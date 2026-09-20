/**
 * The two moves that say a character HAS armor, rather than adding to what they wear:
 *
 *   BARKSKIN (Blessed)                "When you are touching the earth, you have 2 armor. When you mark
 *                                      another with 1 Stock, they gain this benefit so long as the mark
 *                                      remains."
 *   A CANDLE AGAINST THE DARK (Lightbearer)  "When you wield a holy light but go otherwise unarmed, you
 *                                      have 2 Armor."
 *
 * "YOU HAVE 2 ARMOR" IS A WORN BASE, not a bonus, which is the whole reason this is not a `moveBonuses`
 * entry: bases do not stack (the best one wins) and a shield still adds on top of one
 * (CharacterInventory#calculateArmor). A Blessed in mail keeps the mail's 3; a Blessed with a shield and
 * bark for skin has 2 + 1.
 *
 * WHAT IS ASSUMED, AND WHY IT IS SAFE TO ASSUME: the clause on each move is a piece of fiction the sheet
 * cannot read — whether she is touching the earth, whether he is otherwise unarmed. Each is the ordinary
 * case for the character who took the move (a Blessed stands on the ground; a Lightbearer who lit a holy
 * light is holding it), and the exception has a home already: the armor box is editable, and a hand-set
 * total banks the difference (StonetopCharacter#setArmor). Guessing the ordinary case wrong costs one
 * edit; not applying it at all costs the move.
 *
 * Kept Foundry-free so the rule can be tested with plain objects, like holy-light.js and condemn.js.
 */

import { SYSTEM_ID } from "../../system-id.js";
import { ownsLearnedMoveNamed } from "./owns-move.js";
import { BARKSKIN, BLESSED_MARKS_FLAG } from "./blessed-marks.js";
import { actorMatchKeys, trailingActorId } from "./marked-people.js";

export const CANDLE_AGAINST_THE_DARK = "A Candle Against the Dark";

/** Both moves grant the same number, and the book states it as a total rather than a bonus. */
export const MOVE_ARMOR_BASE = 2;

/**
 * Which `stonetop.fight.heroMoves.armorGate.<key>` each move's words live under. Here beside the rule,
 * so a third armor-granting move adds a line here and the damage card needs no edit at all
 * (combat/attack-flow.js#wireConditionalArmor).
 */
const ARMOR_GATE_KEYS = Object.freeze({
	[BARKSKIN]: "barkskin",
	[CANDLE_AGAINST_THE_DARK]: "candle",
});

/** That key for a stored `conditionalSource`, or null when nothing granted the armor. */
export const armorGateKey = source => ARMOR_GATE_KEYS[source] ?? null;

/**
 * The worn-armor base a character's own moves give them, and which move gives it. 0 and null when none
 * do, which is nearly every character.
 *
 * @param {object} p
 * @param {Actor} p.actor
 * @param {boolean} [p.holyLight]  is this character's holy light burning (holy-light.js)
 * @param {boolean|(() => boolean)} [p.markedWithBarkskin]  has a Blessed put Barkskin on them (see
 *   `barkskinMarkedBy`). A FUNCTION is only called when the answer could matter: the scan behind it
 *   walks the world, and a character with Barkskin of their own is already at the base it would find.
 * @returns {{base: number, source: string|null}}
 */
export function moveArmor({ actor, holyLight = false, markedWithBarkskin = false }) {
	if (actor?.type !== "character") return { base: 0, source: null };
	const marked = () => (typeof markedWithBarkskin === "function" ? markedWithBarkskin() : markedWithBarkskin);
	if (ownsLearnedMoveNamed(actor, BARKSKIN) || marked()) return { base: MOVE_ARMOR_BASE, source: BARKSKIN };
	if (holyLight && ownsLearnedMoveNamed(actor, CANDLE_AGAINST_THE_DARK)) {
		return { base: MOVE_ARMOR_BASE, source: CANDLE_AGAINST_THE_DARK };
	}
	return { base: 0, source: null };
}

/**
 * Is this character wearing a Blessed's Barkskin — a mark on somebody ELSE's sheet?
 *
 * Folded onto the trailing actor id exactly as the mark rosters and their sheet tags fold
 * (marked-people.js#actorMatchKeys), so a row laid by dropping a token and a row laid from the sidebar
 * are the same person here too.
 *
 * @param {Actor} actor
 * @param {Iterable<Actor>} actors  the world's actors
 */
export function barkskinMarkedBy(actor, actors = []) {
	const keys = actorMatchKeys(actor);
	if (!keys.size) return false;
	for (const blessed of actors ?? []) {
		if (blessed === actor) continue;
		// The flag read FIRST: it is one property lookup and nearly every actor in the world fails it,
		// where `ownsLearnedMoveNamed` walks that actor's whole item list to answer.
		//
		// RAW, not `readMarks`: that is the roster's reader for SHOWING a list, and it drops rows with no
		// name because there is nothing to render and nothing to dismiss. Here the uuid IS the answer — it
		// names the person whether or not the row carries their name — so a nameless row still grants bark.
		const rows = blessed.getFlag?.(SYSTEM_ID, BLESSED_MARKS_FLAG);
		if (!Array.isArray(rows) || !rows.length) continue;
		if (!ownsLearnedMoveNamed(blessed, BARKSKIN)) continue;
		for (const row of rows) {
			if (row?.kind !== "barkskin" || !row?.uuid) continue;
			if (keys.has(trailingActorId(row.uuid))) return true;
		}
	}
	return false;
}
