/**
 * THE INVOCATIONS A LIGHTBEARER STARTED WITH, told apart from the ones learned since.
 *
 * "You start knowing 2" (the Invocations insert, Book I p.146) is onboarding's Invocations step, and
 * Level Up step 5 adds one at each even level. Both land in the one list, `invocations.selected`, so a
 * re-run of onboarding that wrote its picks over that list wholesale wiped every Invocation learned at
 * level-up. The pair onboarding gave is stamped (`invocations.starting`), and a re-run replaces only
 * that pair: the rest are shown known and locked, and kept.
 */

/** The flag (under the system scope) holding the slugs onboarding gave, in the order picked. */
export const STARTING_INVOCATIONS_FLAG = "invocations.starting";

/** A list of slugs in one dependable shape: strings, no blanks, no repeats. */
function slugs(raw) {
	return [...new Set((Array.isArray(raw) ? raw : []).filter(Boolean).map(String))];
}

/**
 * Which of the known Invocations (`selected`) came from onboarding: the stamped ones still known, or
 * for a character from before the stamp, the first `startingCount` of them, since a level-up only ever
 * appends to the list. A playbook with no starting Invocations (anyone who borrows the Lightbearer's
 * list through Invoke the Sun God) started with none.
 */
export function startingInvocations(selected, starting, startingCount) {
	const known = slugs(selected);
	if (Array.isArray(starting)) {
		const stamped = new Set(slugs(starting));
		return known.filter(slug => stamped.has(slug));
	}
	return known.slice(0, Math.max(0, Math.trunc(Number(startingCount) || 0)));
}

/** The known Invocations that did NOT come from onboarding: the ones learned at level-up. */
export function learnedInvocations(selected, starting, startingCount) {
	const first = new Set(startingInvocations(selected, starting, startingCount));
	return slugs(selected).filter(slug => !first.has(slug));
}

/**
 * What a re-run of onboarding leaves: the new starting `picks`, then everything learned since, and the
 * stamp naming the picks. `selected = (old selected - old starting) U picks`.
 *
 * @returns {{selected: string[], starting: string[]}}
 */
export function rerunInvocations({ selected, starting, startingCount, picks }) {
	const next = slugs(picks);
	const kept = learnedInvocations(selected, starting, startingCount).filter(slug => !next.includes(slug));
	return { selected: [...next, ...kept], starting: next };
}
