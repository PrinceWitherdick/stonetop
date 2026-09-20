import { describe, expect, it, vi } from "vitest";
import {
	HERD_ASSET_NAME, IMPROVEMENT_COMPLETION_NOTES, IMPROVEMENT_MOVES, STEADING_DEFAULTS, StonetopSteading, standingGrantFor,
} from "../../../module/actors/steading/StonetopSteading.js";

/**
 * The improvement effects that are not one-time grants: the ones that come and go with a
 * requirement box once an improvement is built (the Steading playbook), the Herd of Horses' swap
 * on the Assets list, naming the Inn, and the Aurochs Hunt's bookkeeping.
 */

const SCOPE = "stonetop-pwd";

/** A steading whose updates land, so a second write reads what the first one wrote. */
function steadingWith(steading = {}, system = {}) {
	const actor = {
		type: "stonetop",
		system: structuredClone(system),
		flags: { [SCOPE]: { steading: structuredClone(steading) } },
		getFlag: (scope, key) => actor.flags[scope]?.[key],
		setFlag: vi.fn(async (scope, key, value) => { actor.flags[scope][key] = structuredClone(value); }),
		update: vi.fn(async data => {
			for (const [path, value] of Object.entries(data)) {
				const parts = path.split(".");
				const leaf = parts.pop();
				let node = actor;
				for (const part of parts) node = node[part] ??= {};
				node[leaf] = structuredClone(value);
			}
		}),
	};
	return { actor, steading: new StonetopSteading(actor) };
}

/**
 * Make this steading's writes cost a round trip, which is what a real one costs.
 *
 * steadingWith's `update` applies before it ever yields, so two calls started together still read
 * each other's work and nothing can race. An Actor#update goes to the server and back: the caller
 * is suspended with the document UNCHANGED, which is the whole of the window a second click lands
 * in. Nothing about the write changes but when it is visible.
 */
function overTheWire(actor) {
	const write = actor.update;
	actor.update = vi.fn(async data => {
		await Promise.resolve();
		return write(data);
	});
}

const flagsOf = actor => actor.flags[SCOPE].steading;
const defenses = actor => flagsOf(actor).system?.stats?.defenses?.value;
const prosperity = actor => flagsOf(actor).system?.attributes?.prosperity?.value;

// Well-Trained Militia's boxes: [veteran warrior, Archery, Cavalry, Formations, Readiness, Skirmishing].
const MILITIA_R = (...tactics) => [true, ...[1, 2, 3, 4, 5].map(i => tactics.includes(i))];

