// Helpers that span ALL the GM-prep page families (threats, hazards and sites). They live
// here rather than in any one store because they reference all three; the scene-pin code
// and the on-canvas overlay treat those pins identically, resolving whichever kind an
// entry/page id or a document flag names.
import { threatPageById } from "../threats/threat-store.js";
import { hazardPageById } from "../hazards/hazard-store.js";
import { sitePageById } from "../sites/site-store.js";
import { wireSiteTableRoll } from "../sites/site-view.js";
import { STONETOP_SCOPE } from "../actors/character/StonetopFlags.js";

/**
 * Everything that varies by GM-prep kind, in ONE table.
 *
 * The flag that marks a document as this kind, how to resolve one of its pages, and any card
 * wiring only this kind carries. Kept together because they are the same fact — "the kinds are
 * threat, hazard and site" — and spelling it three ways is how a fourth kind comes to be added
 * to two of them.
 *
 * `wireCard` is a DELEGATED wiring: it binds one listener to a root that may hold cards of any
 * kind, and finds nothing when no card of its kind is there. That is what lets every host wire
 * the whole table blindly instead of testing which kinds it is about to draw.
 */
const GM_PREP_KINDS = {
	threat: { pageById: threatPageById },
	hazard: { pageById: hazardPageById },
	// A site card carries its own random tables (Book I p. 369), rollable in place.
	site:   { pageById: sitePageById, wireCard: wireSiteTableRoll },
};

/** Resolve the threat, hazard OR site page an entry/page id pair links to (as a scene Note
 *  does), or null. */
export function gmPrepPageById(entryId, pageId) {
	for (const { pageById } of Object.values(GM_PREP_KINDS)) {
		const page = pageById(entryId, pageId);
		if (page) return page;
	}
	return null;
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
