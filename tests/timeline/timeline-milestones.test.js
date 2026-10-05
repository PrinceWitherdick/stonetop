import { describe, it, expect } from "vitest";
import {
	creationMilestones, detectMilestones, snapshotFrom, touchesWatched,
} from "../../module/timeline/timeline-milestones.js";

// WHAT CHANGED ON A CHARACTER THAT BELONGS ON THEIR TIMELINE. Every case here is about a milestone
// that must appear, or a change that looks like one and must not: the timeline's whole promise is
// that it is not the ledger.

const SCOPE = "stonetop_pwd";

/** A snapshot built the way the watcher builds one, from system data and a flag bag. */
function snap({ level = 2, wounds = [], deathsDoor = null, insert = null, arcana = {}, custom = {}, companion = "" } = {}) {
	return snapshotFrom({
		system: { attributes: { level: { value: level }, wounds } },
		flags: {
			deathsDoor,
			postDeathInsert: insert ? { slug: insert } : undefined,
			arcana,
			customFollowers: custom,
			animalCompanion: companion ? { name: companion } : {},
		},
	});
}

const keys = list => list.map(m => m.key);

describe("touchesWatched", () => {
	const flatten = (obj, prefix = "") => Object.entries(obj).reduce((acc, [k, v]) => {
		const path = prefix ? `${prefix}.${k}` : k;
		if (v && typeof v === "object" && !Array.isArray(v)) Object.assign(acc, flatten(v, path));
		else acc[path] = v;
		return acc;
	}, {});

	it("notices a level, a wound list and each watched flag, nested or dotted", () => {
		expect(touchesWatched({ "system.attributes.level.value": 3 }, SCOPE, flatten)).toBe(true);
		expect(touchesWatched({ system: { attributes: { wounds: [] } } }, SCOPE, flatten)).toBe(true);
		expect(touchesWatched({ flags: { [SCOPE]: { arcana: { owned: ["x"] } } } }, SCOPE, flatten)).toBe(true);
		expect(touchesWatched({ [`flags.${SCOPE}.deathsDoor`]: "dead" }, SCOPE, flatten)).toBe(true);
		expect(touchesWatched({ [`flags.${SCOPE}.customFollowers.abc.dead`]: true }, SCOPE, flatten)).toBe(true);
	});

	// Every HP tick at the table reaches this; it must say no without building a snapshot.
	it("ignores everything else", () => {
		expect(touchesWatched({ "system.attributes.hp.value": 3 }, SCOPE, flatten)).toBe(false);
		expect(touchesWatched({ "system.attributes.xp.value": 3 }, SCOPE, flatten)).toBe(false);
		expect(touchesWatched({ [`flags.${SCOPE}.ledger`]: [] }, SCOPE, flatten)).toBe(false);
	});
});

describe("level-ups", () => {
	it("records the level gained", () => {
		const found = detectMilestones(snap({ level: 2 }), snap({ level: 3 }));
		expect(found).toEqual([expect.objectContaining({ source: "levelup", key: "levelup:3", data: { level: 3 } })]);
	});

	it("names the move learned on the level it was learned at", () => {
		const [found] = detectMilestones(snap({ level: 2 }), snap({ level: 3 }), { learned: "Seasoned Warrior" });
		expect(found.bodyData).toEqual({ move: "Seasoned Warrior" });
	});

	it("records each level of a jump", () => {
		expect(keys(detectMilestones(snap({ level: 2 }), snap({ level: 4 })))).toEqual(["levelup:3", "levelup:4"]);
	});

	it("records nothing for a level lost, or a level set from nothing at creation", () => {
		expect(detectMilestones(snap({ level: 4 }), snap({ level: 3 }))).toEqual([]);
		expect(detectMilestones(snap({ level: 0 }), snap({ level: 1 }))).toEqual([]);
	});
});

describe("deaths and fates", () => {
	it("records stepping through the Last Door, and only that", () => {
		expect(keys(detectMilestones(snap({ deathsDoor: "dying" }), snap({ deathsDoor: "dead" })))).toEqual(["death:mortal"]);
		expect(detectMilestones(snap(), snap({ deathsDoor: "dying" }))).toEqual([]);
		expect(detectMilestones(snap({ deathsDoor: "dying" }), snap({ deathsDoor: "out-of-action" }))).toEqual([]);
	});

	it("records coming back, by what they came back as", () => {
		const [found] = detectMilestones(snap({ deathsDoor: "dead" }), snap({ deathsDoor: "dead", insert: "ghost" }));
		expect(found.key).toBe("insert:ghost");
		expect(found.titleKey).toBe("stonetop.timeline.milestone.insert.ghost");
	});

	// A Revenant dying again is a second death, not the first one seen twice.
	it("keys a death by what they were when they died", () => {
		const found = detectMilestones(snap({ insert: "revenant", deathsDoor: "dying" }), snap({ insert: "revenant", deathsDoor: "dead" }));
		expect(keys(found)).toEqual(["death:revenant"]);
	});
});

