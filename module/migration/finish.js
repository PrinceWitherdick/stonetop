/**
 * Phase 3: the destructive rewrites, run once on the FIRST launch under the new system id.
 *
 * These deliberately do not happen before the flip. Rewriting an asset path or a
 * compendiumSource stamp while the OLD system is still running immediately breaks the
 * features that recognise their own content by those strings (map-pin labels, bestiary
 * placeholder portraits, the managed journal update channel), and a rewritten
 * `core.sheetClasses` makes every actor open on Foundry's generic sheet. Once only one
 * system has to be consistent, all of that is safe.
 *
 * Rather than enumerate the ~20 document fields that can hold an asset path, this walks
 * each document's plain data and rewrites any string containing a stale
 * `systems/<oldId>/` prefix or `Compendium.<oldId>.` reference. That also catches the
 * paths hand-enumeration always misses: inline <img> in journal HTML, item descriptions,
 * chat-card markup, and token ring textures.
 *
 * ⚠ NO CALLER YET, and there cannot be one in this tree: this only runs on the first launch
 * AFTER the flip, which is the renamed system's code, not this bridge's. Wiring it into the
 * Ready hook (behind a once-per-world setting) is step 3 of the runbook in MIGRATION.md —
 * the codemod does not add the call site for you.
 */

import { SYSTEM_ID } from "../system-id.js";
import { PRIOR_SYSTEM_IDS, ALL_SYSTEM_IDS } from "./compat.js";

/** Build the string replacer for one rename. */
export function makeStringRewriter({ systemId = SYSTEM_ID, priorIds = PRIOR_SYSTEM_IDS } = {}) {
	const swaps = [];
	for (const oldId of priorIds) {
		if (oldId === systemId) continue;
		swaps.push([`systems/${oldId}/`, `systems/${systemId}/`]);
		swaps.push([`Compendium.${oldId}.`, `Compendium.${systemId}.`]);
	}
	return (value) => {
		if (typeof value !== "string") return value;
		let out = value;
		for (const [from, to] of swaps) {
			if (out.includes(from)) out = out.split(from).join(to);
		}
		return out;
	};
}

/** Deep-rewrite every string in a plain value. Returns {value, changed}. */
export function deepRewrite(value, rewrite) {
	if (typeof value === "string") {
		const next = rewrite(value);
		return { value: next, changed: next !== value };
	}
	if (Array.isArray(value)) {
		let changed = false;
		const out = value.map((entry) => {
			const result = deepRewrite(entry, rewrite);
			changed = changed || result.changed;
			return result.value;
		});
		return { value: changed ? out : value, changed };
	}
	if (value && typeof value === "object") {
		let changed = false;
		const out = {};
		for (const [key, entry] of Object.entries(value)) {
			const result = deepRewrite(entry, rewrite);
			changed = changed || result.changed;
			out[key] = result.value;
		}
		return { value: changed ? out : value, changed };
	}
	return { value, changed: false };
}

/**
 * The update for one document, or null when nothing is stale.
 *
 * Only the top-level branches that actually changed are sent. `_stats` is special-cased
 * to `compendiumSource` alone: the rest of it is server-managed and would be rejected.
 */
export function planDocumentRewrite(data, options = {}) {
	const rewrite = options.rewrite ?? makeStringRewriter(options);
	if (!data || typeof data !== "object") return null;

	const update = {};
	let changed = false;

	for (const [key, value] of Object.entries(data)) {
		if (key === "_id" || key === "_stats") continue;
		const result = deepRewrite(value, rewrite);
		if (!result.changed) continue;
		update[key] = result.value;
		changed = true;
	}

	const source = data._stats?.compendiumSource;
	if (typeof source === "string") {
		const next = rewrite(source);
		if (next !== source) {
			update._stats = { compendiumSource: next };
			changed = true;
		}
	}

	// `flags.core.sheetClass` is "<packageId>.<ClassName>" — neither an asset path nor a
	// compendium ref, so the string rewriter above cannot see it. Left stale, the document
	// silently falls back to Foundry's generic sheet. Folded into whatever `flags` branch
	// the rewrite already produced, so one update carries both.
	const sheetClass = data.flags?.core?.sheetClass;
	if (typeof sheetClass === "string") {
		const next = rewriteSheetClassValue(sheetClass, options);
		if (next !== sheetClass) {
			const flags = update.flags ?? {};
			flags.core = { ...(flags.core ?? {}), sheetClass: next };
			update.flags = flags;
			changed = true;
		}
	}

	if (!changed) return null;
	update._id = data._id ?? data.id;
	return update;
}

