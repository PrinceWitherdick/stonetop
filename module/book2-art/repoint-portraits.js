import { squarePortraitSrc, basenameOf as basename } from "./people-portraits.js";
import { SYSTEM_ID } from "../system-id.js";
import { getObjectSetting } from "../settings.js";

/**
 * Point art that already exists at the square face, once the squares are on disk.
 *
 * A GM who chose portraits before squares existed has NPCs and follower cards holding the whole
 * illustration. Those keep working — every surface falls back to cover-cropping them — but they
 * are exactly the pictures this feature exists to improve, and nothing would ever move them on
 * its own: the gallery only writes a square when you pick a face again.
 *
 * NPCs and follower cards, and nothing else: see REPOINTS_OWN_PORTRAIT below for who is left out
 * and why. The pass rewrites documents the GM owns, so its reach is stated rather than implied.
 *
 * So the rebuild that cuts the squares also offers to re-point what is already there. Deliberately
 * behind that button rather than on world load: it rewrites documents the GM owns, and the button
 * is where they said yes to this.
 *
 * Idempotent by construction, which is this codebase's convention for a migration (see the
 * `_migrate*` passes in hooks/Ready.js). Once a path has been bumped it no longer resolves as a
 * whole illustration, so a second run matches nothing and needs no version flag.
 */

// The package id, from the one module that owns it. These are not just a settings namespace:
// the flag UPDATE PATHS below are built from it, so a hand-written copy is a place the rename
// codemod would have to know about by name. Same use, same import, as poster-maps.js.
const SYSTEM = SYSTEM_ID;

/**
 * Follower portraits live in flags, not on a document field: a card's art is
 * `flags.stonetop_pwd.customFollowers.<id>.img`. Today that is the ONE store — every follower
 * kind (custom, recruited NPC, monster-derived) lands there. Walking for the `img` key rather
 * than reading that one path is a small bet that a later follower kind nests differently and
 * would otherwise be silently missed; the walk is over our own namespace only, so it cannot
 * wander into another module's data.
 *
 * TWO BOUNDARIES a reader needs, because the walk looks more exhaustive than it is:
 *
 *  • ARRAYS ARE NOT VISITED, deliberately. The steading's `residents`/`neighbors` flags are
 *    arrays whose rows can carry an `img` — but only on LEGACY rows, the plain-text ones
 *    steading-people.js migrates into real NPC Actors. Once migrated the portrait is the
 *    actor's own `img`, which this pass already re-points directly, so descending into those
 *    arrays would only reach rows that are on their way out anyway.
 *
 *  • A CYCLE is the case that bites, which is why `seen` exists rather than depth alone.
 *    Following one does not merely spin, it mints a fresh update path at every lap
 *    (`…self.self.img`), and those are keys Foundry would happily CREATE — so a cyclic flag
 *    object would have this pass write nested junk into the document it was cleaning up.
 *    Visiting each object once is the real guard; the depth cap is a backstop for nesting
 *    that is pathological without being cyclic.
 */
const MAX_FLAG_DEPTH = 6;

function collectFlagImgPaths(node, prefix, squareFor, out, depth = 0, seen = new Set()) {
	if (!node || typeof node !== "object" || Array.isArray(node) || depth > MAX_FLAG_DEPTH) return;
	if (seen.has(node)) return;
	seen.add(node);
	for (const [key, value] of Object.entries(node)) {
		const path = prefix ? `${prefix}.${key}` : key;
		if (key === "img" && typeof value === "string") {
			const square = squareFor(value);
			if (square) out.push({ path, from: value, to: square });
		} else if (value && typeof value === "object") {
			collectFlagImgPaths(value, path, squareFor, out, depth + 1, seen);
		}
	}
}

/**
 * WHOSE portrait field this pass is allowed to move, and why it is not everyone's.
 *
 * The square is a ~200px face, cut because the surfaces that show an NPC are small and round. The
 * surfaces that show a PLAYER CHARACTER are not: the character sheet gives the portrait a whole
 * panel, and unlike the NPC sheet header it has no fallback that resolves a square back to the
 * illustration behind it. So a PC whose portrait a GM browsed to a People-of-Stonetop file would
 * come out of this pass permanently low-resolution, fixable only by re-picking the file by hand.
 * Monsters have their own bestiary art and the steading actor wears the Book I stone, so neither
 * has a stake here either.
 *
 * FLAGS ARE NOT GATED, deliberately — that is where follower cards live, and they live on the PC.
 * A follower card is exactly the small round surface the square exists for, so the walk below runs
 * on every actor; it is only the actor's OWN portrait that is limited to the type that wants one.
 */
