// Weapons of War now grants only what the improvement actually names — "maces, flails, battleaxes,
// warhammers, and all types of swords" (WEAPONS_OF_WAR_COMMON). It used to grant the whole of the
// Special Items handout's weapons section, which also holds the crossbow and the composite bow.
//
// The narrowing is a rules fix, but it is not free for a world already playing. A special item is on
// a character's sheet only while something vouches for it (StonetopCharacter#_gearSources): the
// picker's `addedSpecial`, a playbook possession, or the earned-common set. A crossbow vouched for
// by the old, wider set alone has nothing left holding it up, so on the next render it simply
// leaves — off the sheet, out of the load, out of the weapon prompt — and says nothing about it.
//
// So the ones already CHECKED are grandfathered, written into `addedSpecial` as though the player
// had picked them from the special-items picker, which is the record for "this character has this
// thing". Their crossbow stays; nobody else's list grows; and the improvement stops handing out new
// ones, which is the fix.
//
// UNCHECKED ROWS ARE LEFT TO GO. An unchecked row is the offer, not a possession, and the offer is
// precisely what the rules fix is withdrawing.

import { WEAPONS_OF_WAR_COMMON } from "../data/weapons.js";
import { FoundryOutfitItemRepository } from "../actors/character/repositories/FoundryOutfitItemRepository.js";
import { resolvedFlagProperty, STONETOP_SCOPE } from "../actors/character/StonetopFlags.js";

const WEAPONS_OF_WAR_CATEGORY = "Weapons of War";

/**
 * The slugs this character is holding on the old, wider grant alone.
 *
 * PURE, so the rule can be checked without a world.
 *
 * @param {object} inventoryFlags  the character's `inventory` flag bag
 * @param {Set<string>} droppedSlugs  the special weapons the improvement no longer names
 * @returns {string[]} the slugs to add to `addedSpecial`
 */
export function orphanedWeaponsOfWar(inventoryFlags, droppedSlugs) {
	const checked = inventoryFlags?.checked ?? {};
	const added = new Set(Array.isArray(inventoryFlags?.addedSpecial) ? inventoryFlags.addedSpecial : []);
	return [...droppedSlugs].filter(slug => checked[slug] && !added.has(slug));
}

/**
 * Which of the handout's Weapons of War weapons the improvement stopped naming, read off the
 * catalog rather than listed here: the pair that fall out today are the crossbow and the composite
 * bow, but the rule is "in that section and not in the grant", and a catalog that gains a sixth
 * sword should not need this file edited.
 */
export function droppedWeaponsOfWar(catalog) {
	return new Set((catalog ?? [])
		.filter(i => i.special && i.specialCategory === WEAPONS_OF_WAR_CATEGORY && !WEAPONS_OF_WAR_COMMON.has(i.slug))
		.map(i => i.slug));
}

/**
 * Grandfather every character's already-carried Weapons of War weapon that the improvement no
 * longer grants. Idempotent: a slug already in `addedSpecial` is passed over, so a second run
 * writes nothing.
 *
 * @param {object} [options]
 * @param {Iterable} [options.actors]
 * @param {{getAll: () => Promise<object[]>}} [options.repo]
 * @returns {Promise<number>} how many characters were written to
 */
export async function grandfatherWeaponsOfWar({ actors = globalThis.game?.actors ?? [], repo = new FoundryOutfitItemRepository() } = {}) {
	const dropped = droppedWeaponsOfWar(await repo.getAll());
	// A catalog with nothing outside the grant makes the whole sweep a no-op, without reading an actor.
	if (!dropped.size) return 0;

	let written = 0;
	for (const actor of actors) {
		if (actor?.type !== "character") continue;
		const inventory = resolvedFlagProperty(actor, "inventory") ?? {};
		const orphans = orphanedWeaponsOfWar(inventory, dropped);
		if (!orphans.length) continue;
		const was = Array.isArray(inventory.addedSpecial) ? inventory.addedSpecial : [];
		await actor.update({ [`flags.${STONETOP_SCOPE}.inventory.addedSpecial`]: [...was, ...orphans] });
		written += 1;
	}
	return written;
}
