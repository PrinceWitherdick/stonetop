// Machine-checkable per-stat prerequisites for a move. Stored as
// `system.requirement.stats`: a map of stat key → minimum value (e.g. the Heavy's
// Musclebound, "Requires Strength +2 or higher" → { str: 2 }). A move is gated until
// every listed stat meets its minimum. This is distinct from the free-text
// `requirement.note`, which stays display-only because the engine can't verify it
// (e.g. the Would-Be Hero's "All 6 marks in Potential for Greatness").

// Human-readable label for a stat-requirement map: "STR +2" (or "STR +2, DEX +1" when
// more than one stat is gated). Null when there are no stat requirements to show.
// The stat abbreviation is just the key upper-cased (str → STR) for all six stats.
export function statRequirementLabel(stats) {
	if (!stats) return null;
	const parts = Object.entries(stats).map(([key, min]) => `${key.toUpperCase()} +${min}`);
	return parts.length ? parts.join(", ") : null;
}

// True when the actor fails any listed stat minimum. `actorStats` is a plain map of
// stat key → current value; an absent stat counts as 0. Empty/absent requirements are
// never unmet (so non-stat-gated moves are unaffected).
export function statRequirementsUnmet(stats, actorStats = {}) {
	if (!stats) return false;
	return Object.entries(stats).some(([key, min]) => (actorStats[key] ?? 0) < min);
}
