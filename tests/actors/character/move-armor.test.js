import { describe, it, expect } from "vitest";
import { moveArmor, barkskinMarkedBy, MOVE_ARMOR_BASE, CANDLE_AGAINST_THE_DARK } from "../../../module/actors/character/move-armor.js";
import { BARKSKIN, BLESSED_MARKS_FLAG } from "../../../module/actors/character/blessed-marks.js";
import { SYSTEM_ID } from "../../../module/system-id.js";

// The two moves that say a character HAS 2 armor, which is a worn base and not a bonus.

const character = (name, moves, flags = {}) => ({
	id: name, name, type: "character", uuid: `Actor.${name}`,
	items: moves.map(move => (typeof move === "string" ? { type: "move", name: move } : move)),
	getFlag: (scope, key) => (scope === SYSTEM_ID ? flags[key] : undefined),
});

describe("armor a move grants", () => {
	it("gives a Blessed with Barkskin 2 armor", () => {
		expect(moveArmor({ actor: character("Aerin", [BARKSKIN]) })).toEqual({ base: MOVE_ARMOR_BASE, source: BARKSKIN });
	});

	it("gives a Lightbearer 2 armor only while the holy light burns", () => {
		const sael = character("Sael", [CANDLE_AGAINST_THE_DARK]);
		expect(moveArmor({ actor: sael, holyLight: false }).base).toBe(0);
		expect(moveArmor({ actor: sael, holyLight: true })).toEqual({ base: MOVE_ARMOR_BASE, source: CANDLE_AGAINST_THE_DARK });
	});

	it("gives it to whoever wears a Blessed's mark, not just the Blessed", () => {
		expect(moveArmor({ actor: character("Pim", []), markedWithBarkskin: true }).base).toBe(MOVE_ARMOR_BASE);
	});

	it("gives nothing to a character without the moves, or one who switched them off", () => {
		expect(moveArmor({ actor: character("Pim", ["Undaunted"]) }).base).toBe(0);
		const off = character("Aerin", [{ type: "move", name: BARKSKIN, flags: { [SYSTEM_ID]: { learned: false } } }]);
		expect(moveArmor({ actor: off }).base).toBe(0);
	});
});

describe("who is wearing Barkskin", () => {
	const blessed = (rows, moves = [BARKSKIN]) => character("Aerin", moves, { [BLESSED_MARKS_FLAG]: rows });

	it("finds the mark on the Blessed's own roster, by the person it names", () => {
		const pim = character("Pim", []);
		const actors = [blessed([{ kind: "barkskin", uuid: "Actor.Pim", name: "Pim" }])];
		expect(barkskinMarkedBy(pim, actors)).toBe(true);
		expect(barkskinMarkedBy(character("Wren", []), actors)).toBe(false);
	});

	it("matches a row laid from a token against the same person's sheet", () => {
		const pim = character("Pim", []);
		const actors = [blessed([{ kind: "barkskin", uuid: "Scene.s1.Token.t1.Actor.Pim" }])];
		expect(barkskinMarkedBy(pim, actors)).toBe(true);
	});

	it("ignores the Blessed's other kinds of mark, and a Blessed who no longer has the move", () => {
		const pim = character("Pim", []);
		expect(barkskinMarkedBy(pim, [blessed([{ kind: "trackless", uuid: "Actor.Pim" }])])).toBe(false);
		expect(barkskinMarkedBy(pim, [blessed([{ kind: "barkskin", uuid: "Actor.Pim" }], ["Trackless Step"])])).toBe(false);
	});
});
