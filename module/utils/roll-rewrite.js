// The hands every rewrite of a posted roll card goes through, owned by stonetop.js: `shiftRoll` (the
// rollShifting term the GM's Shift Up/Down moves), `cardFlavor` (the card redrawn for the new total),
// `afterShift` (what the new total owes to what the roll moved: identification, tier effects, Potential for
// Greatness) and `hurt` (Impetuous Youth's 2d4 at the hero). The shape is impetuous-youth.js#giveItAll's `deps`.
//
// A card's own buttons are handed them as the card renders. A window that rewrites a card it posted itself has
// no render to be handed them at (Death's Door settles its tier in its own window, and offers Burn Brightly and
// giving it your all there: actors/character/dialogs/DeathsDoorDialog.js), so stonetop.js registers them here
// once as it loads, and the window reads them back. Nothing registered (a unit test, say) reads as null, and
// the window then offers nothing it could not write.

let _registered = null;

/** Hand over the rewrite functions (stonetop.js, once, at load). */
export function registerRollRewrite(deps) {
	_registered = deps ?? null;
}

/** The registered rewrite functions, or null when none were. */
export function rollRewrite() {
	return _registered;
}
