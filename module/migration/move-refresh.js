// Bring the book moves characters already hold up to the fields the pack ships for them now.
//
// A move is copied onto a character when it is taken (StonetopCharacter#addMove: the pack document's
// `toObject()`), and nothing revisits the copy. So a field the pack gains later never reaches a move a
// character already holds: Stentorian's, Front Line Leader's and Prepare a Welcome's tracks (`resource`,
// added 2026-06-09) left copies that never filled on joining a fight and never spent a Surprise, and
// Battle Joy's `noXpOnMiss` left one that still marked XP on a 6-. Every rule reads the held copy
// (owns-move.js#ownedMove), so without this each would need its own fallback to the pack.
//
// FILLS ONLY WHAT IS MISSING. A field the copy already has is left as it is, whatever the pack says (a
// track a GM retitled on a sheet stays retitled), and a player's own move (the custom-move flag) is never
// touched. Per version, from Ready, like possession-grant-repair.js: a pack only changes with a release.

import { ITEMS_PACK } from "../system-id.js";
import { ensurePackIndex } from "../utils/pack-index.js";
import { isPlayerAuthoredMove } from "../actors/character/owns-move.js";

/** The shipped fields refreshed, each with its test for "there is one". */
export const SHIPPED_MOVE_FIELDS = {
	resource:   value => Number(value?.max) > 0,
	noXpOnMiss: value => value === true,
	// Pack Horse's +1 to every load cap: a copy from before it shipped still read 3/6/9.
	loadBonus:  value => Number(value) > 0,
};

const INDEX_FIELDS = ["system.playbook", ...Object.keys(SHIPPED_MOVE_FIELDS).map(field => `system.${field}`)];

/** The pack's moves by name (`name -> entry[]`), several where two playbooks print one name. */
export function packMovesByName(entries = []) {
	const byName = new Map();
	for (const entry of entries) {
		if (entry?.type !== "move" || !entry.name) continue;
		if (!byName.has(entry.name)) byName.set(entry.name, []);
		byName.get(entry.name).push(entry);
	}
	return byName;
}

/** The pack entry a held copy was taken from: by name, and by playbook where two share a name. */
export function packEntryFor(item, byName) {
	const entries = byName.get(item?.name) ?? [];
	if (entries.length <= 1) return entries[0] ?? null;
	return entries.find(entry => (entry.system?.playbook ?? "") === (item.system?.playbook ?? "")) ?? null;
}

/** The embedded update filling what a held copy lacks from its pack entry, or null. PURE. */
export function moveRefreshUpdate(item, entry) {
	if (!entry || item?.type !== "move" || isPlayerAuthoredMove(item)) return null;
	const update = {};
	for (const [field, has] of Object.entries(SHIPPED_MOVE_FIELDS)) {
		const shipped = entry.system?.[field];
		if (has(shipped) && !has(item.system?.[field])) update[`system.${field}`] = structuredClone(shipped);
	}
	return Object.keys(update).length ? { _id: item._id ?? item.id, ...update } : null;
}

/**
 * Refresh every character's held moves. Throws when the pack cannot be read, so the once-per-version
 * gate retries on the next load instead of stamping a sweep that never looked.
 *
 * @param {object} [options]
 * @param {Iterable} [options.actors]
 * @param {object[]} [options.entries]  the pack's index (tests)
 * @returns {Promise<number>} how many characters had a move refreshed
 */
export async function refreshHeldMoves({ actors = globalThis.game?.actors ?? [], entries = null } = {}) {
	let index = entries;
	if (!index) {
		const pack = await ensurePackIndex(ITEMS_PACK, INDEX_FIELDS);
		if (!pack) throw new Error(`the ${ITEMS_PACK} pack is not available`);
		index = [...pack.index];
	}
	const byName = packMovesByName(index);
	let written = 0;
	for (const actor of actors) {
		if (actor?.type !== "character") continue;
		const updates = (actor.items ?? [])
			.map(item => moveRefreshUpdate(item, packEntryFor(item, byName)))
			.filter(Boolean);
		if (!updates.length) continue;
		// Quiet in the ledger: the pack's text refreshed, not an edit anybody made.
		await actor.updateEmbeddedDocuments("Item", updates, { stonetopLedger: true });
		written += 1;
	}
	return written;
}
