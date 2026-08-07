import { describe, it, expect } from "vitest";
import {
	ARCANA_CURSES,
	CURSE_TIERS,
	CURSE_FILTERS,
	UNGRADED_CURSE,
	arcanumCurse,
	hasConsequencesSection,
} from "../../module/data/arcana-curses.js";

const TIER_KEYS = CURSE_TIERS.map(t => t.key);
import { MAJOR_ARCANA_ICONS, isMajorArcana } from "../../module/arcana-icons.js";
import { loadArcanaPackDocs } from "../fakes/sourcePack.js";

const DOCS = loadArcanaPackDocs();
const arcOf = doc => ({ slug: doc.flags.stonetop.slug, back: doc.flags.stonetop.back ?? {} });
const BY_SLUG = new Map(DOCS.map(doc => [doc.flags.stonetop.slug, arcOf(doc)]));

describe("CURSE_TIERS", () => {
	it("is the three severity chips, worst first", () => {
		expect(TIER_KEYS).toEqual(["ruinous", "grim", "mild"]);
	});

	it("gives every tier a label, icon and tooltip hint", () => {
		for (const tier of CURSE_TIERS) {
			expect(tier.label, tier.key).toBeTruthy();
			expect(tier.icon, tier.key).toMatch(/^fas fa-/);
			expect(tier.hint, tier.key).toBeTruthy();
		}
	});
});

describe("ARCANA_CURSES table", () => {
	it("grades only real slugs, with a known tier and a cost line", () => {
		for (const [slug, entry] of Object.entries(ARCANA_CURSES)) {
			expect(BY_SLUG.has(slug), `${slug} is not a shipped arcanum`).toBe(true);
			expect(TIER_KEYS, slug).toContain(entry.tier);
			expect(entry.cost, slug).toBeTruthy();
		}
	});

	it("grades only Major arcana — the Consequences ladder is a Major mechanic", () => {
		for (const slug of Object.keys(ARCANA_CURSES)) expect(isMajorArcana(slug), slug).toBe(true);
	});

	it("leaves no tier empty, so no curse chip is dead on arrival", () => {
		const tiers = Object.values(ARCANA_CURSES).map(e => e.tier);
		for (const key of TIER_KEYS) expect(tiers, key).toContain(key);
	});
});

describe("coverage against the shipped cards", () => {
	it("grades exactly the majors that HAVE a Consequences track", () => {
		const withTrack = [...BY_SLUG.entries()]
			.filter(([, arc]) => hasConsequencesSection(arc))
			.map(([slug]) => slug)
			.sort();
		expect(Object.keys(ARCANA_CURSES).sort()).toEqual(withTrack);
	});

	it("covers every shipped major but the Blackwood Fetishes, which have no track", () => {
		const majors  = Object.keys(MAJOR_ARCANA_ICONS);
		const ungraded = majors.filter(slug => !ARCANA_CURSES[slug]);
		expect(ungraded).toEqual(["blackwood-fetishes"]);
		expect(hasConsequencesSection(BY_SLUG.get("blackwood-fetishes"))).toBe(false);
	});

	it("finds no Consequences track on any minor arcanum", () => {
		const minors = [...BY_SLUG.entries()].filter(([slug]) => !isMajorArcana(slug));
		expect(minors.length).toBe(64);
		expect(minors.filter(([, arc]) => hasConsequencesSection(arc)).map(([slug]) => slug)).toEqual([]);
	});
});

describe("hasConsequencesSection", () => {
	it("matches the heading, not the word in body prose", () => {
		expect(hasConsequencesSection({ back: { description: "<p>mark a Consequence</p>" } })).toBe(false);
		expect(hasConsequencesSection({ back: { description: "<h3>Consequences</h3><ul><li>□ x</li></ul>" } })).toBe(true);
	});

	it("is false for a card with no back at all", () => {
		expect(hasConsequencesSection({})).toBe(false);
		expect(hasConsequencesSection(null)).toBe(false);
	});
});

describe("arcanumCurse", () => {
	it("resolves a graded major to its tier, label, icon and cost", () => {
		const curse = arcanumCurse(BY_SLUG.get("hungering-maw-of-hlad"));
		expect(curse.tier).toBe("ruinous");
		expect(curse.label).toBe("Ruinous");
		expect(curse.icon).toBe("fas fa-skull");
		expect(curse.ungraded).toBe(false);
		expect(curse.cost).toMatch(/max HP/);
	});

	it("returns null for a card with no Consequences track", () => {
		expect(arcanumCurse(BY_SLUG.get("wolf-pelt"))).toBeNull();
		expect(arcanumCurse(BY_SLUG.get("blackwood-fetishes"))).toBeNull();
		expect(arcanumCurse({ slug: "nothing" })).toBeNull();
	});

	it("marks a homebrew card with an ungraded track rather than guessing a tier", () => {
		const curse = arcanumCurse({ slug: "my-major", back: { description: "<h2>Consequences</h2><ul><li>□</li></ul>" } });
		expect(curse.ungraded).toBe(true);
		expect(curse.tier).toBe("");
		expect(curse.label).toBe("Cursed");
		// The FACET key, which is what the browser files the row under. Blank `tier` is exactly why
		// it has to be read from here rather than derived: a row filed under a value no chip carries
		// is hidden by every chip in the group, not merely unfilterable.
		expect(curse.key).toBe("ungraded");
	});
});

// The chips and the grading are one list for a reason: the browser's facet groups AND, so a
// grading with no chip does not fall through the filter — it is HIDDEN by every chip in its own
// group. Ungraded homebrew majors spent their whole existence in that hole, invisible under the
// very filter their grading was invented to keep them visible under.
describe("CURSE_FILTERS", () => {
	it("carries a chip for every grading arcanumCurse can hand back", () => {
		const gradings = new Set([...Object.values(ARCANA_CURSES).map(c => c.tier), UNGRADED_CURSE.key]);
		const chipKeys = new Set(CURSE_FILTERS.map(c => c.key));
		for (const grading of gradings) expect(chipKeys, grading).toContain(grading);
	});

	it("is the severity ladder worst-first, with the absence of a grade last", () => {
		expect(CURSE_FILTERS.map(c => c.key)).toEqual([...TIER_KEYS, "ungraded"]);
	});

	it("gives every chip a label, icon and tooltip hint, and never an empty key", () => {
		for (const chip of CURSE_FILTERS) {
			// "" is how catalog-filters spells "nothing lit in this group", so a chip keyed with it
			// would clear itself the instant it was clicked and could never light.
			expect(chip.key, chip.label).toBeTruthy();
			expect(chip.label, chip.key).toBeTruthy();
			expect(chip.icon, chip.key).toMatch(/^fas fa-/);
			expect(chip.hint, chip.key).toBeTruthy();
		}
	});
});
