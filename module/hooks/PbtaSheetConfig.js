import { error } from "../utils/logger.js";

// Runs once on ready. Handles data migrations that were previously done via the pbtaSheetConfig
// hook when this was a module on PBTA. Each is a per-character back-fill, guarded by its own
// per-actor "applied" flag so it never resurrects data a player has since removed:
//   • ensureStartingMoves    — the character's starting playbook moves.
//   • ensurePossessionGrants — bundled special-possession gear (Distillery's whisky/malt/stills,
//                              the Apiary's honey/smokers, …) for characters that selected those
//                              possessions before the grants feature shipped.
//   • ensureSeekerLeadCard   — the lead card for Seekers created before that feature (their
//                              onboarding "Lead" arcana pick was stored only as a role).
const MIGRATION_METHODS = ["ensureStartingMoves", "ensurePossessionGrants", "ensureSeekerLeadCard"];

export async function runStartupMigrations() {
	if (!game.user.isGM) return;
	// Per-migration error isolation (matching the original .catch-per-call): a failure in one
	// migration is logged and the remaining migrations still run.
	for (const method of MIGRATION_METHODS) {
		await _ensureAllCharacters(method).catch(error);
	}
}

// Run one per-character migration method across every character actor.
async function _ensureAllCharacters(method) {
	for (const actor of game.actors) {
		if (actor.type !== "character") continue;
		await actor.typedActor?.[method]?.();
	}
}
