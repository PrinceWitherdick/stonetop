import { describe, it, expect } from "vitest";
import {
	LEDGER_CATEGORIES,
	classifyAction,
	categoryForEntry,
	categoryForCharacterPath,
	ledgerCategoryGroups,
} from "../../module/utils/ledger-categories.js";

describe("categoryForCharacterPath", () => {
	it("maps each part of the sheet to its category", () => {
		const cases = {
			"system.attributes.level.value": "leveling",
			"system.attributes.xp.value": "leveling",
			"system.attributes.hp.value": "stats",
			"system.attributes.wounds": "stats",
			"system.stats.str.value": "stats",
			"system.playbook.name": "character",
			"flags.stonetop_pwd.arcana.owned": "arcana",
			"flags.stonetop_pwd.arcana.boxes.the-key:front:0": "arcana",
			"flags.stonetop_pwd.invocations.selected": "moves",
			"flags.stonetop_pwd.moves.backgroundChoices.Well Versed": "moves",
			"flags.stonetop_pwd.inventory.checked.bow-arrows": "inventory",
			"flags.stonetop_pwd.possessions.selected": "inventory",
			"flags.stonetop_pwd.lore.counts.the-earth-mother:shrine-loved": "character",
			"flags.stonetop_pwd.appearance.selected.0": "character",
			"flags.stonetop_pwd.background.selected": "character",
			"flags.stonetop_pwd.crew.individuals.0.name": "followers",
			"flags.stonetop_pwd.animalCompanion.name": "followers",
			"flags.stonetop_pwd.beastLoyalty.wolf": "followers",
			"flags.stonetop_pwd.initiatesHp.acolyte": "followers",
		};
		for (const [path, expected] of Object.entries(cases)) {
			expect(categoryForCharacterPath(path), path).toBe(expected);
		}
	});

	it("falls back to other for an unmapped path", () => {
		expect(categoryForCharacterPath("flags.stonetop_pwd.rollMode")).toBe("other");
	});
});

describe("classifyAction — entries already stored in a world", () => {
	// These strings are verbatim subjects from a real world's ledger, written before entries
	// carried a category. The dropdown has to group them without any stamped field to read.
	it("classifies legacy character entries", () => {
		const cases = {
			"Level changed from 26 to 27": "leveling",
			"XP changed from 0 to 1": "leveling",
			"STR changed from 2 to 3": "stats",
			"HP changed from 16 to 18": "stats",
			"Max HP changed from 16 to 20": "stats",
			"Damage value changed from d4 to d10": "stats",
			"Dazed changed from off to on": "stats",
			'Wound recorded: "Twisted ankle"': "stats",
			"Ambush learned": "moves",
			"Sir, Permission to Die, Sir learned": "moves",
			"Voice of the Earth Mother learned": "moves",
			"Arcana changed from azure-hand to azure-hand, ring-of-daagon": "arcana",
			"Arcana set to on": "arcana",
			"Arcanum gained: Minor Arcana The Key": "arcana",
			"Minor Arcana The Key: front diamond 1 marked": "arcana",
			"Inventory item added: A flawless vase": "inventory",
			"Items undefined ◇ set to 0": "inventory",
			"Item slots ◇ set to 0": "inventory",
			"Distillery selected": "inventory",
			"A flawless vase deselected": "inventory",
			"Sacred pouch: Sacred Pouch Origin Heirloom selected": "inventory",
			"Lore set to 1": "character",
			"Lore — The Earth Mother: loved, well-used marked": "character",
			"Appearance set to imperious voice": "character",
			"Background set to impetuous-youth": "character",
			"Origin set to Stonetop": "character",
			"Instinct set to Devotion": "character",
			"Playbook added: The Blessed": "character",
			"Initiate details set to he": "followers",
			"Crew name set to The Stonetop Irregulars": "followers",
			"Animal companion name set to Bramble": "followers",
			"Crew member 2 loyalty changed from 1 to 2": "followers",
			// Per-option advancement marks. The spaced hyphen distinguishes these from an arcana
			// box ("<Card>: front diamond 1 marked") and a lore tick, which uses an em dash.
			"Well Versed - The civilizations of humanity marked": "moves",
			"Heroes to the Last - They are exceptional (and roll +2 instead of +1) marked": "moves",
			"Beast of Legend - They get +4 HP and +1 armor marked": "moves",
		};
		for (const [action, expected] of Object.entries(cases)) {
			expect(classifyAction(action), action).toBe(expected);
		}
	});

	it("classifies legacy steading entries", () => {
		const cases = {
			"Neighbor added: Tovia (from Lygos)": "steading",
			"Tierney home cleared (was Marshedge)": "steading",
			"Resource added: Timber": "steading",
			"Improvement completed: Palisade": "steading",
			"Surplus changed from 1 to 2": "steading",
			"Population changed from 300 to 320": "steading",
			"Silver purses changed from 1 to 2": "steading",
			"Herd — foals changed from 0 to 2": "steading",
			"Place A set to The Old Mill": "steading",
			// "trait" singular is the pre-fix wording, still sitting in written ledgers.
			"Tierney trait cleared (gets the best deals; has a wandering eye)": "steading",
			"Notes set to The State of Stonetop": "notes",
		};
		for (const [action, expected] of Object.entries(cases)) {
			expect(classifyAction(action), action).toBe(expected);
		}
	});

	it("returns a real category for anything, including nonsense", () => {
		const ids = new Set(LEDGER_CATEGORIES.map(c => c.id));
		for (const action of ["", null, undefined, "???", "Some freeform note"]) {
			expect(ids.has(classifyAction(action))).toBe(true);
		}
	});
});

describe("categoryForEntry", () => {
	it("prefers the stamped category over the heuristic", () => {
		// "Afon selected" is a Blessed initiate, which the text heuristic reads as inventory;
		// a stamped entry knows better because it came from the followers flag path.
		expect(classifyAction("Afon selected")).toBe("inventory");
		expect(categoryForEntry({ action: "Afon selected", category: "followers" })).toBe("followers");
	});

	it("ignores a stamped value that is not a real category", () => {
		expect(categoryForEntry({ action: "Ambush learned", category: "nonsense" })).toBe("moves");
	});
});

describe("ledgerCategoryGroups", () => {
	it("groups subjects under categories in display order with counts", () => {
		const groups = ledgerCategoryGroups([
			{ action: "Level changed from 1 to 2" },
			{ action: "Level changed from 2 to 3" },
			{ action: "Ambush learned" },
			{ action: "Aid learned" },
			{ action: "HP changed from 5 to 3" },
		]);
		expect(groups.map(g => [g.label, g.count])).toEqual([
			["Leveling", 2],
			["Moves", 2],
			["Stats & harm", 1],
		]);
		// Subjects sort alphabetically inside a group.
		expect(groups[1].nouns).toEqual(["Aid", "Ambush"]);
	});

	it("omits categories with no entries", () => {
		const groups = ledgerCategoryGroups([{ action: "Ambush learned" }]);
		expect(groups.map(g => g.id)).toEqual(["moves"]);
	});

	it("handles empty input", () => {
		expect(ledgerCategoryGroups([])).toEqual([]);
		expect(ledgerCategoryGroups(undefined)).toEqual([]);
	});
});
