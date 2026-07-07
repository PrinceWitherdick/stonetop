import { describe, expect, it } from "vitest";
import {
	stepPcDone,
	nextActiveIndex,
	firstActiveIndex,
	turnsUntilActive,
} from "../../module/dialogs/introductions-flow.js";

describe("stepPcDone", () => {
	it("is done when the PC passed", () => {
		expect(stepPcDone({ answers: [], passed: true }, 4)).toBe(true);
	});
	it("is done when the PC has answered every question", () => {
		expect(stepPcDone({ answers: [{}, {}, {}, {}], passed: false }, 4)).toBe(true);
	});
	it("is not done with answers remaining and no pass", () => {
		expect(stepPcDone({ answers: [{}, {}], passed: false }, 4)).toBe(false);
	});
	it("treats a missing/empty record as not done", () => {
		expect(stepPcDone(undefined, 4)).toBe(false);
		expect(stepPcDone({}, 4)).toBe(false);
	});
	it("treats a step with no questions as done (can't answer, can't exhaust)", () => {
		expect(stepPcDone({ answers: [], passed: false }, 0)).toBe(true);
	});
});

describe("nextActiveIndex", () => {
	// done map: index → done?
	const doneFn = (map) => (idx) => !!map[idx];

	it("moves to the next active PC with wrap-around", () => {
		// 3 PCs, none done. From index 2 wraps to 0.
		expect(nextActiveIndex(2, 3, doneFn({}))).toBe(0);
		expect(nextActiveIndex(0, 3, doneFn({}))).toBe(1);
	});
	it("skips PCs that are already done", () => {
		// From 0, PC1 done, PC2 active.
		expect(nextActiveIndex(0, 3, doneFn({ 1: true }))).toBe(2);
	});
	it("stays on the current PC when they are the only one left active", () => {
		// From 1, PCs 0 and 2 are done, PC1 still active → returns 1.
		expect(nextActiveIndex(1, 3, doneFn({ 0: true, 2: true }))).toBe(1);
	});
	it("returns -1 when everyone is done", () => {
		expect(nextActiveIndex(0, 3, doneFn({ 0: true, 1: true, 2: true }))).toBe(-1);
	});
	it("returns -1 for an empty roster", () => {
		expect(nextActiveIndex(0, 0, doneFn({}))).toBe(-1);
	});
});

describe("firstActiveIndex", () => {
	const doneFn = (map) => (idx) => !!map[idx];
	it("finds the first active PC", () => {
		expect(firstActiveIndex(3, doneFn({ 0: true }))).toBe(1);
	});
	it("returns -1 when all are done", () => {
		expect(firstActiveIndex(2, doneFn({ 0: true, 1: true }))).toBe(-1);
	});
});

describe("turnsUntilActive", () => {
	const doneFn = (map) => (idx) => !!map[idx];

	it("is 0 turns away when the target is the current turn", () => {
		expect(turnsUntilActive(1, 1, 3, doneFn({}))).toBe(0);
	});
	it("counts turns forward with wrap-around", () => {
		// From 2, target 0 is one active turn away (2 → 0); target 1 is two away.
		expect(turnsUntilActive(2, 0, 3, doneFn({}))).toBe(1);
		expect(turnsUntilActive(2, 1, 3, doneFn({}))).toBe(2);
	});
	it("skips PCs that are already done when counting", () => {
		// From 0, PC1 done: PC2 is the first upcoming active turn (1 away).
		expect(turnsUntilActive(0, 2, 3, doneFn({ 1: true }))).toBe(1);
	});
	it("returns -1 when the target itself is done", () => {
		expect(turnsUntilActive(0, 2, 3, doneFn({ 2: true }))).toBe(-1);
	});
	it("returns -1 for an empty roster or a negative target", () => {
		expect(turnsUntilActive(0, 0, 0, doneFn({}))).toBe(-1);
		expect(turnsUntilActive(0, -1, 3, doneFn({}))).toBe(-1);
	});
});
