// ── Which improvements' "Henceforth" rules are in force ─────────────────────────────
// ONE LIST, read by every place a built improvement changes the game after the day it is
// built: the Seasons Change window (yields, the harvest, winter's bill, upkeep), a homefront
// move's window and its dice (advantage), the Surplus rolls (a bonus on every one), and the
// header's holds tray (upkeep due).
//
// Those rules used to be keyed by the built-in's SLUG at each reader (`has("mill")`,
// `has("stoneWall")`, a table of yields with a slug on each row), so a homebrew improvement
// could carry none of them however it was authored. They now live on the improvement's GRANTS
// (IMPROVEMENT_GRANTS for the book's seventeen, `def.grants` for a custom one; the keys are
// listed in utils/improvement-def.js as LIVE_GRANT_KEYS), and the readers ask this list.
//
// WHEN AN IMPROVEMENT IS IN FORCE (the one rule, used everywhere a rule is read):
//
//   it is completed, OR a Fortification or Resource its completion adds is on the steading's
//   list and ticked;
//
//   and it has not been SUPERSEDED: an improvement in force whose completion erases a
//   Fortification ("erase 'Palisade' if you had it") retires the improvement that adds it.
//
// The list half is Book I's own bookkeeping: completing an improvement is recorded by writing its
// entry on the Fortifications or Resources list ("add 'Stone Wall' to the Fortifications list"),
// and the character sheet already read a hand-written "Weapons of War" or "Mill" entry as the
// improvement. A GM who writes "Stone Wall" on the list by hand, or a homebrew improvement whose
// completion adds a "Stone Wall" Fortification, now gets the wall's advantage to Deploy too, where
// before only the character side honoured the entry.
//
// Pure: handed the definitions, a grants lookup, the stored improvements and the two lists.

/** Trimmed, lower-cased: how a list entry's name is compared with the name a grant adds. */
function norm(name) {
	return String(name ?? "").trim().toLowerCase();
}

/**
 * The improvements whose rules are in force, in definition order (the book's seventeen, then the
 * custom ones as they were added).
 *
 * @param {object} o
 * @param {Array<{slug: string, label?: string}>} o.defs   every improvement definition
 * @param {(def: object) => object|null} o.grantsFor        its grants (IMPROVEMENT_GRANTS or def.grants)
 * @param {object} [o.improvements]                         the stored `improvements` map (completion)
 * @param {{resources?: Array, fortifications?: Array}} [o.lists]  the steading's two lists
 * @param {(def: object) => boolean} [o.requirementsMet]   are its requirements still met?
 * @returns {Array<{slug: string, label: string, grants: object, completed: boolean, requirementsMet: boolean}>}
 */
export function improvementRulesFrom({ defs = [], grantsFor = def => def?.grants ?? null, improvements = {}, lists = {}, requirementsMet = () => true } = {}) {
	// An entry is `{name, checked}`, or a bare name: the older shape, which the character sheet
	// always read as a ticked entry.
	const onList = (key, name) => (lists?.[key] ?? []).some(entry => {
		if (entry && typeof entry === "object") return entry.checked !== false && norm(entry.name) === norm(name) && norm(name);
		return typeof entry === "string" && norm(entry) === norm(name) && !!norm(name);
	});
	const inForce = [];
	for (const def of defs ?? []) {
		if (!def?.slug) continue;
		const grants = grantsFor(def) ?? {};
		const completed = !!improvements?.[def.slug]?.completed;
		const listed = (grants.fortifications ?? []).some(n => onList("fortifications", n))
			|| (grants.resources ?? []).some(n => onList("resources", n));
		if (!completed && !listed) continue;
		inForce.push({ def, slug: def.slug, label: def.label ?? def.name ?? def.slug, grants, completed });
	}
	// "Erase 'Palisade' if you had it": what one improvement in force erases retires the improvement
	// that adds it. Never itself, so a homebrew that both adds and clears one name is not erased.
	const erasedBy = new Map();
	for (const rule of inForce) {
		for (const name of rule.grants.removeFortifications ?? []) erasedBy.set(norm(name), rule.slug);
	}
	return inForce
		.filter(rule => !(rule.grants.fortifications ?? []).some(name => {
			const by = erasedBy.get(norm(name));
			return by && by !== rule.slug;
		}))
		.map(({ def, ...rule }) => ({ ...rule, requirementsMet: !!requirementsMet(def) }));
}

