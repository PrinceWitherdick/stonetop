// The six character stats in the canonical sheet display order (matches the
// `_STAT_KEYS` order the character sheet renders and rolls with).
export const STAT_KEYS = ["str", "dex", "int", "wis", "con", "cha"];

// Roll types a player may pick for a custom move: any stat, or "ask" (choose a
// stat each time). "" / absent means a no-roll narrative move.
export const CUSTOM_MOVE_ROLL_TYPES = [...STAT_KEYS, "ask"];

export function normalizeRollType(rollType) {
	if (rollType == null || rollType === "") return null;
	if (typeof rollType === "string") return rollType;
	if (typeof rollType === "object") {
		return normalizeRollType(
			rollType.value
			?? rollType.key
			?? rollType.id
			?? rollType.slug
			?? rollType.stat
			?? rollType.type
			?? null
		);
	}
	return String(rollType);
}
