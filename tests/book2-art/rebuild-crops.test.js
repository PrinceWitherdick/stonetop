import { describe, it, expect } from "vitest";
import { isCropSlug, parentSlugOf, isValidCrop, plannedCropRebuilds } from "../../module/book2-art/rebuild-crops.js";
import { BOOK2_ART_APPLY_MANIFEST } from "../../module/book2-art/manifest.js";

// Rebuilding a missing detail portrait out of the parent illustration already on disk, so a GM
// who imported before detail portraits existed does not have to find their PDFs again. These
// cover the pure planning half; the canvas/upload half needs a browser.

const ROOT = "stonetop-book-art";
const durable = (out) => `${ROOT}/${out}`;
const person = (slug, crop) => ({ slug, name: slug, out: `assets/people/${slug}.webp`, ...(crop ? { crop } : {}) });

describe("crop slug parsing", () => {
	it("recognises a crop slug and recovers its parent", () => {
		expect(isCropSlug("b1-p042-x173-c665-098-757-840")).toBe(true);
		expect(parentSlugOf("b1-p042-x173-c665-098-757-840")).toBe("b1-p042-x173");
	});

	it("handles four-digit 1000 groups", () => {
		// per-mille of 1.0 is "1000", not "100" — a \d{3} pattern silently misses every rect
		// touching an edge, which is most of them
		const slug = "b1-p007-x32-c750-387-1000-1000";
		expect(isCropSlug(slug)).toBe(true);
		expect(parentSlugOf(slug)).toBe("b1-p007-x32");
	});

	it("leaves a whole-image slug alone", () => {
		expect(isCropSlug("b1-p156-x594")).toBe(false);
		expect(parentSlugOf("b1-p156-x594")).toBe("b1-p156-x594");
	});

	it("does not mistake other trailing digits for a crop", () => {
		expect(isCropSlug("b1-p007-x32")).toBe(false);
		expect(isCropSlug("b2-p154-x619")).toBe(false);
	});
});

describe("crop rect validation", () => {
	it("accepts a well-formed rect", () => {
		expect(isValidCrop([0, 0.1, 0.5, 1])).toBe(true);
	});

	it("rejects malformed, inverted, zero-area and out-of-range rects", () => {
		expect(isValidCrop(null)).toBe(false);
		expect(isValidCrop([0, 0, 1])).toBe(false);
		expect(isValidCrop([0.5, 0, 0.2, 1])).toBe(false);   // x1 <= x0
		expect(isValidCrop([0.2, 0.4, 0.2, 0.9])).toBe(false); // zero width
		expect(isValidCrop([-0.1, 0, 0.5, 1])).toBe(false);
		expect(isValidCrop([0, 0, 1.2, 1])).toBe(false);
		expect(isValidCrop(["a", 0, 1, 1])).toBe(false);
	});
});

describe("plannedCropRebuilds", () => {
	it("plans a crop whose file is missing but whose parent is present", () => {
		const people = [person("p1-c100-100-900-900", [0.1, 0.1, 0.9, 0.9])];
		const present = new Set([durable("assets/people/p1.webp")]);
		const plan = plannedCropRebuilds(present, ROOT, people);
		expect(plan).toHaveLength(1);
		expect(plan[0].parentSrc).toBe(durable("assets/people/p1.webp"));
		expect(plan[0].dest).toBe(durable("assets/people/p1-c100-100-900-900.webp"));
		expect(plan[0].crop).toEqual([0.1, 0.1, 0.9, 0.9]);
	});

	it("skips a crop that is already on disk", () => {
		const people = [person("p1-c100-100-900-900", [0.1, 0.1, 0.9, 0.9])];
		const present = new Set([
			durable("assets/people/p1.webp"),
			durable("assets/people/p1-c100-100-900-900.webp"),
		]);
		expect(plannedCropRebuilds(present, ROOT, people)).toHaveLength(0);
	});

	it("skips a crop whose parent was never imported", () => {
		const people = [person("p1-c100-100-900-900", [0.1, 0.1, 0.9, 0.9])];
		expect(plannedCropRebuilds(new Set(), ROOT, people)).toHaveLength(0);
	});

	it("ignores whole-image portraits — there is nothing to cut", () => {
		const people = [person("p1")];
		expect(plannedCropRebuilds(new Set(), ROOT, people)).toHaveLength(0);
	});

	it("skips a row carrying a malformed rect rather than planning a bad cut", () => {
		const people = [person("p1-c100-100-900-900", [0.9, 0.1, 0.1, 0.9])];
		const present = new Set([durable("assets/people/p1.webp")]);
		expect(plannedCropRebuilds(present, ROOT, people)).toHaveLength(0);
	});

	it("still plans when the parent is no longer a person row itself", () => {
		// the common upgrade shape: the parent group illustration was superseded by its crops
		// and dropped from the manifest, but its FILE is still sitting in the art folder
		const people = [person("p1-c100-100-900-900", [0.1, 0.1, 0.9, 0.9])];
		const present = new Set([durable("assets/people/p1.webp")]);
		expect(plannedCropRebuilds(present, ROOT, people)).toHaveLength(1);
	});

	it("plans nothing when nothing has been imported at all", () => {
		expect(plannedCropRebuilds(new Set(), ROOT)).toHaveLength(0);
	});

	it("honours a non-default art root", () => {
		const people = [person("p1-c100-100-900-900", [0.1, 0.1, 0.9, 0.9])];
		const present = new Set(["my-art/assets/people/p1.webp"]);
		const plan = plannedCropRebuilds(present, "my-art", people);
		expect(plan[0].dest).toBe("my-art/assets/people/p1-c100-100-900-900.webp");
	});
});

describe("against the real shipped manifest", () => {
	const { people = [] } = BOOK2_ART_APPLY_MANIFEST;
	const crops = people.filter((p) => isCropSlug(p.slug));

	it("ships a crop rect for every detail portrait", () => {
		// rebuild-crops is the only consumer of `crop` in the shipped projection; if
		// gen-pack-macro ever stops emitting it, every rebuild silently plans nothing
		expect(crops.length).toBeGreaterThan(0);
		for (const c of crops) expect(isValidCrop(c.crop)).toBe(true);
	});

	it("never carries a crop on a whole-image portrait", () => {
		for (const p of people.filter((x) => !isCropSlug(x.slug))) expect(p.crop).toBeUndefined();
	});

	it("rebuilds every detail from the whole-illustration set an older release shipped", () => {
		// the upgrade path this feature exists for: holding only the parents, a GM can recover
		// all of the details in one pass
		const parents = new Set(crops.map((c) => durable(`assets/people/${parentSlugOf(c.slug)}.webp`)));
		const plan = plannedCropRebuilds(parents, ROOT);
		expect(plan).toHaveLength(crops.length);
	});
});
