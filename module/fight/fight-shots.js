// Who a fighter is shooting at, kept on their combatant once they have rolled damage at range.
//
// A player's live targets already count as shots (fight-state.js#rangedPairs), but only for the player's
// own character, only while the targets stay up, and never for the GM. That left out every other
// shooter the book fights with: a crew opening fire on a horde (Book I p.416, "the Marshal's crew of six
// opens fire on a horde of 20 crinwin"), a monster spitting at a character from across the room, and the
// GM's own archers. So a damage roll at somebody the roller is NOT in contact with is written down on the
// roller's combatant as a shot, and the engagements read it like a target.
//
// WHAT IS RECORDED is exactly who that roll hit, of the other side, out of reach: a roll that lands on
// somebody the roller is standing against is a blow, not a shot, and clears what was recorded before.
// Each roll replaces the last, so a shooter who changes target moves their line with them.
//
// IT LAPSES by itself while the shooter is in melee with anybody (engagements.js), and the GM can clear
// it from the Fight tab's menu. Written only by whoever may update that combatant (its actor's owner, or
// the GM); anyone else's roll records nothing, and the fight still works from contact and targets.

import { isFightTabEnabled } from "../settings.js";
import { SYSTEM_ID } from "../system-id.js";
import { fightOnScene, combatantSide, SHOTS_FLAG } from "./fight-state.js";
import { rollerEngagement } from "./damage-seed.js";

/** Which combatant of a snapshot stands on which token: the join a roll's targets are matched on. */
const byTokenUuid = found => new Map([...found.combatants.values()].map(c => [c.token?.uuid, c]));

/**
 * The combatant ids a roll at `targets` is a shot at, from `found` (engagementOf's answer for the
 * roller). PURE apart from what `found` holds.
 *
 * @param {object} found
 * @param {Array<{uuid: string}>} targets
 * @returns {string[]}
 */
export function shotsFrom(found, targets = []) {
	if (!found) return [];
	const mine = combatantSide(found.combatant);
	const melee = new Set(found.entry?.melee ?? []);
	const byUuid = byTokenUuid(found);
	const shots = [];
	for (const target of targets ?? []) {
		const combatant = byUuid.get(target?.uuid);
		if (!combatant || combatant.id === found.combatant.id || melee.has(combatant.id)) continue;
		if (combatantSide(combatant) === mine || shots.includes(combatant.id)) continue;
		shots.push(combatant.id);
	}
	return shots;
}

/**
 * Write down who `actor` just rolled damage at, when they are in the fight on the canvas scene.
 * Returns the ids recorded, or null when nothing was written.
 *
 * @param {Actor} actor
 * @param {Array<{uuid: string}>} targets  who the roll hit
 */
export async function recordShots(actor, targets = []) {
	const found = rollerEngagement(actor);
	if (!found) return null;
	const roller = found.combatant;
	const shots = shotsFrom(found, targets);
	const before = roller.flags?.[SYSTEM_ID]?.[SHOTS_FLAG];
	const had = Array.isArray(before) ? before : [];
	if (had.length === shots.length && had.every(id => shots.includes(id))) return null;
	if (!roller.canUserModify?.(globalThis.game?.user, "update")) return null;
	try {
		// An array replaces the stored one outright, so no shots is an empty one, never a deletion.
		await roller.update({ [`flags.${SYSTEM_ID}.${SHOTS_FLAG}`]: shots });
	} catch (err) {
		console.warn("Stonetop | recording a fighter's shot failed", err);
		return null;
	}
	return shots;
}

/**
 * Whether `actor`'s combatant has a shot on record at any of `targets`: what a roll's targets must be before
 * they are let go (releaseSpentTargets), since a target that is not on record is still the only line the
 * fight has to them. False for a blow in contact, a roller the fight cannot place, or a write refused.
 *
 * @param {Actor} actor
 * @param {Array<{uuid: string}>} targets
 */
export function shotOnRecordAt(actor, targets = []) {
	const found = rollerEngagement(actor);
	if (!found) return false;
	const shots = found.combatant.flags?.[SYSTEM_ID]?.[SHOTS_FLAG];
	if (!Array.isArray(shots) || !shots.length) return false;
	const byUuid = byTokenUuid(found);
	return (targets ?? []).some(t => shots.includes(byUuid.get(t?.uuid)?.id));
}

/** Whether a combatant has a shot on record. */
export function hasShots(combatant) {
	const shots = combatant?.flags?.[SYSTEM_ID]?.[SHOTS_FLAG];
	return Array.isArray(shots) && shots.length > 0;
}

/** Clear a combatant's shots (the Fight tab's "Stop shooting"). */
export function clearShots(combatant) {
	if (!hasShots(combatant)) return null;
	return combatant.update({ [`flags.${SYSTEM_ID}.${SHOTS_FLAG}`]: [] });
}

/**
 * Let go of the targets a damage roll just used, once they are on record as a shot: a player's target
 * is a ranged line in the fight for as long as it stays up, and one left up after the arrow flew draws
 * that line long after the archer has turned to something else. Only in a fight on the canvas scene,
 * and only when the roll used the reader's own hand targets.
 */
export function releaseSpentTargets({ used = false } = {}) {
	if (!used || !isFightTabEnabled()) return;
	const scene = globalThis.canvas?.scene ?? null;
	if (!fightOnScene(scene)) return;
	if (!(globalThis.game?.user?.targets?.size > 0)) return;
	try { globalThis.canvas?.tokens?.setTargets?.([], { mode: "replace" }); } catch (err) {
		console.warn("Stonetop | releasing spent targets failed", err);
	}
}
