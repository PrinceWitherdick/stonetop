// Subject categories for the ledger dialog's filter dropdown.
//
// A busy character accumulates a few hundred distinct subjects — almost all of them the name of
// one move, one possession, or one arcanum — which made a flat "filter by subject" list useless.
// Every entry therefore carries a category, and the dropdown groups subjects beneath it.
//
// Categories are resolved two ways. Entries written from now on carry a `category` stamped at
// generation time from the flag path that produced them, which is exact. Entries already in a
// world's ledger have no such field, so they fall back to {@link classifyAction}, a heuristic
// over the action string. The fallback is why the legacy phrasings ("Items undefined ◇",
// "Arcana changed from …", "Lore set to 1") still appear in the tables below: those strings are
// sitting in live ledgers and should land in the right group.
import { ledgerNoun } from "./ledger-core.js";

/** Display order of the dropdown's groups. Only groups with entries are rendered. */
export const LEDGER_CATEGORIES = [
	{ id: "leveling",  label: "Leveling" },
	{ id: "moves",     label: "Moves" },
	{ id: "stats",     label: "Stats & harm" },
	{ id: "inventory", label: "Inventory & gear" },
	{ id: "arcana",    label: "Arcana" },
	{ id: "character", label: "Character & lore" },
	{ id: "followers", label: "Followers" },
	{ id: "steading",  label: "Steading" },
	{ id: "relations", label: "Relationships" },
	{ id: "notes",     label: "Notes & prose" },
	{ id: "other",     label: "Other" },
];

const CATEGORY_LABELS = new Map(LEDGER_CATEGORIES.map(c => [c.id, c.label]));
const CATEGORY_ORDER  = new Map(LEDGER_CATEGORIES.map((c, i) => [c.id, i]));

export const LEDGER_CATEGORY_FALLBACK = "other";

/** True when `id` names a real category. */
export function isLedgerCategory(id) {
	return CATEGORY_LABELS.has(id);
}

/** Human label for a category id, or the id itself if unknown. */
export function ledgerCategoryLabel(id) {
	return CATEGORY_LABELS.get(id) ?? id;
}

// Exact subject → category. Covers the fixed label vocabulary of all three ledgers (character,
// steading, NPC), including labels that only exist in already-written entries.
const NOUN_CATEGORIES = new Map(Object.entries({
	// Leveling
	"Level": "leveling", "XP": "leveling", "XP max": "leveling",

	// Stats & harm
	"STR": "stats", "DEX": "stats", "INT": "stats", "WIS": "stats", "CON": "stats", "CHA": "stats",
	"HP": "stats", "Max HP": "stats", "Armor": "stats", "Armor source": "stats",
	"Forward": "stats", "Ongoing": "stats", "Damage": "stats", "Damage value": "stats",
	"Damage formula": "stats", "Weakened": "stats", "Dazed": "stats", "Miserable": "stats",
	"Game stats": "stats", "Tags": "stats",

	// Inventory & gear
	"Inventory item": "inventory", "Inventory items": "inventory", "Inventory": "inventory",
	"Item slots ◇": "inventory", "Small item slots □": "inventory",
	"Items undefined ◇": "inventory", "Small Items undefined □": "inventory", // pre-fix labels
	"Custom inventory": "inventory", "Inventory resource": "inventory", "Possessions": "inventory",

	// Character & lore
	"Playbook": "character", "Playbooks": "character", "Background": "character",
	"Background choices": "character", "Origin": "character", "Instinct": "character",
	"Appearance": "character", "Lore": "character", "Name": "character", "Pronouns": "character",
	"Occupation": "character", "Traits": "character", "Status": "character", "Home": "character",
	"Relations": "character", "Embodiment": "character", "Post-death insert": "character",
	"Post-death instinct": "character", "Post-death lore": "character",
	"Stat block link": "character", "Threat link": "character", "Linked steading": "character",

	// Moves
	"Moves": "moves", "Move resource": "moves", "Invocations": "moves", "Invocation": "moves",

	// Arcana
	"Arcana": "arcana", "Arcanum": "arcana",

	// Followers
	"Crew": "followers", "Animal companion": "followers", "Initiates loyalty": "followers",
	"Initiate details": "followers", "Initiate": "followers",

	// Steading
	"Resource": "steading", "Fortification": "steading", "Asset": "steading",
	"Neighbor": "steading", "Player": "steading", "Improvement": "steading", "Place": "steading",
	"Size": "steading", "Population": "steading", "Prosperity": "steading", "Surplus": "steading",
	"Fortunes": "steading", "Defenses": "steading", "Places of interest": "steading",
	"Diminished debility": "steading", "Lacking debility": "steading", "Malcontent debility": "steading",

	// Notes & prose
	"Notes": "notes", "Connections": "notes", "Motivations": "notes",

	"Roll mode": "other",
}));

