/**
 * The Ranger's Walk It Off (level 6+): "When you'd mark a debility, you can mark this move instead to
 * no ill effect. Clear it as you would a debility." The sheet prints one box on the move.
 *
 * The box stands in for a debility wherever the sheet marks or clears one, so it rides the
 * character's own list of debilities (StonetopCharacter#debilityChoices) as one more entry. Every
 * "mark a debility" choice built off that list (Hard to Kill, Battle Joy's 6-, Invoke the Sun God's
 * price, Burn Twice as Bright) offers it while the move is LEARNED and its box is clear, and every
 * "clear a debility" (Make Camp, Convalesce, Bath of Healing Light) finds it while the box is marked,
 * learned or not, since clearing it costs nothing.
 *
 * Its mark is the move's own track (MoveResources, keyed by the move's name), never one of the three
 * debility boxes, so no roll takes disadvantage from it: StonetopCharacter#applyDebilityRollMode
 * reads only those.
 */

import { confirmOutcome } from "../../utils/ask-with-buttons.js";
import { escHtml } from "../../utils/strings.js";
import { MoveResources, heldOnTrack } from "./MoveResources.js";
import { StonetopFlags } from "./StonetopFlags.js";
import { ownsLearnedMoveNamed, ownsMoveNamed } from "./owns-move.js";

export const WALK_IT_OFF = "Walk It Off";

/** Its key among the debility keys. Not a debility box's, so nothing writes it as one. */
export const WALK_IT_OFF_KEY = "walkItOff";

const DESCRIPTION = "Mark this move instead of a debility, to no ill effect. Clear it as you would a debility.";

// Only ever asked for update fragments, which need no actor.
const TRACK = new MoveResources(new StonetopFlags(null, "moves"));

/** Whether a debility key is Walk It Off's box rather than one of the three. */
export function isWalkItOff(key) {
	return key === WALK_IT_OFF_KEY;
}

/**
 * Walk It Off as a debility entry (`{key, name, description, marked, standIn}`), or null when there
 * is nothing to offer or clear: the move not held, or held un-learned with its box clear. Marked, it
 * is there to be cleared whether or not the move is still learned.
 *
 * @param {Actor} actor
 * @param {MoveResources} [resources]  the character's move tracks
 */
export function walkItOffChoice(actor, resources = actor?.typedActor?.moveResources) {
	if (!ownsMoveNamed(actor, WALK_IT_OFF)) return null;
	const marked = heldOnTrack(resources, WALK_IT_OFF, 1) > 0;
	if (!marked && !ownsLearnedMoveNamed(actor, WALK_IT_OFF)) return null;
	return { key: WALK_IT_OFF_KEY, name: WALK_IT_OFF, description: DESCRIPTION, marked, standIn: true };
}

/**
 * The actor.update fragment that marks (true) or clears (false) debility `key`: one of the three
 * boxes, or Walk It Off's.
 */
export function debilityData(key, marked) {
	return isWalkItOff(key)
		? TRACK.usesUpdate(WALK_IT_OFF, marked ? 1 : 0)
		: { [`system.attributes.debilities.options.${key}.value`]: !!marked };
}

/**
 * A debility box about to be ticked by hand while Walk It Off stands ready: which to mark. Resolves
 * to WALK_IT_OFF_KEY, the debility's own `key`, or null when the window is closed without an answer.
 *
 * @param {{key: string, name: string}} debility
 */
export async function askWalkItOffInstead({ key, name }) {
	const instead = await confirmOutcome({
		title:   WALK_IT_OFF,
		content: `<p>You'd mark <strong>${escHtml(name)}</strong>. <strong>${WALK_IT_OFF}</strong> lets you mark the move instead, to no ill effect.</p>`,
		yes:     { label: `Mark ${WALK_IT_OFF} instead`, icon: "fa-person-walking" },
		no:      { label: `Mark ${name}`, icon: "fa-heart-crack" },
		defaultYes: true,
	});
	if (instead === null) return null;
	return instead ? WALK_IT_OFF_KEY : key;
}
