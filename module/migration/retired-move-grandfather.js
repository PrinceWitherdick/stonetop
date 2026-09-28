// A replacing move (A Mighty Rampart, which replaces Bulwark) now counts its original as a met
// prerequisite only when the held copy RETIRED it: the `retiredMove` stamp
// StonetopCharacter#_retireReplacedMove leaves. That is Book I p.529, "If a move replaces a
// different move, then it requires the one it replaces": a replacing move ticked on without its
// original retired nothing, and reads as unmet.
//
// The stamp is new, though, and a world already playing has replacing moves taken before anything
// wrote it, most of them by a player who gave up the original by hand as the book says to. Those
// used to read as met (any owned copy excused the missing original), and without this they would
// wake up to "requirement not met" on a move they legitimately hold.
//
// So a copy made under a release that never stamped (LAST_UNSTAMPED_VERSION or earlier), whose
// original is not held, is stamped as though it had retired it. A copy made since is left to the
// rule: under this code, taking the move retires the original itself, so an unstamped one is the
// "ticked on without its original" case the rule is for. That is what makes a per-version re-run
// safe: it can never reach a copy the stamp was live for.

import { STONETOP_SCOPE } from "../actors/character/StonetopFlags.js";
import { madeAtOrBefore } from "./made-under.js";

// The last release whose code never wrote `retiredMove`.
export const LAST_UNSTAMPED_VERSION = "1.6.5";

/**
 * The replacing moves on `items` to stamp: made before the stamp existed (no recorded system
 * version counts as before), not stamped, and with no copy of the original held at all: one held but
 * switched off was never given up, and is left to read as the unmet requirement it is. PURE.
 *
 * @param {object[]} items  a character's embedded items
 * @returns {object[]}
 */
export function unstampedReplacers(items) {
	const list = Array.from(items ?? []);
	const holds = name => list.some(i => i.type === "move" && i.name === name);
	return list.filter(i => {
		const replaced = i?.type === "move" ? i.system?.replaces : null;
		if (!replaced || i.flags?.[STONETOP_SCOPE]?.retiredMove) return false;
		return madeAtOrBefore(i, LAST_UNSTAMPED_VERSION) && !holds(replaced);
	});
}

/**
 * Stamp every character's pre-stamp replacing moves (see above). Idempotent: a stamped copy is
 * passed over, so a second run writes nothing.
 *
 * @param {object} [options]
 * @param {Iterable} [options.actors]
 * @returns {Promise<number>} how many characters were written to
 */
export async function grandfatherRetiredMoves({ actors = globalThis.game?.actors ?? [] } = {}) {
	let written = 0;
	for (const actor of actors) {
		if (actor?.type !== "character") continue;
		const stale = unstampedReplacers(actor.items);
		if (!stale.length) continue;
		await actor.updateEmbeddedDocuments("Item", stale.map(i => ({
			_id: i.id ?? i._id,
			[`flags.${STONETOP_SCOPE}.retiredMove`]: i.system.replaces,
		})));
		written += 1;
	}
	return written;
}
