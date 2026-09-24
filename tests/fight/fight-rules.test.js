import { describe, it, expect } from "vitest";
import { FIGHT_RULES, fightRuleQuotes } from "../../module/fight/fight-rules.js";

// Book I's words on fights with several combatants, as printed. Pinned here so an edit to the
// quotations cannot slip through as a tidy-up: each was taken from the PDF's text layer
// (pdftotext -enc UTF-8, printed pages 414 to 416), punctuation included.

const PRINTED = {
	oneRollsOthersAid: [414, "When multiple PCs and/or followers attack a foe at once, one of them rolls Clash or Let Fly and the others Aid."],
	pileOnDamage: [414, "add +1 extra damage for each capable attacker after the first. Apply tags from all the attackers as they make sense."],
	hurtMultiple: [414, "then the player rolls to Clash or Let Fly just once, but they roll damage separately against each foe."],
	engagesMultiple: [414, "When a PC or follower engages multiple foes, make more aggressive moves than when they face a single foe."],
	unengagedFoes: [414, "Bad guys don’t just sit around waiting to be attacked."],
	groupAsOne: [416, "A group deals damage and has HP and armor as though it was one individual member of the group."],
	groupOutnumbers: [416, "they get a +1 bonus to damage and armor for every multiplier past 1."],
	groupCasualties: [416, "Damage represents casualties."],
	engagedByPcs: [416, "Foes that are engaged by individual PCs aren’t really part of a group."],
	routed: [416, "A group reduced to 0 HP is routed, massacred, or otherwise defeated."],
};

describe("FIGHT_RULES", () => {
	it("quotes each passage from its printed page", () => {
		expect(Object.keys(FIGHT_RULES).sort()).toEqual(Object.keys(PRINTED).sort());
		for (const [key, [page, words]] of Object.entries(PRINTED)) {
			expect(FIGHT_RULES[key].page, key).toBe(page);
			expect(FIGHT_RULES[key].book, key).toBe(1);
			expect(FIGHT_RULES[key].text, key).toContain(words);
		}
	});

	it("keeps the book's own punctuation", () => {
		expect(FIGHT_RULES.hurtMultiple.text).toContain("multiple foes—because of the area tag");
		expect(FIGHT_RULES.unengagedFoes.text).toContain("Unengaged foes—those that aren’t pinned down in combat—are");
	});

	it("marks the GM's advice as the GM's", () => {
		const gmOnly = Object.entries(FIGHT_RULES).filter(([, rule]) => rule.gmOnly).map(([key]) => key).sort();
		expect(gmOnly).toEqual(["engagesMultiple", "unengagedFoes"]);
	});

	it("carries no trailing whitespace from the extraction", () => {
		for (const [key, rule] of Object.entries(FIGHT_RULES)) expect(rule.text, key).toBe(rule.text.trim());
	});

	it("is frozen", () => {
		expect(Object.isFrozen(FIGHT_RULES)).toBe(true);
		expect(Object.isFrozen(FIGHT_RULES.routed)).toBe(true);
	});
});

describe("fightRuleQuotes", () => {
	it("gives each asked-for passage once, in the order asked", () => {
		const quotes = fightRuleQuotes(["pileOnDamage", "oneRollsOthersAid", "pileOnDamage"], { isGM: true });
		expect(quotes.map(q => q.key)).toEqual(["pileOnDamage", "oneRollsOthersAid"]);
		expect(quotes[0]).toMatchObject({ page: 414, book: 1 });
	});

	it("leaves the GM's advice off a player's view", () => {
		const keys = ["engagesMultiple", "pileOnDamage", "hurtMultiple"];
		expect(fightRuleQuotes(keys, { isGM: false }).map(q => q.key)).toEqual(["pileOnDamage", "hurtMultiple"]);
		expect(fightRuleQuotes(keys).map(q => q.key)).toEqual(["pileOnDamage", "hurtMultiple"]);
		expect(fightRuleQuotes(keys, { isGM: true }).map(q => q.key)).toEqual(keys);
	});

	it("skips a key it does not have", () => {
		expect(fightRuleQuotes(["nope", "routed"], { isGM: true }).map(q => q.key)).toEqual(["routed"]);
		expect(fightRuleQuotes(undefined)).toEqual([]);
	});
});
