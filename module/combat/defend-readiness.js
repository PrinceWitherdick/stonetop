// Readiness held by the Defend basic move (Book I, Combat & Boons p.216).
//
// When you Defend (roll +CON), on a 10+ you hold 3 Readiness (4 if you bear a shield);
// on a 7-9 you hold 1 (2 with a shield). A borne shield's "+1 Readiness on a 7+" only
// applies to a hit, never a miss. The Heavy's Guardian move holds 1 extra at every tier
// and — uniquely — holds 1 even on a 6-. That extra circle lives on Defend's own track,
// so Guardian itself carries no resource track.
//
// You spend Readiness to suffer an attack's damage/effects for a ward, halve it, draw
// all attention to yourself, or strike back. You lose ALL held Readiness the moment you
// go on the offense (Clash / Let Fly), cease focusing on defense, or the threat passes.
//
// This module is deliberately Foundry-free (pure functions) so the hold/cap arithmetic
// can be unit-tested; StonetopCharacter wires it to the actor's flags and roll flow, and
// the sheet renders the pips.

// The base cap without a shield or Guardian: a 10+ Defend holds 3.
export const DEFEND_READINESS_BASE_CAP = 3;

/**
 * Readiness held for a Defend roll's PbtA tier.
 * @param {"success"|"partial"|"failure"} tier - from classifyResult(total).key
 * @param {{hasShield?: boolean, hasGuardian?: boolean}} [opts]
 * @returns {number}
 */
export function defendReadinessHold(tier, { hasShield = false, hasGuardian = false } = {}) {
	const guardian = hasGuardian ? 1 : 0;
	// A shield's +1 rides a 7+ hit only; on a miss the only source is Guardian's "hold 1".
	const shield = hasShield ? 1 : 0;
	if (tier === "success") return DEFEND_READINESS_BASE_CAP + shield + guardian;
	if (tier === "partial") return 1 + shield + guardian;
	return guardian;
}

/**
 * Highest Readiness a Defend can leave the character holding — the number of circles
 * to render. A borne shield adds +1, the Guardian move another +1.
 * @param {{hasShield?: boolean, hasGuardian?: boolean}} [opts]
 * @returns {number}
 */
export function defendReadinessCap({ hasShield = false, hasGuardian = false } = {}) {
	return DEFEND_READINESS_BASE_CAP + (hasShield ? 1 : 0) + (hasGuardian ? 1 : 0);
}
