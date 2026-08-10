// Which of a character's own moves bend the Know Things roll that identifies an arcanum
// (Book I, Discoveries p.440). Pure and Foundry-free so the table and the netting rules are
// unit-testable on their own; the sheet does the DOM and the document writes.
//
// Nothing here ENFORCES a trigger. Every one of these moves fires on fiction the system can't
// see ("any script, text, runes or symbols that you encounter", "the source in which you read
// about the matter at hand"), so the dialog quotes the move and lets the player decide — the
// same contract the inline stat picker already keeps for alt-stat grants.

import { ALT_STAT_GRANTS } from "../../data/alt-stat-grants.js";

/** Know Things is +INT (Book I p.220); alt stats are grants layered on top. */
export const KNOW_THINGS_STAT = "int";

// Moves whose text reads "…you have advantage" on a Know Things roll. Kept here rather than in
// ALT_STAT_GRANTS because that table is shared with the attack flow, which asks a different
// question (which stat, and therefore which weapon) and would be confused by an advantage row.
export const KNOW_THINGS_ADVANTAGE_MOVES = ["Polyglot", "Naturalist"];

/**
 * The stat options and advantage grants a character brings to an identifying Know Things roll.
 * `ownedMoveNames` is a plain iterable of move names, so callers pass names rather than Items.
 *
 * `stats` always leads with +INT and never repeats a stat. `advantageMoves` is the subset of
 * KNOW_THINGS_ADVANTAGE_MOVES the character actually owns. `hasChoice` is false for a character
 * with none of these moves, which is most of them — the sheet skips the dialog entirely then, so
 * the ordinary case stays a single click.
 */
export function knowThingsRollChoices(ownedMoveNames = []) {
	const owned = new Set(ownedMoveNames);
	const stats = [KNOW_THINGS_STAT];
	const statGrants = [];
	for (const g of ALT_STAT_GRANTS) {
		// Mirror the inline picker's matching: a grant keyed to this move by name, or a blanket
		// grant keyed to the stat the move rolls by default.
		const matches = g.whenMove === "Know Things" || g.whenDefaultStat === KNOW_THINGS_STAT;
		if (!matches || !owned.has(g.ownsMove)) continue;
		if (g.altStat === KNOW_THINGS_STAT || stats.includes(g.altStat)) continue;
		stats.push(g.altStat);
		statGrants.push(g.ownsMove);
	}
	const advantageMoves = KNOW_THINGS_ADVANTAGE_MOVES.filter(name => owned.has(name));
	return { stats, statGrants, advantageMoves, hasChoice: stats.length > 1 || advantageMoves.length > 0 };
}

/**
 * Fold a claimed advantage into the roll mode the character already carries.
 *
 * Book I p.230: "When you make a roll with both advantage and disadvantage, they cancel each
 * other out" and "Advantage/disadvantage don't 'stack.' They're binary." So advantage on top of
 * disadvantage is a normal roll, and advantage on top of advantage is still just advantage —
 * never a second die. Not claiming it leaves the character's own roll mode untouched.
 */
export function withAdvantage(rollMode, claimed) {
	if (!claimed) return rollMode;
	if (rollMode === "dis") return "normal";
	return "adv";
}