/**
 * `core.sheetClasses` and per-document `flags.core.sheetClass` store `"<packageId>.<Class>"`.
 * A stale entry does more than lose the GM's choice: it actively suppresses `makeDefault`
 * on the newly-registered sheets, so actors open on Foundry's generic sheet with no error.
 */
export function rewriteSheetClassValue(value, { systemId = SYSTEM_ID, priorIds = PRIOR_SYSTEM_IDS } = {}) {
	if (typeof value !== "string") return value;
	for (const oldId of priorIds) {
		if (value.startsWith(`${oldId}.`)) return `${systemId}.${value.slice(oldId.length + 1)}`;
	}
	return value;
}

/** Recursively rewrite the sheet-class ids inside the core.sheetClasses setting value. */
export function rewriteSheetClasses(setting, options = {}) {
	if (!setting || typeof setting !== "object") return { value: setting, changed: false };
	return deepRewrite(setting, (value) => rewriteSheetClassValue(value, options));
}

/**
 * `core.compendiumConfiguration` is keyed by `<packageId>.<packName>`, so every one of our
 * packs is orphaned by the rename, taking the GM's per-pack lock, folder and ownership
 * choices with it.
 */
export function rewriteCompendiumConfiguration(config, { systemId = SYSTEM_ID, priorIds = PRIOR_SYSTEM_IDS } = {}) {
	if (!config || typeof config !== "object") return { value: config, changed: false };

	// Two passes, because a stale key can be iterated before the current key it would
	// otherwise overwrite. Whatever the new id already has always wins.
	const out = {};
	const renames = [];
	for (const [key, value] of Object.entries(config)) {
		const oldId = priorIds.find((id) => key.startsWith(`${id}.`));
		if (oldId) renames.push([`${systemId}.${key.slice(oldId.length + 1)}`, value]);
		else out[key] = value;
	}

	let changed = false;
	for (const [key, value] of renames) {
		if (out[key] !== undefined) continue;
		out[key] = value;
		changed = true;
	}
	return { value: changed ? out : config, changed };
}

/**
 * Walk every target and apply the rewrites.
 *
 * @param {Array} targets  From world-scan's collectTargets().
 */
export async function finishDocuments(targets, options = {}) {
	const rewrite = options.rewrite ?? makeStringRewriter(options);
	let updated = 0;

	for (const target of targets ?? []) {
		const updates = [];
		for (const doc of target.docs) {
			const data = typeof doc.toObject === "function" ? doc.toObject() : doc;
			const update = planDocumentRewrite(data, { ...options, rewrite });
			if (update) updates.push(update);
		}
		if (!updates.length) continue;
		await target.apply(updates);
		updated += updates.length;
		options.onProgress?.({ label: target.label, updated });
	}
	return { updated };
}

/** Occurrences of `needle` in `haystack`, without split()'s full substring array. */
function occurrences(haystack, needle) {
	let count = 0;
	for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + needle.length)) count += 1;
	return count;
}

/** Every string still naming an older id, for the post-run residual report. */
export function residualCount(data, { systemIds = ALL_SYSTEM_IDS, systemId = SYSTEM_ID } = {}) {
	const stale = systemIds.filter((id) => id !== systemId);
	if (!stale.length) return 0;
	const json = JSON.stringify(data ?? {});
	let count = 0;
	for (const id of stale) {
		count += occurrences(json, `systems/${id}/`);
		count += occurrences(json, `Compendium.${id}.`);
	}
	return count;
}
