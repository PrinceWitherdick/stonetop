// Playbook special possessions that grant followers (Moves & Gear handouts). These
// ship as free-text gear on the playbook (e.g. the Would-be Hero's "A good dog"),
// so they render as possession text on the gear tab but never became Followers-tab
// cards. This catalog mirrors those stat lines as buildCustomFollower inputs so the
// Followers tab can offer a one-click "Add as follower" — materializing a real,
// editable card (the group ones use the group roster + group-fight tools).
//
// Keyed by the possession's slug (matching specialPossessions.options[].slug on the
// playbook). `sourceUuid` (`possession:<slug>`) dedupes re-adds, exactly like the
// arcana summons. Where the playbook offers a tag choice (the dog is a retriever OR a
// herder), `choiceTags` names the choice slugs that are tags, and the one the player
// picked on the possession leads the card's tags. Where the playbook prints a headcount
// range ("Hounds, 2-3 followers"), `sizeChoices` lists it: the sheet asks which when the
// group is added, and `size` is the answer taken when none is given.

export const POSSESSION_FOLLOWER_CATALOG = {
	// The Would-be Hero — "A good dog" (single follower).
	"a-good-dog": {
		name:       "Good dog",
		typeLabel:  "a good dog",
		portraitIcon: "fas fa-dog",
		tags:       ["keen-nosed", "clever"],
		choiceTags: ["retriever", "herder"],
		hp:         6,
		damage:     "d6 (hand, grabby)",
		instinct:   "to play",
		cost:       "affection",
		sourceUuid: "possession:a-good-dog",
	},
	// The Ranger — "Hounds" (2–3 followers → a group).
	"hounds": {
		name:       "Hounds",
		typeLabel:  "hounds",
		portraitIcon: "fas fa-dog",
		tags:       ["trackers", "keen-nosed", "fast"],
		hp:         6,
		damage:     "d6 (hand, grabby)",
		instinct:   "to give chase",
		cost:       "training",
		isGroup:    true,
		size:       2,
		sizeChoices: [2, 3],
		sourceUuid: "possession:hounds",
	},
	// The Blessed — "Mastiffs" (2–3 followers → a group).
	"mastiffs": {
		name:       "Mastiffs",
		typeLabel:  "mastiffs",
		portraitIcon: "fas fa-dog",
		tags:       ["alert", "keen-nosed", "fierce", "overprotective"],
		hp:         6,
		damage:     "d6 (hand, grabby)",
		instinct:   "to bark & threaten",
		cost:       "affection",
		isGroup:    true,
		size:       2,
		sizeChoices: [2, 3],
		sourceUuid: "possession:mastiffs",
	},
};

/**
 * The follower inputs for a possession slug, or null if it grants no follower.
 * `picked` is the possession's sub-choice slugs (possessions.subChoices[slug]); the
 * ones among the entry's `choiceTags` lead its tags, so the Would-be Hero's dog is the
 * retriever or the herder they chose. Nothing picked yet leaves the choice off rather
 * than guessing it.
 *
 * `size` is the headcount the player chose for a group with `sizeChoices` (the Ranger's
 * Hounds, 2 or 3); one the entry doesn't list, or none, leaves the entry's own `size`.
 */
export function possessionFollower(slug, picked = [], { size = null } = {}) {
	const entry = POSSESSION_FOLLOWER_CATALOG[slug];
	if (!entry) return null;
	const sized = entry.sizeChoices?.includes(Number(size)) ? { ...entry, size: Number(size) } : entry;
	if (!entry.choiceTags) return sized;
	const { choiceTags, ...rest } = sized;
	const chosen = choiceTags.filter(t => (picked ?? []).includes(t));
	return { ...rest, tags: [...chosen, ...entry.tags] };
}

/** The headcounts to ask between for a possession-follower's group, or [] when there's nothing to ask. */
export function possessionFollowerSizeChoices(slug) {
	const choices = POSSESSION_FOLLOWER_CATALOG[slug]?.sizeChoices ?? [];
	return choices.length > 1 ? [...choices] : [];
}

/**
 * Given the slugs of the possessions a character holds, return the follower inputs
 * for the ones that grant a follower — for the Followers-tab "Add as follower" bar.
 * `presentSourceUuids` filters out any already materialized (deduped like summons).
 */
export function availablePossessionFollowers(ownedSlugs = [], presentSourceUuids = new Set()) {
	const out = [];
	for (const slug of ownedSlugs) {
		const entry = POSSESSION_FOLLOWER_CATALOG[slug];
		if (entry && !presentSourceUuids.has(entry.sourceUuid)) out.push({ slug, ...entry });
	}
	return out;
}
