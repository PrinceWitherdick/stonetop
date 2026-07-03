// Livestock & Other Beasts catalog (Moves & Gear handout). Drives the Followers
// tab beast cards: when a character adds one of these via the Add Special Item
// picker, its slug lands in the `inventory.addedSpecial` flag and the sheet pairs
// it with the full stats here. `slug` matches the inventory-items compendium entry
// and the SPECIAL_ITEM_CATALOG "Livestock & Other Beasts" category in
// special-items.js (which only carries traits/Value for the picker).
//
// Stats are copied verbatim from the Setting Overview "Livestock & Other Beasts"
// table. `follower: true` marks the beasts the rules treat as proper followers —
// they have a Cost and earn Loyalty (dog, mule, horse). The rest are livestock:
// no Loyalty, and most can be butchered for Provisions.
//
// `traitsNote` holds the handout's "choose" instruction (e.g. "pick 2 more",
// "swift or hardy") shown as a muted hint after the fixed trait tags.

export const BEAST_CATALOG = {
	"dog-follower": {
		name:       "Dog",
		subtitle:   "follower",
		traits:     ["keen-nosed"],
		traitsNote: "pick 2 more",
		hp:         6,
		damage:     "d6",
		damageForm: "hand, grabby",
		armor:      0,
		instinct:   "get distracted",
		cost:       "training",
		follower:   true,
	},
	"goat": {
		name:       "Goat",
		traits:     ["sure-footed", "curious", "hungry"],
		hp:         3,
		damage:     "d4",
		damageForm: "hand",
		armor:      0,
		instinct:   "explore",
		butcher:    "4 Provisions (6 uses)",
		follower:   false,
	},
	"sheep": {
		name:       "Sheep",
		traits:     ["timid", "hardy", "wooly"],
		hp:         3,
		damage:     "d4",
		damageForm: "hand",
		armor:      0,
		instinct:   "follow the herd",
		butcher:    "4 Provisions (6 uses)",
		follower:   false,
	},
	"pig": {
		name:       "Pig",
		traits:     ["keen-nosed", "stubborn", "gluttonous", "clever"],
		hp:         6,
		damage:     "d4",
		damageForm: "hand",
		armor:      0,
		instinct:   "eat anything",
		butcher:    "4 Provisions (d6+10 uses)",
		follower:   false,
	},
	"donkey": {
		name:       "Donkey",
		traits:     ["hardy", "sure-footed", "cautious", "slow"],
		hp:         10,
		damage:     "d4+2",
		damageForm: "hand, forceful",
		armor:      0,
		instinct:   "be stubborn",
		follower:   false,
	},
	"mule": {
		name:       "Mule",
		subtitle:   "follower",
		traits:     ["large", "hardy", "sure-footed", "cautious", "keen-nosed", "sterile"],
		hp:         14,
		damage:     "d6+1",
		damageForm: "hand, close",
		armor:      0,
		instinct:   "avoid danger",
		cost:       "care & grooming",
		follower:   true,
	},
	"horse": {
		name:       "Horse",
		subtitle:   "follower",
		traits:     ["large", "powerful", "keen-nosed"],
		traitsNote: "swift or hardy",
		hp:         10,
		damage:     "d6+3",
		damageForm: "hand, close, forceful",
		armor:      0,
		instinct:   "panic",
		cost:       "care & grooming",
		follower:   true,
	},
};

// Display order — matches the handout's Livestock & Other Beasts table (and the
// inventory-items sortOrder: dog 59 → horse 65).
export const BEAST_ORDER = ["dog-follower", "goat", "sheep", "pig", "donkey", "mule", "horse"];

export const BEAST_SLUGS = new Set(BEAST_ORDER);

// Keywords that mark a requisitionable steading asset as a follower-capable animal
// (Book I: "a PC might Requisition one of the town's horses"). Only the beasts the
// rules treat as proper followers (dog / mule / horse) are offered — livestock like
// goats aren't followers. Matched on the asset's free-text name.
const REQUISITION_MOUNT_KEYWORDS = [
	{ re: /\b(draft\s+)?horses?\b|\bmares?\b|\bstallions?\b|\bsteeds?\b|\bponies?\b|\bpony\b/i, slug: "horse" },
	{ re: /\bmules?\b/i, slug: "mule" },
	{ re: /\bdogs?\b|\bhounds?\b|\bmastiffs?\b/i, slug: "dog-follower" },
];

/**
 * If a requisitioned asset's name names a follower-capable animal, return the beast
 * catalog entry to build a follower from (else null). Used by the Requisition flow
 * to offer "add as a follower" when a PC requisitions the town's horses/mules/dogs.
 */
export function beastFollowerForAsset(name) {
	const n = String(name ?? "");
	const hit = REQUISITION_MOUNT_KEYWORDS.find(k => k.re.test(n));
	if (!hit) return null;
	const b = BEAST_CATALOG[hit.slug];
	return b ? { slug: hit.slug, beast: b } : null;
}

/** buildCustomFollower input for a beast catalog entry (a requisitioned mount, etc.). */
export function followerInputFromBeast(beast, { name } = {}) {
	if (!beast) return null;
	return {
		name:         name || beast.name,
		typeLabel:    beast.follower ? "beast follower" : "livestock",
		portraitIcon: "fas fa-horse",
		tags:         beast.traits ?? [],
		hp:           beast.hp,
		armor:        beast.armor,
		damage:       beast.damage + (beast.damageForm ? ` (${beast.damageForm})` : ""),
		instinct:     beast.instinct,
		cost:         beast.cost,
	};
}
