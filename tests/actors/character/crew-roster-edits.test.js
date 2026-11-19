import { describe, it, expect } from "vitest";
import {
	crewGroupHpClampUpdate, crewResizeUpdate, customGroupResizeUpdate, crewMemberPromotionUpdate,
} from "../../../module/actors/character/follower-fate.js";
import { CREW_SIZE_MAX } from "../../../module/utils/crew.js";

// The Roster's own edits (follower-fate.js): the crew's headcount stepper, a custom group's, and
// naming an anonymous crew member. Each cuts or moves a slot of the arrays parallel to the roster
// (memberHp, memberPortrait, memberDead) — the same arrays the fate dialog's removals cut.

const CREW = "flags.stonetop_pwd.crew";
const BAND = "flags.stonetop_pwd.customFollowers.band";

// Two named, four anonymous behind them, two of whom have faces.
const crew = (extra = {}) => ({
	size: 6,
	individuals: [{ name: "Aled" }, { name: "Eira" }],
	individualsHp: { 0: 6, 1: 2 },
	memberHp: [6, 0, 4, 5],
	memberPortrait: [{ img: "a.webp" }, null, { img: "c.webp", portraitFrame: { scale: 2 } }],
	...extra,
});

describe("crewGroupHpClampUpdate", () => {
	it("brings an explicitly-set pool over one member's HP back down to it", () => {
		expect(crewGroupHpClampUpdate({ groupHp: 12 }, 6)).toEqual({ [`${CREW}.groupHp`]: 6 });
	});

	it("leaves a pool at or under the ceiling, and an unset one, alone", () => {
		expect(crewGroupHpClampUpdate({ groupHp: 6 }, 6)).toEqual({});
		expect(crewGroupHpClampUpdate({}, 6)).toEqual({});
		expect(crewGroupHpClampUpdate({ groupHp: null }, 6)).toEqual({});
	});

	it("takes the rulebook's 6 when no ceiling is given", () => {
		expect(crewGroupHpClampUpdate({ groupHp: 9 })).toEqual({ [`${CREW}.groupHp`]: 6 });
	});
});

describe("crewResizeUpdate", () => {
	it("shrinking trims the anonymous tail's HP and faces by the same cut", () => {
		expect(crewResizeUpdate(crew(), 3)).toEqual({
			[`${CREW}.size`]:           3,
			[`${CREW}.memberHp`]:       [6],
			[`${CREW}.memberPortrait`]: [{ img: "a.webp" }],
		});
	});

	it("never drops below the named individuals, nor goes past the cap", () => {
		expect(crewResizeUpdate(crew(), 0)[`${CREW}.size`]).toBe(2);
		expect(crewResizeUpdate(crew(), -4)[`${CREW}.memberHp`]).toEqual([]);
		expect(crewResizeUpdate(crew(), CREW_SIZE_MAX + 10)[`${CREW}.size`]).toBe(CREW_SIZE_MAX);
	});

	it("growing keeps every stored slot, and writes no portrait store it does not have to trim", () => {
		const update = crewResizeUpdate(crew(), 8);
		expect(update).toEqual({ [`${CREW}.size`]: 8, [`${CREW}.memberHp`]: [6, 0, 4, 5] });
		expect(crewResizeUpdate(crew({ memberPortrait: undefined }), 2)).not.toHaveProperty(`${CREW}.memberPortrait`);
	});

	it("clamps the group pool in the same write", () => {
		expect(crewResizeUpdate(crew({ groupHp: 10 }), 6, { memberHpMax: 8 })[`${CREW}.groupHp`]).toBe(8);
		expect(crewResizeUpdate(crew({ groupHp: 8 }), 6, { memberHpMax: 8 })).not.toHaveProperty(`${CREW}.groupHp`);
	});

	it("reads a crew with nothing stored as an empty roster", () => {
		expect(crewResizeUpdate({}, 4)).toEqual({ [`${CREW}.size`]: 4, [`${CREW}.memberHp`]: [] });
	});
});

