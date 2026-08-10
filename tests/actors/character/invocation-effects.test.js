import { describe, it, expect } from "vitest";
import { splitEmpoweredEffect, annotateInvocationEffects } from "../../../module/actors/character/invocation-effects.js";

// Real shape, from the Lightbearer playbook's Invocations.
const BLINDING_FLASH = "<p>Your light blazes. Any in range who look at it are temporarily blinded.</p>"
	+ "<p><strong>Reduced:</strong> the light flares only for a moment.</p>"
	+ "<p><strong>Empowered:</strong> if you wish, your allies are unaffected.</p>";

describe("splitEmpoweredEffect", () => {
	it("lifts the Empowered paragraph out of the description", () => {
		const { base, empowered } = splitEmpoweredEffect(BLINDING_FLASH);
		expect(base).not.toMatch(/Empowered/);
		expect(base).toMatch(/Reduced:/);
		expect(base).toMatch(/Your light blazes/);
		expect(empowered).toBe("<p><strong>Empowered:</strong> if you wish, your allies are unaffected.</p>");
	});

	it("still finds it once the labels carry their hover tooltips", () => {
		// The sheet posts the card's RENDERED html, which the effect-tooltip setting annotates.
		const { base, empowered } = splitEmpoweredEffect(annotateInvocationEffects(BLINDING_FLASH));
		expect(base).not.toMatch(/Empowered/);
		expect(empowered).toMatch(/your allies are unaffected/);
	});

	it("leaves an Invocation without an empowered effect untouched", () => {
		const html = "<p>Your light steadies.</p><p><strong>Reduced:</strong> only briefly.</p>";
		expect(splitEmpoweredEffect(html)).toEqual({ base: html, empowered: null });
	});

	it("takes only the empowered paragraph when more text follows it", () => {
		const html = BLINDING_FLASH + "<p>The invocation is <em>ongoing</em>.</p>";
		const { base, empowered } = splitEmpoweredEffect(html);
		expect(empowered).not.toMatch(/ongoing/);
		expect(base).toMatch(/ongoing/);
	});

	// Verbatim from packs/src/stonetop-items/playbooks/the-lightbearer.json — the one shipped
	// Invocation whose empowered effect is a paragraph plus a list. Torn at the paragraph, its
	// three empowered outcomes stayed on the ordinary card as an unlabelled list, reading as
	// three more of the normal "pick 2" choices — the exact leak this split exists to stop.
	it("keeps a list-bodied empowered effect whole (Bath of Healing Light)", () => {
		const html = "<p>Cup your hands around your light and focus it. Your patient… <em>(pick 2)</em>:</p>"
			+ "<ul><li>Regains 5 HP (can pick this twice)</li><li>Clears a debility (can pick this twice)</li>"
			+ "<li>Has one of their problematic wounds stabilized</li>"
			+ "<li>Recovers from a minor condition (drunk, etc.)</li></ul>"
			+ "<p><strong>Reduced:</strong> pick only 1 (instead of 2).</p>"
			+ "<p><strong>Empowered:</strong> add these to your possible choices:</p>"
			+ "<ul><li>Regains 10 HP (can pick this twice)</li><li>Fully recovers from a problematic wound</li>"
			+ "<li>Is cured of a dire affliction, poison, or disease</li></ul>";
		const { base, empowered } = splitEmpoweredEffect(html);

		expect(base).not.toMatch(/Regains 10 HP/);
		expect(base).not.toMatch(/dire affliction/);
		expect(base).not.toMatch(/Empowered/);
		// ...and the normal list it does keep is untouched.
		expect(base).toMatch(/Regains 5 HP/);
		expect(base).toMatch(/Reduced:/);

		expect(empowered).toMatch(/add these to your possible choices/);
		expect(empowered).toMatch(/Regains 10 HP/);
		expect(empowered).toMatch(/dire affliction/);
		// The heading and its list stay in one piece, in order.
		expect(empowered.indexOf("Empowered:")).toBeLessThan(empowered.indexOf("Regains 10 HP"));
	});

	it("handles a missing description", () => {
		expect(splitEmpoweredEffect(null)).toEqual({ base: "", empowered: null });
	});
});
