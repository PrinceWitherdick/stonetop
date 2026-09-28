import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	BATTLE_JOY_FLAG, BATTLE_JOY, BERSERKER,
	ownsMoveNamed, canEnterBattleJoy, showBattleJoy, ignoresDebilities, battleJoyEndsUnrolled,
	battleJoyTierActions, battleJoyRollOptions,
} from "../../../module/actors/character/battle-joy.js";
import { SYSTEM_ID } from "../../../module/system-id.js";

const actorWith = (...items) => ({ items });
const move = name => ({ type: "move", name });
const unlearned = name => ({ type: "move", name, flags: { [SYSTEM_ID]: { learned: false } } });

describe("who can enter a Battle Joy", () => {
	it("counts the move that makes the state", () => {
		expect(canEnterBattleJoy(actorWith(move(BATTLE_JOY)))).toBe(true);
	});

	// A move kept on the sheet switched off enters nothing, and so earns no glyph.
	it("needs the move LEARNED, not just owned", () => {
		expect(canEnterBattleJoy(actorWith(unlearned(BATTLE_JOY)))).toBe(false);
		expect(canEnterBattleJoy(actorWith(unlearned(BATTLE_JOY)), new Set([BATTLE_JOY]))).toBe(false);
	});

	// A playbook change asks with the names it is keeping: a Battle Joy on its way out makes nothing.
	it("reads ownership off the Set it is handed", () => {
		expect(canEnterBattleJoy(actorWith(move(BATTLE_JOY)), new Set())).toBe(false);
		expect(canEnterBattleJoy(actorWith(move(BATTLE_JOY)), new Set([BATTLE_JOY]))).toBe(true);
	});

	// Berserker only READS the state ("while in your Battle Joy…") and its own requirement is
	// Battle Joy, so nobody owns the reader without the maker. Counting it here would have earned
	// the glyph to a sheet that cannot enter the state at all.
	it("does NOT count Berserker on its own", () => {
		expect(canEnterBattleJoy(actorWith(move(BERSERKER)))).toBe(false);
	});

	it("says no for a character with neither", () => {
		expect(canEnterBattleJoy(actorWith(move("Guardian"), move("Clash")))).toBe(false);
		expect(canEnterBattleJoy(actorWith())).toBe(false);
		expect(canEnterBattleJoy(null)).toBe(false);
	});

	// The type check is the point: an inventory item or an arcanum sharing a move's name must not
	// earn the glyph.
	it("only counts MOVES, not anything else named the same", () => {
		expect(canEnterBattleJoy(actorWith({ type: "item", name: BATTLE_JOY }))).toBe(false);
		expect(ownsMoveNamed(actorWith(move(BATTLE_JOY)), BATTLE_JOY)).toBe(true);
	});
});

describe("whether the glyph renders at all", () => {
	it("shows for anyone who owns the move", () => {
		expect(showBattleJoy({ owns: true, raging: false })).toBe(true);
	});

	// Worse than a stranded candle: a stranded rage goes on cancelling the character's debilities
	// with nothing left on the sheet that could switch it off.
	it("keeps showing a RAGING sheet that can no longer enter one", () => {
		expect(showBattleJoy({ owns: false, raging: true })).toBe(true);
	});

	it("stays off an ordinary sheet", () => {
		expect(showBattleJoy({ owns: false, raging: false })).toBe(false);
	});
});

describe("ignoring the effects of debilities", () => {
	it("is 'are they raging, with the move learned'", () => {
		expect(ignoresDebilities({ raging: true, learned: true })).toBe(true);
		expect(ignoresDebilities({ raging: false, learned: true })).toBe(false);
	});

	// A rage stranded on a sheet whose Battle Joy was switched off keeps its glyph so it can be ended,
	// and ignores nothing meanwhile.
	it("ignores nothing once the move is un-learned", () => {
		expect(ignoresDebilities({ raging: true, learned: false })).toBe(false);
		expect(ignoresDebilities({ raging: true })).toBe(false);
	});

	// Called from the roll path with whatever the flag held, which validates nothing.
	it("survives being asked with nothing", () => {
		expect(ignoresDebilities()).toBe(false);
		expect(ignoresDebilities({})).toBe(false);
	});
});

// The ruling: a Heavy who drops has stopped fighting, so their Battle Joy ends with no +CON roll.
describe("when the Battle Joy ends with no roll", () => {
	const at = (hp, deathsDoor = null) => ({
		system: { attributes: { hp: { value: hp } } },
		flags: { [SYSTEM_ID]: deathsDoor ? { deathsDoor } : {} },
	});

	it("for one at 0 HP, or with Death's Door dying, owed or behind them", () => {
		expect(battleJoyEndsUnrolled(at(0))).toBe(true);
		expect(battleJoyEndsUnrolled(at(0, "dying"))).toBe(true);
		expect(battleJoyEndsUnrolled(at(3, "fate-pending"))).toBe(true);
		expect(battleJoyEndsUnrolled(at(3, "dead"))).toBe(true);
	});

	it("not for a Heavy still standing", () => {
		expect(battleJoyEndsUnrolled(at(5))).toBe(false);
		expect(battleJoyEndsUnrolled(at(5, "out-of-action"))).toBe(false);
	});
});

// "On a 10+, that was a rush, regain 1d4 HP; ... on a 6-, mark a debility but don't mark XP."
describe("the ending roll's card", () => {
	const DEBILITIES = [
		{ key: "weakened", name: "Weakened", marked: false },
		{ key: "dazed", name: "Dazed", marked: true },
		{ key: "miserable", name: "Miserable", marked: false },
	];

	it("offers the 10+'s regain and a 6- button per debility not yet marked, nothing on a 7-9", () => {
		const actions = battleJoyTierActions(DEBILITIES);
		expect(actions.success).toContain('data-choice="regain"');
		expect(actions.success).toContain("regain 1d4 HP");
		expect(actions.failure).toContain('data-choice="weakened"');
		expect(actions.failure).toContain("Mark Miserable");
		expect(actions.failure).not.toContain("dazed");
		expect(actions.partial).toBeUndefined();
	});

	it("rolls with no XP on a miss", () => {
		expect(battleJoyRollOptions(DEBILITIES)).toMatchObject({ noXpOnMiss: true });
	});
});

// The pack's own copy: no XP on a 6- in the data too, and its paraphrase without an em dash.
describe("the packaged Battle Joy", () => {
	const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
	const doc = JSON.parse(fs.readFileSync(path.join(ROOT, "packs/src/stonetop-items/playbook-moves/the-heavy/battle-joy.json"), "utf8"));

	it("says noXpOnMiss", () => {
		expect(doc.system.noXpOnMiss).toBe(true);
	});

	it("paraphrases its tiers without an em dash", () => {
		expect(JSON.stringify(doc.system.moveResults)).not.toContain(String.fromCharCode(0x2014));
	});
});

// The gate is name-matched against the pack files, so a rename in either place silently stops
// showing the glyph. This is the guard for that.
describe("the names the gate matches on", () => {
	it("spells the moves exactly as the packs do", () => {
		expect(BATTLE_JOY).toBe("Battle Joy");
		expect(BERSERKER).toBe("Berserker");
	});

	it("keys the flag on battleJoy", () => {
		expect(BATTLE_JOY_FLAG).toBe("battleJoy");
	});
});