describe("customGroupResizeUpdate", () => {
	const band = (extra = {}) => ({
		isGroup: true, size: 4, hpMax: 5,
		memberHp: [5, 3, 0, 4], memberPortrait: ["a.webp", "b.webp", "c.webp"], memberDead: [null, null, true],
		...extra,
	});

	it("cuts every parallel array to the new size", () => {
		expect(customGroupResizeUpdate(band(), "band", 2)).toEqual({
			[`${BAND}.size`]:           2,
			[`${BAND}.memberHp`]:       [5, 3],
			[`${BAND}.memberPortrait`]: ["a.webp", "b.webp"],
			[`${BAND}.memberDead`]:     [null, null],
		});
	});

	it("floors at two and leaves arrays already within the size untouched", () => {
		expect(customGroupResizeUpdate(band(), "band", 1)[`${BAND}.size`]).toBe(2);
		expect(customGroupResizeUpdate(band(), "band", "6")).toEqual({ [`${BAND}.size`]: 6 });
	});

	it("brings a pool stored over one member's HP down to it", () => {
		expect(customGroupResizeUpdate(band({ groupHp: 20 }), "band", 4)[`${BAND}.groupHp`]).toBe(5);
		expect(customGroupResizeUpdate(band({ groupHp: 5 }), "band", 4)).not.toHaveProperty(`${BAND}.groupHp`);
		// No stored max reads as 1.
		expect(customGroupResizeUpdate(band({ hpMax: undefined, groupHp: 3 }), "band", 4)[`${BAND}.groupHp`]).toBe(1);
	});

	it("is nothing for a follower that is not there", () => {
		expect(customGroupResizeUpdate(undefined, "band", 3)).toBeNull();
		expect(customGroupResizeUpdate(band(), "", 3)).toBeNull();
	});
});

describe("crewMemberPromotionUpdate", () => {
	const named = { name: "Glaw", tag: "eager", traits: ["bald"] };

	it("appends the new individual, carrying their HP and face across, and cuts their anonymous slot", () => {
		expect(crewMemberPromotionUpdate(crew(), 2, named)).toEqual({
			[`${CREW}.individuals`]:    [{ name: "Aled" }, { name: "Eira" }, { name: "Glaw", tag: "eager", traits: ["bald"], img: "c.webp", portraitFrame: { scale: 2 } }],
			[`${CREW}.individualsHp`]:  { 0: 6, 1: 2, 2: 4 },
			[`${CREW}.memberHp`]:       [6, 0, 5],
			[`${CREW}.memberPortrait`]: [{ img: "a.webp" }, null],
		});
	});

	it("a member with no HP stored and no face comes across at full, faceless", () => {
		const update = crewMemberPromotionUpdate(crew({ memberHp: [6, null] }), 1, named);
		expect(update[`${CREW}.individuals`].at(-1)).toEqual(named);
		expect(update[`${CREW}.individualsHp`]).toEqual({ 0: 6, 1: 2 });
		// The empty slot still leaves the portrait array, which is still written.
		expect(update[`${CREW}.memberPortrait`]).toEqual([{ img: "a.webp" }, { img: "c.webp", portraitFrame: { scale: 2 } }]);
	});

	it("does not seed a portrait store on a crew that never picked a face", () => {
		const update = crewMemberPromotionUpdate(crew({ memberPortrait: [] }), 0, named);
		expect(update).not.toHaveProperty(`${CREW}.memberPortrait`);
		expect(update[`${CREW}.memberHp`]).toEqual([0, 4, 5]);
	});

	it("leaves the crew it was handed untouched", () => {
		const before = crew();
		const snapshot = structuredClone(before);
		crewMemberPromotionUpdate(before, 0, named);
		expect(before).toEqual(snapshot);
	});
});
