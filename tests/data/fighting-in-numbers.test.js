// The book pays a group for having more bodies in the fight in TWO ways, and they agree on
// exactly one case — a single foe — which is how they get conflated. These tests pin each rule
// to its own printed wording, and pin the case where they PART, because a single "outnumber"
// number answering both questions is wrong for one of them every time.
//
//   "...Clashes or Lets Fly at a single foe (or Aids a PC in doing so), roll the move once
//    (likely with advantage) and roll one attacker's damage, +1 per each additional attacker."
//
//   "Abstracting group exchanges. Optional rule for fights between larger groups. Each group
//    deals damage and has HP/armor as per a single individual member. Larger groups deal +1
//    damage and have +1 armor for each multiple they outnumber their foe by (e.g. 3:1 gets +2
//    damage and armor). Damage represents casualties; if a group loses half its HP, then half
//    of its members are out of the action. At 0 HP, it's routed, massacred, or otherwise
//    defeated."
import { describe, it, expect } from "vitest";
import { pileOnBonus, outnumberBonus, groupCasualties, casualtyNote, groupFightCardSummaries } from "../../module/data/follower-build.js";
import { addDamageBonus } from "../../module/utils/damage-die.js";

describe("swarm one foe: +1 per each additional attacker", () => {
	it("pays one attacker's damage and nothing more for a lone attacker", () => {
		const r = pileOnBonus(1);
		expect(r.bonus).toBe(0);
		expect(r.rollFor("d6")).toBe("d6");
	});

	it("pays +1 for each attacker PAST the first", () => {
		expect(pileOnBonus(2).bonus).toBe(1);
		expect(pileOnBonus(3).bonus).toBe(2);
		expect(pileOnBonus(6).bonus).toBe(5);
	});

	// The rule grants damage; the +1 ARMOR belongs to the other rule. A readout that offered
	// armor here would hand a swarming horde a defence the book never gives it.
	it("never offers armor", () => {
		expect(pileOnBonus(6).label).toBe("+5 damage");
		expect(pileOnBonus(1).label).toBe("no bonus");
	});

	it("folds the bonus into the group's own damage die", () => {
		expect(pileOnBonus(4).rollFor("d8")).toBe("d8+3");
		expect(pileOnBonus(3).rollFor("d6+1")).toBe("d6+3");
	});

	it("treats a blank or nonsense count as a single attacker", () => {
		for (const bad of ["", null, undefined, 0, -4, "many"]) {
			expect(pileOnBonus(bad).bonus).toBe(0);
		}
	});
});

describe("abstracting group exchanges: +1 damage and armor per multiple outnumbered", () => {
	// The book's own worked example.
	it("gives 3:1 a +2 to damage AND armor", () => {
		const r = outnumberBonus(3, 1);
		expect(r.bonus).toBe(2);
		expect(r.label).toBe("+2 damage, +2 armor");
	});

	it("pays nothing at even odds, and nothing to the outnumbered side", () => {
		expect(outnumberBonus(1, 1).bonus).toBe(0);
		expect(outnumberBonus(4, 4).bonus).toBe(0);
		expect(outnumberBonus(1, 3).bonus).toBe(0);
	});

	it("counts WHOLE multiples, so a part-multiple pays nothing extra", () => {
		expect(outnumberBonus(4, 2).bonus).toBe(1);   // exactly 2:1
		expect(outnumberBonus(5, 2).bonus).toBe(1);   // 2.5:1 is still the second multiple
		expect(outnumberBonus(6, 2).bonus).toBe(2);   // 3:1
	});

	it("folds the bonus into the group's own damage die", () => {
		expect(outnumberBonus(3, 1).rollFor("d8")).toBe("d8+2");
		expect(outnumberBonus(3, 1).rollFor("d6+1")).toBe("d6+3");
	});
});

describe("the two rules are NOT interchangeable", () => {
	// Six creatures against four PCs. The abstraction pays the side nothing (6/4 has not reached
	// a second whole multiple); all six piling onto one of the four pays +5 against that PC. A
	// sheet with one "outnumber" box necessarily answers one of these with the other's number.
	it("parts company as soon as the foe is more than one target", () => {
		expect(outnumberBonus(6, 4).bonus).toBe(0);
		expect(pileOnBonus(6).bonus).toBe(5);
	});

	// ...and agrees on the one case that hides the difference, which is why it stayed hidden.
	it("agrees when the foe is a single target", () => {
		for (const n of [1, 2, 3, 6, 11]) {
			expect(outnumberBonus(n, 1).bonus).toBe(pileOnBonus(n).bonus);
		}
	});
});

