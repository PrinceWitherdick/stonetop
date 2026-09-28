/**
 * Gear a move hands over only when it is taken at the start of play. Armored, the same move in
 * the Heavy's, the Judge's and the Marshal's playbooks: "If you take this move at the start of
 * play, add an iron hauberk, bronze cuirass, or scale coat to your inventory (all are 2 armor,
 * warm, cumbersome)." The one catalog item is all three (hauberk-iron: "Hauberk/cuirass/scale,
 * iron or bronze").
 *
 * "At the start of play" is onboarding: the either/or starting move it stamps (the Heavy's
 * Armored OR Uncanny Reflexes) and its free pick (the Judge's and Marshal's). A level-up or a
 * tick on the Moves tab gives nothing. The move remembers what it added (START_GEAR_FLAG), so a
 * re-run of onboarding that drops the move takes back that gear and never a hauberk the player
 * added themselves. See StonetopCharacter#_grantStartGear / #_releaseStartGear.
 *
 * Pure: no Foundry global is touched.
 */

// Move name -> the special item's slug (packs/src/stonetop-items/inventory-items).
export const START_OF_PLAY_GEAR = Object.freeze({
	Armored: "hauberk-iron",
});

// The item flag on the move: the special item's slug it added, carried and worn.
export const START_GEAR_FLAG = "startGear";

// The special item's slug a move hands over at the start of play, or null.
export function startOfPlayGear(moveName) {
	return START_OF_PLAY_GEAR[moveName] ?? null;
}
