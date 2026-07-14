// CRUD for hazards. Deliberately the same architecture as threats (see
// threat-store.js for the full rationale): each hazard is its OWN JournalEntry
// holding a single `hazard` page, grouped in a per-steading "<Steading> Hazards"
// Folder pointed at by the steading flag `steading.hazardsFolderId`. One entry per
// hazard contains the player-visibility blast radius; reveal is the ENTRY's
// baseline-ownership flip and is UI-level hiding only (v14 still broadcasts world
// journals in full — reference_foundry-world-docs-broadcast).
//
// The doom-track helpers (setPortentDone / setDoomDone) and the reveal helpers
// (isThreatRevealed / setThreatRevealed) in threat-store are page-shape and
// entry-level generic, so hazards reuse them directly rather than duplicating.
import { STONETOP_SCOPE, resolvedFlagProperty } from "../actors/character/StonetopFlags.js";

// Looked up lazily (not at module load) so the file imports cleanly outside Foundry.
const OWN = () => CONST.DOCUMENT_OWNERSHIP_LEVELS;

/** The id of the steading's Hazards folder, if one has been created. */
export function hazardsFolderId(steadingActor) {
	return resolvedFlagProperty(steadingActor, "steading")?.hazardsFolderId ?? null;
}

/** Resolve the steading's Hazards folder, or null. Never creates. */
export function getHazardsFolder(steadingActor) {
	const id = hazardsFolderId(steadingActor);
	return id ? (game.folders?.get(id) ?? null) : null;
}

/** The steading's hazard JournalEntries (each holds one hazard page), in sort order.
 *  For a player this only yields revealed entries — hidden ones aren't on their client. */
export function listHazardEntries(steadingActor) {
	const folder = getHazardsFolder(steadingActor);
	if (!folder) return [];
	return folder.contents
		.filter(e => e.getFlag?.(STONETOP_SCOPE, "hazard"))
		.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
}

/** The single hazard page inside a hazard entry. */
export function hazardPageOf(entry) {
	return entry?.pages?.find(p => p.type === "hazard") ?? null;
}

/** Resolve a `hazard` page from an entry/page id pair (as a scene Note links it), or null. */
export function hazardPageById(entryId, pageId) {
	if (!entryId || !pageId) return null;
	const page = game.journal?.get(entryId)?.pages?.get(pageId);
	return page?.type === "hazard" ? page : null;
}

/** The steading's hazard pages, in order. */
export function listHazardPages(steadingActor) {
	return listHazardEntries(steadingActor).map(hazardPageOf).filter(Boolean);
}

/** Resolve the steading's Hazards folder, creating it (GM-only) on first use. */
export async function ensureHazardsFolder(steadingActor) {
	const existing = getHazardsFolder(steadingActor);
	if (existing) return existing;
	if (!game.user?.isGM) return null;

	const folder = await Folder.create({
		name: `${steadingActor.name} Hazards`,
		type: "JournalEntry",
		flags: { [STONETOP_SCOPE]: { hazardsFor: steadingActor.id } },
	});
	await steadingActor.typedActor.setFlags({ hazardsFolderId: folder.id });
	return folder;
}

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

/**
 * Create a new hazard as its own hidden (GM-only) JournalEntry holding one hazard
 * page. Returns the page. The page's ownership stays INHERIT, so revealing the entry
 * reveals the page.
 */
export async function createHazard(steadingActor, seed = {}) {
	const folder = await ensureHazardsFolder(steadingActor);
	if (!folder) return null;

	const name = String(seed.name ?? "").trim() || "New Hazard";
	const entry = await JournalEntry.create({
		name,
		folder: folder.id,
		ownership: { default: OWN().NONE },
		flags: { [STONETOP_SCOPE]: { hazard: true } },
		pages: [{ type: "hazard", name, system: shapeHazardSystem(seed) }],
	});
	return hazardPageOf(entry);
}

/**
 * Rename a hazard everywhere its name is its identity: the page, the parent ENTRY
 * (the sidebar / share / delete key off it), and any placed scene Note pins (their
 * label is stamped at drop time). Same shape as setThreatName.
 */
export async function setHazardName(page, name) {
	const clean = String(name ?? "").trim() || "New Hazard";
	if (!page) return;
	if (page.name !== clean) await page.update({ name: clean });
	const entry = page.parent;
	if (entry && entry.name !== clean) await entry.update({ name: clean });
	if (game.user?.isGM && game.scenes && entry) {
		for (const scene of game.scenes) {
			const updates = scene.notes
				.filter(n => n.entryId === entry.id && n.text !== clean)
				.map(n => ({ _id: n.id, text: clean }));
			if (updates.length) await scene.updateEmbeddedDocuments("Note", updates).catch(() => {});
		}
	}
}

// Reveal/hide and delete are entry-level and carry no hazard-specific logic, so hazards
// reuse threats' helpers directly (see threat-store): reveal routes through the shared
// handleThreatRevealClick -> setThreatRevealed, and delete IS deleteThreat.
export { deleteThreat as deleteHazard } from "../threats/threat-store.js";