const REPOINTS_OWN_PORTRAIT = new Set(["npc"]);

/**
 * What re-pointing would change, without changing any of it. Pure: takes plain objects, so it is
 * testable without Foundry and the caller can count the work before offering to do it.
 *
 * `squareFor` maps an illustration path to its square, or null — inject it so a test can describe
 * a library without a manifest.
 */
export function planPortraitRepoints(actors, squareFor = squarePortraitSrc) {
	const plan = [];
	for (const actor of actors ?? []) {
		const updates = {};
		const notes = [];
		const ownPortrait = REPOINTS_OWN_PORTRAIT.has(actor?.type);
		const square = ownPortrait && actor?.img ? squareFor(actor.img) : null;
		if (square) {
			updates.img = square;
			// Only when the token was following the portrait already. A GM who deliberately gave
			// this NPC different token art chose that, and a portrait change is no reason to
			// overrule it.
			if (actor.prototypeToken?.texture?.src === actor.img) {
				updates["prototypeToken.texture.src"] = square;
			}
			notes.push({ path: "img", from: actor.img, to: square });
		}
		const flagHits = [];
		collectFlagImgPaths(actor?.flags?.[SYSTEM], "", squareFor, flagHits);
		for (const hit of flagHits) {
			updates[`flags.${SYSTEM}.${hit.path}`] = hit.to;
			notes.push(hit);
		}
		if (notes.length) plan.push({ actor, updates, changes: notes });
	}
	return plan;
}

/**
 * A `squareFor` that only ever names a square THAT IS ON DISK.
 *
 * The manifest knows every square that has been authored; the `peoplePortraitArt` index knows
 * which of them the GM has actually extracted. Re-pointing on the manifest alone would leave a
 * broken image on any world that has not run the rebuild — the one thing worse than a portrait
 * cropped badly is a portrait that does not load.
 */
export function squareOnDiskResolver() {
	const present = new Set(Object.values(getObjectSetting("peoplePortraitArt")).map(basename));
	return (src) => {
		const square = squarePortraitSrc(src);
		return square && present.has(basename(square)) ? square : null;
	};
}

/**
 * Do it — in ONE write where possible, falling back to one write per actor.
 *
 * The plan comes from every actor in the world, and on the upgrade this feature exists for (a
 * GM who populated the steading roster before squares existed) that is tens of them. One awaited
 * `update()` apiece is a server round trip AND a world-wide `updateActor` broadcast apiece, each
 * of which re-renders the Actors sidebar and any open sheet on every connected client. The
 * batched form is one of each — the same move, for the same reason, that the journal baseline
 * stamps make in hooks/SeedCompendiums.js.
 *
 * The per-actor loop stays as the FALLBACK, because it is what makes a partial pass honest: a
 * bulk call is all-or-nothing, so if one actor is unwritable (a permission, a locked copy) the
 * batch rejects and this walks them individually to save everything that can be saved. Either
 * way re-running picks up the remainder, since everything already bumped no longer matches.
 */
export async function repointPeopleSquares({ actors = null, squareFor = null } = {}) {
	const pool = actors ?? globalThis.game?.actors?.contents ?? [];
	const plan = planPortraitRepoints(pool, squareFor ?? squareOnDiskResolver());
	const result = { updated: 0, failed: 0, changes: 0, total: plan.length };
	if (!plan.length) return result;

	const bulk = globalThis.Actor?.updateDocuments;
	if (bulk && plan.every((item) => item.actor?.id)) {
		try {
			await bulk.call(Actor, plan.map((item) => ({ _id: item.actor.id, ...item.updates })));
			result.updated = plan.length;
			result.changes = plan.reduce((n, item) => n + item.changes.length, 0);
			return result;
		} catch (err) {
			console.warn("Stonetop | bulk portrait re-point failed; retrying one actor at a time:", err);
		}
	}

	for (const item of plan) {
		try {
			await item.actor.update(item.updates);
			result.updated++;
			result.changes += item.changes.length;
		} catch (err) {
			result.failed++;
			console.warn(`Stonetop | could not re-point portraits on ${item.actor?.name}:`, err);
		}
	}
	return result;
}
