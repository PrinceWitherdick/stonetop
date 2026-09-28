// Logistics (The Marshal), as it lands on a steading roll.
//
// "When you have a steading Muster or Pull Together, or when you Requisition, you have advantage."
//
// The move belongs to a CHARACTER and the roll to the STEADING, so the steading's windows (its
// Muster and Pull Together, its Requisition walkthrough, the expedition's Requisition) cannot tell
// whether the Marshal is the one behind this roll. They ask, with the line ticked, and only when
// some character in the world has the move LEARNED (owns-move.js#ownsLearnedMoveNamed); the rule
// itself lives in actors/steading/improvement-rolls.js with the other advantage sources, so it
// cancels against Diminished like a Township does. A character's own Requisition window already
// knows who is rolling, and ticks the line for that character alone.

import { learnedHolders, worldLearnedHolderNames } from "./owns-move.js";
import { LOGISTICS } from "../steading/improvement-rolls.js";

/** The characters with Logistics learned, out of any list of actors. */
export function logisticsHolders(actors) {
	return learnedHolders(actors, LOGISTICS);
}

/** Their names, for the steading's windows: every character in the world, since any may be behind it. */
export function worldLogisticsNames() {
	return worldLearnedHolderNames(LOGISTICS);
}

/** The one character's own name when they hold the move, for their own Requisition window. */
export function ownLogisticsNames(actor) {
	return logisticsHolders([actor]).map(a => a.name);
}
