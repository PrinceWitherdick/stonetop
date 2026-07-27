import { describe, it, expect } from "vitest";
import { SETTLEMENTS } from "../../module/data/settlements.js";

describe("SETTLEMENTS roster", () => {
	it("names the book's communities Stonetop can deal with", () => {
		expect(SETTLEMENTS.map(s => s.name)).toEqual([
			"Gordin's Delve", "Marshedge", "Hillfolk", "Barrier Pass",
			"North Manmarch", "Ustrina", "Lygos", "The Fae",
		]);
	});

	it("never lists Stonetop itself — a steading has no relationship with itself", () => {
		expect(SETTLEMENTS.some(s => /^(the village of )?stonetop$/i.test(s.name))).toBe(false);
	});

	it("gives every row the fields the table renders", () => {
		for (const s of SETTLEMENTS) {
			expect(s.name, `${s.slug} name`).toBeTruthy();
			expect(s.blurb, `${s.slug} blurb`).toBeTruthy();
			expect(s.icon, `${s.slug} icon`).toMatch(/^fas fa-/);
		}
	});

	// Authored ahead of the surfaces that will read them: `region` is reference for whoever
	// edits a blurb, `packSlug` the Locations-compendium link a future build will follow.
	it("carries its not-yet-rendered reference fields on every row", () => {
		for (const s of SETTLEMENTS) {
			expect(s.region, `${s.slug} region`).toBeTruthy();
			expect(typeof s.packSlug, `${s.slug} packSlug`).toBe("string");
		}
	});

	describe("slugs are storage keys, so they carry constraints", () => {
		it("are unique — a collision would silently merge two ratings", () => {
			const slugs = SETTLEMENTS.map(s => s.slug);
			expect(new Set(slugs).size).toBe(slugs.length);
		});

		it("contain no dot, which Foundry would expand into a nested update path", () => {
			for (const s of SETTLEMENTS) expect(s.slug, s.name).not.toContain(".");
		});

		it("stay lowercase kebab-case, so they read the same in every world", () => {
			for (const s of SETTLEMENTS) expect(s.slug, s.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
		});
	});
});
