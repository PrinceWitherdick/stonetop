import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
	ARCANA_SUMMONS, arcanaSummon, arcanaSummonFollowers, hasArcanaSummon,
	summonAsks, summonChoiceGroups, resolveSummonChoices,
	summonEntryFor, summonRepair, summonNeedsRepair, applySummonRepair, summonPickTicks, summonPicksComplete,
} from "../../module/data/arcana-summons.js";
import { joinNames } from "../../module/utils/strings.js";
import { buildCustomFollower } from "../../module/data/follower-build.js";

describe("ARCANA_SUMMONS registry", () => {
	const entries = Object.entries(ARCANA_SUMMONS);

	it("covers the known summoning arcana", () => {
		expect(Object.keys(ARCANA_SUMMONS).sort()).toEqual([
			"beautiful-scroll", "blackwood-fetishes", "cloak-richly-embroidered",
			"cracked-flute", "demonhide-cloak", "metal-man", "mindgem",
			"oversized-crown", "ring-of-daagon", "rusty-cauldron",
			"scroll-and-bone-flute", "stone-idol", "tattered-mantle",
		].sort());
	});

	it("every follower builds into a valid custom-follower shape", () => {
		for (const [slug, entry] of entries) {
			expect(entry.followers.length, slug).toBeGreaterThan(0);
			for (const input of entry.followers) {
				const f = buildCustomFollower(input);
				expect(f.name, slug).toBeTruthy();
				expect(f.sourceUuid, slug).toBe(input.sourceUuid);
				expect(Number.isInteger(f.hpMax), slug).toBe(true);
				expect(f.loyalty, slug).toBeGreaterThanOrEqual(0);
			}
		}
	});

	it("uses globally unique, slug-prefixed sourceUuids", () => {
		const uuids = entries.flatMap(([slug, entry]) =>
			entry.followers.map(f => {
				expect(f.sourceUuid.startsWith(`${slug}:`), f.sourceUuid).toBe(true);
				return f.sourceUuid;
			})
		);
		expect(new Set(uuids).size).toBe(uuids.length);
	});

	it("carries the rulebook starting Loyalty for the spirits that have one", () => {
		expect(buildCustomFollower(arcanaSummon("cracked-flute").followers[0]).loyalty).toBe(1);
		expect(buildCustomFollower(arcanaSummon("oversized-crown").followers[0]).loyalty).toBe(3);
	});

	it("hasArcanaSummon / arcanaSummon agree", () => {
		expect(hasArcanaSummon("metal-man")).toBe(true);
		expect(hasArcanaSummon("red-scepter")).toBe(false);
		expect(arcanaSummon("red-scepter")).toBeNull();
	});
});

describe("arcanaSummonFollowers (homebrew-first resolution)", () => {
	it("uses homebrew followers from flags.stonetop.summon and derives a slug:name sourceUuid", () => {
		const out = arcanaSummonFollowers({ slug: "my-charm", summon: { followers: [{ name: "Wisp Friend", hp: 8 }] } });
		expect(out).toHaveLength(1);
		expect(out[0].name).toBe("Wisp Friend");
		expect(out[0].sourceUuid).toBe("my-charm:wisp-friend");
	});

	it("keeps an explicit sourceUuid if the homebrew follower already has one", () => {
		const out = arcanaSummonFollowers({ slug: "x", summon: { followers: [{ name: "A", sourceUuid: "custom:id" }] } });
		expect(out[0].sourceUuid).toBe("custom:id");
	});

	it("drops homebrew followers with a blank name", () => {
		const out = arcanaSummonFollowers({ slug: "x", summon: { followers: [{ name: "" }, { name: "Real" }] } });
		expect(out).toHaveLength(1);
		expect(out[0].name).toBe("Real");
	});

	it("falls back to the shipped ARCANA_SUMMONS map when no homebrew followers", () => {
		const out = arcanaSummonFollowers({ slug: "metal-man" });
		expect(out).toBe(arcanaSummon("metal-man").followers);
	});

	it("returns null for a non-summoning slug with no homebrew followers", () => {
		expect(arcanaSummonFollowers({ slug: "red-scepter" })).toBeNull();
		expect(arcanaSummonFollowers({ slug: "x", summon: { followers: [] } })).toBeNull();
	});
});

// The tulpa's picks are read off the pack's own reverse text, so this pins the two together: each
// option must find its own □, in the order the book prints them (Book II p.527).
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCROLL = JSON.parse(fs.readFileSync(
	path.resolve(HERE, "../../packs/src/stonetop-arcana/minor/beautiful-scroll.json"), "utf8"));
const SCROLL_BACK = SCROLL.flags.stonetop.back.description;
const TULPA = arcanaSummon("beautiful-scroll").followers[0];

