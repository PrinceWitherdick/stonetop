import { describe, it, expect } from "vitest";
import { mitigateDamage, dieFromDamage } from "../../module/utils/damage.js";

describe("mitigateDamage", () => {
	it("returns raw damage when the target has no armor", () => {
		expect(mitigateDamage(6, { armor: 0 })).toBe(6);
	});

	it("subtracts armor from raw damage", () => {
		expect(mitigateDamage(6, { armor: 2 })).toBe(4);
	});

	it("lets piercing ignore that many points of armor", () => {
		expect(mitigateDamage(6, { armor: 2, piercing: 1 })).toBe(5);
	});

	it("never lets piercing ADD damage past raw (armor floors at 0)", () => {
		expect(mitigateDamage(6, { armor: 1, piercing: 5 })).toBe(6);
	});

	it("bypasses armor entirely when the weapon ignores armor", () => {
		expect(mitigateDamage(8, { armor: 3, ignoresArmor: true })).toBe(8);
	});

	it("clamps the result at 0 when armor meets or exceeds the damage", () => {
		expect(mitigateDamage(2, { armor: 5 })).toBe(0);
	});

	it("rounds and floors odd inputs safely", () => {
		expect(mitigateDamage(NaN, { armor: 2 })).toBe(0);
		expect(mitigateDamage(-3, {})).toBe(0);
	});
});

describe("dieFromDamage (existing grammar, unchanged)", () => {
	it("pulls the first die expression out of a damage string", () => {
		expect(dieFromDamage("d8 (forceful)")).toBe("d8");
		expect(dieFromDamage("2d6+1")).toBe("2d6+1");
		expect(dieFromDamage("special")).toBeNull();
	});
});
