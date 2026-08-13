// CRUD for sites. Deliberately the same architecture as threats and hazards (see
// threat-store.js for the full rationale): every site is a `site` page of ONE hidden
// JournalEntry named "<Steading> Sites", pointed at by the steading flag
// `steading.sitesEntryId`. Sites are pure GM prep, never shared with players, so the
// entry stays NONE-owned and a single many-page journal leaks nothing.
//
// The entry/list/create/rename CRUD is shared with threats and hazards through
// makeGmPrepPageStore; the delete helper in threat-store (page + its scene pins, dropping
// an emptied journal) is page-shape generic, so sites reuse it directly.
import { makeGmPrepPageStore } from "../journal/gm-prep-page-store.js";

/** A list of trimmed, non-empty strings from a seed's list field. */
const cleanLines = (arr) => (Array.isArray(arr) ? arr : []).map(s => String(s ?? "").trim()).filter(Boolean);

/** Keep a row only if at least one of its fields carries text. */
const someText = (row, keys) => keys.some(k => String(row?.[k] ?? "").trim());

/** Normalize a creator/editor payload into the site page's system data. */
export function shapeSiteSystem(seed = {}) {
	const rows = (arr, keys) => (Array.isArray(arr) ? arr : [])
		.map(row => Object.fromEntries(keys.map(k => [k, String(row?.[k] ?? "").trim()])))
		.filter(row => someText(row, keys));
	return {
		description: String(seed.description ?? ""),
		why: String(seed.why ?? "").trim(),
		manner: String(seed.manner ?? ""),
		mannerLabel: String(seed.mannerLabel ?? ""),
		// A pick with no result is nothing at all, so those rows go (unlike a question,
		// which is worth keeping unanswered).
		picks: rows(seed.picks, ["key", "label", "value"]).filter(p => p.value),
		regionId: String(seed.regionId ?? ""),
		regionLabel: String(seed.regionLabel ?? ""),
		terrain: String(seed.terrain ?? "").trim(),
		connections: cleanLines(seed.connections),
		questions: rows(seed.questions, ["prompt", "answer"]),
		timeline: rows(seed.timeline, ["when", "text"]),
		denizens: rows(seed.denizens, ["name", "notes"]),
		dangers: cleanLines(seed.dangers),
		discoveries: cleanLines(seed.discoveries),
		outside: cleanLines(seed.outside),
		inside: cleanLines(seed.inside),
		// An area's description is a textarea, so it keeps its interior line breaks; only
		// fully blank areas are dropped.
		areas: (Array.isArray(seed.areas) ? seed.areas : [])
			.map(a => ({
				title: String(a?.title ?? "").trim(),
				description: String(a?.description ?? ""),
				contents: String(a?.contents ?? ""),
				exits: String(a?.exits ?? "").trim(),
			}))
			.filter(a => someText(a, ["title", "description", "contents", "exits"])),
		plans: cleanLines(seed.plans),
		// A table with a caption but no rows is still worth keeping (it's a note to fill in);
		// one with neither is not.
		randomTables: (Array.isArray(seed.randomTables) ? seed.randomTables : [])
			.map(t => ({ caption: String(t?.caption ?? "").trim(), rows: cleanLines(t?.rows) }))
			.filter(t => t.caption || t.rows.length),
	};
}

const _store = makeGmPrepPageStore({
	pageType: "site",
	entryFlag: "site",
	entryFlagId: "sitesEntryId",
	entrySuffix: "Sites",
	defaultName: "New Site",
	shapeSystem: shapeSiteSystem,
});

/** The id of the steading's Sites journal, if one has been created. */
export const sitesEntryId = _store.entryId;
/** Resolve the steading's Sites journal, or null. Never creates. */
export const getSitesEntry = _store.getEntry;
/** Resolve a `site` page from an entry/page id pair (as a scene Note links it), or null. */
export const sitePageById = _store.pageById;
/** The steading's site pages, in order. */
export const listSitePages = _store.listPages;
/** Resolve the steading's Sites journal, creating it (GM-only) on first use. */
export const ensureSitesEntry = _store.ensureEntry;
/** Create a new site as a page on the steading's Sites journal. */
export const createSite = _store.create;
/** Rename a site everywhere its name is its identity: the page and its scene pins. */
export const setSiteName = _store.setName;

// Delete carries no site-specific logic (it removes a page + its scene pins and tidies an
// empty journal), so sites reuse threats' helper directly.
export { deleteThreat as deleteSite } from "../threats/threat-store.js";