describe("the militia's +1 Defenses", () => {
	// "When the militia has trained in 2+ tactics, increase Defenses by 1."
	it("comes with the second tactic and goes with it", async () => {
		const { actor, steading } = steadingWith(
			{ improvements: { wellTrainedMilitia: { completed: true, r: MILITIA_R(1), standing: null } }, system: { stats: { defenses: { value: 1 } } } },
		);
		const up = await steading.setImprovementRequirement("wellTrainedMilitia", 3, true);
		expect(defenses(actor)).toBe(2);
		expect(up.summary[0]).toMatch(/2\+ tactics/);
		const down = await steading.setImprovementRequirement("wellTrainedMilitia", 1, false);
		expect(defenses(actor)).toBe(1);
		expect(down.summary[0]).toMatch(/no longer/);
	});

	// ⚠ TWO BOXES CAN BE PRESSED INSIDE ONE ROUND TRIP, and this is a read-modify-write over the
	// whole `improvements` flag AND a stat. Run at once, both copies read the same "before" and the
	// second write lands on top of the first: the first untick is lost, while the Defenses it already
	// took stays taken, and `entry.standing` is left claiming an effect that is gone. So they queue.
	it("takes turns, so two quick unticks cannot lose one and strand the standing record", async () => {
		const { actor, steading } = steadingWith(
			{ improvements: { wellTrainedMilitia: { completed: true, r: MILITIA_R(1, 3), standing: { defenses: 1 } } }, system: { stats: { defenses: { value: 2 } } } },
		);
		overTheWire(actor);

		// Neither awaited before the other starts: two clicks, one round trip.
		await Promise.all([
			steading.setImprovementRequirement("wellTrainedMilitia", 1, false),
			steading.setImprovementRequirement("wellTrainedMilitia", 3, false),
		]);

		// Both unticks survive, the +1 comes off exactly once, and the record agrees with the stat.
		expect(flagsOf(actor).improvements.wellTrainedMilitia.r.slice(1)).toEqual([false, false, false, false, false]);
		expect(defenses(actor)).toBe(1);
		expect(flagsOf(actor).improvements.wellTrainedMilitia.standing).toBeNull();
	});

	// The same line, because completing an improvement rewrites the same flag its boxes live in.
	it("queues a completion behind a requirement tick on the same steading", async () => {
		const { actor, steading } = steadingWith(
			{ improvements: { wellTrainedMilitia: { completed: true, r: MILITIA_R(1), standing: null } }, system: { stats: { defenses: { value: 1 } } } },
		);
		overTheWire(actor);

		await Promise.all([
			steading.setImprovementRequirement("wellTrainedMilitia", 3, true),
			steading.setImprovementCompleted("wellTrainedMilitia", false),
		]);

		// The tick banked its +1, then un-completing gave it straight back: neither write was lost.
		expect(flagsOf(actor).improvements.wellTrainedMilitia.completed).toBe(false);
		expect(defenses(actor)).toBe(1);
	});

	it("does nothing until the militia is built", async () => {
		const { actor, steading } = steadingWith({ improvements: { wellTrainedMilitia: { completed: false, r: MILITIA_R(1) } }, system: { stats: { defenses: { value: 1 } } } });
		await steading.setImprovementRequirement("wellTrainedMilitia", 3, true);
		expect(defenses(actor)).toBe(1);
	});

	it("is applied on completion when 2 tactics are already trained, and taken back on un-completion", async () => {
		const { actor, steading } = steadingWith({ improvements: { wellTrainedMilitia: { completed: false, r: MILITIA_R(1, 3) } }, system: { stats: { defenses: { value: 1 } } } });
		await steading.setImprovementCompleted("wellTrainedMilitia", true);
		expect(defenses(actor)).toBe(2);
		await steading.setImprovementCompleted("wellTrainedMilitia", false);
		expect(defenses(actor)).toBe(1);
	});

	// Built before this was tracked: the table may have added the +1 by hand, so only a CHANGE moves it.
	it("presumes a militia built before this was tracked already has what its boxes earned", async () => {
		const { actor, steading } = steadingWith({ improvements: { wellTrainedMilitia: { completed: true, r: MILITIA_R(1, 3) } }, system: { stats: { defenses: { value: 2 } } } });
		await steading.setImprovementRequirement("wellTrainedMilitia", 5, true);
		expect(defenses(actor)).toBe(2);
		await steading.setImprovementRequirement("wellTrainedMilitia", 1, false);
		await steading.setImprovementRequirement("wellTrainedMilitia", 3, false);
		expect(defenses(actor)).toBe(1);
	});
});

describe("a Market or Expanded Trades that stops meeting its requirements", () => {
	// "If you cease to meet the requirements, decrease Prosperity by 1."
	it("loses the Prosperity, and has it back once they are met again", async () => {
		const { actor, steading } = steadingWith({ system: { attributes: { prosperity: { value: 0 } } } });
		const r = steading.improvementDef("market").sections.flatMap(s => s.items).map(() => true);
		await steading.setImprovementCompleted("market", true, { forceR: r });
		expect(prosperity(actor)).toBe(1);
		// Box 0 is one of two alternatives ("Requires 1 of the following"), so losing it alone
		// still meets them; box 2 is "a dedicated market site", which the Market must have.
		expect((await steading.setImprovementRequirement("market", 0, false)).summary).toEqual([]);
		expect(prosperity(actor)).toBe(1);
		const lapse = await steading.setImprovementRequirement("market", 2, false);
		expect(prosperity(actor)).toBe(0);
		expect(lapse.summary[0]).toMatch(/no longer met/);
		await steading.setImprovementRequirement("market", 2, true);
		expect(prosperity(actor)).toBe(1);
	});

	it("names only the improvements the book gives a standing effect", () => {
		const entry = { completed: true, r: [] };
		expect(standingGrantFor("palisade", { sections: [] }, entry)).toBeNull();
	});
});