// Ordered patterns applied to the whole action string when the subject alone isn't decisive.
// First match wins, so the specific rules must precede the broad verb rules at the bottom.
const ACTION_PATTERNS = [
	[/^(?:Minor|Major) [Aa]rcan(?:a|um)\b/, "arcana"],
	[/^Arcan(?:a|um)\b/, "arcana"],
	[/^Wound\b/, "stats"],
	[/^Lore\b/, "character"],
	[/^(?:Silver|Gold|Herd)\b/, "steading"],
	[/^Improvement\b/, "steading"],
	// Places of interest are logged by their map letter: "Place A set to The Old Mill".
	[/^Place\b/, "steading"],
	[/^Crew member\b/, "followers"],
	// "<Follower> <field> set to …" — the subject carries the field, so "Crew name" and
	// "Animal companion instinct" never match the bare-subject table above.
	[/^(?:Crew|Animal companion|Initiate)\b/, "followers"],
	// A steading neighbour's home/traits read "<Name> home cleared (was Marshedge)". The bare
	// "Home"/"Traits" subjects belong to an NPC's own sheet and are claimed by the table above.
	// "trait" singular is the pre-fix wording, still present in written ledgers.
	[/\S\s+(?:home|traits?)\s+(?:changed|set|cleared)/, "steading"],
	// A move's per-option advancement mark: "Well Versed - The civilizations of humanity marked".
	// The spaced hyphen is what separates it from an arcana box ("<Card>: front diamond 1 marked")
	// and from a lore tick, which uses an em dash.
	[/\s-\s.+\s(?:marked|unmarked)$/, "moves"],
	[/^Impression\b/, "relations"],
	[/\brelationship\b/i, "relations"],
	[/\b(?:loyalty|Readiness)\s+(?:changed|set|cleared)/, "followers"],
	// A follower's HP reads "<Name> HP changed from …"; a PC's own reads "HP changed from …",
	// which the subject table already claimed above.
	[/\S\s+HP\s+(?:changed|set|cleared)/, "followers"],
	[/\bwrite-in possession\b/, "inventory"],
	[/\buses changed\b/, "inventory"],
	[/^\S.*\s(?:carried|set down)$/, "inventory"],
	// A bare "<Name> learned" is always a move; typed grants say "<Type> added: <Name>".
	[/\blearned\b/, "moves"],
	// "<Possession> selected" / a background choice / an inventory tick all read the same way.
	[/\b(?:selected|deselected)\b/, "inventory"],
];

/**
 * Best-effort category for an action string, used for entries written before categories were
 * stamped. Exact subjects win; otherwise the ordered patterns decide; otherwise "other".
 */
export function classifyAction(action) {
	const text = String(action ?? "").trim();
	if (!text) return LEDGER_CATEGORY_FALLBACK;

	const noun = ledgerNoun(text);
	const byNoun = NOUN_CATEGORIES.get(noun);
	if (byNoun) return byNoun;

	// "Inventory item added: …" and friends put the type before the colon.
	const typed = NOUN_CATEGORIES.get(noun.replace(/\s+(?:added|removed)$/, ""));
	if (typed) return typed;

	for (const [pattern, category] of ACTION_PATTERNS) {
		if (pattern.test(text)) return category;
	}
	return LEDGER_CATEGORY_FALLBACK;
}

/** The category of a stored entry: its stamped value when it has one, else the heuristic. */
export function categoryForEntry(entry) {
	const stamped = entry?.category;
	return isLedgerCategory(stamped) ? stamped : classifyAction(entry?.action);
}

/**
 * Group ledger entries into categories, each with its distinct subjects.
 * Categories keep {@link LEDGER_CATEGORIES} order; subjects sort alphabetically within one.
 *
 * Only the category carries a count. A per-subject tally would have nowhere to go: the
 * dropdown deliberately leaves counts off the subject rows, where a trailing "(3)" reads
 * as part of the subject rather than a number (see ledgerNounOptionsHtml).
 *
 * @returns {{id: string, label: string, count: number, nouns: string[]}[]}
 */
export function ledgerCategoryGroups(entries) {
	const groups = new Map();
	for (const entry of entries ?? []) {
		const noun = ledgerNoun(entry?.action);
		if (!noun) continue;
		const id = categoryForEntry(entry);
		if (!groups.has(id)) groups.set(id, { id, label: ledgerCategoryLabel(id), count: 0, nouns: new Set() });
		const group = groups.get(id);
		group.count += 1;
		group.nouns.add(noun);
	}

	return [...groups.values()]
		.sort((a, b) => (CATEGORY_ORDER.get(a.id) ?? 99) - (CATEGORY_ORDER.get(b.id) ?? 99))
		.map(group => ({ ...group, nouns: [...group.nouns].sort((a, b) => a.localeCompare(b)) }));
}
