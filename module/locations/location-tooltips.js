// Replaces the useless default "Journal Entry" hover tooltip on cross-links into
// the Stonetop Locations and Stonetop Lore packs with that entry's one-line
// summary.
//
// The summary is authored as a `flags.stonetop.summary` on each journal (by the
// locations / lore generators) and read here from each pack's compendium index —
// no documents are loaded. The index is built lazily and cached; render hooks
// (registered in stonetop.js) call applyLocationTooltips() on the rendered HTML.

// Packs that carry hover summaries. Both the locations and lore generators stamp
// `flags.stonetop.summary` and cross-link into one another, so both are indexed.
const SUMMARY_PACKS = ["stonetop_pwd.stonetop-locations", "stonetop_pwd.stonetop-lore"];

let _indexPromise = null;

/**
 * Build (or return the cached) Map<uuid, summary> across every summary pack.
 * Caches the promise so concurrent callers share one in-flight build. Call once
 * on ready to warm the cache so the first hover is instant.
 */
export function ensureLocationSummaryIndex() {
	return _indexPromise ??= (async () => {
		const map = new Map();
		for (const packId of SUMMARY_PACKS) {
			const pack = game.packs?.get(packId);
			if (!pack) continue;
			const index = await pack.getIndex({ fields: ["flags.stonetop.summary"] });
			for (const entry of index) {
				const summary = entry.flags?.stonetop?.summary;
				if (summary) map.set(entry.uuid, summary);
			}
		}
		return map;
	})();
}

/**
 * Set data-tooltip = the entry summary on every content-link in `root` that
 * points at a summarized Stonetop journal (locations or lore). Safe to call
 * repeatedly.
 * @param {HTMLElement|jQuery} root
 */
export async function applyLocationTooltips(root) {
	const el = root?.jquery ? root[0] : root;
	if (!el?.querySelectorAll) return;
	const links = el.querySelectorAll("a.content-link[data-uuid]");
	if (!links.length) return;
	const map = await ensureLocationSummaryIndex();
	for (const a of links) {
		const summary = map.get(a.dataset.uuid);
		if (summary) a.dataset.tooltip = summary;
	}
}
