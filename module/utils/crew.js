// Group-follower roster arithmetic: how many bodies a crew has, and how many of them are still
// anonymous. Shared because three places have to agree about it — the sheet that draws the roster,
// the Expedition outfit readout, and the portrait store that has to refuse a write aimed past the
// end of the roster (actors/character/roster-portraits.js).

// Does a character's crew meaningfully exist? True when any defining field is set — a name,
// tags, an instinct, a cost, or at least one named individual. Shared by the sheet's follower
// panel and the Expedition outfit readout so the "is there a crew" question is asked one way.
export function crewExists(crew) {
	return !!(crew && (crew.name || crew.tags?.length || crew.instinct || crew.cost || crew.individuals?.length));
}

// Hard cap on crew headcount, so a fat-fingered roster size can't build a
// thousand-member anonymous list (and a thousand-die group HP pool).
export const CREW_SIZE_MAX = 99;

/**
 * The crew's real headcount: the stored size, defaulting to the rulebook's half-dozen when unset,
 * and never fewer than the members who have been named. An explicit 0 is honoured, so emptying the
 * roster doesn't spring back to six.
 */
export function effectiveCrewSize(rawSize, namedCount) {
	// `rawSize == null` first, because Number(null) is 0 — so a null size would have read as a
	// deliberate "this crew has nobody in it" and silently emptied the roster, where it means the
	// same thing an absent one does. An explicit 0 still gets through and is still honoured.
	const n = rawSize == null ? NaN : Number(rawSize);
	const base = Number.isFinite(n) ? Math.max(0, n) : 6;
	return Math.max(namedCount, base);
}

/** How many of the crew are still anonymous — the length of the roster's unnamed tail. */
export function crewAnonymousCount(crew) {
	const named = Array.isArray(crew?.individuals) ? crew.individuals.length : 0;
	return Math.max(0, effectiveCrewSize(crew?.size, named) - named);
}

/**
 * A custom GROUP follower's headcount. Two is both the floor and the default: a group of one is a
 * single follower, which is a different card, so a record with no size stored yet still has two
 * members on the roster. Every member of one of these is anonymous — only the crew names its own.
 */
export function customGroupSize(follower) {
	return Math.max(2, Math.min(CREW_SIZE_MAX, Math.trunc(Number(follower?.size) || 0) || 2));
}

/**
 * What to call the Nth ANONYMOUS crew member — the unnamed tail that starts where the named
 * individuals stop, so the roster numbers read straight down past them.
 *
 * Lives here, beside the arithmetic it depends on, because the sheet draws this label and the
 * ledger has to recognise it: `utils/ledger-categories.js` files these entries by matching
 * "Crew member" at the head of the string, so the wording is a contract, not a caption.
 */
export function crewAnonMemberLabel(namedCount, index) {
	return `Crew member ${Number(namedCount ?? 0) + Number(index) + 1}`;
}

/**
 * What to call a NAMED individual who has not been given a name yet. They sit inside the named
 * block, so they number from the top of the roster — unlike the anonymous tail above.
 */
export function crewIndividualLabel(index) {
	return `Crew member ${Number(index) + 1}`;
}
