import { describe, it, expect } from "vitest";
import {
	majorArcanaImg, isMajorArcana, isMajorArcanumItem, arcanumCardImg,
} from "../module/arcana-icons.js";

describe("arcana-icons taxonomy", () => {
	describe("isMajorArcana (slug only — shipped allowlist)", () => {
		it("is true for a shipped major slug", () => {
			expect(isMajorArcana("azure-hand")).toBe(true);
		});
		it("is false for a minor / unknown slug", () => {
			expect(isMajorArcana("humble-broom")).toBe(false);
			expect(isMajorArcana("my-homebrew")).toBe(false);
		});
	});

	describe("isMajorArcanumItem (item-aware)", () => {
		it("honors an explicit major flag even for an unknown slug", () => {
			expect(isMajorArcanumItem({ slug: "my-homebrew", major: true })).toBe(true);
		});
		it("falls back to the allowlist for shipped arcana without the flag", () => {
			expect(isMajorArcanumItem({ slug: "azure-hand" })).toBe(true);
		});
		it("is false for a minor item", () => {
			expect(isMajorArcanumItem({ slug: "humble-broom", major: false })).toBe(false);
			expect(isMajorArcanumItem({ slug: "humble-broom" })).toBe(false);
		});
		it("is false for null/undefined", () => {
			expect(isMajorArcanumItem(null)).toBe(false);
			expect(isMajorArcanumItem(undefined)).toBe(false);
		});
	});

	describe("arcanumCardImg", () => {
		it("returns the registered icon for a shipped major", () => {
			expect(arcanumCardImg({ slug: "azure-hand" }))
				.toBe(majorArcanaImg("azure-hand"));
		});
		it("prefers the registered icon over the item's own img for shipped majors", () => {
			expect(arcanumCardImg({ slug: "azure-hand", major: true, img: "custom.webp" }))
				.toBe(majorArcanaImg("azure-hand"));
		});
		it("falls back to the item's own img for a homebrew major", () => {
			expect(arcanumCardImg({ slug: "my-homebrew", major: true, img: "world/art.webp" }))
				.toBe("world/art.webp");
		});
		it("returns null for a homebrew major with no art", () => {
			expect(arcanumCardImg({ slug: "my-homebrew", major: true })).toBe(null);
		});
		it("treats the default item-bag icon as no art (not the card illustration)", () => {
			expect(arcanumCardImg({ slug: "my-homebrew", major: true, img: "icons/svg/item-bag.svg" })).toBe(null);
		});
		it("returns null for minor arcana (no card art)", () => {
			expect(arcanumCardImg({ slug: "humble-broom", img: "ignored.webp" })).toBe(null);
		});
	});
});
