// What the rules as written allow a character's six stats to be, and how to say what is off
// about one that sits outside them.
//
// The stat boxes take any number anyone types, on purpose: a table may be running a variant,
// converting a character in from another game, or handing out something the book never
// printed. Nothing here blocks a write or changes one. It works out whether the book could
// have made the six numbers and hands the sheet a sentence for the stats that disagree, which
// the stat block shows as a caution highlight while its section is being edited
// (actor-stats.hbs).
//
// A score is where the stat started plus every +1 earned since, and a sheet passes when SOME
// legal history gives the numbers on it. Three rules, and they are the three the book pins
// down:
//
//  1. The RANGE, which holds whatever the playbook and whatever was earned. The lowest score
//     any playbook assigns is -1 and nothing in play lowers a stat (a debility gives
//     disadvantage instead); Superior Stat is the only advance that reaches +3 and nothing
//     goes past it.
//  2. The ARRAY. Take each stat's earned +1s back off and the six starting scores come back,
//     and they have to be the playbook's printed array in SOME order. Which stat starts on
//     which score is the player's to choose and to change: trade the +2 and the +0 between
//     STR and CHA and the sheet is exactly as legal as it was. That is why what onboarding
//     recorded (`onboardingStats`) is not read here. It is one legal assignment, not the only
//     one, and holding each stat to it would caution a perfectly good trade. A set check can
//     only ever say "too many stats start here", never which of them is the wrong one, so the
//     message names them all, offers the scores the array has not given out, and leaves the
//     choice to the reader.
//  3. The CAP on every +1. An earned +1 stays on the stat it was taken for, because that is
//     what the pick recorded, and the move that gave it raises a stat only so far: Improved
//     Stat and Potential for Greatness to +2, Superior Stat to +3. A trade is where this
//     bites. Move a +2 start onto the stat an Improved Stat raised and the box reads +3, a
//     set the array allows and a score Improved Stat could never have reached.
//
// Every recorded pick is worth exactly +1, which is what lets rule 2 take the picks back off
// by counting them. The Improved / Superior Stat pickers only ever offer a stat below the
// move's cap, and a Potential for Greatness slot adds its +1 without checking one (so a slot
// marked on a stat already at +2 reads +3, and rule 3 cautions it).

import {STAT_KEYS} from "../../utils/roll-types.js";
import {joinNames, sign} from "../../utils/strings.js";

/** A stat score as the book prints it: "+2", "+0", "-1". The system-wide signed-number
 *  formatter, named for what a stat score is so the prose below reads as what it prints. */
export const statScoreLabel = sign;

/** The range every score sits in, both ends inclusive. */
export const STAT_FLOOR   = -1;
export const STAT_CEILING = 3;

// What eight of the nine playbooks assign. A playbook's own note is read where there is one;
// this is the fallback for a playbook carrying none (the Would-Be Hero prints its own, lower
// array, so this is a default and never an override).
export const DEFAULT_STAT_ARRAY = [2, 1, 1, 0, 0, -1];

// How far a marking move's stat slot raises a stat, by the move name the mark store is keyed
// on. Potential for Greatness is the only move with stat slots, and its cap is printed in the
// option's own text ("Increase the stat you rolled by 1, to a max of +2") rather than carried
// in its data, so it is written down here. A marking move missing from this table is held to
// the range alone.
const MARK_STAT_CAPS = { "Potential for Greatness": 2 };

/**
 * The scores a playbook hands out, read off its printed note ("Assign these scores to your
 * stats: +2, +1, +1, +0, +0, -1"). Null when there is no note, or when what it reads off is
 * not one score per stat: a note we can't parse into six has to fall back to a playable
 * default rather than demand an assignment nobody can make.
 * @param {string|null} note
 * @returns {number[]|null}
 */
export function parseStatArray(note) {
	const matches = String(note ?? "").match(/[+-]?\d+/g);
	return matches?.length === STAT_KEYS.length ? matches.map(Number) : null;
}