describe("damage represents casualties", () => {
	// A horde: 3 HP as a single member, six bodies on the field.
	it("puts nobody out while the pool is full", () => {
		expect(groupCasualties({ hpMax: 3, hpCurrent: 3, count: 6 })).toMatchObject({ out: 0, standing: 6, routed: false });
	});

	it("puts half the members out when half the pool is gone", () => {
		// 6 HP, 6 bodies: the book's stated data point, where it lands exactly.
		expect(groupCasualties({ hpMax: 6, hpCurrent: 3, count: 6 })).toMatchObject({ out: 3, standing: 3 });
		// 8 HP, 4 bodies.
		expect(groupCasualties({ hpMax: 8, hpCurrent: 4, count: 4 })).toMatchObject({ out: 2, standing: 2 });
	});

	it("routs the group at 0 HP, with nobody left standing", () => {
		expect(groupCasualties({ hpMax: 3, hpCurrent: 0, count: 6 })).toMatchObject({ out: 6, standing: 0, routed: true });
	});

	it("never reports more casualties than there are members", () => {
		const c = groupCasualties({ hpMax: 3, hpCurrent: -99, count: 6 });
		expect(c.out).toBe(6);
		expect(c.standing).toBe(0);
	});

	// Rounding every fraction up put a body out of the action for any scratch at all.
	it("rounds to the nearest body, with a half going up", () => {
		// A sixth of a pair's pool is a third of a body: nobody is out yet.
		expect(groupCasualties({ hpMax: 6, hpCurrent: 5, count: 2 })).toMatchObject({ out: 0, standing: 2 });
		// A third of it is two-thirds of a body, which rounds to one.
		expect(groupCasualties({ hpMax: 6, hpCurrent: 4, count: 2 })).toMatchObject({ out: 1, standing: 1 });
		// Half of three is a body and a half, and the half goes up.
		expect(groupCasualties({ hpMax: 6, hpCurrent: 3, count: 3 })).toMatchObject({ out: 2, standing: 1 });
	});

	it("says nothing when there is no headcount or no pool to divide", () => {
		expect(casualtyNote({ hpMax: 6, hpCurrent: 3, count: 0 })).toBeNull();
		expect(casualtyNote({ hpMax: 0, hpCurrent: 0, count: 6 })).toBeNull();
	});

	it("reads the remaining pool back as bodies", () => {
		expect(casualtyNote({ hpMax: 6, hpCurrent: 6, count: 6 })).toBe("all 6 still standing");
		expect(casualtyNote({ hpMax: 6, hpCurrent: 3, count: 6 })).toBe("3 of 6 out of the action, 3 still standing");
		expect(casualtyNote({ hpMax: 6, hpCurrent: 0, count: 6 })).toBe("routed, massacred, or otherwise defeated");
	});
});

describe("a group with nobody left on their feet", () => {
	// The swarm row used to fall back to the whole roster here, offering "+5 damage" from six
	// bodies who are all out of the action, beside a group-vs-group row offering nothing.
	it("offers no bonus in either row, starting both from the same count", () => {
		const down = { hpCurrent: 0, hpMax: 6 };
		const s = groupFightCardSummaries({
			roster: Array(6).fill(down), aliveCount: 0, size: 6, groupHpCurrent: 0, groupHpMax: 6, damageRoll: "d6",
		});
		expect(s.swarmCount).toBe(1);
		expect(s.swarmLabel).toBe("no bonus");
		expect(s.swarmRoll).toBe("d6");
		expect(s.exchangeLabel).toBe("no bonus");
		expect(s.exchangeRoll).toBe("d6");
	});
});

describe("addDamageBonus keeps a damage line to ONE modifier", () => {
	it("folds into an existing modifier rather than appending a term", () => {
		expect(addDamageBonus("d8+1", 2)).toBe("d8+3");
		expect(addDamageBonus("d8 - 1", 1)).toBe("d8");
		expect(addDamageBonus("d10+2", -2)).toBe("d10");
	});

	it("leaves a formula it cannot parse whole, appending rather than rewriting inside it", () => {
		expect(addDamageBonus("d8 or d6", 2)).toBe("d8 or d6+2");
	});

	it("is a no-op at +0, and falls back to d6 for an empty base", () => {
		expect(addDamageBonus("d8+2", 0)).toBe("d8+2");
		expect(addDamageBonus("", 3)).toBe("d6+3");
	});
});
