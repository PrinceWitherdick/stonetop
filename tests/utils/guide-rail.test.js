import { describe, it, expect } from "vitest";
import { guideRailStep } from "../../module/utils/guide-rail.js";

// The rail's Back/Next arithmetic, shared by every stepped dialog (WelcomeDialog,
// CreateMonsterDialog, StonetopArcanumSheet, WoundDialog, CustomMoveDialog). Pure, so the
// ends of the rail — the part a click can't easily be made to demonstrate — are testable.
const SECTIONS = [
	{ key: "one" }, { key: "two" }, { key: "three" },
];

describe("guideRailStep", () => {
	it("walks forward and back through the rail", () => {
		expect(guideRailStep(SECTIONS, "one", 1)).toEqual({ key: "two" });
		expect(guideRailStep(SECTIONS, "two", 1)).toEqual({ key: "three" });
		expect(guideRailStep(SECTIONS, "three", -1)).toEqual({ key: "two" });
		expect(guideRailStep(SECTIONS, "two", -1)).toEqual({ key: "one" });
	});

	// Callers key their Back/Next off a falsy answer, so the ends have to be falsy rather
	// than wrapping around to the other end of the rail.
	it("stops at both ends", () => {
		expect(guideRailStep(SECTIONS, "one", -1)).toBeUndefined();
		expect(guideRailStep(SECTIONS, "three", 1)).toBeUndefined();
	});

	// findIndex answers -1 for a key that isn't in the rail, so the bare arithmetic
	// `sections[-1 + 1]` would send Next to the FIRST section — a wrong answer that looks
	// like a working button.
	it("refuses to step from a key the rail does not hold", () => {
		expect(guideRailStep(SECTIONS, "nope", 1)).toBeUndefined();
		expect(guideRailStep(SECTIONS, "nope", -1)).toBeUndefined();
		expect(guideRailStep(SECTIONS, undefined, 1)).toBeUndefined();
	});

	it("is safe on an empty rail", () => {
		expect(guideRailStep([], "one", 1)).toBeUndefined();
	});
});
