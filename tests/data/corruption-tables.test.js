import { describe, it, expect } from "vitest";
import { GIFTS, MARKS, EMANATION_BASE, bumpDamage, applyCorruption } from "../../module/data/corruption-tables.js";

describe("GIFTS / MARKS catalogs", () => {
	it("are each a full 1d12 with unique ids and labels", () => {
		for (const [name, table] of [["GIFTS", GIFTS], ["MARKS", MARKS]]) {
			expect(table, name).toHaveLength(12);
			const ids = table.map(e => e.id);
			expect(new Set(ids).size, name).toBe(12);
			for (const e of table) expect(e.label, name).toBeTruthy();
		}
	});

	it("the resilience gift sets Armor 4 and adds HP", () => {
		const g = GIFTS.find(g => g.id === 11);
		expect(g.armorSet).toBe(4);
		expect(g.hpDelta).toBe(4);
		expect(g.quality).toMatch(/bronze/i);
	});

	it("the vicious-attacks gift bumps damage and adds a tag", () => {
		const g = GIFTS.find(g => g.id === 12);
		expect(g.damageBonus).toBe(2);
		expect(g.addTags).toContain("forceful");
	});
});

describe("bumpDamage", () => {
	it("steps the die and rewrites the prose formula in place", () => {
		const r = bumpDamage("gore d8+2 (hand, forceful)", "d8+2", { dieSteps: 1 });
		expect(r.rollFormula).toBe("d10+2");
		expect(r.damageValue).toBe("gore d10+2 (hand, forceful)");
	});

	it("adds a flat bonus", () => {
		const r = bumpDamage("d8", "d8", { damageBonus: 2 });
		expect(r.rollFormula).toBe("d8+2");
		expect(r.damageValue).toBe("d8+2");
	});

	it("splices new attack tags into an existing parenthetical, de-duped", () => {
		const r = bumpDamage("claws d6 (hand, messy)", "d6", { addTags: ["forceful", "messy"] });
		expect(r.damageValue).toBe("claws d6 (hand, messy, forceful)");
	});

	it("adds a parenthetical when the prose has none", () => {
		const r = bumpDamage("d10", "d10", { addTags: ["ignores armor"] });
		expect(r.damageValue).toBe("d10 (ignores armor)");
	});

	it("caps the die at d12", () => {
		expect(bumpDamage("d12", "d12", { dieSteps: 2 }).rollFormula).toBe("d12");
	});

	it("handles a bonus-carrying prose with no bonus in the formula", () => {
		const r = bumpDamage("searing grasp d10 (hand, grabby)", "d10", { dieSteps: 1, damageBonus: 1 });
		expect(r.rollFormula).toBe("d12+1");
		expect(r.damageValue).toBe("searing grasp d12+1 (hand, grabby)");
	});

	it("degrades gracefully with no recognizable die", () => {
		const r = bumpDamage("special", "", { dieSteps: 1, addTags: ["messy"] });
		expect(r.rollFormula).toBe("");
		expect(r.damageValue).toBe("special (messy)");
	});
});

