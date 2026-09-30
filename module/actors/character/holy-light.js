/**
 * The Lightbearer's holy light — the fictional state half their playbook is written against
 * ("when you wield a holy light but go otherwise unarmed…", "an Invocation's range is equal
 * to that of its light source", "it will end immediately if your holy light is
 * extinguished"). Nothing on the sheet tracked whether one was actually burning, so the
 * header candle does.
 *
 * ONE SLOT, never a counter: Consecrated Flame lasts "until the flame goes out or until you
 * consecrate another flame, whichever comes first", so consecrating a second flame replaces
 * the first rather than adding to it. That is why the state is a plain boolean.
 *
 * Kept out of the sheet and the character model so the predicates can be tested without a
 * Foundry global in sight.
 */

import { ownsMoveNamed, ownsAnyMoveNamed } from "./owns-move.js";

// Re-exported so the sheet and this playbook's tests keep reaching the predicate through the
// feature module they already import.
export { ownsMoveNamed };

export const HOLY_LIGHT_FLAG       = "holyLight";
export const CONSECRATED_FLAME     = "Consecrated Flame";
export const INVOKE_THE_SUN_GOD    = "Invoke the Sun God";
export const EMPOWERED_INVOCATIONS = "Empowered Invocations";
export const WIELDER_OF_THE_WHITE_FLAME = "Wielder of the White Flame";

// The moves that make or READ a holy light, and so the ones that earn the candle. The readers
// (A Candle Against the Dark, Purifying Flames, Luminous Shield, Hungry Flames) are here too:
// inside the Lightbearer's own list each needs a maker first, but a Would-be Hero can take A
// Candle Against the Dark or Purifying Flames through Versatile alone, and a reader with no
// candle to light could never switch its own move on.
//
// Known and accepted: a non-Lightbearer wielding a holy light from somewhere else (an
// arcanum, say) gets no candle. Widening that is one line here.
const HOLY_LIGHT_MOVES = [
	CONSECRATED_FLAME, INVOKE_THE_SUN_GOD, WIELDER_OF_THE_WHITE_FLAME,
	"A Candle Against the Dark", "Purifying Flames", "Luminous Shield", "Hungry Flames",
];

// `owned` is the character sheet's one-pass Set — see ownsAnyMoveNamed. Omitted, this answers
// for itself exactly as it always did.
export function canWieldHolyLight(actor, owned = null) {
	return ownsAnyMoveNamed(actor, HOLY_LIGHT_MOVES, owned);
}

export const LUMINOUS_SHIELD = "Luminous Shield";

/**
 * What a roll of one of the two moves that turn on the light does to it, or null for no change:
 *   Luminous Shield's 6-: "your light snuffs out and the attack is unimpeded" (false).
 *   Wielder of the White Flame's 7+: "it ignites with a white flame that casts a holy light" (true).
 * `tier` is roll-engine's classifyResult key. The 10+'s "Invoke the Sun God right now" is its own button
 * (invoke-consequences.js#wielderRollOptions).
 */
export function holyLightAfterRoll(moveName, tier) {
	if (moveName === LUMINOUS_SHIELD && tier === "failure") return false;
	if (moveName === WIELDER_OF_THE_WHITE_FLAME && (tier === "success" || tier === "partial")) return true;
	return null;
}

/**
 * Whether to render the candle at all. A LIT light is always shown, even on a sheet that no
 * longer owns any of the moves — otherwise dropping a new playbook over a Lightbearer strands
 * a burning light with nothing left on the sheet that could snuff it.
 */
export function showHolyLight({ owns, lit }) {
	return !!owns || !!lit;
}
