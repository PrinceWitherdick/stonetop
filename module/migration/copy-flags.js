/**
 * Additive half of the system-id migration: copy every `flags.<source>` bag into
 * `flags.<target>` and stamp the document as cut over. Nothing is deleted and nothing
 * else on the document is touched, so a world remains fully working on the OLD system
 * until world.json is re-pointed. That is what makes this phase reversible.
 *
 * Must not use setFlag/getFlag: Foundry validates a flag scope against the ACTIVE
 * package ids, so writing the not-yet-installed target scope throws. Raw
 * `update({flags: {...}})` is validated lexically only, which is why it works.
 */

import { SYSTEM_ID, RENAME_TARGET_ID, CUTOVER_KEY, isCutOver } from "../system-id.js";

/** Documents per updateDocuments() call. The socket has no chunking of its own. */
export const BATCH_SIZE = 100;

/** Serialized bytes per batch, well under the server's 100MB frame cap. */
export const BATCH_BYTES = 2_000_000;

/** A flag bag we can copy from, or null for anything that is not a plain object. */
function plainBag(value) {
	return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

/**
 * The additive update for one document, or null when there is nothing to do.
 * Skips documents already stamped: the stamp is written in the same atomic update as
 * the data, so its presence means that document completed. This is what makes an
 * interrupted run cheap to resume and the whole pass safe to re-run.
 */
export function buildFlagUpdate(doc, { source = SYSTEM_ID, target = RENAME_TARGET_ID, cutoverKey = CUTOVER_KEY, legacyScopes = [] } = {}) {
	const flags = doc?.flags;
	if (!flags) return null;
	if (isCutOver(doc, target, cutoverKey)) return null;

	const bag = plainBag(flags[source]);
	if (!bag || !Object.keys(bag).length) return null;

	// Fold any requested fallback rungs in UNDERNEATH the source bag. Writing the cutover
	// stamp is what makes the read paths stop consulting those rungs for this document
	// (system-id.js#isCutOver), so a key that only ever lived on one of them — carried
	// across the pre-0.8.0 `stonetop` → `stonetop_pwd` rename and never rewritten since —
	// would otherwise become unreachable the moment we stamp.
	//
	// SHALLOW, top-level keys only. A deep merge is what would resurrect a sub-key the
	// system deliberately deleted (CharacterArcana#removeArcanum), because the stale
	// legacy copy of the parent object still holds it. The source bag wins any key it has.
	//
	// EMPTY BY DEFAULT, because "stonetop" is both a former system id AND the live
	// ITEM_FLAG_SCOPE. world-scan.js turns this on for actor targets alone — the only
	// documents whose reads go through StonetopFlags/resolvedFlags — so shipped item
	// content, journal checkbox progress and hover summaries are never duplicated.
	// Either way nothing is moved: the legacy bags stay exactly where they are.
	const merged = {};
	// LEGACY_FLAG_SCOPES is newest-first, so apply it oldest-first and let newer win.
	for (const scope of [...legacyScopes].reverse()) {
		if (scope === source || scope === target) continue;
		const legacy = plainBag(flags[scope]);
		if (legacy) Object.assign(merged, structuredClone(legacy));
	}
	// Cloned so the update can never alias live document state.
	Object.assign(merged, structuredClone(bag), { [cutoverKey]: source });

	return { _id: doc._id ?? doc.id, flags: { [target]: merged } };
}

/** Split updates into batches bounded by both count and serialized size. */
export function batchUpdates(updates, { size = BATCH_SIZE, bytes = BATCH_BYTES } = {}) {
	const batches = [];
	let current = [];
	let currentBytes = 0;
	for (const update of updates) {
		const cost = JSON.stringify(update).length;
		// A single oversized document still goes out on its own rather than being dropped.
		if (current.length && (current.length >= size || currentBytes + cost > bytes)) {
			batches.push(current);
			current = [];
			currentBytes = 0;
		}
		current.push(update);
		currentBytes += cost;
	}
	if (current.length) batches.push(current);
	return batches;
}

/**
 * Copy flags for one set of documents.
 *
 * @param {Iterable} docs         Documents to consider.
 * @param {Function} apply        async (updates) => void — performs one batched write.
 * @param {object}   [options]    { source, target, cutoverKey, size, bytes, onProgress }
 * @returns {Promise<{considered: number, updated: number, batches: number}>}
 */
export async function copyFlags(docs, apply, options = {}) {
	const { onProgress, ...rest } = options;
	const all = [...(docs ?? [])];
	const updates = all.map((doc) => buildFlagUpdate(doc, rest)).filter(Boolean);
	const batches = batchUpdates(updates, rest);

	let done = 0;
	for (const batch of batches) {
		await apply(batch);
		done += batch.length;
		onProgress?.({ done, total: updates.length });
	}
	return { considered: all.length, updated: updates.length, batches: batches.length };
}

/**
 * Count what a run would change, without writing anything. Drives the preflight report
 * so the GM sees the size of the job before committing to it.
 */
export function previewFlags(docs, options = {}) {
	let pending = 0;
	let alreadyDone = 0;
	const target = options.target ?? RENAME_TARGET_ID;
	const cutoverKey = options.cutoverKey ?? CUTOVER_KEY;
	for (const doc of docs ?? []) {
		if (isCutOver(doc, target, cutoverKey)) alreadyDone += 1;
		else if (buildFlagUpdate(doc, options)) pending += 1;
	}
	return { pending, alreadyDone };
}
