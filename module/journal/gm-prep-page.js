// Helpers that span ALL the GM-prep page families (threats, hazards and sites). They live
// here rather than in any one store because they reference all three; the scene-pin code
// and the on-canvas overlay treat those pins identically, resolving whichever kind an
// entry/page id or a document flag names.
import { threatPageById, threatsEntryId } from "../threats/threat-store.js";
import { hazardPageById, hazardsEntryId } from "../hazards/hazard-store.js";
import { sitePageById, sitesEntryId } from "../sites/site-store.js";
import { wireSiteTableRoll } from "../sites/site-view.js";
import { STONETOP_SCOPE } from "../actors/character/StonetopFlags.js";

/**
 * Everything that varies by GM-prep kind, in ONE table.
 *
 * The flag that marks a document as this kind, how to resolve one of its pages, where that kind
 * keeps its journal entry, and any card wiring only this kind carries. Kept together because they
 * are the same fact — "the kinds are threat, hazard and site" — and spelling it three ways is how
 * a fourth kind comes to be added to two of them.
 *
 * `wireCard` is a DELEGATED wiring: it binds one listener to a root that may hold cards of any
 * kind, and finds nothing when no card of its kind is there. That is what lets every host wire
 * the whole table blindly instead of testing which kinds it is about to draw.
 */
const GM_PREP_KINDS = {
	threat: { pageById: threatPageById, entryId: threatsEntryId },
	hazard: { pageById: hazardPageById, entryId: hazardsEntryId },
	// A site card carries its own random tables (Book I p. 369), rollable in place.
	site:   { pageById: sitePageById, entryId: sitesEntryId, wireCard: wireSiteTableRoll },
};

/**
 * The kind names alone, for the hosts that need to iterate or test them without caring how a
 * kind resolves its pages — the prep tabs key their collapse state and view-model caches off
 * this, and use it as the cheap `doc.type` discriminator on world-wide page hooks.
 *
 * Exported so that list is not spelled a fourth time: this table is the one place a kind is
 * declared, and the docblock above says why.
 */
export const GM_PREP_KIND_IDS = Object.freeze(Object.keys(GM_PREP_KINDS));

/** Resolve the threat, hazard OR site page an entry/page id pair links to (as a scene Note
 *  does), or null. */
export function gmPrepPageById(entryId, pageId) {
	for (const { pageById } of Object.values(GM_PREP_KINDS)) {
		const page = pageById(entryId, pageId);
		if (page) return page;
	}
	return null;
}

/**
 * Delete a GM-prep page of ANY kind: the page, its scene pins, and the journal entry behind it
 * once nothing is left in it.
 *
 * There is genuinely one deletion here — `deleteHazard` and `deleteSite` are both `deleteThreat`
 * re-exported, because the work is page-shaped rather than kind-shaped. Named neutrally and
 * offered from the module that owns the kind table, so a caller with a page and no particular
 * kind in mind stops having to pick one of the three aliases and present one behaviour as three.
 */
export { deleteThreat as deleteGmPrepPage } from "../threats/threat-store.js";

/**
 * The journal entries a steading files its prep in, by id — every kind's, with the ones this
 * steading has not minted yet dropped.
 *
 * From the table for the reason the table exists: a host asking "is this page write one of
 * ours?" should not be re-listing the kinds by hand, because a kind added above but missed
 * there renders and wires correctly and then never refreshes, which reads as a stale tab
 * rather than as a missing registration.
 */
export function gmPrepEntryIds(steading) {
	if (!steading) return [];
	return Object.values(GM_PREP_KINDS).map(({ entryId }) => entryId(steading)).filter(Boolean);
}

/** Whether a JournalEntry / Note document is one of our GM-prep kinds. */
export function isGmPrepDoc(doc) {
	return Object.keys(GM_PREP_KINDS).some(flag => !!doc?.getFlag?.(STONETOP_SCOPE, flag));
}

/**
 * Wire every kind's own card controls on a delegated root.
 *
 * For the hosts that draw cards of MORE than one kind at once — the steading sheet's prep tabs
 * and the on-canvas overlay — so neither has to name a particular kind, and a fourth kind's
 * controls light up in both the moment its entry above gains a `wireCard`. (A single-kind host,
 * like a page sheet, reaches for `gmPrepCardWiring` instead.)
 *
 * @param {HTMLElement} root
 * @param {(el:HTMLElement) => any} resolvePage  the page (or a promise of it) for a clicked element
 */
export function wireGmPrepCardExtras(root, resolvePage) {
	for (const { wireCard } of Object.values(GM_PREP_KINDS)) wireCard?.(root, resolvePage);
}

/** One kind's card wiring, or undefined where that kind's card has no controls of its own. */
export function gmPrepCardWiring(kind) {
	return GM_PREP_KINDS[kind]?.wireCard;
}
