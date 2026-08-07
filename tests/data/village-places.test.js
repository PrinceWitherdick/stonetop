import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
	VILLAGE_PLACES, normalizePlaceName, villagePlaceBlurb, villagePlaceFor,
} from "../../module/data/village-places.js";

// What the book says about the village's lettered places, so a Place of Interest's
// Chronicle page opens with the gazetteer's own words rather than an empty body.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VILLAGE_PACK_DOC = path.resolve(
	HERE, "../../packs/src/stonetop-locations/settlements/the-village-of-stonetop.json"
);

/**
 * The "Places" bullets off the shipped Village of Stonetop location journal, with their
 * `@UUID` cross-links flattened to the bold names they display — the exact form the data
 * module stores.
 */
function packPlaceBullets() {
	const doc = JSON.parse(fs.readFileSync(VILLAGE_PACK_DOC, "utf8"));
	const section = doc.pages
		.flatMap(p => p.system?.sections ?? [])
		.find(s => s.heading === "Places");
	if (!section) throw new Error('the Village of Stonetop journal has no "Places" section');
	return [...section.body.matchAll(/<li>([\s\S]*?)<\/li>/g)]
		.map(m => m[1].replace(/<strong>@UUID\[[^\]]+\]\{([^}]*)\}<\/strong>/g, "<strong>$1</strong>"));
}

describe("VILLAGE_PLACES mirrors the shipped village journal", () => {
	// Nothing at runtime can read a pack's source, so the blurbs are duplicated into the
	// data module. That is fine only while it cannot drift silently: an edit to the
	// gazetteer text that never reached here would put stale prose on every place page.
	const bullets = packPlaceBullets();

	it("quotes every blurb verbatim from the journal's Places section", () => {
		for (const place of VILLAGE_PLACES) {
			expect(bullets, `no "Places" bullet matches ${place.key}`).toContain(place.blurb);
		}
	});

	it("covers every bullet the journal lists", () => {
		expect(VILLAGE_PLACES).toHaveLength(bullets.length);
	});

	it("gives each place a unique key and at least one alias", () => {
		const keys = VILLAGE_PLACES.map(p => p.key);
		expect(new Set(keys).size).toBe(keys.length);
		for (const place of VILLAGE_PLACES) expect(place.aliases.length).toBeGreaterThan(0);
	});

	it("stores every alias already normalised, or it could never match", () => {
		for (const place of VILLAGE_PLACES) {
			for (const alias of place.aliases) expect(normalizePlaceName(alias)).toBe(alias);
		}
	});
});

describe("normalizePlaceName", () => {
	it("folds case, the leading article, ampersands and punctuation", () => {
		expect(normalizePlaceName("The Public House & Stables")).toBe("public house and stables");
		expect(normalizePlaceName("  the   STONE  ")).toBe("stone");
		expect(normalizePlaceName("Pavilion of the Gods")).toBe("pavilion of the gods");
	});

	it("drops only a LEADING article, not one mid-name", () => {
		expect(normalizePlaceName("Pavilion of the Gods")).toContain("of the gods");
	});

	it("is empty for a blank slot", () => {
		expect(normalizePlaceName("")).toBe("");
		expect(normalizePlaceName(null)).toBe("");
		expect(normalizePlaceName("   ")).toBe("");
	});
});

describe("villagePlaceFor", () => {
	// The six the steading sheet ships filled in, spelled as STEADING_DEFAULTS spells them.
	it("finds all six printed landmarks by their default names", () => {
		const defaults = ["The Stone", "The Granary", "Public House & Stables", "Cistern", "Pavilion of the Gods", "Watchtowers"];
		for (const name of defaults) {
			expect(villagePlaceFor(name), `no book entry for "${name}"`).toBeTruthy();
		}
	});

	it("matches a name that extends an alias", () => {
		expect(villagePlaceFor("Watchtowers (north)")?.key).toBe("watchtowers");
		expect(villagePlaceFor("public house and stables")?.key).toBe("public-house");
	});

	// The reason matching is anchored rather than a substring test: a place that merely
	// starts with the same word is a different place, and inheriting the Stone's paragraph
	// would put wrong prose on a page the GM went on to write in.
	it("does not match a longer word that merely starts the same", () => {
		expect(villagePlaceFor("Stonemason's yard")).toBe(null);
		expect(villagePlaceFor("Fieldstone Barn")).toBe(null);
	});

	it("has nothing to say about a place the GM invented", () => {
		expect(villagePlaceFor("Bethany's smithy")).toBe(null);
		expect(villagePlaceFor("")).toBe(null);
	});
});

describe("villagePlaceBlurb", () => {
	it("wraps the book's paragraph as HTML", () => {
		expect(villagePlaceBlurb("Cistern")).toBe(`<p>${VILLAGE_PLACES.find(p => p.key === "cistern").blurb}</p>`);
	});

	it("is empty when the book describes no such place", () => {
		expect(villagePlaceBlurb("Bethany's smithy")).toBe("");
	});
});
