// The Would-be Hero's Potential for Greatness on the sheet, Superior Stat's "(Requires all 6 marks in
// Potential for Greatness)", a replacing move held without its original, and onboarding re-runs after
// a free pick was retired or stats were earned. Driven through the stateful character (LiveCharacter)
// and the real sheet, with the moves as the pack source ships them.

import { afterEach, describe, it, expect, vi } from "vitest";
import { buildLiveCharacter, ownedMoveNames, sourceMovesFor } from "../../fakes/LiveCharacter.js";
import { loadPlaybookPackDocs } from "../../fakes/sourcePack.js";
import { createStonetopCharacterSheetClass } from "../../../module/actors/character/StonetopCharacterSheet.js";
import { CREATION_PICK_FLAG, RETIRED_CREATION_PICK_FLAG } from "../../../module/actors/character/StonetopCharacter.js";
import { CharacterOnboardingDialog } from "../../../module/actors/character/dialogs/CharacterOnboardingDialog.js";

const WBH = "The Would-Be Hero";
const PFG = "Potential for Greatness";
const WBH_STATS = { str: 1, dex: 0, con: 0, int: 0, wis: 0, cha: -1 };
const wbhId = name => sourceMovesFor(WBH).find(d => d.name === name)._id;
const marksOf = actor => actor.getFlag("stonetop-pwd", "moves.moveMarks")?.[PFG] ?? {};
const stat = (actor, key) => actor.system.stats[key].value;
const itemNamed = (actor, name) => actor.items.find(i => i.name === name);

function hero({ level = 1, stats = WBH_STATS, marks = null } = {}) {
	const flags = marks ? { "moves.moveMarks": { [PFG]: marks } } : {};
	return buildLiveCharacter({ slug: "the-would-be-hero", name: WBH, level, stats, flags });
}

async function playbookMove(char, name) {
	const { movelist } = await char.buildSnapshot();
	return movelist.playbookMoves.find(m => m.name === name);
}

// Every box filled, as the mark store keeps them.
const ALL_SIX = () => ({
	stat:   ["wis", "wis", "cha", "cha"].map((s, i) => ({ stat: s, level: i + 1 })),
	hp:     [{ stat: "", level: 5 }],
	damage: [{ stat: "", level: 6 }],
});

afterEach(() => { vi.restoreAllMocks(); });

describe("Potential for Greatness: the stat slots", () => {
	it("un-picking the last filled slot leaves no empty entries behind", async () => {
		const { char, actor } = hero({ level: 3 });
		await char.setStatSlot(PFG, "stat", 2, "dex");
		expect(marksOf(actor).stat).toHaveLength(3); // the two before it are padded
		await char.setStatSlot(PFG, "stat", 2, "");
		expect(marksOf(actor).stat).toEqual([]);
		expect(stat(actor, "dex")).toBe(0);
	});

	it("un-picking an earlier slot keeps the later one where it is", async () => {
		const { char, actor } = hero({ level: 3 });
		await char.setStatSlot(PFG, "stat", 0, "dex");
		await char.setStatSlot(PFG, "stat", 1, "con");
		await char.setStatSlot(PFG, "stat", 0, "");
		expect(marksOf(actor).stat.map(e => e.stat)).toEqual(["", "con"]);
	});

	it("offers only the stats below +2 in each slot, and always the slot's own pick", async () => {
		// STR +2 came from slot 0's own +1; DEX is at +2 from elsewhere.
		const { char } = hero({
			level: 3, stats: { str: 2, dex: 2, con: 0, int: 0, wis: 0, cha: -1 },
			marks: { stat: [{ stat: "str", level: 2 }] },
		});
		const pfg = await playbookMove(char, PFG);
		const slots = pfg.markOptions.find(o => o.slug === "stat").statSlots;
		const keys = slot => slot.options.map(o => o.key);
		expect(keys(slots[0])).toEqual(["", "str", "con", "int", "wis", "cha"]);
		expect(slots[0].options.find(o => o.key === "str").selected).toBe(true);
		expect(keys(slots[1])).toEqual(["", "con", "int", "wis", "cha"]);
	});
});

