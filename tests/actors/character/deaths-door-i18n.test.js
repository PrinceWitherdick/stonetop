import { describe, it, expect } from "vitest";
import { readRepo as read } from "../../fakes/css.js";
import { lookup, usedKeys, code, markup } from "../../fakes/i18n.js";
import {
	DEATHS_DOOR_FATES, DEATHS_DOOR_REFUSAL_INSERTS, DEATHS_DOOR_TIERS,
} from "../../../module/actors/character/dialogs/DeathsDoorDialog.js";

// The Death's Door walkthrough speaks through languages/en.json (stonetop.specialMoves.deathsDoor): its template,
// its notes and notices, the chat lines it posts, the book's outcomes and fates it prints, and the relay that
// spends a boost on the GM's client for it (Burn Brightly's own keys). Every key they name has to be in the
// language file (a missing one prints the key on the window or the card), and none of the English they used to
// carry inline is left in the source. Move, background and insert names, and the tier notation ("6-", "7-9",
// "10+"), stay as they are: they are the book's names, and several are lookup keys besides.

const KEY = "stonetop.specialMoves.deathsDoor";
const DIALOG = "module/actors/character/dialogs/DeathsDoorDialog.js";
const RELAY = "module/actors/character/deaths-door-relay.js";
const TEMPLATE = "templates/dialogs/deaths-door.hbs";

/** The keys a template names to `localize`, with or without hash data. */
const templateKeys = source => [...source.matchAll(/\{\{\{?localize\s+"(stonetop\.[^"]+)"/g)].map(m => m[1]);

describe("the Death's Door walkthrough's words are in the language file", () => {
	it("resolves every key its template names", () => {
		const keys = templateKeys(read(TEMPLATE));
		expect(keys.length).toBeGreaterThan(40);
		for (const key of keys) expect(typeof lookup(key), key).toBe("string");
	});

	for (const file of [DIALOG, RELAY]) {
		it(`resolves every key ${file} names whole`, () => {
			const keys = usedKeys(read(file));
			expect(keys.length).toBeGreaterThan(0);
			for (const key of keys) expect(typeof lookup(key), key).toBe("string");
		});
	}

	it("has every key the dialog builds at run time", () => {
		const families = [
			...["success", "partial", "failure"].map(tier => `tiers.${tier}`),
			...["lastDoor", "refuse", "thrall"].flatMap(fate => [`fates.${fate}.label`, `fates.${fate}.hint`]),
			...["revenant", "ghost"].map(slug => `refusalHints.${slug}`),
			...["refused", "thrall"].flatMap(kind => ["intro", "card", "next"].map(part => `taken.${kind}.${part}`)),
			...["scar", "eye", "visions", "crows"].map(chip => `mark.chips.${chip}`),
			"chat.unstoppableOne", "chat.unstoppableMany",
		];
		for (const key of families) expect(typeof lookup(`${KEY}.${key}`), key).toBe("string");
	});

	it("reads the book's outcomes, fates and refusals out of it, word for word", () => {
		// The book's own dashes, spelled as escapes here.
		expect(DEATHS_DOOR_TIERS.map(t => t.text)).toEqual([
			"You wrest yourself back to the realm of the living—return to 1 HP but say how your brush with death has marked you.",
			"The Lady waves you off—you’re no longer dying but you’re out of the action.",
			"Your time has come—choose 1:",
		]);
		expect(DEATHS_DOOR_TIERS.map(t => t.label)).toEqual(["10+", "7-9", "6-"]);
		expect(DEATHS_DOOR_TIERS[2].options).toEqual(DEATHS_DOOR_FATES.map(f => f.label));
		for (const fate of DEATHS_DOOR_FATES) {
			expect(fate.label).not.toMatch(/^stonetop\./);
			expect(fate.hint).not.toMatch(/^stonetop\./);
		}
		expect(DEATHS_DOOR_REFUSAL_INSERTS.map(i => [i.name, i.hint])).toEqual([
			["Revenant", "You cling stubbornly to your body."],
			["Ghost", "Your body is dead and gone; your soul lingers."],
		]);
	});

	it("spends Burn Brightly with Burn Brightly's own words", () => {
		expect(usedKeys(read(RELAY))).toContain("stonetop.specialMoves.burnBrightly.spent");
		expect(usedKeys(read(DIALOG))).toContain("stonetop.specialMoves.burnBrightly.notEnoughXp");
	});
});

describe("none of that English is left inline", () => {
	const LEFTOVERS = {
		[DIALOG]: () => [code(read(DIALOG)), [
			"Another player", "The character", "took over Death's Door", "settled from another window",
			"doesn't roll Death's Door", "survives, and clears", "to regain 1 HP", "makes one last move",
			"There's no saving them", "counts as a", "you didn't roll", "has left the game", "hasn't finished it",
			"describe the mark", "a nasty scar", "You wrest yourself", "The Lady waves you off", "Refuse to go;",
			"You cling stubbornly", "Here is what that costs", "Couldn't record", "You don't have enough XP", "Then, roll",
		]],
		[RELAY]: () => [code(read(RELAY)), ["Burning Brightly", "New XP"]],
		[TEMPLATE]: () => [markup(read(TEMPLATE)), [
			"Accept this result", "Take over", "Not yet", "However it lands", "No rush", "is rolling Death's Door",
			"Refuse to Go", "Say how it marked you", "Give it my all", "Done", "roll with:", "The dice are still",
			"This result hasn't landed", "Back to <strong>1 HP", "Hard to Kill</strong>", "The fate is",
			"What the {{insertName}} insert",
		]],
	};
	for (const [file, of] of Object.entries(LEFTOVERS)) {
		it(`in ${file}`, () => {
			const [source, phrases] = of();
			for (const phrase of phrases) expect(source.includes(phrase), phrase).toBe(false);
		});
	}
});
