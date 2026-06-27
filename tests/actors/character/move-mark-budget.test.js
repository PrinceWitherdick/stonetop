import { describe, expect, it } from "vitest";
import { moveMarkBudget } from "../../../module/actors/character/move-mark-budget.js";

describe("moveMarkBudget", () => {
	it("returns null (uncapped) when the move declares no budget", () => {
		expect(moveMarkBudget(null, 3)).toBeNull();
		expect(moveMarkBudget(undefined, 3)).toBeNull();
		expect(moveMarkBudget({}, 3)).toBeNull();
		expect(moveMarkBudget({ perExtra: 2 }, 3)).toBeNull(); // base is the required key
	});

	it("pick-1-each-time ({base:1, perExtra:1}) grows by one per owned copy", () => {
		const b = { base: 1, perExtra: 1 };
		expect(moveMarkBudget(b, 1)).toBe(1);
		expect(moveMarkBudget(b, 2)).toBe(2);
		expect(moveMarkBudget(b, 3)).toBe(3);
	});

	it("Well Versed ({base:1, perExtra:2}) yields 2·count − 1", () => {
		const b = { base: 1, perExtra: 2 };
		expect(moveMarkBudget(b, 1)).toBe(1);
		expect(moveMarkBudget(b, 2)).toBe(3);
		expect(moveMarkBudget(b, 3)).toBe(5);
		expect(moveMarkBudget(b, 4)).toBe(7);
	});

	it("yields 0 for an UNowned move (no copies ⇒ no picks)", () => {
		// You can't mark a move's options before you've taken it — the render locks
		// every box on an unowned move instead of offering `base` phantom picks.
		expect(moveMarkBudget({ base: 1, perExtra: 1 }, 0)).toBe(0);
		expect(moveMarkBudget({ base: 1, perExtra: 2 }, 0)).toBe(0);
		expect(moveMarkBudget({ base: 3, perExtra: 1 }, 0)).toBe(0);
	});

	it("defaults perExtra to 0 (a flat budget that never grows)", () => {
		expect(moveMarkBudget({ base: 2 }, 5)).toBe(2);
	});

	it("never returns a negative budget", () => {
		expect(moveMarkBudget({ base: 0, perExtra: -5 }, 4)).toBe(0);
	});
});
