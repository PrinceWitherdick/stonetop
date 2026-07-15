import { describe, it, expect } from "vitest";
import {
	artEmbed,
	bestiaryDescriptionWithArt,
	locationSectionsWithArt,
	mapFigureEmbed,
	textPageWithMap,
	matchWorldPage,
} from "../../module/book2-art/world-journal-art.js";

// Pure helpers that decide how Book II art is embedded into journal pages, shared by the
// runtime re-apply (reapply.js) and mirrored inline by the import macro. These are the
// idempotency + matching guarantees the two callers rely on.

const SRC = "stonetop-book-art/assets/locations/the-flats-1.webp";
const SRC2 = "stonetop-book-art/assets/locations/the-flats-2.webp";

describe("artEmbed", () => {
	it("produces the canonical stonetop-journal-art markup", () => {
		expect(artEmbed(SRC, "The Flats")).toBe(
			`<p><img class="stonetop-journal-art" src="${SRC}" alt="The Flats"></p>`
		);
	});

	it("escapes the alt text", () => {
		expect(artEmbed(SRC, `A & B "x" <y>`)).toContain(`alt="A &amp; B &quot;x&quot; &lt;y>"`);
	});
});

describe("bestiaryDescriptionWithArt", () => {
	it("prepends the embed to the existing prose", () => {
		const out = bestiaryDescriptionWithArt("<p>prose</p>", SRC, "Crinwin");
		expect(out).toBe(`<p><img class="stonetop-journal-art" src="${SRC}" alt="Crinwin"></p><p>prose</p>`);
	});

	it("returns null when the src is already embedded (idempotent)", () => {
		const once = bestiaryDescriptionWithArt("<p>prose</p>", SRC, "Crinwin");
		expect(bestiaryDescriptionWithArt(once, SRC, "Crinwin")).toBeNull();
	});

	it("treats a null/undefined description as empty", () => {
		expect(bestiaryDescriptionWithArt(null, SRC, "Crinwin")).toBe(
			`<p><img class="stonetop-journal-art" src="${SRC}" alt="Crinwin"></p>`
		);
		expect(bestiaryDescriptionWithArt(undefined, SRC, "Crinwin")).toContain(SRC);
	});
});

