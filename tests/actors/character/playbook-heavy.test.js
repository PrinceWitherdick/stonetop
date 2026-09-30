// The Heavy's advancement, pinned to the playbook sheet: the gate on every move, the stat moves'
// caps, the moves that add HP and armor, Unstoppable's marks and the starting moves. Below that,
// the one move three playbooks share by name (Armored: the Heavy's, the Judge's and the
// Marshal's), which Seasoned Warrior and Arts of War must never hand over as a foreign move, and
// a world that already holds one. Making a Heavy (the Sheriff's barked order, the Storm-Marked's
// arcanum, Armored's hauberk) is in heavy-creation.test.js.

import { describe, it, expect } from "vitest";
import { buildLiveCharacter, sourceMovesFor, ownedMoveNames, makeLiveItem } from "../../fakes/LiveCharacter.js";
import { loadPlaybookPackDocs } from "../../fakes/sourcePack.js";
import { PlaybookMoveEntry } from "../../../module/actors/character/PlaybookMoveEntry.js";
import { MoveDefinition } from "../../../module/model/MoveDefinition.js";
import { parseMovePickCount, CREATION_PICK_FLAG, STARTING_CHOICE_FLAG } from "../../../module/actors/character/StonetopCharacter.js";
import { STONETOP_SCOPE } from "../../../module/actors/character/StonetopFlags.js";
import { CharacterOnboardingDialog } from "../../../module/actors/character/dialogs/CharacterOnboardingDialog.js";

const PACK         = new Map(loadPlaybookPackDocs().map(doc => [doc.system.slug, doc]));
const pbDoc        = slug => ({ ...structuredClone(PACK.get(slug)), uuid: `Compendium.test.${slug}` });
const HEAVY_MOVES  = PACK.get("the-heavy").flags.stonetop.moves;
const HEAVY_GROUPS = HEAVY_MOVES.choices;

const heavy   = name => sourceMovesFor("The Heavy").find(d => d.name === name);
const marshal = name => sourceMovesFor("The Marshal").find(d => d.name === name);
const heavyAt = (level, opts = {}) => buildLiveCharacter({ slug: "the-heavy", name: "The Heavy", level, ...opts });
const stamp   = flag => ({ [STONETOP_SCOPE]: { [flag]: true } });
// A move as an owned item, from its playbook's source.
const moveItem = (def, flags) => makeLiveItem({ name: def.name, type: "move", system: structuredClone(def.system), flags });

// The Heavy's moves as the Moves tab builds them, keyed by name.
async function sheetEntries(char, level) {
	const entries = await char._moveRepo.getPlaybookMoves("The Heavy");
	const built = char.buildMovelistContext(entries, char._buildOwnedMovesMap(), new Set(), level, "The Heavy", HEAVY_GROUPS);
	return new Map(built.map(e => [e.name, e]));
}