describe("lasting wounds", () => {
	const wound = over => ({ id: "w1", text: "A broken hand", status: "problematic", origin: "wound", healed: false, ...over });

	it("records a wound turning permanent", () => {
		expect(keys(detectMilestones(snap({ wounds: [wound()] }), snap({ wounds: [wound({ status: "permanent" })] }))))
			.toEqual(["wound:w1:permanent"]);
	});

	it("records a wound healing to a scar", () => {
		expect(keys(detectMilestones(snap({ wounds: [wound()] }), snap({ wounds: [wound({ healed: true })] }))))
			.toEqual(["wound:w1:scar"]);
	});

	// Everyday wounds are bookkeeping, not the story.
	it("records nothing for an ordinary wound added, stabilised or removed", () => {
		expect(detectMilestones(snap(), snap({ wounds: [wound()] }))).toEqual([]);
		expect(detectMilestones(snap({ wounds: [wound()] }), snap({ wounds: [wound({ status: "stabilized" })] }))).toEqual([]);
		expect(detectMilestones(snap({ wounds: [wound()] }), snap())).toEqual([]);
	});

	// The mark is seeded with a placeholder and then rewritten with the player's words.
	it("records a Death's Door mark in the player's words, never the placeholder", () => {
		const seeded = wound({ origin: "deaths-door", status: "permanent", text: "Describe the mark" });
		const written = wound({ origin: "deaths-door", status: "permanent", text: "A murder of crows follows me" });
		expect(detectMilestones(snap(), snap({ wounds: [seeded] }), { markPlaceholder: "Describe the mark" })).toEqual([]);
		const [found] = detectMilestones(snap({ wounds: [seeded] }), snap({ wounds: [written] }), { markPlaceholder: "Describe the mark" });
		expect(found).toEqual(expect.objectContaining({ key: "wound:w1:mark", body: "A murder of crows follows me", refresh: ["body"] }));
	});
});

describe("arcana", () => {
	it("records an arcanum found and identified", () => {
		const found = detectMilestones(snap(), snap({ arcana: { owned: ["dragon-bone"], identified: ["dragon-bone"] } }));
		expect(keys(found)).toEqual(["arcana:dragon-bone:found", "arcana:dragon-bone:identified"]);
		expect(found[0].arcanaSlug).toBe("dragon-bone");
	});

	// A lead is a rumour; the card is the thing.
	it("does not record a mere lead, and records it once the lead is found", () => {
		const lead = snap({ arcana: { owned: ["dragon-bone"], leads: ["dragon-bone"] } });
		expect(detectMilestones(snap(), lead)).toEqual([]);
		expect(keys(detectMilestones(lead, snap({ arcana: { owned: ["dragon-bone"] } })))).toEqual(["arcana:dragon-bone:found"]);
	});

	it("keeps the major arcanum to one row, refreshed on a re-pick", () => {
		const [found] = detectMilestones(snap({ arcana: { major: "the-hand" } }), snap({ arcana: { major: "the-eye" } }));
		expect(found).toEqual(expect.objectContaining({ key: "arcana:major", arcanaSlug: "the-eye", refresh: ["title"] }));
	});
});

describe("followers", () => {
	it("records a custom follower once it has a name", () => {
		expect(detectMilestones(snap(), snap({ custom: { f1: { name: "" } } }))).toEqual([]);
		const [found] = detectMilestones(snap({ custom: { f1: { name: "" } } }), snap({ custom: { f1: { name: "Wren" } } }));
		expect(found).toEqual(expect.objectContaining({ key: "follower:gain:f1", data: { name: "Wren" } }));
	});

	it("records an animal companion named", () => {
		expect(keys(detectMilestones(snap(), snap({ companion: "Ash" })))).toEqual(["follower:gain:animalCompanion"]);
	});

	it("records a follower breaking free", () => {
		expect(keys(detectMilestones(snap({ custom: { f1: { name: "Deep Ones" } } }), snap({ custom: { f1: { name: "Deep Ones", brokenFree: true } } }))))
			.toEqual(["follower:free:f1"]);
	});

	// A follower's death is recorded by the fate dialog, which knows a death from a dismissal.
	it("leaves a follower's death to the fate dialog", () => {
		expect(detectMilestones(snap({ custom: { f1: { name: "Wren" } } }), snap({ custom: { f1: { name: "Wren", dead: true } } }))).toEqual([]);
	});
});

describe("while a character is being made", () => {
	it("keeps only the major arcanum", () => {
		const found = detectMilestones(snap({ level: 0 }), snap({ level: 1, companion: "Ash", arcana: { owned: ["x"], major: "the-eye" } }));
		expect(keys(creationMilestones(found))).toEqual(["arcana:major"]);
	});
});
