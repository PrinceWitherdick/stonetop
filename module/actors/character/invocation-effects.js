import { escHtml } from "../../utils/strings.js";

// Plain-language explanations for an Invocation's Reduced / Empowered effects,
// surfaced as hover tooltips on those labels wherever an Invocation's description is
// shown (the Invocations tab and the level-up "choose an Invocation" step).
export const INVOCATION_EFFECT_TOOLTIPS = {
	reduced:   "When you Invoke the Sun God, one consequence you can choose — and must, on a 7-9 — is for the Invocation to take this weaker, reduced effect instead.",
	empowered: "With the Empowered Invocations move (6th level), you can choose an extra consequence before you roll to give the Invocation this stronger, empowered effect.",
};

// Wrap the "Reduced:" / "Empowered:" labels inside an Invocation's description
// HTML so they carry a hover tooltip explaining what those effect tiers mean.
export function annotateInvocationEffects(html) {
	return String(html).replace(/<strong>(Reduced|Empowered):<\/strong>/g, (_match, label) => {
		const tip = INVOCATION_EFFECT_TOOLTIPS[label.toLowerCase()];
		return `<strong class="stonetop-invocation-effect-label" data-tooltip="${escHtml(tip)}" data-tooltip-direction="UP">${label}:</strong>`;
	});
}