/**
 * Every +1 each stat has been given since creation, with the move that gave it and how far
 * that move raises a stat. Two stores, both keyed by what made the pick rather than by the
 * stat, and at DIFFERENT depths in the flag bag: `improvedStatChoices` (one entry per
 * Improved / Superior Stat instance, keyed by the move item's id) and the stat slots inside
 * `moves.moveMarks` (where the ledger writes them, keyed by move name). A count-style mark
 * stores `{ stat: "", level }` in the same store, so "names a stat" is exactly what tells a
 * stat slot apart from every other kind of mark.
 *
 * An Improved / Superior Stat pick reads its cap off its own move item. A pick whose item is
 * gone from the sheet, or carries no cap, is held to the ceiling: a cap nobody can read is
 * not one to caution anybody over.
 * @param {object} flags the actor's resolved Stonetop flag bag
 * @param {Iterable<object>} [items] the actor's items (a Foundry collection or a plain array)
 * @returns {Record<string, {move: string, cap: number}[]>} every stat key, empty where nothing was earned
 */
export function earnedStatIncreases(flags = {}, items = []) {
	const increases = Object.fromEntries(STAT_KEYS.map(key => [key, []]));
	const itemsById = new Map(Array.from(items?.values?.() ?? [], item => [item?.id, item]));
	for (const [itemId, statKey] of Object.entries(flags?.improvedStatChoices ?? {})) {
		if (!STAT_KEYS.includes(statKey)) continue;
		const item = itemsById.get(itemId);
		increases[statKey].push({ move: item?.name ?? "a stat increase", cap: _capOrCeiling(item?.system?.cap) });
	}
	for (const [moveName, options] of Object.entries(flags?.moves?.moveMarks ?? {})) {
		for (const entries of Object.values(options ?? {})) {
			if (!Array.isArray(entries)) continue;
			for (const entry of entries) {
				if (!STAT_KEYS.includes(entry?.stat)) continue;
				increases[entry.stat].push({ move: moveName, cap: _capOrCeiling(MARK_STAT_CAPS[moveName]) });
			}
		}
	}
	return increases;
}

function _capOrCeiling(cap) {
	return Number.isFinite(cap) ? cap : STAT_CEILING;
}

/**
 * Every stat whose stored value the rules as written can't account for.
 * @param {object} args
 * @param {object} args.stats the actor's `system.stats` ({ str: { value }, ... })
 * @param {object} args.flags the actor's resolved Stonetop flag bag
 * @param {string|null} args.statsNote the playbook's printed stat-assignment note
 * @param {Iterable<object>} [args.items] the actor's items, which say how far each Improved /
 *   Superior Stat pick reaches
 * @returns {Record<string, {value: number, message: string}>}
 *   keyed by stat; a stat that checks out is simply absent.
 */
export function statRuleIssues({ stats = {}, flags = {}, statsNote = null, items = [] } = {}) {
	const values    = Object.fromEntries(STAT_KEYS.map(key => [key, Number(stats?.[key]?.value ?? 0)]));
	const increases = earnedStatIncreases(flags, items);
	const starts    = Object.fromEntries(STAT_KEYS.map(key => [key, values[key] - increases[key].length]));
	const issues    = {};

	// One sentence per stat, and the most local reason wins: the number on its own, then the
	// stat against its own increases, then (below) the stat against the other five.
	for (const key of STAT_KEYS) {
		const value = values[key];
		if (!Number.isFinite(value)) continue;
		if (value > STAT_CEILING)    issues[key] = { value, message: _ceilingMessage(value) };
		else if (value < STAT_FLOOR) issues[key] = { value, message: _floorMessage(value) };
		else {
			const breach = _capBreach(starts[key], increases[key]);
			if (breach) issues[key] = { value, message: _capMessage({ key, value, start: starts[key], ...breach }) };
		}
	}

	const array = parseStatArray(statsNote);
	if (!array) return issues;
	return _arrayIssues({ array, values, starts, increases, issues });
}

// Whether all of a stat's +1s could have landed from where it started. Nothing records the
// order they were taken in, so take them in the order that lands the most: lowest cap first.
// The k-th +1 lifts the stat to start + k, which the move behind it has to reach, so the
// highest start that lands them all is the smallest (cap - k). Null when the stat starts
// within that; otherwise the cap that stops them, the moves carrying it, and that highest
// start.
function _capBreach(start, picks) {
	if (!picks.length) return null;
	const ordered = [...picks].sort((a, b) => a.cap - b.cap);
	const highest = Math.min(...ordered.map((pick, i) => pick.cap - (i + 1)));
	if (start <= highest) return null;
	const { cap } = ordered.find((pick, i) => start + i + 1 > pick.cap);
	const moves   = [...new Set(ordered.filter(pick => pick.cap === cap).map(pick => pick.move))];
	return { cap, moves, highest, taken: picks.length };
}

