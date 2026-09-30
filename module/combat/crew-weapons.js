// Which of the crew's weapons a crew blow is dealt with.
//
// The Crew insert kits the Marshal's crew out with three weapons, "Hatchet, iron (hand, thrown, x
// piercing)", "Spear, iron (close, thrown, x piercing)" and "Bow & iron arrows (near, x piercing)",
// and the crew's card rolls only the bare die. Read that way a crew blow never pierced, whatever the
// steading's Prosperity. So a crew blow asks which of its CARRIED weapons it is dealt with, the way a
// character's own damage asks (combat/attack-flow.js#chooseDamageWeapon), and the weapon's piercing and
// tags ride the blow to Apply.
//
// CARRIED is the card's own inventory: the pip map at `crew.gear` (a number of filled load pips, or
// the older `true` for all of them), against the rows the playbook prints (`crew.inventory`, each with
// its weight). A row is a weapon when the curated table knows its slug (data/weapons.js#WEAPON_META),
// which is the rule every other weapon the system offers goes by.
//
// PURE: plain values in, plain values out.

import { weaponMeta, isClashWeapon, isLetFlyWeapon } from "../data/weapons.js";
import { crewGearCarried } from "../data/follower-build.js";

/** Which carried weapons fit a move: melee for Clash, thrown or ranged for Let Fly, anything for neither. */
const FITS = {
	"clash": isClashWeapon,
	"let-fly": isLetFlyWeapon,
};
const anyWeapon = meta => isClashWeapon(meta) || isLetFlyWeapon(meta);

/**
 * The crew's carried weapons that fit `move`, as the weapon picker lists candidates.
 *
 * @param {object} crew  the character's `crew` flags
 * @param {Array<{slug: string, weight?: number, weaponSlug?: string}>|null} inventory  the playbook's
 *   crew inventory rows; without them, every slug the pip map holds is read at one pip
 * @param {{move?: "clash"|"let-fly"|null}} [options]
 * @returns {Array<{slug: string, meta: object, ammoStore: string, ammoLabel: null}>}
 */
export function crewWeaponChoices(crew, inventory, { move = null } = {}) {
	const gear = crew?.gear && typeof crew.gear === "object" ? crew.gear : {};
	const fits = FITS[move] ?? anyWeapon;
	const rows = Array.isArray(inventory) && inventory.length
		? inventory
		: Object.keys(gear).map(slug => ({ slug, weight: 1 }));
	const out = [];
	for (const row of rows) {
		const slug = String(row?.slug ?? "");
		if (!slug) continue;
		if (!crewGearCarried(row, gear[slug])) continue;
		const meta = weaponMeta(row.weaponSlug || slug);
		if (!meta || !fits(meta)) continue;
		out.push({ slug, meta, ammoStore: "inventory", ammoLabel: null });
	}
	return out;
}
