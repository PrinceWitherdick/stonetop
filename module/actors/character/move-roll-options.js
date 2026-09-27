// What a move adds to its OWN roll card, by name: buttons under a tier and an override of the miss XP.
// The generic roll (item/StonetopItem.js#roll) asks this once rather than naming moves itself, the way
// MOVE_USE_EFFECTS and TIER_EFFECTS keep their moves out of the code that runs them.
//
// Each tier's actions are APPENDED after whatever the roll already carries (a Soul on Fire hit note,
// StonetopCharacter#_withHitNote), so no move's buttons silently replace another's.

import { isKnowThings, knowThingsRollOptions } from "./know-things.js";
import { BATTLE_JOY, battleJoyRollOptions } from "./battle-joy.js";

const named = name => moveName => moveName === name;

/**
 * `matches(moveName)`, and `build(actor)` answering `{noXpOnMiss?, tierActions?}` or null when this
 * character's roll gets nothing (a move they do not hold learned).
 */
export const MOVE_ROLL_OPTIONS = [
	// Never at a Loss defers a Know Things miss's XP to a choice on the card.
	{ matches: isKnowThings, build: knowThingsRollOptions },
	// Battle Joy's ending roll: "on a 6-, mark a debility but don't mark XP", with the 10+'s 1d4 HP and
	// the 6-'s debility as buttons (combat/battle-joy-offer.js).
	{ matches: named(BATTLE_JOY), build: actor => battleJoyRollOptions(actor.typedActor?.debilityChoices ?? []) },
];

/**
 * The options move `moveName` adds to a character's roll, folded over the `tierActions` the roll
 * already has; null when it adds none.
 *
 * @param {string} moveName
 * @param {Actor} actor
 * @param {Record<string, string>|null} [tierActions]
 * @returns {{noXpOnMiss?: boolean, tierActions: Record<string, string>}|null}
 */
export function moveRollOptions(moveName, actor, tierActions = null, table = MOVE_ROLL_OPTIONS) {
	if (actor?.type !== "character") return null;
	const found = table.filter(entry => entry.matches(moveName)).map(entry => entry.build(actor)).filter(Boolean);
	if (!found.length) return null;
	const out = { tierActions: { ...(tierActions ?? {}) } };
	for (const { tierActions: actions, ...rest } of found) {
		Object.assign(out, rest);
		for (const [tier, html] of Object.entries(actions ?? {})) out.tierActions[tier] = `${out.tierActions[tier] ?? ""}${html}`;
	}
	return out;
}