describe("the beautiful scroll's tulpa (Book II p.527)", () => {
	it("prints only its first move; the other four are picks", () => {
		expect(TULPA.moves).toBe("Manifest a form of dust/snow/vapor");
		const moves = TULPA.choices.find(g => g.field === "moves");
		expect(moves.pick).toBe(2);
		expect(moves.options).toHaveLength(4);
		expect(summonAsks(TULPA)).toBe(true);
		expect(summonAsks(arcanaSummon("metal-man").followers[0])).toBe(false);
	});

	it("finds every option's own box on the card's reverse, in printed order", () => {
		const groups = summonChoiceGroups(TULPA, { backDescription: SCROLL_BACK, slug: "beautiful-scroll" });
		const boxes = groups.flatMap(g => g.options.map(o => o.box));
		// 6 tags, 3 instincts, 4 moves, 3 costs: 16 boxes, 0..15.
		expect(boxes).toEqual([...Array(16).keys()]);
		expect((SCROLL_BACK.match(/□/g) ?? []).length).toBe(16);
	});

	it("opens on the card's ticks, keeping no more than the pick", () => {
		const boxStates = {
			"beautiful-scroll:back:0": true, "beautiful-scroll:back:3": true, "beautiful-scroll:back:4": true,
			"beautiful-scroll:back:7": true, "beautiful-scroll:back:14": true,
		};
		const groups = summonChoiceGroups(TULPA, { backDescription: SCROLL_BACK, slug: "beautiful-scroll", boxStates });
		const checked = field => groups.find(g => g.field === field).options.filter(o => o.checked).map(o => o.value);
		expect(checked("tags")).toEqual(["eager", "sly"]);
		expect(checked("instinct")).toEqual(["to learn"]);
		expect(checked("moves")).toEqual([]);
		expect(checked("cost")).toEqual(["new experiences"]);
	});

	it("builds the tulpa from its picks and its name", () => {
		const input = resolveSummonChoices(TULPA, {
			tags: ["kind", "willful"], instinct: ["to flaunt"],
			moves: ["Deliver a message", "Produce light (area, reach)"], cost: ["comfort/compassion"],
		}, { name: "Pip" });
		const f = buildCustomFollower(input);
		expect(f.name).toBe("Pip");
		expect(f.tags).toEqual(["spirit", "construct", "tiny", "naive", "kind", "willful"]);
		expect(f.instinct).toBe("to flaunt");
		expect(f.moves.split("\n")).toEqual(["Manifest a form of dust/snow/vapor", "Produce light (area, reach)", "Deliver a message"]);
		expect(f.cost).toBe("comfort/compassion");
		expect(f.notes).not.toMatch(/Still to pick/);
		expect(f.sourceUuid).toBe("beautiful-scroll:tulpa");
	});

	it("never takes more than a group's pick, and says what is still to pick", () => {
		const input = resolveSummonChoices(TULPA, {
			tags: ["eager", "fierce", "kind"], moves: ["Deliver a message", "not on the card"],
		});
		expect(input.name).toBe("Tulpa");
		expect(input.tags).toEqual(["spirit", "construct", "tiny", "naive", "eager", "fierce"]);
		expect(input.moves.split("\n")).toHaveLength(2);
		expect(input.instinct).toBeUndefined();
		expect(input.notes).toMatch(/Still to pick from the card: Instinct \(1 more\), Moves \(1 more\), Cost \(1 more\)\./);
		expect(input.choices).toBeUndefined();
	});
});

// A tulpa as the old summon built it: all five moves, no instinct or cost, the old notes.
const OLD_TULPA_NOTES = TULPA.replacesNotes[0];
const oldTulpa = (over = {}) => ({
	...buildCustomFollower({
		...TULPA, choices: undefined,
		moves: "Manifest a form of dust/snow/vapor\nProduce light (area, reach)\nCarry/manipulate a ◇ item\nDeliver a message\nSpy on someone/something",
		notes: OLD_TULPA_NOTES,
	}),
	...over,
});
const OLD_SCROLL_BACK = SCROLL_BACK.replace(/□ ▶/g, "▶");

