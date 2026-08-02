// One feeling word per heart rating (1-5), matching the sheet's tooltip scale.
//
// Lives here rather than inside a ledger because all three ledgers need it: the NPC
// sheet has always logged relationship shifts, and the character and steading sheets
// log theirs too. The ledger bakes the word into its stored action text ("Neutral (3)"),
// so the wording is effectively permanent once written — change it and old entries keep
// the old word beside new ones.
//
// Deliberately NOT the full sentences in `stonetop.relationships.feels1-5`: those are
// localized and read "{subject} likes {object}", while a ledger line already names both
// parties around this label. Keep them in step if the scale is ever reworded.
import { clampHearts } from "./relationship-hearts.js";

export const HEART_WORDS = ["Hates", "Dislikes", "Neutral", "Likes", "Loves"];

/**
 * A rating as "Likes (4)". Runs through the storage layer's own clampHearts, so a corrupt
 * stored value still reads and reads the SAME way the sheet reads it — garbage is neutral,
 * not hatred, and nothing ever indexes the table with NaN (which would have printed the
 * literal "undefined (NaN)" into a permanent ledger line).
 */
export function heartsLabel(value) {
	const n = clampHearts(value);
	return `${HEART_WORDS[n - 1]} (${n})`;
}