describe("locationSectionsWithArt", () => {
	const baseSections = () => [
		{ kind: "prose", heading: "At a Glance", body: "<p>glance</p>" },
		{ kind: "prose", heading: "The Place", body: "<p>place prose</p>" },
	];

	it("inserts the art into the target section body and preserves other fields", () => {
		const sections = baseSections();
		const out = locationSectionsWithArt(sections, 1, [SRC], "The Flats");
		expect(out).not.toBeNull();
		expect(out[1].body).toBe(
			`<p><img class="stonetop-journal-art" src="${SRC}" alt="The Flats"></p><p>place prose</p>`
		);
		expect(out[1].kind).toBe("prose");
		expect(out[1].heading).toBe("The Place");
		// untouched section left as-is
		expect(out[0].body).toBe("<p>glance</p>");
	});

	it("does not mutate the input array or section objects", () => {
		const sections = baseSections();
		const snapshot = JSON.stringify(sections);
		locationSectionsWithArt(sections, 1, [SRC], "The Flats");
		expect(JSON.stringify(sections)).toBe(snapshot);
	});

	it("returns null when every src is already present (idempotent)", () => {
		const sections = baseSections();
		const once = locationSectionsWithArt(sections, 1, [SRC], "The Flats");
		expect(locationSectionsWithArt(once, 1, [SRC], "The Flats")).toBeNull();
	});

	it("appends a late src after the last existing embed, keeping book order", () => {
		const sections = baseSections();
		const first = locationSectionsWithArt(sections, 1, [SRC], "The Flats");
		const second = locationSectionsWithArt(first, 1, [SRC, SRC2], "The Flats");
		expect(second).not.toBeNull();
		const body = second[1].body;
		// order: SRC embed, then SRC2 embed, then the prose
		expect(body.indexOf(SRC)).toBeLessThan(body.indexOf(SRC2));
		expect(body.indexOf(SRC2)).toBeLessThan(body.indexOf("<p>place prose</p>"));
	});

	it("falls back to the first section (top) when the target index is gone", () => {
		// The manifest's target section was deleted, so index 9 no longer exists: the
		// art lands at the top of the page rather than being silently dropped.
		const out = locationSectionsWithArt(baseSections(), 9, [SRC], "x");
		expect(out).not.toBeNull();
		expect(out[0].body).toBe(`${artEmbed(SRC, "x")}<p>glance</p>`);
		expect(out[1].body).toBe("<p>place prose</p>"); // other sections untouched
	});

	it("synthesises a top prose section when the page has no sections at all", () => {
		for (const empty of [[], null, undefined]) {
			const out = locationSectionsWithArt(empty, 0, [SRC], "The Flats");
			expect(out).not.toBeNull();
			expect(out).toHaveLength(1);
			expect(out[0]).toMatchObject({ kind: "prose", heading: "", group: "glance", danger: false, pairs: [], groups: [] });
			expect(out[0].body).toBe(artEmbed(SRC, "The Flats"));
		}
	});

	it("is idempotent after the synthesised fallback (no second copy on re-apply)", () => {
		const once = locationSectionsWithArt([], 0, [SRC], "The Flats");
		expect(locationSectionsWithArt(once, 0, [SRC], "The Flats")).toBeNull();
	});

	it("relocates art to the manifest's target section (manifest is authoritative)", () => {
		// The illustration sits in section 1, but the manifest now assigns it to section 0:
		// authoritative placement MOVES it (strips it from 1, inserts at 0) rather than
		// leaving it where it was. This is what makes the picker's re-section actually apply.
		const moved = [
			{ kind: "prose", heading: "At a Glance", body: "<p>glance</p>" },
			{ kind: "prose", heading: "The Place", body: `<p>place</p>${artEmbed(SRC, "x")}` },
		];
		const out = locationSectionsWithArt(moved, 0, [SRC], "x");
		expect(out).not.toBeNull();
		expect(out[0].body).toBe(`${artEmbed(SRC, "x")}<p>glance</p>`); // moved to target
		expect(out[1].body).toBe("<p>place</p>");                       // stripped from where it was
	});

	it("relocates only its own row's images out of a pile, leaving the others put", () => {
		// The Forge Lords case: three images were all piled at section 0; the manifest now
		// assigns img2 + img3 to section 2. Applying the section-2 row moves only those two,
		// leaving img1 at section 0 (its own row is a separate no-op call).
		const SRC3 = "stonetop-book-art/assets/locations/the-flats-3.webp";
		const piled = [
			{ kind: "prose", heading: "Overview", body: `<p>o</p>${artEmbed(SRC, "x")}${artEmbed(SRC2, "x")}${artEmbed(SRC3, "x")}` },
			{ kind: "prose", heading: "A", body: "<p>a</p>" },
			{ kind: "prose", heading: "Sites", body: "<p>sites</p>" },
		];
		const out = locationSectionsWithArt(piled, 2, [SRC2, SRC3], "x");
		expect(out).not.toBeNull();
		expect(out[0].body).toBe(`<p>o</p>${artEmbed(SRC, "x")}`);                        // img1 stays
		expect(out[2].body).toBe(`${artEmbed(SRC2, "x")}${artEmbed(SRC3, "x")}<p>sites</p>`); // img2+3 land here, in order
		expect(out[1].body).toBe("<p>a</p>");                                              // untouched
	});

	it("treats a ProseMirror-normalized embed as already present (no duplicate on re-apply)", () => {
		// After a GM opens a location page and saves, ProseMirror re-serializes each <img>
		// (attribute order changed, our class sometimes dropped). Detection keys on the src,
		// not the exact wrapper, so the re-apply must NOT insert a second copy of the image.
		for (const normalizedImg of [
			`<img src="${SRC}" class="stonetop-journal-art" alt="x">`, // class after src
			`<img src="${SRC}" alt="x">`,                              // class dropped entirely
		]) {
			const sections = [
				{ kind: "prose", heading: "Overview", body: "<p>o</p>" },
				{ kind: "prose", heading: "Sites", body: `<p>${normalizedImg}</p><p>sites</p>` },
			];
			expect(locationSectionsWithArt(sections, 1, [SRC], "x")).toBeNull();
		}
	});

	it("relocates a normalized embed, stripping the old copy so no duplicate survives", () => {
		// The art was placed in section 1, then a GM edit normalized its markup (src before
		// class). The manifest assigns it to section 0: it must MOVE there, leaving no stray
		// copy and no empty paragraph where it was.
		const normalized = [
			{ kind: "prose", heading: "At a Glance", body: "<p>glance</p>" },
			{ kind: "prose", heading: "The Place", body: `<p>place</p><p><img src="${SRC}" class="stonetop-journal-art" alt="x"></p>` },
		];
		const out = locationSectionsWithArt(normalized, 0, [SRC], "x");
		expect(out).not.toBeNull();
		expect(out[0].body).toBe(`${artEmbed(SRC, "x")}<p>glance</p>`); // canonical embed at the target
		expect(out[1].body).toBe("<p>place</p>");                       // normalized copy stripped, no empty <p>
		// exactly one occurrence of the src remains across the whole page
		const escaped = SRC.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const occurrences = out.map(s => s.body).join("").match(new RegExp(`src="${escaped}"`, "g")) ?? [];
		expect(occurrences).toHaveLength(1);
	});

	it("is a no-op once every image already sits in its assigned section", () => {
		const placed = [
			{ kind: "prose", heading: "Overview", body: "<p>o</p>" },
			{ kind: "prose", heading: "Sites", body: `${artEmbed(SRC, "x")}<p>sites</p>` },
		];
		expect(locationSectionsWithArt(placed, 1, [SRC], "x")).toBeNull();
	});

	it("skips a falsy section hole when falling back rather than throwing", () => {
		// A malformed page (a null where a section should be) must degrade gracefully:
		// place at the first REAL section, never dereference the hole.
		const out = locationSectionsWithArt([null, { kind: "prose", heading: "The Place", body: "<p>place</p>" }], 0, [SRC], "x");
		expect(out).not.toBeNull();
		expect(out[0]).toBeNull();                                    // hole preserved untouched
		expect(out[1].body).toBe(`${artEmbed(SRC, "x")}<p>place</p>`); // art at the first real section
	});

	it("defaults to section 0 when no index is given", () => {
		const out = locationSectionsWithArt(baseSections(), undefined, [SRC], "x");
		expect(out[0].body).toContain(SRC);
	});
});

