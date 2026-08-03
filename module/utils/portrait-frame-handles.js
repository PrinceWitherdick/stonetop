import { SYSTEM_ID } from "../system-id.js";
import { resolvedFlags } from "../actors/character/StonetopFlags.js";
import { isActorRow, personRowActor } from "../actors/steading/steading-people.js";
import { STEADING_DEFAULTS } from "../actors/steading/StonetopSteading.js";
import { normalizeFrame, documentPortraitFrame } from "./portrait-frame.js";

/**
 * Where a chosen portrait frame is stored, per kind of "person".
 *
 * The editor knows no flag paths. It is handed one of these handles and can only ask four things
 * of it: may I write, what image am I framing, what is stored, and store this. That is what lets
 * one dialog serve an NPC document, a follower card living in a flag, a legacy steading text row
 * living in a flag ARRAY, and a PC, without any of them leaking into the editor.
 *
 * ⚠ Every property read uses BRACKETS: `flags?.["stonetop-pwd"]?.x`. The package id is hyphenated,
 * so a dotted `flags.stonetop-pwd.x` parses as a subtraction and fails at runtime with
 * "pwd is not defined". Nothing lints it. Dotted paths are fine inside string literals, which is
 * why every one of those is built from SYSTEM_ID rather than written out.
 *
 * ⚠ The stored key is `portraitFrame` and its path key is `src`, never `img` — see the warning in
 * module/utils/portrait-frame.js.
 *
 * CLEARING IS ASYMMETRIC BETWEEN THE THREE, and the asymmetry is not cosmetic:
 *  - an object flag MERGES, so writing a smaller object never drops a key. Clearing needs
 *    `unsetFlag` (or an explicit `-=` in an update);
 *  - a flag ARRAY is replaced wholesale, because mergeObject treats arrays as atomic values, so
 *    a plain `delete` on a row object is both correct and the only thing that works.
 * Do not "unify" them.
 */

/**
 * An Actor's own portrait: NPCs, PCs, monsters, and every actor-backed steading roster row.
 *
 * Stored at `flags["stonetop-pwd"].portraitFrame`. A flag rather than a data-model field, so
 * there is nothing to migrate and every actor type gets it for free.
 */
export function actorFrameHandle(actor, { editable = null } = {}) {
	if (!actor) return null;
	return {
		canWrite: editable ?? !!actor.isOwner,
		// The document itself, for the one consumer that needs more than a rect: the Tokenizer
		// bridge, which tokenizes an ACTOR. A follower card has no document, which is exactly
		// why this is a property of the actor handle rather than of every handle.
		actor,
		get img() { return actor.img ?? ""; },
		read: () => documentPortraitFrame(actor),
		// A fresh object fully replaces the old one despite the merge, because the shape is
		// exactly { src: primitive, rect: Array } and mergeObject treats an Array as an atomic
		// value. IF A THIRD KEY IS EVER ADDED, that stops being true and this needs an unset first.
		write: (frame) => actor.setFlag(SYSTEM_ID, "portraitFrame", normalizeFrame(frame)),
		// Guarded, because unsetFlag on a missing parent inserts an empty object rather than
		// doing nothing.
		clear: () => (actor.flags?.[SYSTEM_ID]?.portraitFrame === undefined
			? Promise.resolve()
			: actor.unsetFlag(SYSTEM_ID, "portraitFrame"))
	};
}

/**
 * A follower card: animal companion, crew, initiate, beast or custom.
 *
 * Stored at `flags["stonetop-pwd"].<detailBase>.portraitFrame`, beside the `img` the card already
 * keeps there. A follower is not a document, which is exactly why the frame had to be storable
 * against a flag as well as an actor.
 *
 * `base` is `_followerDetailBase(ftype, slug)`: `animalCompanion.details`, `crew.details`,
 * `initiateDetails.{slug}`, `beastDetails.{slug}` or `customFollowers.{slug}`. Slugs are pack
 * slugs or a randomID, never containing a dot, so the dotted flag path is safe.
 */
