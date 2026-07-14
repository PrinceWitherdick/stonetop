import { describe, it, expect } from "vitest";
import {
	artEmbed,
	bestiaryDescriptionWithArt,
	locationSectionsWithArt,
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

	it("returns null when the target section index does not exist", () => {
		expect(locationSectionsWithArt(baseSections(), 9, [SRC], "x")).toBeNull();
		expect(locationSectionsWithArt([], 0, [SRC], "x")).toBeNull();
		expect(locationSectionsWithArt(null, 0, [SRC], "x")).toBeNull();
	});

	it("defaults to section 0 when no index is given", () => {
		const out = locationSectionsWithArt(baseSections(), undefined, [SRC], "x");
		expect(out[0].body).toContain(SRC);
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
