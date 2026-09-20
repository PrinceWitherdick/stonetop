/**
 * How one roll mode meets another: ADVANTAGE AND DISADVANTAGE CANCEL (p.230), and neither stacks
 * with itself.
 *
 * One rule, one home. It is asked from every side of a fight — the roller's own moves (Dangerous
 * sharpening a blow), the people being hit (Uncanny Reflexes, Battlefield Grace, Big Damn Hero's
 * locked eyes), a grudge a character is owed, and every ticked line on the damage window — and a
 * copy per caller is how the four quietly stop agreeing.
 *
 * Pure: no Foundry global, no document.
 */

/**
 * `mode` once `added` has been laid on top of it.
 *
 * An empty `mode` is the roll's own default, which is straight — a blow nobody has said anything
 * about yet — so laying advantage on it gives advantage. Anything unrecognised reads the same way,
 * because "not a mode I know" and "no mode" are the same thing to this rule.
 *
 * @param {string} mode   "adv" | "dis" | "normal", or empty for the roll's own default
 * @param {string} added  what is being laid on; empty or "normal" changes nothing
 * @returns {string} the mode to roll at
 */
export function stepMode(mode, added) {
	if (!added || added === "normal") return mode;
	const from = mode === "adv" || mode === "dis" ? mode : "normal";
	if (from === added) return mode;
	return from === "normal" ? added : "normal";
}

/** One step better: what a move that sharpens a blow does to it. */
export const betterMode = mode => stepMode(mode, "adv");

/** One step worse: what a move that blunts a blow does to it. */
export const worseMode = mode => stepMode(mode, "dis");
