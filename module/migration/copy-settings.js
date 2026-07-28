/**
 * Settings half of the system-id migration.
 *
 * World-scope settings are Setting DOCUMENTS keyed `"<namespace>.<key>"`. The key field
 * is a plain string validated only as "contains a dot", so it can be written for a
 * namespace that is not registered yet. `game.settings.get/set` THROW on an unregistered
 * key, so this must go through the document collection instead.
 *
 * Client-scope settings are plain localStorage entries under the same key string.
 *
 * Two traps this deliberately avoids:
 *  - Copy the SERIALIZED source value (`_source.value`), never the initialized `value`.
 *    A JSON field re-casts on read, so a stored string like "123" comes back as a number
 *    and would be written back with the wrong type.
 *  - UPSERT, never blind-create. There is no uniqueness constraint on Setting.key and
 *    the lookup is a bare find(), so a duplicate key silently shadows the original.
 */

import { SYSTEM_ID, RENAME_TARGET_ID } from "../system-id.js";
import { PRIOR_SYSTEM_IDS } from "./compat.js";

/** Read the serialized value off a Setting document, whatever shape it arrives in. */
export function sourceValue(setting) {
	return setting?._source?.value ?? setting?.value;
}

/** Rewrite the namespace of a `namespace.key` string, or null if it is not ours. */
export function rekey(key, source, target) {
	const prefix = `${source}.`;
	if (typeof key !== "string" || !key.startsWith(prefix)) return null;
	return `${target}.${key.slice(prefix.length)}`;
}

/**
 * Decide what to create and what to update, given every Setting document in the world.
 * Pure: takes plain objects, returns plain objects, so it is testable without Foundry.
 *
 * @param {Array} settings  [{ _id, key, _source: { value } }, …]
 * @returns {{creates: Array, updates: Array, unchanged: Array}}
 */
export function planSettingCopies(settings, { source = SYSTEM_ID, target = RENAME_TARGET_ID } = {}) {
	const all = [...(settings ?? [])];
	const byKey = new Map();
	for (const setting of all) {
		// A duplicate key can exist; the first one is the one Foundry's find() resolves.
		if (!byKey.has(setting.key)) byKey.set(setting.key, setting);
	}

	const creates = [];
	const updates = [];
	const unchanged = [];

	for (const setting of all) {
		const targetKey = rekey(setting.key, source, target);
		if (!targetKey) continue;
		if (byKey.get(setting.key) !== setting) continue; // shadowed duplicate, leave alone

		const value = sourceValue(setting);
		const existing = byKey.get(targetKey);
		if (!existing) creates.push({ key: targetKey, value });
		else if (sourceValue(existing) !== value) updates.push({ _id: existing._id, value });
		else unchanged.push(targetKey);
	}

	return { creates, updates, unchanged };
}

/**
 * Apply a settings plan.
 *
 * @param {Array}    settings
 * @param {object}   io        { create(docs), update(docs) } — batched writers.
 * @returns {Promise<{created: number, updated: number, unchanged: number}>}
 */
export async function copySettings(settings, io, options = {}) {
	const { creates, updates, unchanged } = planSettingCopies(settings, options);
	if (creates.length) await io.create(creates);
	if (updates.length) await io.update(updates);
	return { created: creates.length, updated: updates.length, unchanged: unchanged.length };
}

/**
 * Client-scope settings and any other namespaced localStorage entries. Per-browser, so
 * this only ever fixes the machine it runs on; every player has to log in once from each
 * browser they use.
 *
 * @param {Storage} storage  window.localStorage, or a Map-like stand-in in tests.
 * @returns {{copied: number, skipped: number}}
 */
export function copyLocalStorage(storage, { source = SYSTEM_ID, target = RENAME_TARGET_ID } = {}) {
	if (!storage) return { copied: 0, skipped: 0 };

	const keys = [];
	for (let i = 0; i < storage.length; i += 1) {
		const key = storage.key(i);
		if (typeof key === "string" && key.startsWith(`${source}.`)) keys.push(key);
	}

	let copied = 0;
	let skipped = 0;
	for (const key of keys) {
		const targetKey = rekey(key, source, target);
		// Never clobber a value the new system has already written on this browser.
		if (storage.getItem(targetKey) !== null) { skipped += 1; continue; }
		storage.setItem(targetKey, storage.getItem(key));
		copied += 1;
	}
	return { copied, skipped };
}

/**
 * Adopt this browser's client-scope settings from any id this system previously shipped
 * under.
 *
 * Phase 1's localStorage copy only ever runs on the machine the GM migrated from, because
 * localStorage is per-browser. Without this, every player silently reverts to defaults for
 * the ~24 client-scope preferences (sheet font, font scale, reduce motion, edit-pencil
 * delay, tab order and the rest) the first time they log in after the rename.
 *
 * Runs on every client, GM or not, and needs no world write. Prior ids are tried newest
 * first and `copyLocalStorage` never clobbers, so the most recent legacy value wins and a
 * value the active id already has is always left alone. Safe to run on every load.
 *
 * Must run BEFORE the first settings read: onReady applies the sheet font on its opening
 * line, so a later copy would not take effect until the next reload.
 */
export function adoptLegacyClientSettings(storage = globalThis.localStorage, { systemId = SYSTEM_ID, priorIds } = {}) {
	const sources = priorIds ?? PRIOR_SYSTEM_IDS;
	let copied = 0;
	let skipped = 0;
	for (const source of sources) {
		if (source === systemId) continue;
		const result = copyLocalStorage(storage, { source, target: systemId });
		copied += result.copied;
		skipped += result.skipped;
	}
	return { copied, skipped };
}
