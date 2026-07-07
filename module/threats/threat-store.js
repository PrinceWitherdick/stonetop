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
import { STONETOP_SCOPE, resolvedFlagProperty } from "../actors/character/StonetopFlags.js";
import { shareLevelFor } from "../journal/share-journal.js";
import { DEFAULT_THREAT_TYPE, DEFAULT_PROXIMITY } from "./threat-types.js";

// Looked up lazily (not at module load) so the file imports cleanly outside Foundry.
const OWN = () => CONST.DOCUMENT_OWNERSHIP_LEVELS;

/** The id of the steading's Threats folder, if one has been created. */
export function threatsFolderId(steadingActor) {
	return resolvedFlagProperty(steadingActor, "steading")?.threatsFolderId ?? null;
}

/** Resolve the steading's Threats folder, or null. Never creates. */
export function getThreatsFolder(steadingActor) {
	const id = threatsFolderId(steadingActor);
	return id ? (game.folders?.get(id) ?? null) : null;
}

/** The steading's threat JournalEntries (each holds one threat page), in sort order.
 *  For a player this only yields revealed entries — hidden ones aren't on their client. */
export function listThreatEntries(steadingActor) {
	const folder = getThreatsFolder(steadingActor);
	if (!folder) return [];
	return folder.contents
		.filter(e => e.getFlag?.(STONETOP_SCOPE, "threat"))
		.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
}

/** The single threat page inside a threat entry. */
export function threatPageOf(entry) {
	return entry?.pages?.find(p => p.type === "threat") ?? null;
}

/** Resolve a `threat` page from an entry/page id pair (as a scene Note links it), or null. */
export function threatPageById(entryId, pageId) {
	if (!entryId || !pageId) return null;
	const page = game.journal?.get(entryId)?.pages?.get(pageId);
	return page?.type === "threat" ? page : null;
}

/** The steading's threat pages, in order. */
export function listThreatPages(steadingActor) {
	return listThreatEntries(steadingActor).map(threatPageOf).filter(Boolean);
}

/** Whether a threat is revealed to players — driven by its ENTRY's baseline ownership. */
export function isThreatRevealed(page) {
	return (page?.parent?.ownership?.default ?? OWN().NONE) >= OWN().OBSERVER;
}

/** Resolve the steading's Threats folder, creating it (GM-only) on first use. */
export async function ensureThreatsFolder(steadingActor) {
	const existing = getThreatsFolder(steadingActor);
	if (existing) return existing;
	if (!game.user?.isGM) return null;

	const folder = await Folder.create({
		name: `${steadingActor.name} Threats`,
		type: "JournalEntry",
		flags: { [STONETOP_SCOPE]: { threatsFor: steadingActor.id } },
	});
	await steadingActor.typedActor.setFlags({ threatsFolderId: folder.id });
	return folder;
}

/** Normalize a creation seed into the threat page's system data. The guided creator
 *  only supplies type / instinct / proximity / gmMoves; every other field (doom track,
 *  stakes, prose, nested) is left to the model's own defaults and authored in the editor. */
function _shapeSeed(seed) {
	return {
		type: seed.type ?? DEFAULT_THREAT_TYPE,
		instinct: String(seed.instinct ?? ""),
		proximity: seed.proximity ?? DEFAULT_PROXIMITY,
		gmMoves: (seed.gmMoves ?? []).map(String),
	};
}

/**
 * Create a new threat as its own hidden (GM-only) JournalEntry holding one threat
 * page. Returns the page. The page's ownership stays INHERIT, so revealing the entry
 * reveals the page.
 */
export async function createThreat(steadingActor, seed = {}) {
	const folder = await ensureThreatsFolder(steadingActor);
	if (!folder) return null;

	const name = String(seed.name ?? "").trim() || "New Threat";
	const entry = await JournalEntry.create({
		name,
		folder: folder.id,
		ownership: { default: OWN().NONE },
		flags: { [STONETOP_SCOPE]: { threat: true } },
		pages: [{ type: "threat", name, system: _shapeSeed(seed) }],
	});
	return threatPageOf(entry);
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
 * Rename a threat everywhere its name is its identity: the page, the parent ENTRY (the
 * sidebar / share / delete key off it), and any placed scene Note pins (their label is
 * stamped at drop time). Keeps a rename from being half-applied to the page alone.
 */
export async function setThreatName(page, name) {
	const clean = String(name ?? "").trim() || "New Threat";
	if (!page) return;
	if (page.name !== clean) await page.update({ name: clean });
	const entry = page.parent;
	if (entry && entry.name !== clean) await entry.update({ name: clean });
	// Update any pins linked to this threat (GM-only; players can't edit scene notes).
	if (game.user?.isGM && game.scenes && entry) {
		for (const scene of game.scenes) {
			const updates = scene.notes
				.filter(n => n.entryId === entry.id && n.text !== clean)
				.map(n => ({ _id: n.id, text: clean }));
			if (updates.length) await scene.updateEmbeddedDocuments("Note", updates).catch(() => {});
		}
	}
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
