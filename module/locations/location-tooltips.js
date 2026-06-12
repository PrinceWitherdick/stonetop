// Replaces the useless default "Journal Entry" hover tooltip on cross-links into
// the Stonetop Locations pack with that location's one-line summary.
//
// The summary is authored as a `flags.stonetop.summary` on each location journal
// (by the locations generator) and read here from the pack's compendium index —
// no documents are loaded. The index is built lazily and cached; render hooks
// (registered in stonetop.js) call applyLocationTooltips() on the rendered HTML.

const PACK_ID = "stonetop_pwd.stonetop-locations";
const UUID_PREFIX = "Compendium.stonetop_pwd.stonetop-locations.JournalEntry.";

let _indexPromise = null;

function _buildIndex() {
	_indexPromise ??= (async () => {
		const pack = game.packs?.get(PACK_ID);
		const map = new Map();
		if (!pack) return map;
		const index = await pack.getIndex({ fields: ["flags.stonetop.summary"] });
		for (const entry of index) {
			const summary = entry.flags?.stonetop?.summary;
			if (summary) map.set(entry.uuid, summary);
		}
		return map;
	})();
	return _indexPromise;
}

/** Drop the cached index (e.g. if the pack changes). */
export function invalidateLocationSummaryIndex() {
	_indexPromise = null;
}

/** Warm the cache (call once on ready so the first hover is instant). */
export async function ensureLocationSummaryIndex() {
	return _buildIndex();
}

/**
 * Set data-tooltip = the location summary on every content-link in `root` that
 * points at a Stonetop Locations journal. Safe to call repeatedly.
 * @param {HTMLElement|jQuery} root
 */
export async function applyLocationTooltips(root) {
	const el = root?.jquery ? root[0] : root;
	if (!el?.querySelectorAll) return;
	const links = el.querySelectorAll(`a.content-link[data-uuid^="${UUID_PREFIX}"]`);
	if (!links.length) return;
	const map = await _buildIndex();
	for (const a of links) {
		const summary = map.get(a.dataset.uuid);
		if (summary) a.dataset.tooltip = summary;
	}
}
