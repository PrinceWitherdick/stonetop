// CRUD for threats. Each threat is its OWN JournalEntry (holding a single `threat`
// page), grouped in a per-steading "<Steading> Threats" Folder. The steading actor
// holds only a pointer flag to that folder (`steading.threatsFolderId`).
//
// Why one entry PER threat rather than one entry with many pages: Foundry transmits
// a whole JournalEntry — including pages the user can't observe — to any client that
// can see ANY page in it. So a shared entry would leak hidden threats' prose to
// players' clients (verified). Splitting one threat per entry contains that: a player
// granted a revealed threat only receives that threat's entry, not its siblings.
//
// NOTE — this is UI-level hiding, not a hard secret. v14 still broadcasts every WORLD
// JournalEntry (content included) to all clients regardless of `ownership.default`
// (see reference_foundry-world-docs-broadcast); ownership gates the sidebar/sheet/pin,
// not transmission, so a player with console access can still read an un-revealed
// threat. True server-side hiding would require a compendium pack with pack ownership.
// For GM prep at the table this trust model is acceptable; reveal remains an entry-level
// ownership flip, the standard Foundry "share journal" mechanism.
//
// The folder/list/create/rename CRUD is shared with hazards through makeGmPrepPageStore;
// the reveal / doom-tick / delete helpers below are entry-level and page-shape generic,
// so hazards reuse them directly rather than duplicating.
import { shareLevelFor } from "../journal/share-journal.js";
import { makeGmPrepPageStore } from "../journal/gm-prep-page-store.js";
import { DEFAULT_THREAT_TYPE, DEFAULT_PROXIMITY, normalizeThreatSeedExtras } from "./threat-types.js";

// Looked up lazily (not at module load) so the file imports cleanly outside Foundry.
const OWN = () => CONST.DOCUMENT_OWNERSHIP_LEVELS;

/** Normalize a creation seed into the threat page's system data. The plain threat creator
 *  only supplies type / instinct / proximity / gmMoves; every other field is left to the
 *  model's own defaults and authored in the editor. The Things-Below wizards (Book II) seed
 *  richer fields — themes / aspects / cleansing / a pre-built doom track / prose — which are
 *  copied through only when present, so an ordinary threat seed is unaffected. */
function _shapeSeed(seed) {
	return {
		type: seed.type ?? DEFAULT_THREAT_TYPE,
		instinct: String(seed.instinct ?? ""),
		proximity: seed.proximity ?? DEFAULT_PROXIMITY,
		gmMoves: (seed.gmMoves ?? []).map(String),
		...normalizeThreatSeedExtras(seed),
	};
}

const _store = makeGmPrepPageStore({
	pageType: "threat",
	entryFlag: "threat",
	folderFlagId: "threatsFolderId",
	folderForFlag: "threatsFor",
	folderSuffix: "Threats",
	defaultName: "New Threat",
	shapeSystem: _shapeSeed,
});

/** The id of the steading's Threats folder, if one has been created. */
export const threatsFolderId = _store.folderId;
/** Resolve the steading's Threats folder, or null. Never creates. */
export const getThreatsFolder = _store.getFolder;
/** The steading's threat JournalEntries (each holds one threat page), in sort order. */
export const listThreatEntries = _store.listEntries;
/** The single threat page inside a threat entry. */
export const threatPageOf = _store.pageOf;
/** Resolve a `threat` page from an entry/page id pair (as a scene Note links it), or null. */
export const threatPageById = _store.pageById;
/** The steading's threat pages, in order. */
export const listThreatPages = _store.listPages;
/** Resolve the steading's Threats folder, creating it (GM-only) on first use. */
export const ensureThreatsFolder = _store.ensureFolder;
/** Create a new threat as its own hidden (GM-only) JournalEntry holding one threat page. */
export const createThreat = _store.create;
/** Rename a threat everywhere its name is its identity: the page, the parent entry, and pins. */
export const setThreatName = _store.setName;

/** Whether a threat is revealed to players — driven by its ENTRY's baseline ownership. */
export function isThreatRevealed(page) {
	return (page?.parent?.ownership?.default ?? OWN().NONE) >= OWN().OBSERVER;
}

/** Tick / untick a grim portent's "come to pass" checkbox (full-array replace, since
 *  dotted array-index updates are unreliable on DataModel ArrayFields). */
export async function setPortentDone(page, index, done) {
	if (!page) return;
	const arr = foundry.utils.deepClone(page.system?.grimPortents ?? []);
	if (!Number.isInteger(index) || index < 0 || index >= arr.length) return;
	arr[index] = { ...arr[index], done: !!done };
	await page.update({ "system.grimPortents": arr });
}

/** Tick / untick the impending-doom checkbox. */
export async function setDoomDone(page, done) {
	if (page) await page.update({ "system.impendingDoom.done": !!done });
}

/**
 * Reveal a threat to players (or hide it) by flipping its ENTRY's baseline ownership.
 * OBSERVER lets players see the sheet card, the map pin, and open a read-only copy;
 * NONE hides all three and keeps the whole entry off their client (no content leak).
 */
export async function setThreatRevealed(page, revealed) {
	const entry = page?.parent;
	if (!entry) return;
	await entry.update({ "ownership.default": shareLevelFor(!!revealed, false) });
}

/**
 * Delete a threat (its whole entry) and any scene Note pins linked to it across all
 * scenes. Notes link back via `entryId`; GM-only (threats are GM prep).
 */
export async function deleteThreat(page) {
	const entry = page?.parent;
	if (!entry) return;
	const entryId = entry.id;
	if (game.user?.isGM && game.scenes) {
		for (const scene of game.scenes) {
			const noteIds = scene.notes.filter(n => n.entryId === entryId).map(n => n.id);
			if (noteIds.length) await scene.deleteEmbeddedDocuments("Note", noteIds).catch(() => {});
		}
	}
	await entry.delete();
}
