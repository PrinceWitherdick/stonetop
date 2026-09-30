// pfg-marks.js: a marking move's FILLED marks, counted one way. Potential for Greatness stores a stat
// slot at its index, so picking the third slot first pads the first two with empty entries, and a
// slot un-picked leaves one behind: counting stored entries over-counts.

import { describe, it, expect } from "vitest";
import {
	markEntries, isFilledMark, filledMarks, filledMarkCount, markCapacity, hasMarkAtLevel,
	trimEmptyTail, oncePerLevelCautions, POTENTIAL_FOR_GREATNESS, ONCE_PER_LEVEL_MARKS,
} from "../../../module/actors/character/pfg-marks.js";

// Potential for Greatness as the pack ships it.
const PFG_OPTIONS = [
	{ slug: "stat", label: "Increase the stat you rolled by 1, to a max of +2", marks: 4, choice: "stat" },
	{ slug: "hp", label: "Increase your max HP by 4", marks: 1, hp: 4 },
	{ slug: "damage", label: "Increase your damage die to a d8", marks: 1, damageDie: "d8" },
];
const EMPTY = { stat: "", level: null };

describe("pfg-marks: filled marks", () => {
	it("a padded or un-picked stat slot is not a mark; a checked box always is", () => {
		const marks = {
			stat: [EMPTY, EMPTY, { stat: "str", level: 2 }],
			hp: [{ stat: "", level: 3 }],
		};
		expect(filledMarkCount(marks, PFG_OPTIONS)).toBe(2);
		expect(filledMarks(marks, PFG_OPTIONS)).toEqual([
			{ slug: "stat", index: 2, stat: "str", level: 2 },
			{ slug: "hp", index: 0, stat: "", level: 3 },
		]);
	});

	it("all six marks filled reads 6, whatever order they were marked in", () => {
		const marks = {
			stat: ["str", "dex", "con", "wis"].map((stat, i) => ({ stat, level: i + 2 })),
			hp: [{ stat: "", level: 6 }],
			damage: [{ stat: "", level: 7 }],
		};
		expect(filledMarkCount(marks, PFG_OPTIONS)).toBe(6);
		expect(markCapacity(PFG_OPTIONS)).toBe(6);
	});

	it("never counts past an option's own boxes", () => {
		expect(filledMarkCount({ hp: [{ stat: "", level: 2 }, { stat: "", level: 3 }] }, PFG_OPTIONS)).toBe(1);
	});

	it("without the options, reads entries by shape: a stat or a level makes a mark", () => {
		expect(isFilledMark(EMPTY)).toBe(false);
		expect(isFilledMark({ stat: "", level: 2 })).toBe(true);
		expect(isFilledMark({ stat: "cha", level: null })).toBe(true);
		expect(filledMarkCount({ stat: [EMPTY, { stat: "int", level: 4 }], hp: [{ stat: "", level: 5 }] })).toBe(2);
	});

	it("reads the legacy shapes (a count, an array of stat strings)", () => {
		expect(markEntries(2)).toEqual([EMPTY, EMPTY]);
		expect(markEntries(["str", ""])).toEqual([{ stat: "str", level: null }, EMPTY]);
		expect(filledMarkCount({ hp: 1, stat: ["str", ""] }, PFG_OPTIONS)).toBe(2);
	});

	it("hasMarkAtLevel asks only filled marks", () => {
		const marks = { stat: [{ stat: "", level: 3 }, { stat: "dex", level: 4 }] };
		expect(hasMarkAtLevel(marks, PFG_OPTIONS, 3)).toBe(false);
		expect(hasMarkAtLevel(marks, PFG_OPTIONS, 4)).toBe(true);
	});
});

describe("pfg-marks: trimEmptyTail", () => {
	it("drops the empty slots at the end, keeps an empty slot before a filled one", () => {
		expect(trimEmptyTail([EMPTY, EMPTY, EMPTY])).toEqual([]);
		expect(trimEmptyTail([EMPTY, { stat: "str", level: 2 }, EMPTY])).toEqual([EMPTY, { stat: "str", level: 2 }]);
	});
});

describe("pfg-marks: once per level", () => {
	it("is Potential for Greatness's rule", () => {
		expect(ONCE_PER_LEVEL_MARKS.has(POTENTIAL_FOR_GREATNESS)).toBe(true);
	});

	it("flags two marks noted at one level, and a mark noted above the current level", () => {
		const marks = {
			stat: [{ stat: "str", level: 3 }, EMPTY, { stat: "dex", level: 3 }],
			hp: [{ stat: "", level: 9 }],
			damage: [{ stat: "", level: 4 }],
		};
		const cautions = oncePerLevelCautions(marks, PFG_OPTIONS, 5);
		expect(Object.fromEntries(cautions)).toEqual({ "stat:0": "shared", "stat:2": "shared", "hp:0": "ahead" });
	});

	it("never flags a mark with no level noted, nor an empty slot", () => {
		const marks = { stat: [{ stat: "str", level: null }, { stat: "", level: 2 }, { stat: "dex", level: null }], hp: [{ stat: "", level: 2 }] };
		expect(oncePerLevelCautions(marks, PFG_OPTIONS, 5).size).toBe(0);
	});
});
