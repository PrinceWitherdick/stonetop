import { describe, it, expect } from "vitest";
import { CharacterOnboardingDialog } from "../../../module/actors/character/dialogs/CharacterOnboardingDialog.js";

// The Seeker draws three minor arcana at random during onboarding. Alongside the full
// "Draw again" re-roll, a player can swap a SINGLE drawn card for a specific one from the
// pool (the "I've got 2 of 3 I want, let me just pick the third" path). These tests drive
// _swapSeekerMinorArcana directly — it's pure over this._selections.arcana, touching no
// Foundry APIs — via the same Object.create path the other onboarding tests use.

function makeDialog(minorDraw, minorRoles = { mastered: "", found: "", lead: "" }) {
	const d = Object.create(CharacterOnboardingDialog.prototype);
	d._selections = { arcana: { minorDraw: [...minorDraw], minorRoles: { ...minorRoles } } };
	return d;
}

describe("Seeker minor arcana single-card swap", () => {
	it("replaces just the target card, leaving the other two (and their positions) untouched", () => {
		const d = makeDialog(["alpha", "beta", "gamma"]);
		d._swapSeekerMinorArcana("beta", "delta");
		expect(d._selections.arcana.minorDraw).toEqual(["alpha", "delta", "gamma"]);
	});

	it("moves a role from the swapped-out card to the incoming card", () => {
		const d = makeDialog(["alpha", "beta", "gamma"], { mastered: "beta", found: "", lead: "" });
		d._swapSeekerMinorArcana("beta", "delta");
		expect(d._selections.arcana.minorRoles).toEqual({ mastered: "delta", found: "", lead: "" });
	});

	it("leaves roles untouched when the swapped card had no role", () => {
		const d = makeDialog(["alpha", "beta", "gamma"], { mastered: "alpha", found: "", lead: "" });
		d._swapSeekerMinorArcana("beta", "delta");
		expect(d._selections.arcana.minorRoles).toEqual({ mastered: "alpha", found: "", lead: "" });
	});

	it("is a no-op when the target card would duplicate one already drawn", () => {
		const d = makeDialog(["alpha", "beta", "gamma"]);
		d._swapSeekerMinorArcana("beta", "gamma");
		expect(d._selections.arcana.minorDraw).toEqual(["alpha", "beta", "gamma"]);
	});

	it("is a no-op when the old slug isn't currently drawn", () => {
		const d = makeDialog(["alpha", "beta", "gamma"]);
		d._swapSeekerMinorArcana("zeta", "delta");
		expect(d._selections.arcana.minorDraw).toEqual(["alpha", "beta", "gamma"]);
	});

	it("is a no-op when no incoming card is given (empty picker value)", () => {
		const d = makeDialog(["alpha", "beta", "gamma"], { mastered: "beta", found: "", lead: "" });
		d._swapSeekerMinorArcana("beta", "");
		expect(d._selections.arcana.minorDraw).toEqual(["alpha", "beta", "gamma"]);
		expect(d._selections.arcana.minorRoles).toEqual({ mastered: "beta", found: "", lead: "" });
	});
});
