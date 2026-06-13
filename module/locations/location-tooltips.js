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

// The bestiary codex is reference material a GM may withhold from players: its
// journal pack carries the same `flags.stonetop.summary` but is GM-gated. Links
// into it (e.g. the creatures named in the Setting Overview) only get their hover
// summary and stay clickable for users who can view the pack (the GM, or a player
// granted Observer+); for everyone else the link is flattened to plain text.
const BESTIARY_JOURNAL_PACK = "stonetop_pwd.stonetop-bestiary-journal";

let _indexPromise = null;
let _bestiaryIndexPromise = null;

/**
 * Build (or return the cached) Map<uuid, summary> across every summary pack.
 * Caches the promise so concurrent callers share one in-flight build. Call once
 * on ready to warm the cache so the first hover is instant.
 */
export function ensureLocationSummaryIndex() {
	return _indexPromise ??= (async () => {
		const map = new Map();
		for (const packId of SUMMARY_PACKS) await _indexPackSummaries(map, packId);
		// Also index world journals carrying the summary flag — e.g. the copies
		// seeded into the world on first load (SeedCompendiums.js), whose
		// cross-links are rewritten to world uuids and so wouldn't match the
		// compendium-keyed entries above.
		for (const entry of game.journal ?? []) {
			const summary = entry.flags?.stonetop?.summary;
			if (summary) map.set(entry.uuid, summary);
		}
		return map;
	})();
}

/** Drop the cached summary index so the next lookup rebuilds it — call after
 *  world journals carrying summaries are added (e.g. compendium seeding). */
export function invalidateLocationSummaryIndex() {
	_indexPromise = null;
	_bestiaryIndexPromise = null;
}

/** True if the current user may view the bestiary codex pack — the GM always,
 *  or a player a GM has granted Observer+ on the pack. */
function canUseBestiaryLinks() {
	if (globalThis.game?.user?.isGM) return true;
	const pack = globalThis.game?.packs?.get?.(BESTIARY_JOURNAL_PACK);
	if (!pack || typeof pack.getUserLevel !== "function") return false;
	const observer = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OBSERVER ?? 2;
	return pack.getUserLevel(globalThis.game.user) >= observer;
}

/** Index every summarized entry of one compendium pack into `map`, keyed by uuid
 *  (falling back to a constructed Compendium uuid for indexes that omit it). */
async function _indexPackSummaries(map, packId) {
	const pack = globalThis.game?.packs?.get?.(packId);
	if (!pack) return;
	const index = await pack.getIndex({ fields: ["flags.stonetop.summary"] });
	for (const entry of index) {
		const summary = entry.flags?.stonetop?.summary;
		if (summary) map.set(entry.uuid ?? `Compendium.${pack.collection}.JournalEntry.${entry._id}`, summary);
	}
}

/** Set `data-tooltip` on each link from `map` keyed by its target uuid. */
function _applyLinkSummaries(links, map) {
	for (const a of links) {
		const summary = map.get(a.dataset.uuid);
		if (summary) a.dataset.tooltip = summary;
	}
}

/** Build (or return the cached) Map<uuid, summary> for the bestiary codex pack.
 *  Only built for users who can view it — non-privileged players never touch it. */
function ensureBestiarySummaryIndex() {
	return _bestiaryIndexPromise ??= (async () => {
		const map = new Map();
		await _indexPackSummaries(map, BESTIARY_JOURNAL_PACK);
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

	const bestiaryLinks = [], otherLinks = [];
	for (const a of links) {
		(a.dataset.uuid.includes(".stonetop-bestiary-journal.") ? bestiaryLinks : otherLinks).push(a);
	}

	_applyLinkSummaries(otherLinks, await ensureLocationSummaryIndex());
	if (bestiaryLinks.length) await applyBestiaryLinkGating(bestiaryLinks);
}

// Bestiary links: GM/privileged users get the creature's concept on hover and a
// working click-through; everyone else has the link flattened to plain text so
// there's nothing to hover and nothing to click.
async function applyBestiaryLinkGating(links) {
	if (!canUseBestiaryLinks()) {
		for (const a of links) a.replaceWith(document.createTextNode(a.textContent));
		return;
	}
	_applyLinkSummaries(links, await ensureBestiarySummaryIndex());
}
