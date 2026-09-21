import { describe, it, expect } from "vitest";
import {
	CREW_SIZE_MAX,
	crewAnonymousCount,
	crewExists,
	customGroupSize,
	effectiveCrewSize,
	groupFollowerStanding,
	groupFollowerMembers,
} from "../../module/utils/crew.js";

describe("how many of a group follower are still standing", () => {
	it("counts the crew's named individuals and anonymous tail, a missing HP as full", () => {
		const flags = { crew: { size: 6, individuals: [{ name: "Lowri" }, { name: "Bran" }], individualsHp: { 0: 0, 1: 4 }, memberHp: [6, 0, null] } };
		expect(groupFollowerStanding(flags, { ftype: "crew" })).toEqual({ standing: 4, size: 6 });
	});

	it("reads a crew with no size stored as the book's half-dozen", () => {
		expect(groupFollowerStanding({ crew: { name: "The Crew" } }, { ftype: "crew" })).toEqual({ standing: 6, size: 6 });
	});

	it("counts a custom group's members, and ignores a custom follower who is not a group", () => {
		const flags = { customFollowers: { warband: { isGroup: true, size: 4, memberHp: [0, 2, 0] }, enfys: { name: "Enfys" } } };
		expect(groupFollowerStanding(flags, { ftype: "custom", slug: "warband" })).toEqual({ standing: 2, size: 4 });
		expect(groupFollowerStanding(flags, { ftype: "custom", slug: "enfys" })).toBeNull();
	});

	it("has nothing to say about any other follower", () => {
		expect(groupFollowerStanding({ animalCompanion: {} }, { ftype: "animal-companion" })).toBeNull();
		expect(groupFollowerStanding({}, { ftype: "crew" })).toBeNull();
	});
});

// Book I p.471: "When a PC directs an individual member of a group, they can trigger moves as if they
// were a follower themselves. The group's tags and moves apply, plus any unique tags or moves they have
// as an individual." These are the members the Order dialog offers to direct that way.
describe("a group follower's members, to direct one of them on their own", () => {
	it("lists the crew's named individuals first with their own tag and traits, then the anonymous tail", () => {
		const flags = { crew: {
			size: 4,
			individuals: [{ name: "Glaw", tag: "small", traits: ["too serious"] }, { name: "Hari", tag: "", traits: [] }],
		} };
		expect(groupFollowerMembers(flags, { ftype: "crew" })).toEqual([
			{ key: "named:0", name: "Glaw", tags: ["small", "too serious"] },
			{ key: "named:1", name: "Hari", tags: [] },
			{ key: "anon:0", name: "Crew member 3", tags: [] },
			{ key: "anon:1", name: "Crew member 4", tags: [] },
		]);
	});

	it("leaves out anyone at 0 HP, who is out of the action", () => {
		const flags = { crew: { size: 4, individuals: [{ name: "Glaw" }, { name: "Hari" }], individualsHp: { 0: 0 }, memberHp: [5, 0] } };
		expect(groupFollowerMembers(flags, { ftype: "crew" }).map(m => m.name)).toEqual(["Hari", "Crew member 3"]);
	});

	it("names an individual who has not been named yet by their roster row", () => {
		const flags = { crew: { size: 1, individuals: [{ name: " ", tag: "eager" }] } };
		expect(groupFollowerMembers(flags, { ftype: "crew" })).toEqual([{ key: "named:0", name: "Crew member 1", tags: ["eager"] }]);
	});

	it("numbers a custom group's members, none of whom have tags of their own", () => {
		const flags = { customFollowers: { posse: { isGroup: true, size: 3, memberHp: [4, 0] } } };
		expect(groupFollowerMembers(flags, { ftype: "custom", slug: "posse" })).toEqual([
			{ key: "member:0", name: "Member 1", tags: [] },
			{ key: "member:2", name: "Member 3", tags: [] },
		]);
	});

	it("has no members for a follower who is one person, or a crew that is not there", () => {
		expect(groupFollowerMembers({ customFollowers: { enfys: { name: "Enfys" } } }, { ftype: "custom", slug: "enfys" })).toEqual([]);
		expect(groupFollowerMembers({ animalCompanion: {} }, { ftype: "animal-companion" })).toEqual([]);
		expect(groupFollowerMembers({}, { ftype: "crew" })).toEqual([]);
	});
});

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
