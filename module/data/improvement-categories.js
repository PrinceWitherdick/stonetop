// The Improvements tab's categories, in a module of their own so the card-refresh
// hash (migration/improvement-refresh.js) can share the steading's category rule
// without importing the steading. StonetopSteading.js re-exports both lists.

/**
 * The three lenses the Improvements tab filters by — the toggle chips beside its
 * search control. Every built-in improvement (IMPROVEMENT_DEFINITIONS, in
 * StonetopSteading.js) carries exactly one `category`.
 *
 * The split follows what an improvement *feeds*, not what it costs to build, which is
 * what a player is actually shopping for when they open the tab:
 *   hearth — the Surplus engine (housing, food, water); every Fortunes grant but the Inn
 *   renown — Prosperity and everything facing outward (trade, guests, reputation)
 *   wall   — exactly the set of improvements that add to the Fortifications list
 * The Inn straddles hearth/renown (it grants Fortunes, but its ongoing rules are all
 * about guests and news from the wider world) and Township is really a capstone; both
 * are filed under renown.
 *
 * Custom improvements — hand-authored, or dropped in from a journal card, which carries
 * no category — may have none, in which case they're immune to the filter and always
 * shown, so nothing a user added can silently vanish behind a chip.
 */
export const IMPROVEMENT_CATEGORIES = [
	{
		key: "hearth",
		label: "Hearth & Harvest",
		icon: "fas fa-wheat-awn",
		hint: "Housing, food, and water: the Fortunes and Surplus engine.",
	},
	{
		key: "renown",
		label: "Trade & Renown",
		icon: "fas fa-coins",
		hint: "Prosperity, trade, and everything facing the wider world.",
	},
	{
		key: "wall",
		label: "Wall & Watch",
		icon: "fas fa-shield-halved",
		hint: "Defenses and the Fortifications list.",
	},
];

/** Valid `category` values, for validating a hand-authored custom improvement. */
export const IMPROVEMENT_CATEGORY_KEYS = new Set(IMPROVEMENT_CATEGORIES.map(c => c.key));

/**
 * The category a definition is stored under: a real key, trimmed, or "" for anything else.
 * THE rule: the steading's add and edit paths, the builder's journal-card reader and the
 * card-refresh hash all read a category through this, so a card and its stored copy agree. PURE.
 */
export function improvementCategoryKey(raw) {
	const key = String(raw ?? "").trim();
	return IMPROVEMENT_CATEGORY_KEYS.has(key) ? key : "";
}