describe("putting right a tulpa summoned before its picks were asked", () => {
	it("finds the entry it came from", () => {
		expect(summonEntryFor(oldTulpa())).toBe(TULPA);
		expect(summonEntryFor({ sourceUuid: "metal-man:bronze-protector" })).toBe(arcanaSummon("metal-man").followers[0]);
		expect(summonEntryFor({ sourceUuid: null })).toBeNull();
	});

	it("names what is off, and opens on what the card has ticked", () => {
		const boxStates = { "beautiful-scroll:back:1": true, "beautiful-scroll:back:6": true, "beautiful-scroll:back:15": true };
		const { groups, issues } = summonRepair(oldTulpa(), TULPA, { backDescription: SCROLL_BACK, slug: "beautiful-scroll", boxStates });
		expect(issues.map(i => [i.field, i.kind, i.have])).toEqual([
			["tags", "short", 0], ["instinct", "short", 0], ["moves", "over", 4], ["cost", "short", 0],
		]);
		const checked = field => groups.find(g => g.field === field).options.filter(o => o.checked).map(o => o.value);
		expect(checked("tags")).toEqual(["fierce"]);
		expect(checked("instinct")).toEqual(["to play"]);
		expect(checked("moves")).toEqual([]);
		expect(groups.find(g => g.field === "moves").over).toBe(true);
		expect(checked("cost")).toEqual(["comfort/compassion"]);
	});

	it("needs no repair once settled, or once it matches the book", () => {
		expect(summonNeedsRepair(oldTulpa())).toBe(true);
		expect(summonNeedsRepair(oldTulpa({ picksSettled: true }))).toBe(false);
		expect(summonNeedsRepair(oldTulpa({ dead: true }))).toBe(false);
		expect(summonNeedsRepair(oldTulpa({
			tags: ["spirit", "construct", "tiny", "naive", "sly", "kind"],
			moves: "Manifest a form of dust/snow/vapor\nDeliver a message\nSpy on someone/something",
			instinct: "to wander off", cost: "new experiences",
		}))).toBe(false);
		expect(summonNeedsRepair(buildCustomFollower(arcanaSummon("metal-man").followers[0]))).toBe(false);
	});

	it("rewrites only what the picks decide", () => {
		const stored = oldTulpa({
			tags: ["spirit", "construct", "tiny", "naive", "glowing"],
			moves: "Manifest a form of dust/snow/vapor\nProduce light (area, reach)\nCarry/manipulate a ◇ item\nDeliver a message\nSpy on someone/something\nHum a lullaby",
			instinct: "to hide under beds",
			notes: OLD_TULPA_NOTES + " Loves the miller's cat.",
		});
		const fields = applySummonRepair(stored, TULPA, {
			tags: ["timid", "eager"], moves: ["Spy on someone/something", "Produce light (area, reach)"], cost: ["respect given"],
		});
		expect(fields).toEqual({
			picksSettled: true,
			tags: ["spirit", "construct", "tiny", "naive", "glowing", "eager", "timid"],
			moves: "Manifest a form of dust/snow/vapor\nProduce light (area, reach)\nSpy on someone/something\nHum a lullaby",
			// The player's own instinct stays: nothing was picked to replace it.
			cost: "respect given",
			notes: TULPA.notes + " Loves the miller's cat.",
		});
	});

	it("leaves a group with nothing picked as it is, and stays unsettled until complete", () => {
		// Saving before choosing the moves must not strip them.
		const fields = applySummonRepair(
			oldTulpa({ instinct: "to learn", notes: "Named Pip. Still to pick from the card: Moves (1 more)." }),
			TULPA, { tags: ["sly", "kind"], cost: ["new experiences"] },
		);
		expect(fields.moves).toBeUndefined();
		expect(fields.instinct).toBeUndefined();
		expect(fields.notes).toBe("Named Pip.");
		expect(fields.picksSettled).toBe(false);
		expect(applySummonRepair(oldTulpa(), TULPA, {})).toEqual({ notes: TULPA.notes, picksSettled: false });
	});

	it("settles a follower whose picks are complete", () => {
		const fields = applySummonRepair(oldTulpa(), TULPA, {
			tags: ["sly", "kind"], instinct: ["to play"], moves: ["Deliver a message", "Spy on someone/something"], cost: ["new experiences"],
		});
		expect(fields.picksSettled).toBe(true);
		expect(summonPicksComplete(resolveSummonChoices(TULPA, { tags: ["sly"] }), TULPA)).toBe(false);
	});

	it("marks the card's boxes from the picks", () => {
		const groups = summonChoiceGroups(TULPA, { backDescription: SCROLL_BACK, slug: "beautiful-scroll" });
		const ticks = summonPickTicks(groups, { tags: ["eager"], moves: ["Deliver a message"] });
		expect(ticks[0]).toBe(true);
		expect(ticks[1]).toBe(false);
		expect(ticks[11]).toBe(true);
		// Only the groups picked in: 6 tag boxes and 4 move boxes. Instinct and cost are untouched.
		expect(Object.keys(ticks)).toHaveLength(10);
		expect(summonPickTicks(groups, {})).toEqual({});
	});

	it("gives a move no box on a card printed before the move boxes, rather than the box above it", () => {
		const groups = summonChoiceGroups(TULPA, { backDescription: OLD_SCROLL_BACK, slug: "beautiful-scroll" });
		expect(groups.find(g => g.field === "moves").options.map(o => o.box)).toEqual([-1, -1, -1, -1]);
		expect(groups.find(g => g.field === "cost").options.map(o => o.box)).toEqual([9, 10, 11]);
	});
});

describe("joinNames", () => {
	it("formats one, two, and many names", () => {
		expect(joinNames(["Astor"])).toBe("Astor");
		expect(joinNames(["Astor", "Halix"])).toBe("Astor & Halix");
		expect(joinNames(["A", "B", "C"])).toBe("A, B & C");
		expect(joinNames([])).toBe("");
		expect(joinNames([null, "X"])).toBe("X");
	});
});
