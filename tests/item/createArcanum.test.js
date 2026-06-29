import { describe, it, expect } from "vitest";
import {
	slugify, uniqueArcanumSlug, buildArcanumItemData,
} from "../../module/item/createArcanum.js";

describe("createArcanum helpers", () => {
	describe("slugify", () => {
		it("kebab-cases a display name", () => {
			expect(slugify("Azure Hand")).toBe("azure-hand");
		});
		it("trims punctuation and collapses runs", () => {
			expect(slugify("  A Folktale!! ")).toBe("a-folktale");
		});
		it("strips accents via NFKD", () => {
			expect(slugify("Café Crème")).toBe("cafe-creme");
		});
		it("returns '' for empty/nullish input", () => {
			expect(slugify("")).toBe("");
			expect(slugify(null)).toBe("");
			expect(slugify(undefined)).toBe("");
		});
	});

	describe("uniqueArcanumSlug", () => {
		it("returns the base slug when free", () => {
			expect(uniqueArcanumSlug("Azure Hand", [])).toBe("azure-hand");
		});
		it("suffixes -2, -3 on collision", () => {
			expect(uniqueArcanumSlug("Azure Hand", ["azure-hand"])).toBe("azure-hand-2");
			expect(uniqueArcanumSlug("Azure Hand", ["azure-hand", "azure-hand-2"])).toBe("azure-hand-3");
		});
		it("accepts a Set of taken slugs", () => {
			expect(uniqueArcanumSlug("Azure Hand", new Set(["azure-hand"]))).toBe("azure-hand-2");
		});
		it("falls back to 'arcanum' for an empty name", () => {
			expect(uniqueArcanumSlug("", [])).toBe("arcanum");
			expect(uniqueArcanumSlug("", ["arcanum"])).toBe("arcanum-2");
		});
	});

	describe("buildArcanumItemData", () => {
		it("produces a move item flagged as an arcanum with the dedicated sheet", () => {
			const data = buildArcanumItemData({ slug: "my-homebrew", name: "My Homebrew" });
			expect(data.type).toBe("move");
			expect(data.system.moveType).toBe("arcanum");
			expect(data.flags.core.sheetClass).toBe("stonetop.StonetopArcanumSheet");
		});
		it("stores card data under flags.stonetop with the slug and tier", () => {
			const data = buildArcanumItemData({ slug: "my-homebrew", name: "My Homebrew", major: true });
			expect(data.flags.stonetop.slug).toBe("my-homebrew");
			expect(data.flags.stonetop.major).toBe(true);
			expect(data.flags.stonetop.front.title).toBe("My Homebrew");
		});
		it("defaults to a minor arcanum", () => {
			expect(buildArcanumItemData({ slug: "x" }).flags.stonetop.major).toBe(false);
		});
		it("scaffolds empty front/back shapes the model expects", () => {
			const { front, back } = buildArcanumItemData({ slug: "x" }).flags.stonetop;
			expect(front.unlock).toEqual({ description: "", requirements: [] });
			expect(back.options).toEqual([]);
			expect(back.resource).toBeNull();
			expect(back.move).toBeNull();
		});
		it("only sets img when provided", () => {
			expect(buildArcanumItemData({ slug: "x" }).img).toBeUndefined();
			expect(buildArcanumItemData({ slug: "x", img: "a.webp" }).img).toBe("a.webp");
		});
		it("merges a front pre-fill over the defaults (wizard seed), keeping the scaffold", () => {
			const seed = "<p><em>Inspiration</em></p>";
			const { front } = buildArcanumItemData({ slug: "x", name: "Seeded", front: { description: seed } }).flags.stonetop;
			expect(front.description).toBe(seed);
			// Untouched defaults survive the merge.
			expect(front.title).toBe("Seeded");
			expect(front.unlock).toEqual({ description: "", requirements: [] });
		});
		it("merges a back pre-fill over the defaults", () => {
			const { back } = buildArcanumItemData({ slug: "x", back: { description: "<p>boon</p>" } }).flags.stonetop;
			expect(back.description).toBe("<p>boon</p>");
			expect(back.options).toEqual([]);
			expect(back.move).toBeNull();
		});
	});
});