describe("the Herd of Horses on the Assets list", () => {
	// "Replace 'a pair of sturdy draft horses' with 'a herd of horses' on the Assets list."
	it("replaces the draft horses, and puts them back if the herd is un-completed", async () => {
		const { actor, steading } = steadingWith({ assets: structuredClone(STEADING_DEFAULTS.assets) });
		const done = await steading.setImprovementCompleted("herdOfHorses", true);
		expect(flagsOf(actor).assets[0].name).toBe(HERD_ASSET_NAME);
		expect(done.summary.some(line => line.startsWith("Assets:"))).toBe(true);
		await steading.setImprovementCompleted("herdOfHorses", false);
		expect(flagsOf(actor).assets[0].name).toBe(STEADING_DEFAULTS.assets[0].name);
	});

	it("adds the herd when there are no draft horses to replace", async () => {
		const { actor, steading } = steadingWith({ assets: [{ name: "A plow", checked: true }, { name: "", checked: false }] });
		await steading.setImprovementCompleted("herdOfHorses", true);
		expect(flagsOf(actor).assets.map(a => a.name)).toEqual(["A plow", HERD_ASSET_NAME]);
	});
});

describe("naming the Inn", () => {
	it("writes the name onto the Resources entry, and un-completing still removes it", async () => {
		const { actor, steading } = steadingWith({ resources: [{ name: "", checked: false }] });
		await steading.setImprovementCompleted("inn", true);
		expect(await steading.nameInn("The Wisent's Rest")).toBe("The Wisent's Rest (the inn)");
		expect(flagsOf(actor).resources[0].name).toBe("The Wisent's Rest (the inn)");
		await steading.setImprovementCompleted("inn", false);
		expect(flagsOf(actor).resources[0].name).toBe("");
	});

	it("names nothing before the Inn is built", async () => {
		const { steading } = steadingWith({});
		expect(await steading.nameInn("The Wisent's Rest")).toBeNull();
	});
});

describe("the Aurochs Hunt's bookkeeping", () => {
	it("takes lamed or killed horses from a tracked herd, oldest first", async () => {
		const { actor, steading } = steadingWith({ improvements: { herdOfHorses: { completed: true } }, herd: { grown: 2, yearlings: 3, foals: 1 } });
		expect(await steading.loseHorses(4)).toBe(4);
		expect(flagsOf(actor).herd).toEqual({ grown: 0, yearlings: 1, foals: 1 });
	});

	it("has no herd to take from without a Herd of Horses", async () => {
		const { steading } = steadingWith({});
		expect(await steading.loseHorses(2)).toBeNull();
	});

	it("remembers the year the herd was left weak", async () => {
		const { steading } = steadingWith({});
		expect(steading.aurochsWeakYear()).toBe(0);
		await steading.markAurochsWeak(3);
		expect(steading.aurochsWeakYear()).toBe(3);
	});
});

describe("what a built improvement puts in front of the table", () => {
	it("gives the two improvements that are moves a roll on their own card", async () => {
		expect(Object.keys(IMPROVEMENT_MOVES).sort()).toEqual(["aurochsHunting", "heroicReputation"]);
		const { steading } = steadingWith({ improvements: { aurochsHunting: { completed: true, r: [] } } });
		const cards = (await steading.buildSnapshot()).improvements;
		expect(cards.find(c => c.slug === "aurochsHunting").rollsMove).toMatchObject({ move: "aurochsHunt" });
		expect(cards.find(c => c.slug === "heroicReputation").rollsMove).toBeNull();
	});

	it("asks for the map and the herd's size the moment each is built", () => {
		for (const slug of ["additionalHousing", "inn", "mill", "palisade", "stoneWall"]) {
			expect(IMPROVEMENT_COMPLETION_NOTES[slug], slug).toMatch(/map/);
		}
		expect(IMPROVEMENT_COMPLETION_NOTES.herdOfHorses).toMatch(/size/);
	});
});
