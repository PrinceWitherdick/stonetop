import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The NPC window's sizing contract, which is three separate decisions that only make sense
// together — and which regress SILENTLY, because a window that resizes itself still works,
// it just moves under the cursor:
//
//  1. `height: "auto"` so it OPENS fitted to its content.
//  2. Tab switches do NOT refit. This is the one that keeps getting re-added: refitting per
//     tab looks tidy in isolation (a short tab hugs its content) but means the frame grows
//     and shrinks as you browse, and throws away a size the user chose.
//  3. A manual drag freezes it, via enableAutoHeightVerticalResize.
//
// Wiring a full AppV1 sheet under node is not worth it for this, so these read the source.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.resolve(HERE, "../../..", rel), "utf8");

const SHEET = read("module/actors/npc/StonetopNpcSheet.js");
const CSS = read("styles/stonetop.css").replace(/\/\*[\s\S]*?\*\//g, "");
// Comments explain at length why there is no per-tab refit, and name the thing they are
// explaining — so strip them before asserting on what the code does.
const CODE = SHEET.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

describe("the NPC sheet's window height", () => {
	it("opens fitted to its content", () => {
		expect(CODE).toMatch(/height:\s*"auto"/);
	});

	it("does not refit when the user switches tabs", () => {
		// The regression shape: a click handler bound to the tab strip that calls _fitHeight.
		expect(CODE).not.toMatch(/sheet-tabs[\s\S]{0,240}_fitHeight/);
	});

	it("still refits when content changes height inside a tab", () => {
		// Not the same thing as tab navigation: the relationships board is taller than the
		// table and an opened card note taller again, so that path legitimately asks for a
		// refit. Guarding tab switches must not take this with it.
		expect(CODE).toMatch(/onResize:[\s\S]{0,240}_fitHeight/);
		expect(CODE).toMatch(/_fitHeight\(\)\s*\{/);
	});

	it("has no max-height to fight the user's chosen size", () => {
		// A cap on the frame would clamp a drag as well as the opening height. The NPC frame
		// carried one (700px) until it was found to be both redundant — core clamps to the
		// viewport — and the only one on any sheet.
		expect(CSS).not.toMatch(/\.window-app\.stonetop\.sheet\.actor\.npc\s*\{[^}]*max-height/);
	});

	it("keeps a tab that outgrows the frame scrollable, since the frame no longer grows for it", () => {
		// This is what makes "never refit" safe: nothing is cut off, it scrolls in place.
		expect(CSS).toMatch(
			/\.stonetop-npc-sheet \.sheet-body > \.tab\.active:not\(\.notes\)\s*\{[^}]*overflow-y:\s*auto/);
	});
});
