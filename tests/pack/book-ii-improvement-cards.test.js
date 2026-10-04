import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readImprovementCard } from "../../module/journal/steading-improvement-cards.js";
import {
	normalizeImprovementGrants, normalizeImprovementSections, sanitizeImprovementDef,
} from "../../module/utils/improvement-def.js";
import { IMPROVEMENT_CATEGORY_KEYS, improvementRequirementsMet } from "../../module/actors/steading/StonetopSteading.js";

// The seven steading improvements Book II prints in its gazetteer sidebars, baked into the
// location and lore journals as draggable cards. Each card's `data-steading-improvement` payload
// is what a drop onto the steading sheet stores (StonetopSteading#addCustomImprovement), so the
// grants, either/or counts and category have to be right in the payload itself.

const ROOT = new URL("../../packs/src/", import.meta.url);

// Grants checked against Book II's own text (page and quote beside each). Kept in step with
// BOOK_II in tests/actors/steading/improvement-rules.test.js, which runs the same grants through
// the season, roll and upkeep rules.
const CARDS = {
	"Trade with Barrier Pass": {
		// Book II p. 29 (PDF 15)
		file: "stonetop-locations/settlements/barrier-pass.json",
		category: "renown",
		mins: [1, undefined],
		grants: {
			stats: { fortunes: 1 },
			resources: ["Trade with Barrier Pass (timber, ivory, parchment, fine wool, goats, sheep)"],
			seasonalYield: { seasons: ["spring"], surplus: 1, minSurplus: 1 },
			rollAdvantage: { moves: ["Trade & Barter"], ask: "Trading for timber, ivory, fine wool, goats, sheep, parchment, vellum, or ink" },
		},
	},
	"Permanent Logging Camp": {
		// Book II p. 147 (PDF 74)
		file: "stonetop-locations/regions/the-foothills.json",
		category: "hearth",
		mins: [undefined],
		grants: { stats: { fortunes: 1 }, resources: ["Logging: timber, wood"], winterConsumption: -1, upkeep: { seasons: ["summer"], surplus: 1 } },
	},
	"Golden Sapling": {
		// Book II p. 189 (PDF 95)
		file: "stonetop-locations/settlements/the-golden-oak.json",
		category: "hearth",
		mins: [undefined],
		grants: { resources: ["Golden Sapling"], markImprovements: ["greaterHarvest"], surplusBonus: 1 },
	},
	"Great Wood Timber": {
		// Book II p. 202 (PDF 102)
		file: "stonetop-locations/regions/the-great-wood.json",
		category: "hearth",
		mins: [undefined],
		grants: { stats: { fortunes: 1 }, resources: ["Timber from the Great Wood"], winterConsumption: -1 },
	},
	"Rhoillyg Orchard": {
		// Book II p. 216 (PDF 109)
		file: "stonetop-lore/factions/green-lords.json",
		category: "hearth",
		mins: [undefined, 1, undefined],
		grants: {
			stats: { fortunes: 1 },
			resources: ["Rhoillyg Orchard"],
			completionNote: "Add the orchard to the steading map.",
			seasonalYield: { seasons: ["summer"], surplus: 1 },
			harvestBonus: 1,
		},
	},
	"Roadbuilding": {
		// Book II p. 273 (PDF 137)
		file: "stonetop-locations/byways/the-makers-roads.json",
		category: "renown",
		mins: [undefined],
		grants: {
			completionNote: "The steading can now expand or repair the Makers' Roads: every ~25 miles takes Pulling Together, a season of labor, 2 Surplus and a purse of silvers.",
		},
	},
	"Aetherium Crucible": {
		// Book II p. 405 (PDF 203)
		file: "stonetop-lore/factions/tempest-lords.json",
		category: "renown",
		mins: [undefined],
		grants: {
			resources: ["Aetherium Crucible"],
			completionNote: "Add the crucible to the steading map.",
			condition: { text: "Trading aetherium to the outside world", stats: { prosperity: 1 } },
			rollAdvantage: { moves: ["Trade & Barter"], ask: "Trading for aetherium items with special characteristics" },
		},
	},
};

/** The card's attribute value as the browser hands it to `dataset`: entity-decoded once. */
function cardElement(file) {
	const doc = JSON.parse(readFileSync(new URL(file, ROOT), "utf8"));
	const html = JSON.stringify(doc);
	const matches = [...html.matchAll(/data-steading-improvement=\\"([^"\\]*)\\"/g)];
	expect(matches).toHaveLength(1);
	const value = matches[0][1]
		.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")
		.replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
	return { dataset: { steadingImprovement: value } };
}

const read = name => readImprovementCard(cardElement(CARDS[name].file));

describe("Book II's baked steading-improvement cards", () => {
	it.each(Object.keys(CARDS))("%s: payload name, category, requirement counts and grants", name => {
		const spec = CARDS[name];
		const raw = read(name);
		expect(raw).not.toBeNull();

		// Title case, as the book's own prose names it, not the sidebar's small caps.
		expect(raw.name).toBe(name);
		expect(raw.name).not.toBe(raw.name.toUpperCase());

		expect(raw.category).toBe(spec.category);
		expect(IMPROVEMENT_CATEGORY_KEYS.has(raw.category)).toBe(true);

		// Authored exactly as the normalizer would store it: nothing dropped on the way in.
		expect(raw.grants).toEqual(spec.grants);
		expect(normalizeImprovementGrants(raw.grants)).toEqual(spec.grants);

		const sections = normalizeImprovementSections(raw.sections);
		expect(sections).toEqual(raw.sections);
		expect(sections.map(s => s.min)).toEqual(spec.mins);
		// Every "1 of these" / "either of these" heading carries its min; every other one has none.
		for (const s of sections) {
			const partial = /\b(1|either|one) of these\b/i.test(s.heading);
			expect(s.min === 1).toBe(partial);
		}

		// The drop path's sanitizer leaves the book's text alone.
		const def = sanitizeImprovementDef({ effect: raw.effect, sections });
		expect(def.sections).toEqual(sections);
		expect(def.effect).toBe(raw.effect);

		// No em dashes in anything the card authors.
		expect(JSON.stringify(raw)).not.toMatch(/—|&mdash;/);
	});

	it("Barrier Pass: either way of getting them to talk suffices, but not neither", () => {
		const def = { sections: normalizeImprovementSections(read("Trade with Barrier Pass").sections) };
		const rest = [true, true, true];
		expect(improvementRequirementsMet(def, [true, false, ...rest])).toBe(true);
		expect(improvementRequirementsMet(def, [false, true, ...rest])).toBe(true);
		expect(improvementRequirementsMet(def, [false, false, ...rest])).toBe(false);
		expect(improvementRequirementsMet(def, [true, true, true, true, false])).toBe(false);
	});

	it("Rhoillyg Orchard: either way of germinating the seeds suffices", () => {
		const def = { sections: normalizeImprovementSections(read("Rhoillyg Orchard").sections) };
		expect(improvementRequirementsMet(def, [true, true, false, true, true, true, true])).toBe(true);
		expect(improvementRequirementsMet(def, [true, true, true, false, true, true, true])).toBe(true);
		expect(improvementRequirementsMet(def, [true, true, false, false, true, true, true])).toBe(false);
		expect(improvementRequirementsMet(def, [false, true, true, true, true, true, true])).toBe(false);
	});
});
