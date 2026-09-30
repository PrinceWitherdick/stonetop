import { describe, it, expect } from "vitest";
import { readRepo as read } from "../../fakes/css.js";
import { lookup, usedKeys, code } from "../../fakes/i18n.js";
import { GIVE_IT_ALL_COSTS } from "../../../module/actors/character/impetuous-youth.js";
import { RAPPORT_QUESTION_KEYS, rapportQuestions } from "../../../module/actors/character/up-with-people.js";

// The Would-Be Hero's cards, buttons and tooltips speak through languages/en.json: Impetuous Youth's
// "Give it your all", the Potential for Greatness reminder, the "A Would-Be Hero No Longer" card, the
// Destined's start-of-session Omens card, Up With People's four questions, and Burn Brightly's button on
// a roll card. Every key they name has to be in the language file (a missing one prints the key on the
// card), and none of the English they used to carry inline is left in the source.

// Burn Brightly's roll-card button is one section of the entry file; the rest of it is not this test's.
const burnBrightlySection = () => {
	const all = read("stonetop.js");
	const start = all.indexOf("// -- BURN BRIGHTLY");
	const end = all.indexOf("// -- +1 TO A ROLL JUST MADE");
	expect(start).toBeGreaterThan(-1);
	expect(end).toBeGreaterThan(start);
	return all.slice(start, end);
};

const SOURCES = {
	"module/actors/character/impetuous-youth.js":     () => read("module/actors/character/impetuous-youth.js"),
	"module/actors/character/WouldBeHeroAsterisk.js": () => read("module/actors/character/WouldBeHeroAsterisk.js"),
	"module/actors/character/up-with-people.js":      () => read("module/actors/character/up-with-people.js"),
	"module/hooks/StonetopSingleton.js":              () => read("module/hooks/StonetopSingleton.js"),
	"stonetop.js (Burn Brightly)":                    burnBrightlySection,
};

describe("the Would-Be Hero's words are in the language file", () => {
	for (const [file, source] of Object.entries(SOURCES)) {
		it(`resolves every key ${file} names`, () => {
			const keys = usedKeys(source());
			expect(keys.length).toBeGreaterThan(0);
			for (const key of keys) expect(typeof lookup(key), key).toBe("string");
		});
	}

	it("has each of Impetuous Youth's three costs in full: the button, the spent label and the book's words", () => {
		expect(GIVE_IT_ALL_COSTS.map(c => c.key)).toEqual(["hurt", "escalate", "lost"]);
		for (const cost of GIVE_IT_ALL_COSTS) {
			for (const field of ["button", "spent", "text"]) {
				expect(lookup(`stonetop.wouldBeHero.impetuousYouth.costs.${cost.key}.${field}`), `${cost.key}.${field}`).toBeTypeOf("string");
				expect(cost[field]).not.toMatch(/^stonetop\./);
			}
		}
		expect(GIVE_IT_ALL_COSTS[0].text).toBe("You get hurt (2d4 damage and an actual injury)");
		expect(GIVE_IT_ALL_COSTS[1].text).toBe("You cause collateral damage, endanger others, or otherwise escalate the situation");
		expect(GIVE_IT_ALL_COSTS[2].text).toBe("Something on your person is lost or breaks");
	});

	it("has a button and a clause for each Potential for Greatness box", () => {
		for (const kind of ["stat", "hp", "damage"]) {
			expect(lookup(`stonetop.wouldBeHero.potentialForGreatness.buttons.${kind}`), kind).toBeTypeOf("string");
			expect(lookup(`stonetop.wouldBeHero.potentialForGreatness.clauses.${kind}`), kind).toBeTypeOf("string");
		}
	});

	it("has both Burn Brightly tooltips, the Driven one included", () => {
		for (const key of ["button", "tooltip", "drivenTooltip", "notEnoughXp", "spent"]) {
			expect(lookup(`stonetop.specialMoves.burnBrightly.${key}`), key).toBeTypeOf("string");
		}
	});

	it("asks Up With People's four questions in the book's words and order", () => {
		for (const key of RAPPORT_QUESTION_KEYS) expect(lookup(`stonetop.upWithPeople.questions.${key}`), key).toBeTypeOf("string");
		expect(rapportQuestions()).toEqual([
			"What weighs you down or holds you back?",
			"What drives you forward?",
			"What lesson would you have me learn?",
			"What do you think of me, truly?",
		]);
	});
});

describe("none of that English is left inline", () => {
	const LEFTOVERS = {
		"module/actors/character/impetuous-youth.js":     ["Give it your all", "gives it their all", "Gave it their all", "I get hurt", "The cost:", "Don't give it my all"],
		"module/actors/character/WouldBeHeroAsterisk.js": ["A Would-Be Hero No Longer", "has crossed off", "hasn't yet marked", "max HP", "damage die", "can't be marked now", " or "],
		"module/actors/character/up-with-people.js":      ["What weighs you down", "What drives you forward?", "What lesson would you have me learn?", "What do you think of me, truly?"],
		"module/hooks/StonetopSingleton.js":              ["Start of Session: Omen Roll", "Roll +Omens:", "lose all Omens", "follow-up question", "recent nightmares"],
		"stonetop.js (Burn Brightly)":                    ["Burn brightly", "Burning Brightly", "When you have enough XP to Level Up", "even if you don't have enough XP to level", "You don't have enough XP"],
	};
	for (const [file, phrases] of Object.entries(LEFTOVERS)) {
		it(`in ${file}`, () => {
			const source = code(SOURCES[file]());
			for (const phrase of phrases) expect(source.includes(phrase), phrase).toBe(false);
		});
	}
});
