import { describe, it, expect } from "vitest";
import {
	HOLY_LIGHT_FLAG, CONSECRATED_FLAME, INVOKE_THE_SUN_GOD, EMPOWERED_INVOCATIONS,
	ownsMoveNamed, canWieldHolyLight, showHolyLight,
} from "../../../module/actors/character/holy-light.js";

const actorWith = (...items) => ({ items });
const move = name => ({ type: "move", name });

describe("who can wield a holy light", () => {
	it("counts each of the three moves that MAKE one", () => {
		for (const name of [CONSECRATED_FLAME, INVOKE_THE_SUN_GOD, "Wielder of the White Flame"]) {
			expect(canWieldHolyLight(actorWith(move(name))), name).toBe(true);
		}
	});

	it("says no for a character with none of them", () => {
		expect(canWieldHolyLight(actorWith(move("Guardian"), move("Clash")))).toBe(false);
		expect(canWieldHolyLight(actorWith())).toBe(false);
		expect(canWieldHolyLight(null)).toBe(false);
	});

	// The type check is the point: an inventory item or an arcanum sharing a move's name
	// must not light the candle.
	it("only counts MOVES, not anything else named the same", () => {
		expect(canWieldHolyLight(actorWith({ type: "item", name: CONSECRATED_FLAME }))).toBe(false);
		expect(ownsMoveNamed(actorWith({ type: "item", name: CONSECRATED_FLAME }), CONSECRATED_FLAME)).toBe(false);
		expect(ownsMoveNamed(actorWith(move(CONSECRATED_FLAME)), CONSECRATED_FLAME)).toBe(true);
	});
});

describe("whether the candle renders at all", () => {
	it("shows for anyone who can make a light", () => {
		expect(showHolyLight({ owns: true, lit: false })).toBe(true);
	});

	// Drop a new playbook over a Lightbearer and the moves go, but the flag doesn't — hide
	// the candle then and a burning light can never be put out.
	it("keeps showing a LIT light on a sheet that can no longer make one", () => {
		expect(showHolyLight({ owns: false, lit: true })).toBe(true);
	});

	it("stays off an ordinary sheet", () => {
		expect(showHolyLight({ owns: false, lit: false })).toBe(false);
	});
});

// The gate is name-matched against the pack files, so a rename in either place silently
// stops lighting the candle. This is the guard for that.
describe("the names the gate matches on", () => {
	it("spells the moves exactly as the packs do", () => {
		expect(CONSECRATED_FLAME).toBe("Consecrated Flame");
		expect(INVOKE_THE_SUN_GOD).toBe("Invoke the Sun God");
		expect(EMPOWERED_INVOCATIONS).toBe("Empowered Invocations");
	});

	it("keys the flag on holyLight", () => {
		expect(HOLY_LIGHT_FLAG).toBe("holyLight");
	});
});
