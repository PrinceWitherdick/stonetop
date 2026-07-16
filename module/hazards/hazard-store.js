// CRUD for hazards. Deliberately the same architecture as threats (see threat-store.js
// for the full rationale): each hazard is its OWN JournalEntry holding a single `hazard`
// page, grouped in a per-steading "<Steading> Hazards" Folder pointed at by the steading
// flag `steading.hazardsFolderId`. One entry per hazard contains the player-visibility
// blast radius; reveal is the ENTRY's baseline-ownership flip and is UI-level hiding only
// (v14 still broadcasts world journals in full — reference_foundry-world-docs-broadcast).
//
// The folder/list/create/rename CRUD is shared with threats through makeGmPrepPageStore;
// the doom-track helpers (setPortentDone / setDoomDone) and the reveal helpers
// (isThreatRevealed / setThreatRevealed) in threat-store are page-shape and entry-level
// generic, so hazards reuse them directly rather than duplicating.
import { makeGmPrepPageStore } from "../journal/gm-prep-page-store.js";

/** Normalize a creator/editor payload into the hazard page's system data. */
export function shapeHazardSystem(seed = {}) {
	return {
		description: String(seed.description ?? ""),
		damageDie: seed.damageDie ?? "",
		damageEffects: (seed.damageEffects ?? []).map(String),
		damageExtra: String(seed.damageExtra ?? ""),
		certainDeath: !!seed.certainDeath,
		instinct: String(seed.instinct ?? ""),
		gmMoves: (seed.gmMoves ?? []).map(String),
		advanceTrigger: String(seed.advanceTrigger ?? ""),
		grimPortents: (seed.grimPortents ?? []).map(p => ({ text: String(p?.text ?? ""), done: !!p?.done })),
		impendingDoom: { text: String(seed.impendingDoom?.text ?? ""), done: !!seed.impendingDoom?.done },
		customPlayerMoves: (seed.customPlayerMoves ?? []).map(m => ({ label: String(m?.label ?? ""), text: String(m?.text ?? "") })),
	};
}

const _store = makeGmPrepPageStore({
	pageType: "hazard",
	entryFlag: "hazard",
	folderFlagId: "hazardsFolderId",
	folderForFlag: "hazardsFor",
	folderSuffix: "Hazards",
	defaultName: "New Hazard",
	shapeSystem: shapeHazardSystem,
});

/** The id of the steading's Hazards folder, if one has been created. */
export const hazardsFolderId = _store.folderId;
/** Resolve the steading's Hazards folder, or null. Never creates. */
export const getHazardsFolder = _store.getFolder;
/** The steading's hazard JournalEntries (each holds one hazard page), in sort order. */
export const listHazardEntries = _store.listEntries;
/** The single hazard page inside a hazard entry. */
export const hazardPageOf = _store.pageOf;
/** Resolve a `hazard` page from an entry/page id pair (as a scene Note links it), or null. */
export const hazardPageById = _store.pageById;
/** The steading's hazard pages, in order. */
export const listHazardPages = _store.listPages;
/** Resolve the steading's Hazards folder, creating it (GM-only) on first use. */
export const ensureHazardsFolder = _store.ensureFolder;
/** Create a new hazard as its own hidden (GM-only) JournalEntry holding one hazard page. */
export const createHazard = _store.create;
/** Rename a hazard everywhere its name is its identity: the page, the parent entry, and pins. */
export const setHazardName = _store.setName;

// Reveal/hide and delete are entry-level and carry no hazard-specific logic, so hazards
// reuse threats' helpers directly (see threat-store): reveal routes through the shared
// handleThreatRevealClick -> setThreatRevealed, and delete IS deleteThreat.
export { deleteThreat as deleteHazard } from "../threats/threat-store.js";
