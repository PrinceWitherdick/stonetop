/**
 * Index a compendium pack for the fields a caller needs, remembering every field ANY caller has
 * ever asked that pack for and always requesting the union.
 *
 * Why the union, rather than each caller asking for its own fields:
 *
 * A pack tracks one set of "fields I am indexed on" (`CompendiumCollection##indexedFields`), and
 * `getIndex({fields})` OVERWRITES it with core-fields ∪ fields. The freshly fetched rows are
 * merged into the existing index entries, so the data of a previous, wider index survives the
 * call — but the pack no longer believes those fields are indexed. That matters because v14
 * rebuilds an index entry FROM SCRATCH out of the tracked set whenever a document is loaded
 * (`set()` → `indexDocument()`): the entry is replaced, not merged, so every field outside the
 * last-requested set is dropped from it.
 *
 * The visible failure: this system reads one shared items pack through half a dozen stores with
 * different field lists. Ask it for `system.moveType` last, then open a post-death insert
 * document, and that insert's index entry comes back without `system.slug` — so the "Choose Your
 * Fate" list, which matches inserts by slug, silently loses the ones the player had looked at.
 * Anything else keyed off an index field (playbook lookup, treasure, arcana slugs) fails the same
 * way, and only for the documents that happen to have been loaded.
 *
 * `getIndex` is asked on every call rather than guarded by a local "already indexed" flag: it
 * returns immediately when the requested fields are already covered, and re-fetches exactly when
 * they are not — which is precisely when another caller has narrowed the set and the index needs
 * repairing. Calls per pack are chained so a burst can't fire several server round trips before
 * the first one records what it indexed.
 *
 * @param {string} packName  Full pack id, e.g. "stonetop-pwd.stonetop-items".
 * @param {string[]} [fields]  Index fields this caller needs.
 * @returns {Promise<CompendiumCollection|null>}  The pack, or null when it isn't registered.
 */

const _fields  = new Map();
const _pending = new Map();

export async function ensurePackIndex(packName, fields = []) {
	const pack = globalThis.game?.packs?.get?.(packName);
	if (!pack) return null;

	let wanted = _fields.get(packName);
	if (!wanted) _fields.set(packName, wanted = new Set());
	for (const field of fields) wanted.add(field);

	// Spread inside the thunk, not here: by the time this link of the chain runs, a later caller
	// may have widened the union, and asking for the wider set costs the same one request.
	const run = (_pending.get(packName) ?? Promise.resolve())
		.then(() => pack.getIndex({ fields: [...wanted] }));
	// A failed index must not poison the chain for the next caller.
	_pending.set(packName, run.catch(() => {}));
	await run;
	return pack;
}

/** Forget every remembered field set. Tests only — a live session wants the union to accumulate. */
export function resetPackIndexFields() {
	_fields.clear();
	_pending.clear();
}