describe("the Heavy's move gates, as the sheet reads them", () => {
	// "(Requires level 6+ and X)", each the level-6 move that builds on a level-1 one.
	it.each([
		["Cut from Granite",   "Carved Out of Wood"],
		["Mighty Thews",       "Musclebound"],
		["Nemesis",            "Relentless"],
		["Steadfast Guardian", "Guardian"],
		["Stone Cold",         "Frosty"],
	])("%s needs level 6+ and %s", async (name, need) => {
		const { char } = heavyAt(6);
		expect((await sheetEntries(char, 6)).get(name)).toMatchObject({ minLevel: 6, requiresLabel: `${need}; level 6+`, locked: true });
		await char.addMove(heavy(need)._id);
		expect((await sheetEntries(char, 5)).get(name).locked).toBe(true);
		expect((await sheetEntries(char, 6)).get(name).locked).toBe(false);
	});

	it.each(["Bringer of Ruin", "Superior Stat"])("%s needs level 6+ and nothing else", async name => {
		const { char } = heavyAt(6);
		expect((await sheetEntries(char, 5)).get(name)).toMatchObject({ minLevel: 6, requiresLabel: "level 6+", locked: true });
		expect((await sheetEntries(char, 6)).get(name).locked).toBe(false);
	});

	it.each([
		["Berserker",   "Battle Joy"],
		["Unstoppable", "Hard to Kill"],
	])("%s needs %s, at any level", async (name, need) => {
		const { char } = heavyAt(1, { seedStartingMoves: false });
		expect((await sheetEntries(char, 1)).get(name)).toMatchObject({ minLevel: null, requiresLabel: need, locked: true });
		await char.addMove(heavy(need)._id);
		expect((await sheetEntries(char, 1)).get(name).locked).toBe(false);
	});

	it("Musclebound needs Strength +2 or higher", async () => {
		const weak = heavyAt(1, { stats: { str: 1, dex: 2, con: 1, int: 0, wis: 0, cha: -1 } });
		expect((await sheetEntries(weak.char, 1)).get("Musclebound")).toMatchObject({ minLevel: null, locked: true });
		const strong = heavyAt(1);
		expect((await sheetEntries(strong.char, 1)).get("Musclebound").locked).toBe(false);
	});

	it("Dangerous is the Heavy's alone: no one else learns it", async () => {
		const { char } = heavyAt(1);
		expect((await sheetEntries(char, 1)).get("Dangerous").requiresPlaybook).toBe("The Heavy");
		const { char: fox } = buildLiveCharacter({ slug: "the-fox", name: "The Fox", level: 9 });
		expect((await fox.getForeignMovesForLevelUp({ playbooks: ["The Heavy"] }, 10)).map(m => m.name)).not.toContain("Dangerous");
	});

	it("Seasoned Warrior: level 2+, the Heavy only, a Fox, Marshal, Ranger or Seeker move, three times", async () => {
		const { char } = heavyAt(1);
		const seasoned = (await sheetEntries(char, 1)).get("Seasoned Warrior");
		expect(seasoned).toMatchObject({ minLevel: 2, requiresPlaybook: "The Heavy", repeatMax: 3, locked: true });
		expect(seasoned.crossPlaybook.playbooks).toEqual(["The Fox", "The Marshal", "The Ranger", "The Seeker"]);
		expect((await sheetEntries(char, 2)).get("Seasoned Warrior").locked).toBe(false);
		expect(new PlaybookMoveEntry(new MoveDefinition(heavy("Seasoned Warrior")), [], new Set(), new Map(), 6, "The Fox").locked).toBe(true);
		const offered = await char.getForeignMovesForLevelUp(seasoned.crossPlaybook, 2);
		expect(offered.length).toBeGreaterThan(0);
		expect(offered.every(m => seasoned.crossPlaybook.playbooks.includes(m.playbook))).toBe(true);
	});

	it("Improved Stat: three times, to a max of +2; Superior Stat to a max of +3", async () => {
		const entries = await sheetEntries(heavyAt(6).char, 6);
		expect(entries.get("Improved Stat")).toMatchObject({ repeatMax: 3, cap: 2, minLevel: null });
		expect(entries.get("Superior Stat")).toMatchObject({ repeatMax: 1, cap: 3 });
	});

	it("Carved Out of Wood is +4 HP; Cut from Granite +2 HP and +1 armor on top", async () => {
		const { char } = heavyAt(6, { seedStartingMoves: false });
		const bonuses = async () => char._ownedMoveBonuses(await char.playbook(), char._buildOwnedMovesMap());
		await char.addMove(heavy("Carved Out of Wood")._id);
		expect(await bonuses()).toMatchObject({ hp: 4, armor: 0 });
		await char.addMove(heavy("Cut from Granite")._id);
		expect(await bonuses()).toMatchObject({ hp: 6, armor: 1 });
	});

	it("Unstoppable has 5 marks", async () => {
		expect((await sheetEntries(heavyAt(1).char, 1)).get("Unstoppable").resource.max).toBe(5);
	});
});

describe("the Heavy's starting moves", () => {
	it("are Dangerous, Hard to Kill, and either Armored OR Uncanny Reflexes, with no pick of your choice", () => {
		expect(HEAVY_MOVES.startingMovesNote).toBe("You start with Dangerous, Hard to Kill, and either Armored OR Uncanny Reflexes.");
		expect(parseMovePickCount(HEAVY_MOVES.startingMovesNote)).toBe(0);
		expect(HEAVY_GROUPS.map(g => g.options)).toEqual([["Armored", "Uncanny Reflexes"]]);
		const starting = sourceMovesFor("The Heavy").filter(d => d.system.isStartingMove).map(d => d.name).sort();
		expect(starting).toEqual(["Armored", "Dangerous", "Hard to Kill", "Uncanny Reflexes"]);
	});

	it("onboarding has no free pick to make, and never offers the Sheriff's Bark an Order to another background", () => {
		const d = Object.create(CharacterOnboardingDialog.prototype);
		d._initializeState(pbDoc("the-heavy"), null, null);
		d._movesCache = sourceMovesFor("The Heavy").map(doc => ({ id: doc._id, name: doc.name, system: doc.system }));
		Object.assign(d._selections, { backgroundSlug: "blood-soaked-past", moveChoices: { 0: heavy("Armored")._id } });
		expect(d._movePickCount).toBe(0);
		const offered = d._freePickOffers().map(doc => doc.name);
		expect(offered).toContain("Formidable");
		expect(offered).not.toContain("Bark an Order");
	});
});

