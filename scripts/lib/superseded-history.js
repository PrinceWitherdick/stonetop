// The pure core of scripts/gen-superseded-fields.js: given every version of every pack document
// the history holds, and the pack as it is now, list each current entry's FORMER values, the ones
// a held copy taken under an older release could still carry. See module/migration/superseded-values.js
// for why, and for the comparison both sides share.

import {
	fieldsFor, fieldValue, fieldPaths, valueHash, valueAt, isGear, entryFingerprint,
} from "../../module/migration/superseded-values.js";

const category = doc => (isGear(doc) ? "gear" : "move");

/**
 * Which current entry each historical version is a version OF: the same `_id` (stable since the
 * packs were consolidated), else the same name and playbook in the same category, else a name
 * only one current entry of that category has. Anything else is an orphan (a move the pack no
 * longer ships) and has no current entry to correct a copy towards. PURE.
 *
 * @param {object} doc         a historical version
 * @param {object} index       built by indexCurrent
 * @returns {object|null}      the current entry
 */
export function currentEntryFor(doc, index) {
	if (doc?._id && index.byId.has(doc._id)) {
		const entry = index.byId.get(doc._id);
		// An id reused for something else entirely is not a version of it.
		if (entry.name === doc.name || category(entry) === category(doc)) return entry;
	}
	const named = index.byName.get(`${category(doc)}|${doc?.name}`) ?? [];
	if (named.length === 1) return named[0];
	const playbook = doc?.system?.playbook ?? "";
	const same = named.filter(e => (e.system?.playbook ?? "") === playbook);
	return same.length === 1 ? same[0] : null;
}

/** The lookups currentEntryFor reads. PURE. */
export function indexCurrent(entries) {
	const byId = new Map();
	const byName = new Map();
	for (const entry of entries) {
		if (entry?._id) byId.set(entry._id, entry);
		const key = `${category(entry)}|${entry.name}`;
		if (!byName.has(key)) byName.set(key, []);
		byName.get(key).push(entry);
	}
	return { byId, byName };
}

/**
 * Every former value of every refreshable field, by current entry: `{ [_id]: { [path]: hash[] } }`.
 * A keyed field (a track, the roll outcomes, armor) is listed whole AND per key, and a key a former
 * version did not have is listed as absent, so a copy that predates a key (a track's spend list)
 * reads as pristine and gains it. A value equal to the current one is never listed. PURE.
 *
 * @param {object[]} history  every historical version (duplicates are harmless)
 * @param {object[]} current  the pack's entries now
 * @returns {{superseded: object, fingerprints: object, orphans: string[]}}
 */
export function supersededValues(history, current) {
	const index = indexCurrent(current);
	const sets = new Map(); // _id -> Map(path -> Set(hash))
	const orphans = new Set();
	for (const doc of history) {
		if (doc?.type !== "move") continue;
		const entry = currentEntryFor(doc, index);
		if (!entry) { orphans.add(`${doc.name} (${doc.system?.playbook || category(doc)})`); continue; }
		const spec = fieldsFor(entry);
		if (!sets.has(entry._id)) sets.set(entry._id, new Map());
		const paths = sets.get(entry._id);
		const add = (path, hash) => {
			if (!paths.has(path)) paths.set(path, new Set());
			paths.get(path).add(hash);
		};
		for (const field of Object.keys(spec)) {
			if (spec[field].fillOnly) continue;
			const was = fieldValue(doc, field, spec);
			const now = fieldValue(entry, field, spec);
			for (const [path, value, opts] of fieldPaths(field, was, spec[field])) add(path, valueHash(value, opts));
			// Keys the current entry has that this version lacked: listed as absent.
			if (spec[field].keys && was && typeof was === "object" && now && typeof now === "object") {
				for (const k of Object.keys(now)) if (!(k in was)) add(`${field}.${k}`, valueHash(undefined, { top: false }));
			}
		}
	}

	const superseded = {};
	const fingerprints = {};
	for (const entry of [...current].sort((a, b) => String(a._id).localeCompare(String(b._id)))) {
		fingerprints[entry._id] = entryFingerprint(entry);
		const paths = sets.get(entry._id);
		if (!paths) continue;
		const spec = fieldsFor(entry);
		const out = {};
		for (const path of [...paths.keys()].sort()) {
			const [field, key] = path.split(/\.(.*)/s);
			const now = fieldValue(entry, field, spec);
			const nowHash = key === undefined ? valueHash(now) : valueHash(now?.[key], { top: false });
			const former = [...paths.get(path)].filter(h => h !== nowHash).sort();
			if (former.length) out[path] = former;
		}
		if (Object.keys(out).length) superseded[entry._id] = out;
	}
	return { superseded, fingerprints, orphans: [...orphans].sort() };
}

/**
 * The bestiary's former values: `{ [actorId]: { paths: { [path]: hash[] }, items: { [itemId]: { [path]: hash[] } } } }`.
 * A historical stat block is a version of the current one with the same id; its moves, of the current
 * move with the same id, else the same name. A value equal to the current one is never listed. PURE.
 *
 * @param {object[]} history  every historical version of every stat block
 * @param {object[]} current  the bestiary pack's stat blocks now
 * @param {{actor: string[], move: string[]}} paths  the fields compared (bestiary-refresh.js)
 */
export function bestiarySuperseded(history, current, paths) {
	const byId = new Map(current.map(e => [e._id, e]));
	const sets = new Map(); // key -> Set(hash), key = `${actorId}|${itemId ?? ""}|${path}`
	const add = (key, value) => {
		if (!sets.has(key)) sets.set(key, new Set());
		sets.get(key).add(valueHash(value, { top: false }));
	};
	for (const doc of history) {
		const entry = byId.get(doc?._id);
		if (!entry) continue;
		for (const path of paths.actor) add(`${entry._id}||${path}`, valueAt(doc, path));
		for (const move of doc.items ?? []) {
			const now = (entry.items ?? []).find(m => m._id === move._id) ?? (entry.items ?? []).find(m => m.name === move.name);
			if (!now) continue;
			for (const path of paths.move) add(`${entry._id}|${now._id}|${path}`, valueAt(move, path));
		}
	}
	const out = {};
	for (const [key, hashes] of [...sets].sort(([a], [b]) => a.localeCompare(b))) {
		const [actorId, itemId, path] = key.split("|");
		const entry = byId.get(actorId);
		const source = itemId ? entry.items.find(m => m._id === itemId) : entry;
		const nowHash = valueHash(valueAt(source, path), { top: false });
		const former = [...hashes].filter(h => h !== nowHash).sort();
		if (!former.length) continue;
		out[actorId] ??= { paths: {}, items: {} };
		if (itemId) (out[actorId].items[itemId] ??= {})[path] = former;
		else out[actorId].paths[path] = former;
	}
	return out;
}