describe("applyCorruption", () => {
	const base = {
		hp: 12,
		armorValue: 1,
		armorSource: "hide",
		damageValue: "claws d8 (hand, messy)",
		rollFormula: "d8",
		tags: ["solitary", "beast"],
		qualities: "keen senses",
		instinct: "to hunt",
	};

	it("always adds the corrupted tag", () => {
		const r = applyCorruption(base, { gifts: [], marks: [] });
		expect(r.tags).toContain("corrupted");
		expect(r.tags).toContain("beast");
	});

	it("adds the emanation tag only when asked", () => {
		expect(applyCorruption(base, { addEmanation: true }).tags).toContain("emanation");
		expect(applyCorruption(base, {}).tags).not.toContain("emanation");
	});

	it("folds the resilience gift: Armor 4, +4 HP, and a bronze quality", () => {
		const r = applyCorruption(base, { gifts: [11] });
		expect(r.hp).toBe(16);
		expect(r.armorValue).toBe(4);
		expect(r.armorSource).toMatch(/resilience/);
		expect(r.qualities.some(q => /bronze/i.test(q))).toBe(true);
		expect(r.tags).toContain("hardy");
	});

	it("folds the vicious gift into the damage line", () => {
		const r = applyCorruption(base, { gifts: [12] });
		expect(r.rollFormula).toBe("d8+2");
		expect(r.damageValue).toBe("claws d8+2 (hand, messy, forceful)");
		expect(r.tags).toContain("vicious");
	});

	it("emits gift/mark moves and mark notes", () => {
		const r = applyCorruption(base, { gifts: [1, 6], marks: [4] });
		const moveNames = r.moves.map(m => m.name);
		expect(moveNames).toContain("Loose its terrible presence");
		expect(moveNames).toContain("Refuse to die");
		expect(r.tags).toContain("terrifying");
		expect(r.notes.some(n => /nightmare/i.test(n))).toBe(true);
	});

	it("de-dupes qualities against the base and never drops below 1 HP", () => {
		const weak = { ...base, hp: 0, qualities: "unnatural resilience: Armor 4, but 0 vs. bronze" };
		const r = applyCorruption(weak, { gifts: [11] });
		expect(r.hp).toBe(4); // 0 + 4, clamped floor is 1 but 4 > 1
		// the gift's quality matches an existing one → not duplicated
		expect(r.qualities.filter(q => /unnatural resilience/i.test(q))).toHaveLength(1);
	});

	it("says 0 vs. bronze once when the resilience gift lands on the emanation base", () => {
		const r = applyCorruption(EMANATION_BASE, { gifts: [11], addEmanation: true });
		expect(r.qualities.filter(q => /0 vs\. bronze/i.test(q))).toEqual(["Armor 0 vs. bronze"]);
		expect(r.armorValue).toBe(4);
	});

	it("works from the emanation base template", () => {
		const r = applyCorruption(EMANATION_BASE, { gifts: [12], addEmanation: true });
		expect(r.tags).toContain("emanation");
		expect(r.tags).toContain("corrupted");
		expect(r.tags).toContain("solitary");
		expect(r.rollFormula).toBe("d10+2");
	});

	it("counts a repeated gift or mark id once", () => {
		const r = applyCorruption(base, { gifts: [11, "11", 12, 12], marks: [11, 11] });
		expect(r.hp).toBe(16);
		expect(r.rollFormula).toBe("d8+2");
		expect(r.damageValue).toBe("claws d8+2 (hand, messy, forceful)");
		expect(r.qualities.filter(q => /vulnerable to bronze/i.test(q))).toHaveLength(1);
	});

	it("claims Armor 4 for the resilience gift only when the gift raised the armor", () => {
		const plated = applyCorruption({ ...base, armorValue: 5, armorSource: "plate" }, { gifts: [11] });
		expect(plated.armorValue).toBe(5);
		expect(plated.armorSource).toBe("plate");
		expect(plated.qualities.some(q => /Armor 4/.test(q))).toBe(false);
		expect(plated.qualities.some(q => /0 vs\. bronze/i.test(q))).toBe(true);

		const hide = applyCorruption(base, { gifts: [11] });
		expect(hide.qualities).toContain("unnatural resilience: Armor 4, but 0 vs. bronze");
	});
});

describe("bumpDamage on lines the book prints", () => {
	it("gives every attack of a multi-attack line the bonus and the tags, separators kept", () => {
		const colossus = "trample d10+5 (hand, close, area, forceful), crushing hands d10+5 (close, reach, forceful, grabby), or hurled object d10+5 (far, area, forceful, reload)";
		const r = bumpDamage(colossus, "d10+5", { damageBonus: 2, addTags: ["forceful"] });
		expect(r.damageValue).toBe("trample d10+7 (hand, close, area, forceful), crushing hands d10+7 (close, reach, forceful, grabby), or hurled object d10+7 (far, area, forceful, reload)");
		expect(r.rollFormula).toBe("d10+7");

		const llamudwr = bumpDamage("stinging tail d10+1 (reach), crunching bite d10+1 (hand, grabby, messy, 1 piercing)", "d10+1", { damageBonus: 2, addTags: ["forceful"] });
		expect(llamudwr.damageValue).toBe("stinging tail d10+3 (reach, forceful), crunching bite d10+3 (hand, grabby, messy, 1 piercing, forceful)");
	});

	it("steps each attack's own die when they differ", () => {
		const r = bumpDamage("trample d8+3 w/disadvantage (hand, close) or ice-tusks d8+7 w/disadvantage (reach)", "d8+7", { dieSteps: 1, damageBonus: 2 });
		expect(r.damageValue).toBe("trample d10+5 w/disadvantage (hand, close) or ice-tusks d10+9 w/disadvantage (reach)");
		expect(r.rollFormula).toBe("d10+9");
	});

	it("keeps a dice count and reads a spaced bonus", () => {
		expect(bumpDamage("bite 2d6+1", "", { damageBonus: 2 })).toEqual({ damageValue: "bite 2d6+3", rollFormula: "2d6+3" });
		expect(bumpDamage("claws d8 - 1 (hand)", "", { damageBonus: 2 })).toEqual({ damageValue: "claws d8+1 (hand)", rollFormula: "d8+1" });
	});

	it("never takes a bonus from another attack when the formula is blank", () => {
		const r = bumpDamage("claws d6 (hand) or bite d8+2 (close)", "", { damageBonus: 2 });
		expect(r.damageValue).toBe("claws d6+2 (hand) or bite d8+4 (close)");
		expect(r.rollFormula).toBe("d6+2");
	});

	it("de-dupes the new tags when the line has no tag list yet", () => {
		expect(bumpDamage("d12+1", "d12+1", { addTags: ["forceful", "Forceful"] }).damageValue).toBe("d12+1 (forceful)");
	});

	it("adds tags into a tag list that is not at the end of the attack", () => {
		expect(bumpDamage("gore d8 (hand) w/advantage", "d8", { addTags: ["messy"] }).damageValue).toBe("gore d8 (hand, messy) w/advantage");
	});
});