export function followerFrameHandle(actor, base, { editable = false } = {}) {
	if (!actor || !base) return null;
	// resolvedFlags rather than actor.flags[SYSTEM_ID], so a world that has not been cut over
	// from a legacy flag scope still resolves its followers.
	const detail = () => foundry.utils.getProperty(resolvedFlags(actor), base) ?? {};
	return {
		canWrite: !!editable,
		get img() { return String(detail().img ?? "").trim(); },
		read: () => detail().portraitFrame ?? null,
		write: (frame) => actor.setFlag(SYSTEM_ID, `${base}.portraitFrame`, normalizeFrame(frame)),
		// An explicit `-=` through update() rather than unsetFlag: it touches the parent anyway,
		// so no phantom `initiateDetails.acolyte: {}` can be inserted for a follower that never
		// had a frame. Guarded so clearing an unframed follower is a genuine no-op.
		clear: () => (detail().portraitFrame === undefined
			? Promise.resolve()
			: actor.update({ [`flags.${SYSTEM_ID}.${base}.-=portraitFrame`]: null }))
	};
}

/**
 * A legacy steading person row: plain text in the `residents`/`neighbors` flag arrays, from
 * before those rows became NPC actors.
 *
 * Stored as a `portraitFrame` key on the row object itself.
 */
export function legacyRowFrameHandle(steading, list, index, { editable = false } = {}) {
	// Falls back to STEADING_DEFAULTS exactly as the sheet's own photo editor does. Reading only
	// the flag looks right and is wrong: a world that has never written this list still SHOWS the
	// default rows, so a handle built from `[]` would decide there was no row here and quietly
	// offer nothing.
	const rows = () => {
		const stored = steading?._flags?.[list];
		const source = Array.isArray(stored) ? stored : STEADING_DEFAULTS[list];
		return Array.isArray(source) ? source : [];
	};
	const row = () => rows()[index] ?? null;
	const save = async (mutate) => {
		const arr = foundry.utils.deepClone(rows());
		// An actor-backed row renders from the NPC's own img, so a frame written onto the array
		// row would be an invisible no-op. Branch the same way the photo editor does.
		if (!arr[index] || isActorRow(arr[index])) return;
		mutate(arr[index]);
		await steading.setFlags({ [list]: arr });
	};
	return {
		canWrite: !!editable,
		get img() { return String(row()?.img ?? "").trim(); },
		read: () => row()?.portraitFrame ?? null,
		write: (frame) => save((r) => { r.portraitFrame = normalizeFrame(frame); }),
		// A PLAIN delete, and `-=` would be WRONG here — the exact opposite of the object-flag
		// rule above. setFlags merges the whole `steading` object, and mergeObject/diffObject
		// treat ARRAYS as atomic values, so the array is replaced and a deleted row key really
		// does disappear. The existing photo editor already relies on this for `arr[index].img`.
		clear: () => save((r) => { delete r.portraitFrame; })
	};
}

/**
 * The steading roster's one handle: an actor row writes to its NPC, a legacy row to the array.
 *
 * Deliberately synchronous, so it can be called from a click handler that also builds UI. The
 * actor comes from `personRowActor` — literally the function the roster's own resolve uses — so
 * the two cannot disagree about which document backs a row.
 */
export function personFrameHandle(steading, list, index, { editable = false } = {}) {
	const stored = steading?._flags?.[list];
	const rows = Array.isArray(stored) ? stored : (STEADING_DEFAULTS[list] ?? []);
	const row = rows[index];
	if (!row) return null;
	if (!isActorRow(row)) return legacyRowFrameHandle(steading, list, index, { editable });
	const npc = personRowActor(row);
	// actorFrameHandle gates on the NPC's own ownership, which is stricter than the steading's
	// editability on purpose: roster NPCs are seeded at OBSERVER, so a player who may edit the
	// steading would otherwise be offered a control whose save the server refuses.
	return npc ? actorFrameHandle(npc) : null;
}
