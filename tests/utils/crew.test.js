import { describe, it, expect } from "vitest";
import {
	CREW_SIZE_MAX,
	crewAnonymousCount,
	crewExists,
	customGroupSize,
	effectiveCrewSize,
} from "../../module/utils/crew.js";

// This arithmetic decides three separate things that must agree: how many rows the Roster draws,
// how far the size stepper trims the parallel HP / portrait arrays, and — since the portrait store
// gained a bound — which member a face may be stored against at all. It lived inline on the sheet
// where none of it could be tested; these are the cases the three callers actually depend on.

describe("does a crew exist", () => {
	it("is false for nothing at all", () => {
		expect(crewExists(null)).toBe(false);
		expect(crewExists({})).toBe(false);
	});

	it("is true on any one defining field", () => {
		expect(crewExists({ name: "The Red Shields" })).toBe(true);
		expect(crewExists({ tags: ["loyal"] })).toBe(true);
		expect(crewExists({ instinct: "to bicker" })).toBe(true);
		expect(crewExists({ cost: "merry-making" })).toBe(true);
		expect(crewExists({ individuals: [{ name: "Aled" }] })).toBe(true);
	});

	it("is false when those fields are present but empty", () => {
		expect(crewExists({ name: "", tags: [], instinct: "", cost: "", individuals: [] })).toBe(false);
	});
});

describe("the crew's headcount", () => {
	// "A half-dozen strong by default" (Crew insert, p.144).
	it("defaults to six when no size was ever stored", () => {
		expect(effectiveCrewSize(undefined, 0)).toBe(6);
		expect(effectiveCrewSize(null, 0)).toBe(6);
		expect(effectiveCrewSize("nonsense", 0)).toBe(6);
	});

	// An explicit 0 is honoured, so emptying the roster doesn't spring back to six.
	it("honours an explicit zero rather than springing back to the default", () => {
		expect(effectiveCrewSize(0, 0)).toBe(0);
	});

	it("never falls below the members who have been named", () => {
		expect(effectiveCrewSize(2, 5)).toBe(5);
		expect(effectiveCrewSize(0, 3)).toBe(3);
		expect(effectiveCrewSize(-4, 2)).toBe(2);
	});

	it("takes the stored size when it is the larger", () => {
		expect(effectiveCrewSize(9, 2)).toBe(9);
	});
});

describe("the crew's anonymous tail", () => {
	// The named individuals come off the FRONT of the headcount, so a crew of six with two named
	// has four anonymous bodies — the range a face may be stored against.
	it("is the headcount less the named members", () => {
		expect(crewAnonymousCount({ size: 6, individuals: [{ name: "Aled" }, { name: "Eira" }] })).toBe(4);
	});

	it("is the whole default half-dozen when nobody is named", () => {
		expect(crewAnonymousCount({})).toBe(6);
		expect(crewAnonymousCount(undefined)).toBe(6);
	});

	it("is empty when everyone on the roster is named", () => {
		expect(crewAnonymousCount({ size: 2, individuals: [{ name: "Aled" }, { name: "Eira" }] })).toBe(0);
	});

	// The size floor means a roster can never owe more named members than it holds.
	it("never goes negative when more are named than the stored size", () => {
		expect(crewAnonymousCount({ size: 1, individuals: [{ name: "Aled" }, { name: "Eira" }] })).toBe(0);
	});
});

describe("a custom group follower's headcount", () => {
	// Two is both the floor and the default: a group of one is a single follower, which is a
	// different card entirely.
	it("is two before any size is stored", () => {
		expect(customGroupSize(undefined)).toBe(2);
		expect(customGroupSize({})).toBe(2);
		expect(customGroupSize({ size: 0 })).toBe(2);
		expect(customGroupSize({ size: 1 })).toBe(2);
	});

	it("takes a stored size above the floor", () => {
		expect(customGroupSize({ size: 7 })).toBe(7);
	});

	// The cap exists so a fat-fingered size cannot build a thousand-member list.
	it("is capped", () => {
		expect(customGroupSize({ size: 5000 })).toBe(CREW_SIZE_MAX);
	});
});
