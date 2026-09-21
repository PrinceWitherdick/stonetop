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
 * Whether a roster slot's stored HP leaves that member standing, on the sheet's own terms
 * (`_clampHp`): nothing stored is full HP, and anything that reads as a number counts at that number.
 */
function memberStanding(raw) {
	return raw == null || !Number.isFinite(Number(raw)) || Number(raw) > 0;
}

/**
 * How many of a group follower's members are still standing, read off the character's flags: the
 * crew (named individuals, then the anonymous tail) or a custom GROUP follower. Null for any other
 * follower, or a custom one that is not a group.
 *
 * @param {object} flags  the character's system flags
 * @param {{ftype: string, slug?: string}} which  the card, as a follower actor's `followerOrigin` names it
 * @returns {{standing: number, size: number}|null}
 */
/** How many of the first `count` HP entries are a member still standing. */
function countStanding(hp, count) {
	let standing = 0;
	for (let i = 0; i < count; i += 1) if (memberStanding(hp[i])) standing += 1;
	return standing;
}

export function groupFollowerStanding(flags, { ftype, slug = "" } = {}) {
	if (ftype === "crew") {
		const crew = flags?.crew;
		if (!crew) return null;
		const named = Array.isArray(crew.individuals) ? crew.individuals.length : 0;
		const size = effectiveCrewSize(crew.size, named);
		const individualsHp = crew.individualsHp ?? {};
		const memberHp = Array.isArray(crew.memberHp) ? crew.memberHp : [];
		return { standing: countStanding(individualsHp, named) + countStanding(memberHp, size - named), size };
	}
	if (ftype === "custom") {
		const follower = flags?.customFollowers?.[slug];
		if (!follower?.isGroup) return null;
		const size = customGroupSize(follower);
		const memberHp = Array.isArray(follower.memberHp) ? follower.memberHp : [];
		return { standing: countStanding(memberHp, size), size };
	}
	return null;
}

/** A named crew member's own tags: their extra tag and their traits, as the card's own Order button counts them. */
function ownTags(individual) {
	const traits = Array.isArray(individual?.traits) ? individual.traits : [];
	return [individual?.tag, ...traits].map(t => String(t ?? "").trim()).filter(Boolean);
}

/**
 * A group follower's members who are still standing, in roster order, as someone ordering one of them
 * picks them: a key, the name their roster row carries, and the tags that are theirs alone.
 *
 * The book lets a group be split this way: "When a PC directs an individual member of a group, they can
 * trigger moves as if they were a follower themselves. The group's tags and moves apply, plus any unique
 * tags or moves they have as an individual" (Book I p.471). So `tags` here is only the member's OWN; the
 * group's are the caller's to add. A member at 0 HP is out of the action (p.469) and is not offered.
 *
 * Named by the same labellers the roster rows use, so "Crew member 4" here is the row that says so. The
 * character sheet's `_followerMemberNames` walks the same roster for Have What They Need, where a downed
 * member still counts.
 *
 * @param {object} flags  the character's system flags
 * @param {{ftype: string, slug?: string}} which  the card
 * @returns {Array<{key: string, name: string, tags: string[]}>}  empty for anyone but a group
 */
export function groupFollowerMembers(flags, { ftype, slug = "" } = {}) {
	const members = [];
	if (ftype === "crew") {
		const crew = flags?.crew;
		if (!crew) return members;
		const named = Array.isArray(crew.individuals) ? crew.individuals : [];
		const individualsHp = crew.individualsHp ?? {};
		named.forEach((individual, i) => {
			if (!memberStanding(individualsHp[i])) return;
			const name = String(individual?.name ?? "").trim() || crewIndividualLabel(i);
			members.push({ key: `named:${i}`, name, tags: ownTags(individual) });
		});
		const memberHp = Array.isArray(crew.memberHp) ? crew.memberHp : [];
		const anonymous = crewAnonymousCount(crew);
		for (let i = 0; i < anonymous; i += 1) {
			if (memberStanding(memberHp[i])) members.push({ key: `anon:${i}`, name: crewAnonMemberLabel(named.length, i), tags: [] });
		}
		return members;
	}
	if (ftype === "custom") {
		const follower = flags?.customFollowers?.[slug];
		if (!follower?.isGroup) return members;
		const memberHp = Array.isArray(follower.memberHp) ? follower.memberHp : [];
		const size = customGroupSize(follower);
		for (let i = 0; i < size; i += 1) {
			if (memberStanding(memberHp[i])) members.push({ key: `member:${i}`, name: customGroupMemberLabel(i), tags: [] });
		}
	}
	return members;
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

/**
 * What to call the Nth member of a custom GROUP follower, every one of whom is anonymous. The
 * roster rows and the Have What They Need picker both print it, and the picker writes it into
 * saved gear ("litter (Member 2)"), so the two must not word it differently.
 */
export function customGroupMemberLabel(index) {
	return `Member ${Number(index) + 1}`;
}
