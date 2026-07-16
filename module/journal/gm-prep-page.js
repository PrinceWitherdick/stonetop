// Helpers that span BOTH GM-prep page families (threats and hazards). They live here
// rather than in either store because they reference both; the scene-pin code and the
// on-canvas overlay treat a threat and a hazard pin identically, resolving whichever kind
// an entry/page id or a document flag names.
import { threatPageById } from "../threats/threat-store.js";
import { hazardPageById } from "../hazards/hazard-store.js";
import { STONETOP_SCOPE } from "../actors/character/StonetopFlags.js";

/** Resolve the threat OR hazard page an entry/page id pair links to (as a scene Note does), or null. */
export function gmPrepPageById(entryId, pageId) {
	return threatPageById(entryId, pageId) ?? hazardPageById(entryId, pageId);
}

/** Whether a JournalEntry / Note document is one of our GM-prep kinds (threat or hazard). */
export function isGmPrepDoc(doc) {
	return !!(doc?.getFlag?.(STONETOP_SCOPE, "threat") || doc?.getFlag?.(STONETOP_SCOPE, "hazard"));
}