describe("Potential for Greatness: once per level (flag, never block)", () => {
	it("cautions two marks noted at one level, and one noted above the current level", async () => {
		const { char, actor } = hero({
			level: 4,
			marks: {
				stat: [{ stat: "dex", level: 3 }, { stat: "", level: null }, { stat: "con", level: 2 }],
				hp:   [{ stat: "", level: 3 }],
				damage: [{ stat: "", level: 6 }],
			},
		});
		const pfg = await playbookMove(char, PFG);
		const opt = slug => pfg.markOptions.find(o => o.slug === slug);
		const slots = opt("stat").statSlots;
		expect(slots[0].levelCaution).toMatch(/once per level/);
		expect(slots[1].levelCaution).toBeNull();
		expect(slots[2].levelCaution).toBeNull();
		expect(opt("hp").checks[0].levelCaution).toMatch(/once per level/);
		expect(opt("damage").checks[0].levelCaution).toMatch(/above your current level/);
		// Nothing is taken away or locked for it.
		expect(opt("hp").checks[0]).toMatchObject({ checked: true, disabled: false });
		expect(marksOf(actor).stat).toHaveLength(3);
	});

	it("no caution when each mark has its own level", async () => {
		const { char } = hero({ level: 4, marks: { stat: [{ stat: "dex", level: 2 }], hp: [{ stat: "", level: 3 }] } });
		const pfg = await playbookMove(char, PFG);
		expect(pfg.markOptions.find(o => o.slug === "stat").statSlots[0].levelCaution).toBeNull();
		expect(pfg.markOptions.find(o => o.slug === "hp").checks[0].levelCaution).toBeNull();
	});
});

describe("Superior Stat: all 6 marks in Potential for Greatness", () => {
	it("is locked at level-up until all 6 are filled, and names the requirement", async () => {
		const five = ALL_SIX(); five.damage = [];
		const { char } = hero({ level: 9, marks: five });
		const data = await char.getLevelUpData();
		expect(data.availableMoves.map(m => m.name)).not.toContain("Superior Stat");
		const locked = data.lockedMoves.find(m => m.name === "Superior Stat");
		expect(locked.requiresLabel).toBe("All 6 marks in Potential for Greatness");
	});

	it("padded empty slots are not marks", async () => {
		const padded = ALL_SIX();
		padded.stat = [{ stat: "", level: null }, ...padded.stat.slice(1), { stat: "", level: null }];
		const { char } = hero({ level: 9, marks: padded });
		expect((await char.getLevelUpData()).availableMoves.map(m => m.name)).not.toContain("Superior Stat");
	});

	it("is offered with all 6 filled, at any level (no level is printed)", async () => {
		const { char } = hero({ level: 2, marks: ALL_SIX() });
		expect((await char.getLevelUpData()).availableMoves.map(m => m.name)).toContain("Superior Stat");
	});

	it("counts the marks only while Potential for Greatness is learned", async () => {
		const { char, actor } = hero({ level: 6, marks: ALL_SIX() });
		await itemNamed(actor, PFG).setFlag("stonetop-pwd", "learned", false);
		expect((await char.getLevelUpData()).availableMoves.map(m => m.name)).not.toContain("Superior Stat");
	});

	it("owned with the marks unmet, its card warns (red), and it is not taken away", async () => {
		const { char, actor } = hero({ level: 6, marks: { stat: [{ stat: "wis", level: 2 }] } });
		await char.addMove(wbhId("Superior Stat"));
		const superior = await playbookMove(char, "Superior Stat");
		expect(superior).toMatchObject({ owned: true, requirementsUnmet: true });
		expect(ownedMoveNames(actor)).toContain("Superior Stat");
	});

	it("is never an onboarding free pick", async () => {
		const d = Object.create(CharacterOnboardingDialog.prototype);
		d._initializeState(loadPlaybookPackDocs().find(p => p.name === WBH), null, null);
		d._movesCache = sourceMovesFor(WBH).map(doc => ({ ...doc, id: doc._id }));
		expect(d._freePickOffers().map(doc => doc.name)).not.toContain("Superior Stat");
	});
});

