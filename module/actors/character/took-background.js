/**
 * "Did this character take background X of playbook Y?", the one test behind every rule a background
 * makes: an alternate stat (data/alt-stat-grants.js), a pick-list bonus (move-pick-bonuses.js), a
 * standing advantage (StonetopCharacter's BACKGROUND_MOVE_ADVANTAGE) and the Vessel's purse
 * (stock-cost.js#isVessel). The playbook is asked as well as the slug, because a slug is only the
 * playbook's own name for the background: two playbooks may print one of the same slug.
 *
 * Pure: no Foundry global is touched (actorTookBackground reads only the actor it is handed).
 */

import { readableFlags } from "./StonetopFlags.js";

/**
 * @param {{playbook?: string|null, background?: string|null}} who  the character's playbook NAME and
 *   selected background's slug
 * @param {{playbook: string, slug: string}} row  the background a rule names
 */
export function tookBackground(who, row) {
	return !!row && !!who?.background && row.playbook === who.playbook && row.slug === who.background;
}

/**
 * tookBackground for a character actor: its playbook's name, and the background slug read off its flags
 * without throwing (a roll or a blow is no place to fail over a flag bag). The key is the one
 * CharacterBackgrounds#selectedSlug reads, flattened spelling included. False for anyone else.
 */
export function actorTookBackground(actor, row) {
	if (actor?.type !== "character" || !row) return false;
	const bag = readableFlags(actor);
	const background = bag?.background?.selected ?? bag?.["background.selected"] ?? null;
	return tookBackground({ playbook: actor.system?.playbook?.name ?? null, background }, row);
}
