import { describe, it, expect } from "vitest";
import {
	computeMonster,
	stepDie,
	ORGANIZATIONS,
	SIZES,
} from "../../module/data/monster-builder.js";

describe("stepDie", () => {
	it("steps up and down the ladder", () => {
		expect(stepDie("d8", 1)).toBe("d10");
		expect(stepDie("d8", -1)).toBe("d6");
		expect(stepDie("d8", 0)).toBe("d8");
	});
	it("clamps at the ends of the ladder", () => {
		expect(stepDie("d10", 5)).toBe("d12");
		expect(stepDie("d6", -5)).toBe("d4");
	});
	it("treats an off-ladder die as d6", () => {
		expect(stepDie("d20", 0)).toBe("d6");
	});
});

describe("computeMonster — HP by organization and size", () => {
	it("uses the organization base HP and damage die", () => {
		expect(computeMonster({ organization: "horde" }).hp).toBe(3);
		expect(computeMonster({ organization: "group" }).hp).toBe(6);
		expect(computeMonster({ organization: "solitary" }).hp).toBe(12);
		expect(computeMonster({ organization: "horde" }).damageDie).toBe("d6");
		expect(computeMonster({ organization: "solitary" }).damageDie).toBe("d10");
	});

	it("applies the size HP modifier", () => {
		expect(computeMonster({ organization: "solitary", size: "large" }).hp).toBe(16);
		expect(computeMonster({ organization: "solitary", size: "huge" }).hp).toBe(20);
	});

	it("never drops below 1 HP (a tiny horde)", () => {
		expect(computeMonster({ organization: "horde", size: "tiny" }).hp).toBe(1);
	});

	it("sums the extra HP modifiers", () => {
		// solitary(12) + large(+4) + tough(+4) + fated(+2) = 22
		const out = computeMonster({
			organization: "solitary", size: "large", hpMods: ["tough", "fated"],
		});
		expect(out.hp).toBe(22);
	});

	it("defaults to group when organization is missing", () => {
		expect(computeMonster({}).hp).toBe(6);
		expect(computeMonster({}).count).toBe(3);
	});
});

describe("computeMonster — armor", () => {
	it("uses the base armor and its source", () => {
		const out = computeMonster({ organization: "group", armorBase: 2 });
		expect(out.armorValue).toBe(2);
		expect(out.armorSource).toBe("mail");
	});

	it("adds +1 armor for tiny automatically and tags the source", () => {
		const out = computeMonster({ organization: "horde", size: "tiny", armorBase: 1 });
		expect(out.armorValue).toBe(2); // leathers(1) + tiny(+1)
		expect(out.armorSource).toContain("hide");
		expect(out.armorSource).toContain("small");
	});

	it("stacks shield / skilled / no-organs modifiers", () => {
		const out = computeMonster({
			organization: "solitary", armorBase: 3, armorMods: ["shield", "skilled"],
		});
		expect(out.armorValue).toBe(5); // 3 + 1 + 1
		expect(out.armorSource).toBe("plate, shield, skill");
	});

	it("lets a typed source override the auto-derived one", () => {
		const out = computeMonster({ armorBase: 4, armorSource: "ancient wards" });
		expect(out.armorValue).toBe(4);
		expect(out.armorSource).toBe("ancient wards");
	});
});

describe("computeMonster — damage", () => {
	it("builds the roll formula from die + flat bonus", () => {
		// group d8, large (+1 dmg), vicious (+2 dmg) => d8+3
		const out = computeMonster({
			organization: "group", size: "large", damageMods: ["vicious"],
		});
		expect(out.rollFormula).toBe("d8+3");
	});

	it("steps the die for ancient / weak / subtle", () => {
		expect(computeMonster({ organization: "solitary", damageMods: ["ancient"] }).damageDie).toBe("d12");
		expect(computeMonster({ organization: "group", damageMods: ["weak"] }).damageDie).toBe("d6");
		expect(computeMonster({ organization: "group", damageMods: ["weak", "subtle"] }).damageDie).toBe("d4");
	});

	it("nets advantage against disadvantage", () => {
		expect(computeMonster({ damageMods: ["relentless"] }).rollMode).toBe("adv");
		expect(computeMonster({ damageMods: ["abhorrent"] }).rollMode).toBe("dis");
		expect(computeMonster({ damageMods: ["relentless", "abhorrent"] }).rollMode).toBe("");
	});

	it("assembles range tags, effect tags, and modifier-contributed tags", () => {
		const out = computeMonster({
			organization: "solitary",
			damageTags: ["reach", "messy", "1 piercing"],
			damageMods: ["strong"], // contributes "forceful" + damage
		});
		expect(out.damageTags).toEqual(["reach", "messy", "1 piercing", "forceful"]);
		expect(out.damageValue).toContain("(reach, messy, 1 piercing, forceful)");
		expect(out.damageValue).toContain("d10+2");
	});

	it("notes advantage in the prose damage value", () => {
		const out = computeMonster({ organization: "group", damageMods: ["relentless"] });
		expect(out.damageValue).toBe("d8 w/advantage");
	});

	it("renders a negative bonus (tiny)", () => {
		// horde d6, tiny (-2 dmg) => d6-2
		const out = computeMonster({ organization: "horde", size: "tiny" });
		expect(out.rollFormula).toBe("d6-2");
	});
});

describe("computeMonster — tag line", () => {
	it("leads with organization then size, then nature and notable tags", () => {
		const out = computeMonster({
			organization: "group", size: "large",
			natureTags: ["undead"], notableTags: ["cunning", "stealthy"],
		});
		expect(out.tags).toBe("group, large, undead, cunning, stealthy");
	});

	it("omits the size tag for medium", () => {
		const out = computeMonster({ organization: "solitary", size: "medium" });
		expect(out.tags).toBe("solitary");
	});

	it("folds in and de-dupes free-text custom tags", () => {
		const out = computeMonster({
			organization: "horde", notableTags: ["cunning"], customTags: "Cunning, drunkard",
		});
		expect(out.tags).toBe("horde, cunning, drunkard");
	});

	it("surfaces range advice from size", () => {
		expect(computeMonster({ size: "large" }).rangeAdvice).toBe("add");
		expect(computeMonster({ size: "tiny" }).rangeAdvice).toBe("reduce");
		expect(computeMonster({ size: "medium" }).rangeAdvice).toBeNull();
	});
});

describe("data tables sanity", () => {
	it("has three organizations and five sizes", () => {
		expect(ORGANIZATIONS).toHaveLength(3);
		expect(SIZES).toHaveLength(5);
	});
});