describe("Versatile and the stat moves (Would-be Hero data)", () => {
	it("Versatile repeats 4 times, Improved Stat 3", () => {
		const def = name => sourceMovesFor(WBH).find(d => d.name === name).system;
		expect(def("Versatile").repeatMax).toBe(4);
		expect(def("Improved Stat").repeatMax).toBe(3);
	});

	it("Versatile offers no Would-be Hero move, and no Improved or Superior Stat", async () => {
		const { char } = hero({ level: 10 });
		const offered = await char.getForeignMovesForLevelUp({ playbooks: "any" }, 10);
		expect(offered.length).toBeGreaterThan(0);
		expect(offered.filter(m => m.playbook === WBH)).toEqual([]);
		expect(offered.map(m => m.name)).not.toEqual(expect.arrayContaining(["Improved Stat"]));
		expect(offered.map(m => m.name)).not.toContain("Superior Stat");
		expect(offered.map(m => m.name)).not.toContain(PFG);
	});
});

describe("a replacing move held without its original (Book I p.529)", () => {
	it("reads as a requirement not met, and is not taken away", async () => {
		const { char, actor } = hero({ level: 6 });
		await char.addMove(wbhId("A Force to Be Reckoned With")); // no Underestimated to retire
		const force = await playbookMove(char, "A Force to Be Reckoned With");
		expect(force).toMatchObject({ owned: true, requirementsUnmet: true });
		expect(ownedMoveNames(actor)).toContain("A Force to Be Reckoned With");
	});

	it("taken in place of its original, it is met", async () => {
		const { char } = hero({ level: 6 });
		await char.addMove(wbhId("Underestimated"));
		await char.addMove(wbhId("A Force to Be Reckoned With"));
		expect(await playbookMove(char, "A Force to Be Reckoned With")).toMatchObject({ owned: true, requirementsUnmet: false });
	});
});

describe("a free pick retired by its replacement, and onboarding run again", () => {
	async function retiredFreePick() {
		const made = hero({ level: 6 });
		await made.char.addMove(wbhId("Underestimated"));
		await made.char.markCreationPick("Underestimated");
		await made.char.addMove(wbhId("Iron Will"));
		await made.char.markCreationPick("Iron Will");
		await made.char.addMove(wbhId("A Force to Be Reckoned With"));
		return made;
	}

	it("the replacement remembers it retired a free pick, and a re-run asks for one fewer", async () => {
		const { char, actor } = await retiredFreePick();
		const force = itemNamed(actor, "A Force to Be Reckoned With");
		expect(ownedMoveNames(actor)).not.toContain("Underestimated");
		expect(force.flags["stonetop-pwd"][RETIRED_CREATION_PICK_FLAG]).toBe(true);
		expect(char.retiredCreationPickCount()).toBe(1);
		// The replacement itself is no free pick: a re-run neither shows it nor takes it back.
		expect(char.creationPickItems(WBH).map(i => i.name)).toEqual(["Iron Will"]);

		const d = Object.create(CharacterOnboardingDialog.prototype);
		d._retiredCreationPicks = char.retiredCreationPickCount();
		d._initializeState(loadPlaybookPackDocs().find(p => p.name === WBH), null, null);
		expect(d._movePickCount).toBe(1);
	});

	it("removing the replacement brings the original back as the free pick it was", async () => {
		const { char, actor } = await retiredFreePick();
		await char.removeMove(itemNamed(actor, "A Force to Be Reckoned With")._id);
		const back = itemNamed(actor, "Underestimated");
		expect(back).toBeTruthy();
		expect(back.flags["stonetop-pwd"][CREATION_PICK_FLAG]).toBe(true);
		expect(char.retiredCreationPickCount()).toBe(0);
		expect(char.creationPickItems(WBH).map(i => i.name).sort()).toEqual(["Iron Will", "Underestimated"]);
	});

	it("a replacement of a level-up pick asks nothing of onboarding", async () => {
		const { char, actor } = hero({ level: 6 });
		await char.addMove(wbhId("Underestimated"));
		await char.addMove(wbhId("A Force to Be Reckoned With"));
		expect(itemNamed(actor, "A Force to Be Reckoned With").flags["stonetop-pwd"][RETIRED_CREATION_PICK_FLAG]).toBeUndefined();
		expect(char.retiredCreationPickCount()).toBe(0);
	});
});