/** `has(slug)` over a rules list: is this improvement in force? For the rules still bespoke. */
export function rulesHas(rules = []) {
	const slugs = new Set((rules ?? []).map(r => r.slug));
	return slug => slugs.has(slug);
}

// ── Season-step keys ───────────────────────────────────────────────────────────
// A yield or an upkeep is taken once a season, remembered by a key in the steading's
// `seasonSteps` map. A custom improvement's key is minted from its slug; the built-ins keep the
// keys they were stamped under before these rules moved onto the grants, so a season already
// settled stays settled across the update.

const YIELD_STEP_ALIASES = Object.freeze({ harnessingStream: "streamYield" });
// The watch's key is character-identical to its slug: see StonetopSteading#WATCH_SEASON_STEP.
const UPKEEP_STEP_ALIASES = Object.freeze({ standingWatch: "standingWatch", weaponsOfWar: "weaponsUpkeep" });

/** The once-a-season key for an improvement's yield. */
export function yieldStepKey(slug) {
	return YIELD_STEP_ALIASES[slug] ?? `${slug}Yield`;
}

/** The once-a-season key for an improvement's upkeep. */
export function upkeepStepKey(slug) {
	return UPKEEP_STEP_ALIASES[slug] ?? `${slug}Upkeep`;
}

// ── Upkeep ───────────────────────────────────────────────────────────────────

/**
 * The upkeeps owed this season: "At the start of each season, the watch consumes 1 Surplus or it
 * disbands"; "Each spring, the village must expend 1 Surplus"; Book II's logging camp, "1 Surplus
 * every summer or else it ceases operation". Book I p. 514: "If the PCs fail to pay that cost, they
 * lose the improvement", so every upkeep is pay-or-lose.
 *
 * `start`: one owed every season is owed at the season's START (the watch's own words), so the
 * window asks it before the season's roll; one owed in named seasons is a cost of that season.
 *
 * @returns {Array<{slug, label, surplus, seasons, key, start}>}
 */
export function upkeepsDue(rules = [], seasonId = "") {
	return (rules ?? [])
		.filter(r => r.grants?.upkeep?.seasons?.includes(seasonId))
		.map(r => ({
			slug: r.slug,
			label: r.label,
			surplus: r.grants.upkeep.surplus,
			seasons: [...r.grants.upkeep.seasons],
			key: upkeepStepKey(r.slug),
			start: r.grants.upkeep.seasons.length === 4,
		}));
}

// ── Surplus bonus (Book II, the Golden Sapling) ───────────────────────────────

/**
 * "Henceforth, when the steading generates Surplus, even just 1, it generates +1 Surplus." Added to
 * each Surplus the steading GENERATES: summer's 1d4-1, the harvest, and each improvement's yield.
 * Only when that came to at least 1 ("even just 1": a summer that generated nothing gets nothing).
 *
 * @param {number} gain   what the season's roll or the yield came to
 * @returns {{gain: number, bonus: number, parts: Array<{label: string, amount: number}>}}
 */
export function withSurplusBonus(gain, rules = []) {
	const base = Math.max(0, Math.trunc(Number(gain) || 0));
	if (base < 1) return { gain: base, bonus: 0, parts: [] };
	const parts = (rules ?? [])
		.filter(r => Number(r.grants?.surplusBonus) > 0)
		.map(r => ({ label: r.label, amount: Math.trunc(Number(r.grants.surplusBonus)) }));
	const bonus = parts.reduce((n, p) => n + p.amount, 0);
	return { gain: base + bonus, bonus, parts };
}

/** " (+1 from the Golden Sapling)" for a notice, or "" with no bonus. */
export function surplusBonusNote({ parts = [] } = {}) {
	return parts.length ? ` (${parts.map(p => `+${p.amount} from ${p.label}`).join(", ")})` : "";
}