describe("mapFigureEmbed", () => {
	const MAP = "stonetop-book-art/assets/maps/map-vicinity.webp";

	it("produces the captioned figure markup with the stonetop-map class", () => {
		expect(mapFigureEmbed(MAP, "The Vicinity")).toBe(
			`<figure class="stonetop-map"><img src="${MAP}" alt="The Vicinity"></figure>`
		);
	});

	it("escapes the alt text", () => {
		expect(mapFigureEmbed(MAP, `A & B "x" <y>`)).toContain(`alt="A &amp; B &quot;x&quot; &lt;y>"`);
	});
});

describe("textPageWithMap", () => {
	const MAP = "stonetop-book-art/assets/maps/map-vicinity.webp";

	it("prepends the map figure to the top of the page content", () => {
		const out = textPageWithMap("<p>setting prose</p>", MAP, "The Vicinity");
		expect(out).toBe(`<figure class="stonetop-map"><img src="${MAP}" alt="The Vicinity"></figure><p>setting prose</p>`);
	});

	it("treats a null/undefined content as empty", () => {
		expect(textPageWithMap(null, MAP, "The Vicinity")).toBe(
			`<figure class="stonetop-map"><img src="${MAP}" alt="The Vicinity"></figure>`
		);
		expect(textPageWithMap(undefined, MAP, "The Vicinity")).toContain(MAP);
	});

	it("returns null when this exact map src is already embedded (idempotent)", () => {
		const once = textPageWithMap("<p>prose</p>", MAP, "The Vicinity");
		expect(textPageWithMap(once, MAP, "The Vicinity")).toBeNull();
	});

	it("returns null when the page already carries ANY map figure (never stacks a second)", () => {
		// e.g. a GM's own labelled variant already on the page -> we leave it alone
		const withLabelled = `<figure class="stonetop-map"><img src="worlds/mine/map-vicinity-labelled.png" alt="mine"></figure><p>prose</p>`;
		expect(textPageWithMap(withLabelled, MAP, "The Vicinity")).toBeNull();
	});
});

describe("matchWorldPage", () => {
	const pages = [
		{ id: "aaa", name: "Alpha", type: "location", system: {} },
		{ id: "bbb", name: "Beta", type: "bestiary", system: {} },
	];

	it("matches by id first", () => {
		expect(matchWorldPage(pages, "bbb", "WRONG", "location")).toBe(pages[1]);
	});

	it("falls back to name + type when the id does not match", () => {
		expect(matchWorldPage(pages, "no-such-id", "Alpha", "location")).toBe(pages[0]);
	});

	it("requires both name AND type to match on the fallback", () => {
		expect(matchWorldPage(pages, "no-such-id", "Alpha", "bestiary")).toBeNull();
	});

	it("returns null when nothing matches", () => {
		expect(matchWorldPage(pages, "zzz", "Gamma", "location")).toBeNull();
	});

	it("accepts a Foundry-style collection exposing .contents", () => {
		const collection = { contents: pages };
		expect(matchWorldPage(collection, "aaa")).toBe(pages[0]);
	});

	it("tolerates null/undefined page lists", () => {
		expect(matchWorldPage(null, "aaa")).toBeNull();
		expect(matchWorldPage(undefined, "aaa")).toBeNull();
	});
});