// ── Armored: the Heavy's, the Judge's and the Marshal's ─────────────────────────
// The same move in three playbooks. A cross-playbook pick of another playbook's Armored by a
// character whose own playbook has one is an ordinary pick of their own, never a foreign move.

// A 2nd-level Heavy who started with Uncanny Reflexes and took Seasoned Warrior.
function reflexesHeavy(extra = () => []) {
	const seasoned = moveItem(heavy("Seasoned Warrior"));
	const made = heavyAt(2, { seedStartingMoves: false, items: [
		moveItem(heavy("Dangerous")), moveItem(heavy("Hard to Kill")),
		moveItem(heavy("Uncanny Reflexes"), stamp(STARTING_CHOICE_FLAG)),
		seasoned, ...extra(seasoned),
	] });
	return { ...made, seasoned };
}

describe("Armored, across playbooks", () => {
	it("Seasoned Warrior never offers a Heavy who started with Uncanny Reflexes the Marshal's Armored", async () => {
		const { char } = reflexesHeavy();
		const offered = await char.getForeignMovesForLevelUp(heavy("Seasoned Warrior").system.crossPlaybook, 2);
		expect(offered.map(m => m.playbook)).toContain("The Marshal");
		expect(offered.map(m => m.name)).not.toContain("Armored");
	});

	it("Arts of War never offers a Marshal the Heavy's or the Judge's Armored", async () => {
		const { char, actor } = buildLiveCharacter({ slug: "the-marshal", name: "The Marshal", level: 9 });
		expect(ownedMoveNames(actor)).not.toContain("Armored");
		const offered = await char.getForeignMovesForLevelUp(marshal("Arts of War").system.crossPlaybook, 10);
		expect(offered.map(m => m.playbook)).toEqual(expect.arrayContaining(["The Heavy", "The Judge"]));
		expect(offered.map(m => m.name)).not.toContain("Armored");
	});

	// A world from before the offer was closed: the Marshal's Armored, granted by Seasoned Warrior.
	const grantedArmored = seasoned => [moveItem(marshal("Armored"), {
		[STONETOP_SCOPE]: { grantedBy: { move: "Seasoned Warrior", instanceId: seasoned._id } },
	})];

	it("one already granted sits in Learned Moves with its \"Granted by\", out of the level's picks", async () => {
		const { char, actor } = reflexesHeavy(grantedArmored);
		const granted = actor.items.find(i => i.name === "Armored");
		const { movelist } = await char.buildSnapshot();

		expect(movelist.learnedMoves.find(m => m.name === "Armored"))
			.toMatchObject({ ownedIds: [granted._id], sourceLabel: "Granted by Seasoned Warrior · The Marshal" });
		// The Heavy's own row holds none of it, so its box can't untick the grant.
		expect(movelist.playbookMoves.find(m => m.name === "Armored")).toMatchObject({ owned: false, ownedIds: [] });
		expect(movelist.levelMovesOverage).toBe(0);
		expect(movelist.levelMovesShortfall).toBe(0);
		// Held already, so a level-up does not offer the Heavy's own.
		expect((await char.getLevelUpData()).availableMoves.map(m => m.name)).not.toContain("Armored");
	});

	it("one already granted doesn't stop a re-run of onboarding giving the Heavy their own", async () => {
		const { char, actor } = reflexesHeavy(grantedArmored);

		await char.applyStartingMoveChoices(HEAVY_GROUPS, { 0: heavy("Armored")._id });

		const armored = actor.items.filter(i => i.name === "Armored");
		expect(armored.map(i => i.system.playbook).sort()).toEqual(["The Heavy", "The Marshal"]);
		expect(armored.find(i => i.system.playbook === "The Heavy").flags[STONETOP_SCOPE][STARTING_CHOICE_FLAG]).toBe(true);
		expect(ownedMoveNames(actor)).not.toContain("Uncanny Reflexes");
	});

	it("the other way: a Marshal holding the Heavy's Armored through Arts of War takes their own as onboarding's free pick", async () => {
		const arts = moveItem(marshal("Arts of War"));
		const { char, actor } = buildLiveCharacter({ slug: "the-marshal", name: "The Marshal", level: 3, items: [arts,
			moveItem(heavy("Armored"), { [STONETOP_SCOPE]: { grantedBy: { move: "Arts of War", instanceId: arts._id } } })] });

		await char.addMove(marshal("Armored")._id, { skipIfOwned: true });
		await char.markCreationPick("Armored");

		const armored = playbook => actor.items.find(i => i.name === "Armored" && i.system.playbook === playbook);
		expect(armored("The Marshal").flags[STONETOP_SCOPE][CREATION_PICK_FLAG]).toBe(true);
		expect(armored("The Heavy").flags[STONETOP_SCOPE][CREATION_PICK_FLAG]).toBeUndefined();
	});
});