// The set check. Each stat's starting score is its value less its earned +1s, and a score held
// by more stats than the array assigns it to flags every stat holding it.
function _arrayIssues({ array, values, starts, increases, issues }) {
	const allowed = new Map();
	for (const score of array) allowed.set(score, (allowed.get(score) ?? 0) + 1);

	const holders = new Map();
	for (const key of STAT_KEYS) {
		holders.set(starts[key], [...(holders.get(starts[key]) ?? []), key]);
	}

	// What the array still has to give out, once every stat legitimately on a score has taken
	// it. This is what a flagged stat could be instead, and it is the only "allowed value" a
	// set check is ever in a position to offer.
	const spare = [];
	for (const [score, count] of allowed) {
		const taken = Math.min(count, holders.get(score)?.length ?? 0);
		for (let i = taken; i < count; i++) spare.push(score);
	}
	spare.sort((a, b) => b - a);

	for (const [score, keys] of holders) {
		const allow = allowed.get(score) ?? 0;
		if (keys.length <= allow) continue;
		for (const key of keys) {
			if (issues[key]) continue;
			issues[key] = {
				value:   values[key],
				message: _arrayMessage({ key, keys, score, allow, array, spare, taken: increases[key].length, value: values[key] }),
			};
		}
	}
	return issues;
}

const _abbr = key => key.toUpperCase();

const _rangeTail = `A score runs from ${statScoreLabel(STAT_FLOOR)} to ${statScoreLabel(STAT_CEILING)}.`;

function _ceilingMessage(value) {
	return `${statScoreLabel(value)} is past what the rules reach: Superior Stat is the only advance that gets a stat `
	     + `to ${statScoreLabel(STAT_CEILING)}, and nothing takes one further. ${_rangeTail}`;
}

function _floorMessage(value) {
	return `${statScoreLabel(value)} is below what the rules reach: ${statScoreLabel(STAT_FLOOR)} is the lowest score any `
	     + `playbook assigns, and nothing in play lowers a stat (a debility gives disadvantage instead). ${_rangeTail}`;
}

// Where a stat starts, said so the reader can check it against the box. The box shows the value,
// so a start that differs from it has to say what came off, or it reads as another stat.
function _startsAt(key, start, value, taken) {
	if (taken === 0) return `${_abbr(key)} starts at ${statScoreLabel(start)}`;
	const less = taken === 1 ? "one stat increase" : `${taken} stat increases`;
	return `${_abbr(key)} starts at ${statScoreLabel(start)} (${statScoreLabel(value)} now, less ${less})`;
}

function _everyIncrease(count) {
	if (count === 1) return "that increase";
	return count === 2 ? "both increases" : `all ${count} increases`;
}

function _capMessage({ key, value, start, cap, moves, highest, taken }) {
	const reach = `${joinNames(moves)} ${moves.length === 1 ? "raises" : "raise"} a stat only as far as ${statScoreLabel(cap)}`;
	if (highest < STAT_FLOOR) {
		return `${_startsAt(key, start, value, taken)}, but ${reach}, so no starting score lets ${_everyIncrease(taken)} count.`;
	}
	const most = highest === STAT_FLOOR ? statScoreLabel(highest) : `${statScoreLabel(highest)} or lower`;
	return `${_startsAt(key, start, value, taken)}, but ${reach}, so for ${_everyIncrease(taken)} to count, `
	     + `${_abbr(key)} has to start at ${most}.`;
}

function _timesClause(count) {
	if (count === 1) return "once";
	return count === 2 ? "twice" : `${count} times`;
}

function _arrayMessage({ key, keys, score, allow, array, spare, taken, value }) {
	const others = keys.filter(k => k !== key).map(_abbr);
	const clash  = allow === 0
		? ", which this playbook's array never assigns."
		: `${others.length === 1 ? `, and so does ${others[0]}` : `, and so do ${joinNames(others)}`}, `
		  + `but the array assigns ${statScoreLabel(score)} ${_timesClause(allow)}.`;
	const offer = spare.length
		? ` Still unassigned: ${spare.map(statScoreLabel).join(", ")}.`
		: "";
	return `${_startsAt(key, score, value, taken)}${clash} Array: ${array.map(statScoreLabel).join(", ")}.${offer}`;
}
