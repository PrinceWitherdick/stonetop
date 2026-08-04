import { afterEach, describe, expect, it, vi } from "vitest";
import { headerPortraitContext } from "../../module/utils/actor-portrait-picker.js";

// The two pips over a sheet header's portrait: crop on the right, Tokenizer on its left. One
// function answers for all three sheets that draw the header, which is the point of it — the
// visibility policy cannot be changed on the character sheet and silently not on the monster.

afterEach(() => { delete globalThis.game.modules; });

/** A `game.modules` registry answering the way Foundry's does. */
function installTokenizer({ active = true, api = { launch: vi.fn() } } = {}) {
	globalThis.game.modules = { get: (id) => (id === "vtta-tokenizer" ? { active, api } : undefined) };
}

const sheetFor = (img, { editable = true } = {}) =>
	({ actor: { id: "abc", name: "Bryn", img, flags: {} }, isEditable: editable });

describe("the header portrait's pips", () => {
	it("offers both on real art, with Tokenizer installed", () => {
		installTokenizer();
		const ctx = headerPortraitContext(sheetFor("worlds/w/bryn.webp"), "worlds/w/bryn.webp");
		expect(ctx.canFramePortrait).toBe(true);
		expect(ctx.canTokenizePortrait).toBe(true);
	});

	// THE BUG THIS EXISTS FOR: a brand-new character has no portrait, and the Tokenizer pip was
	// deliberately ungated on art — so a fresh sheet answered a hover over its blank silhouette
	// with a button. Choosing a face comes first, by clicking the portrait itself.
	it.each([
		["a fresh actor with no image at all", ""],
		["Foundry's stock mystery-man", "icons/svg/mystery-man.svg"],
		["the item-bag icon", "icons/svg/item-bag.svg"],
	])("offers NEITHER pip over %s", (_label, img) => {
		installTokenizer();
		const ctx = headerPortraitContext(sheetFor(img), img);
		expect(ctx.canFramePortrait).toBe(false);
		expect(ctx.canTokenizePortrait).toBe(false);
	});

	it("drops only the Tokenizer pip when the module is absent", () => {
		globalThis.game.modules = { get: () => undefined };
		const ctx = headerPortraitContext(sheetFor("worlds/w/bryn.webp"), "worlds/w/bryn.webp");
		expect(ctx.canFramePortrait).toBe(true);
		expect(ctx.canTokenizePortrait).toBe(false);
	});

	it("offers neither to a reader who may not edit this actor", () => {
		installTokenizer();
		const ctx = headerPortraitContext(
			sheetFor("worlds/w/bryn.webp", { editable: false }), "worlds/w/bryn.webp");
		expect(ctx.canFramePortrait).toBe(false);
		expect(ctx.canTokenizePortrait).toBe(false);
	});
});