describe("a change of playbook takes back the +1s Potential for Greatness gave", () => {
	it("each filled slot steps its stat back down, with the level-up Improved Stat's", async () => {
		const { char, actor } = hero({ level: 3, stats: { ...WBH_STATS, con: 1, wis: 1 } });
		await char.setStatSlot(PFG, "stat", 0, "wis");
		await char.setStatSlot(PFG, "stat", 2, "con");
		await char.applyLevelUp(wbhId("Improved Stat"), null, { stat: "dex", cap: 2 });
		expect([stat(actor, "wis"), stat(actor, "con"), stat(actor, "dex")]).toEqual([2, 2, 1]);

		await char.clearPlaybookData(WBH);

		expect([stat(actor, "wis"), stat(actor, "con"), stat(actor, "dex")]).toEqual([1, 1, 0]);
		expect(marksOf(actor)).toEqual({});
	});

	it("never takes a stat below -1", async () => {
		const { char, actor } = hero({ stats: { ...WBH_STATS, cha: -1 }, marks: { stat: [{ stat: "cha", level: 1 }] } });
		await char.clearPlaybookData(WBH);
		expect(stat(actor, "cha")).toBe(-1);
	});
});

describe("re-running onboarding keeps the +1s earned since creation", () => {
	function sheetFor(char, actor) {
		actor.typedActor = char;
		const Base = class {
			constructor() { this._actor = actor; }
			get actor() { return this._actor; }
			get isEditable() { return true; }
			async getData() { return {}; }
			activateListeners() {}
			render = vi.fn();
		};
		const sheet = new (createStonetopCharacterSheetClass(Base))();
		sheet._openPossessionChoices = vi.fn();
		sheet._applyBackgroundNeighbors = vi.fn();
		return sheet;
	}
	const pbDoc = () => ({ ...structuredClone(loadPlaybookPackDocs().find(p => p.name === WBH)), uuid: "Compendium.test.the-would-be-hero" });

	async function onboardedAndEarned() {
		const made = buildLiveCharacter({ slug: "the-would-be-hero", name: WBH, level: 1, seedStartingMoves: false, stats: WBH_STATS });
		const sheet = sheetFor(made.char, made.actor);
		await sheet._applyPlaybookSelections(pbDoc(), {
			backgroundSlug: "impetuous-youth",
			stats: WBH_STATS,
			possessions: [],
			moves: [wbhId("Iron Will"), wbhId("Improved Stat")],
			moveStatChoices: { [wbhId("Improved Stat")]: "str" },
		});
		expect(stat(made.actor, "str")).toBe(2);
		// A level-up's Improved Stat on DEX, and a Potential for Greatness slot on CON.
		await made.char.applyLevelUp(wbhId("Improved Stat"), null, { stat: "dex", cap: 2 });
		await made.char.setStatSlot(PFG, "stat", 0, "con");
		return { ...made, sheet };
	}

	it("the level-up Improved Stat and the Potential for Greatness slot survive the base-stat write", async () => {
		const { actor, sheet } = await onboardedAndEarned();
		const before = { ...Object.fromEntries(Object.keys(WBH_STATS).map(k => [k, stat(actor, k)])) };
		expect(before).toMatchObject({ str: 2, dex: 1, con: 1 });

		await sheet._applyPlaybookSelections(pbDoc(), sheet._readSelectionsFromActor(pbDoc()));

		expect(Object.fromEntries(Object.keys(WBH_STATS).map(k => [k, stat(actor, k)]))).toEqual(before);
	});

	it("un-marking the slot afterwards lands on the base, not below it", async () => {
		const { char, actor, sheet } = await onboardedAndEarned();
		await sheet._applyPlaybookSelections(pbDoc(), sheet._readSelectionsFromActor(pbDoc()));
		await char.setStatSlot(PFG, "stat", 0, "");
		expect(stat(actor, "con")).toBe(0);
	});

	it("a free pick swapped for another stat moves only its own +1", async () => {
		const { actor, sheet } = await onboardedAndEarned();
		const sel = sheet._readSelectionsFromActor(pbDoc());
		await sheet._applyPlaybookSelections(pbDoc(), { ...sel, moveStatChoices: { "Improved Stat": "wis" } });
		expect(Object.fromEntries(Object.keys(WBH_STATS).map(k => [k, stat(actor, k)])))
			.toEqual({ str: 1, dex: 1, con: 1, int: 0, wis: 1, cha: -1 });
	});
});
