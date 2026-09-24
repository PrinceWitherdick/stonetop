import { describe, it, expect } from "vitest";
import { averageDamage, leadDie, settleBestDie, withBestDie, composeDamageFormula } from "../../module/utils/damage.js";

// "Roll one combatant's damage (usually the best one)" (Book I p.414; p.239 "the single highest damage
// die among them"): the other attackers' dice ride on the fight's seed, and the best one is offered.

describe("averageDamage and leadDie", () => {
	it("averages dice and flat numbers", () => {
		expect(averageDamage("d8+2")).toBe(6.5);
		expect(averageDamage("2d6")).toBe(7);
		expect(averageDamage("d10-1")).toBe(4.5);
		expect(averageDamage("")).toBe(0);
	});

	it("takes the first die with the flat number stuck to it, and leaves extra dice behind", () => {
		expect(leadDie("d8+2+1d6")).toBe("d8+2");
		expect(leadDie("d8+1d4+2")).toBe("d8");
		expect(leadDie("2d6")).toBe("2d6");
		expect(leadDie("5")).toBe("");
	});
});

describe("settleBestDie", () => {
	const seed = { bonus: 1, dice: [{ name: "Garet", formula: "d10" }, { name: "Eira", formula: "d6" }] };

	it("keeps the other attacker's die that beats the roller's own", () => {
		expect(settleBestDie(seed, "d8").best).toEqual({ name: "Garet", formula: "d10" });
	});

	it("keeps nothing when the roller's die is as good, measured without their extra dice", () => {
		expect(settleBestDie(seed, "d10").best).toBeUndefined();
		expect(settleBestDie(seed, "d6+1d6").best).toEqual({ name: "Garet", formula: "d10" });
	});
});

describe("withBestDie", () => {
	it("swaps the roller's lead die for the best die only when they chose to roll it, keeping their extra dice", () => {
		const best = { name: "Garet", formula: "d10" };
		expect(withBestDie("d8+1d6", { best, useBest: true })).toBe("d10+1d6");
		expect(withBestDie("d8+1d6", { best, useBest: false })).toBe("d8+1d6");
		expect(composeDamageFormula("d8+1d6", { seed: { bonus: 1, applied: true, best, useBest: true } })).toBe("d10+1d6+1");
	});
});
