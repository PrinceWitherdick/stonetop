// Playbook special possessions that grant followers (Moves & Gear handouts). These
// ship as free-text gear on the playbook (e.g. the Would-be Hero's "A good dog"),
// so they render as possession text on the gear tab but never became Followers-tab
// cards. This catalog mirrors those stat lines as buildCustomFollower inputs so the
// Followers tab can offer a one-click "Add as follower" — materializing a real,
// editable card (the group ones use the group roster + group-fight tools).
//
// Keyed by the possession's slug (matching specialPossessions.options[].slug on the
// playbook). `sourceUuid` (`possession:<slug>`) dedupes re-adds, exactly like the
// arcana summons. Where the handout offers a tag choice, we bake a sensible default
// and note the alternative — the resulting card is fully editable, so the player
// adjusts to their pick.

export const POSSESSION_FOLLOWER_CATALOG = {
	// The Would-be Hero — "A good dog" (single follower).
	"a-good-dog": {
		name:       "Good dog",
		typeLabel:  "a good dog",
		portraitIcon: "fas fa-dog",
		tags:       ["herder", "keen-nosed", "clever"],
		hp:         6,
		damage:     "d6 (hand, grabby)",
		instinct:   "to play",
		cost:       "affection",
		notes:      "Choose when you gain it: a retriever, or a herder (keen-nosed, clever).",
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
		sourceUuid: "possession:mastiffs",
	},
};

/** The follower-catalog entry for a possession slug, or null if it grants no follower. */
export function possessionFollower(slug) {
	return POSSESSION_FOLLOWER_CATALOG[slug] ?? null;
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
