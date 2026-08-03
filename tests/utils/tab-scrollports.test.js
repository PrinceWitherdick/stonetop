import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

// Each tab on the character and steading sheets is its own scrollport, so it keeps its
// own scroll offset: the browser preserves a scrollport's scrollTop across the
// `display: none` that hides an inactive tab, and the portrait/stats header stays pinned
// while you read.
//
// That only works while the flex height chain above the tab stays DEFINITE. It used to be
// gated on `:has(.tab.notes.active)`, which left every other tab with nothing for
// `height: 100%` to resolve against: the tab grew to its full content height, its
// `overflow-y: auto` never engaged, and the whole sheet scrolled as one unit in
// `.window-content` instead. One shared scrollport means one shared offset, so switching
// to a shorter tab clamped it and the position in the tall tab was gone on the way back.
//
// The failure is silent (nothing errors, the sheet just scrolls as one piece), so these
// guard the declarations that keep the chain definite. Layout itself is verified in a
// browser, not here.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.resolve(HERE, "../..", rel), "utf8");

const CSS = read("styles/stonetop.css");
const CHARACTER_SHEET = read("module/actors/character/StonetopCharacterSheet.js");
const STEADING_SHEET = read("module/actors/steading/StonetopSteadingSheet.js");

/** The declaration block for the first rule whose selector list contains `selector`. */
function ruleFor(selector) {
	const at = CSS.indexOf(selector);
	if (at === -1) return null;
	const open = CSS.indexOf("{", at);
	const close = CSS.indexOf("}", open);
	if (open === -1 || close === -1) return null;
	return CSS.slice(open + 1, close);
}

describe("character sheet tab scrollports", () => {
	it("relinks the height chain for every tab, not only Notes", () => {
		// The three steps between the window frame and the tab body. If any of them
		// regains a `:has(.tab.notes.active)` gate, `height: 100%` on the tab stops
		// resolving and the sheet silently goes back to scrolling as one unit.
		for (const step of [".window-content > form", ".sheet-wrapper", ".sheet-main"]) {
			const selector = `.pbta.sheet.actor.character ${step}`;
			// Either mid-list (trailing comma) or last before the block's brace. Compared as
			// booleans so a miss reports the step, not a diff of the whole stylesheet.
			const ungated = CSS.includes(`${selector},`) || CSS.includes(`${selector} {`);
			expect(ungated, `${step} must still be in the ungated chain`).toBe(true);
			const gated = CSS.includes(`${selector}:has(.tab.notes.active)`);
			expect(gated, `${step} must not be re-gated to the Notes tab`).toBe(false);
		}
	});

	it("gives the chain a definite, growing height at each step", () => {
		const block = ruleFor(".pbta.sheet.actor.character .sheet-main");
		expect(block).toBeTruthy();
		expect(block).toContain("flex: 1 1 auto");
		// Without min-height: 0 a flex item refuses to shrink below its content, so the
		// tab would push the sheet taller instead of scrolling inside it.
		expect(block).toContain("min-height: 0");
		expect(block).toContain("flex-direction: column");
		// pbta sets flex-wrap: wrap on .sheet-wrapper; in a column that spills sideways.
		expect(block).toContain("flex-wrap: nowrap");
	});

	it("pins the header and stats so only the tab body scrolls", () => {
		const block = ruleFor(".pbta.sheet.actor.character .sheet-wrapper > :not(.sheet-main)");
		expect(block).toBeTruthy();
		expect(block).toContain("flex: 0 0 auto");
	});

	it("leaves the blank sheet's Create Character block free to take the slack", () => {
		// The no-playbook sheet has no .sheet-main, so the generic "everything else is
		// rigid" rule would otherwise pin its call-to-action and break the centring.
		expect(CSS).toContain(".sheet-wrapper > :not(.sheet-main):not(.stonetop-no-playbook-state)");
	});
});

describe("tab scrollbars stay hidden", () => {
	it.each([
		["character", ".pbta.sheet.actor.character .stonetop-sheet-layout .sheet-body > .tab.active:not(.notes)"],
		["steading", ".steading-sheet .sheet-body > .tab.active:not(.notes)"],
	])("%s tabs scroll without drawing a bar", (_label, selector) => {
		const block = ruleFor(selector);
		expect(block).toBeTruthy();
		expect(block).toContain("overflow-y: auto");
		expect(block).toContain("scrollbar-width: none");
		// A reserved gutter insets the tab's right edge for a bar that is never drawn.
		expect(block).not.toContain("scrollbar-gutter");
	});
});

describe("scroll restore across re-renders", () => {
	it("saves the active tab, not .window-content", () => {
		// On a re-render Foundry hands _restoreScrollPositions the freshly rendered inner
		// form, not the outer frame, so a `.window-content` entry saves fine and then
		// restores nothing. The selector has to resolve from inside the form.
		const scrollY = CHARACTER_SHEET.match(/scrollY:\s*\[([^\]]*)\]/)?.[1];
		expect(scrollY).toBeTruthy();
		expect(scrollY).toContain(".sheet-body > .tab.active");
		expect(scrollY).not.toContain(".window-content");
	});
});

describe("retired scroll workarounds", () => {
	it("neither sheet carries a scroll offset across tab switches by hand", () => {
		// keepScrollAcrossTab ran as the Tabs callback, which fires AFTER the panel
		// classes have already been toggled, so the offset it read was the one the
		// browser had just clamped. Per-tab scrollports make the whole thing unnecessary.
		for (const src of [CHARACTER_SHEET, STEADING_SHEET]) {
			expect(src).not.toContain("keepScrollAcrossTab");
			expect(src).not.toContain("_onChangeTab");
		}
	});

	it("neither sheet drives the sidebar collapse handle by hand", () => {
		// followSidebarToggle slid the handle down to track a sheet that scrolled as one
		// unit. Only the tab body scrolls now, and it scrolls beside the sidebar.
		for (const src of [CHARACTER_SHEET, STEADING_SHEET]) {
			expect(src).not.toContain("followSidebarToggle");
		}
	});
});
