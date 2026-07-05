import { error } from "../utils/logger.js";

// Runs once on ready. Handles data migrations that were previously
// done via the pbtaSheetConfig hook when this was a module on PBTA.
export async function runStartupMigrations() {
	if (!game.user.isGM) return;
	await _ensureAllCharacterMoves().catch(error);
	await _ensureAllPossessionGrants().catch(error);
}

async function _ensureAllCharacterMoves() {
	for (const actor of game.actors) {
		if (actor.type !== "character") continue;
		await actor.typedActor?.ensureStartingMoves?.();
	}
}

// Back-fill bundled special-possession gear (Distillery's whisky/malt/stills, the
// Apiary's honey/smokers, etc.) onto characters that selected those possessions before
// the grants feature shipped. Runs once per possession per character (guarded by a
// per-actor applied flag), so it never resurrects gear a player has since deleted.
async function _ensureAllPossessionGrants() {
	for (const actor of game.actors) {
		if (actor.type !== "character") continue;
		await actor.typedActor?.ensurePossessionGrants?.();
	}
}
