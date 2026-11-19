import { describe, it, expect } from "vitest";
import { readRepo } from "../../fakes/css.js";

// The steading sheet's capture-phase delegation goes through onCapture (utils/activation.js), as
// the character sheet's does: one copy of "find the control, claim the event, act". Pinned so a
// new hand-rolled copy of the exact shape is caught here rather than in review.
const SHEET = readRepo("module/actors/steading/StonetopSteadingSheet.js");

describe("the steading sheet's capture-phase wiring", () => {
	it("leaves no hand-rolled copy of onCapture's shape", () => {
		const handRolled = /addEventListener\("\w+", (?:async )?\(?ev\)? => \{\s*const (\w+) = ev\.target\.closest\([^)]*\);\s*if \(!\1\) return;\s*ev\.stopPropagation\(\);/g;
		expect(SHEET.match(handRolled) ?? []).toEqual([]);
		expect(SHEET).toContain(`import {onCapture} from "../../utils/activation.js";`);
	});

	// The add button is one class across every list, split by edit mode: the people lists' is
	// live outside it, the rest only inside. Each half must leave the other's event unclaimed,
	// which is what onCapture's `when` guard (checked BEFORE the claim) gives it.
	it("splits the add buttons between the two handlers with complementary guards", () => {
		expect(SHEET).toContain(`btn => PEOPLE_LISTS.includes(btn.dataset.list));`);
		expect(SHEET).toContain(`btn => !PEOPLE_LISTS.includes(btn.dataset.list));`);
		expect(SHEET).toMatch(/const PEOPLE_LISTS = Object\.freeze\(\["residents", "neighbors"\]\);/);
	});

	// A disabled glyph, or a `data-action` that is not a hold's, must travel on untouched: the
	// sheet carries many other data-action buttons with handlers of their own.
	it("claims a hold glyph's click only for an enabled hold action", () => {
		expect(SHEET).toContain(`btn => !btn.disabled && Object.hasOwn(holdActions, btn.dataset.action));`);
	});

	// These are anchors: claimed AND default-prevented, on click alone, as before the move.
	it("still prevents the actor links' default", () => {
		expect(SHEET).toMatch(/onCapture\(html\[0\], "click", selector, async \(link, ev\) => \{\s*ev\.preventDefault\(\);/);
	});
});
