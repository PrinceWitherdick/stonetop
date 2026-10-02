// THE TIMELINE, SHAPED FOR A TEMPLATE.
//
// One view model, three hosts: the tab on a sheet, the aggregate window, and the journal page a
// track reads back as. They differ in how many tracks they are handed and in nothing else, which is
// what keeps the season a card is filed under from being worked out three times and drifting twice.
//
// Pure. Enriching an entry's body is async and Foundry-only, so the raw body rides in the model and
// the host enriches it; everything about WHICH period a card is in and WHAT that period is called
// is decided here, once.
//
// ⚠ THE SEASON INKS ARE NOT USED HERE, AND MUST NOT BE. The four `--stonetop-season-*-ink` tokens
// belong to the steading header's clock and nothing else; a test counts every read of them in the
// stylesheet and fails on a fifth. A period's heading IS coloured by its season (user's call,
// 2026-10-01, so the seasons are easy to spot), but with the timeline's OWN four colours
// (`--st-timeline-season-*`), and its name and glyph still say which season it is. See
// season-inks-exclusive.

import { SEASON_IDS, seasonLabel } from "../seasons/seasons-change-reminders.js";
import { yearLabel } from "../seasons/seasons-chronicle.js";
import { periodLabel } from "../seasons/current-season.js";
import { localize, format } from "../utils/i18n.js";
import { enrichHTML } from "../utils/foundry-compat.js";
import {
	TIMELINE_KILLS_SOURCE, TIMELINE_SOURCES, UNDATED_PERIOD_KEY, foeLines, groupByPeriod, killTotal,
	periodFacts, periodKey, readEntries, sortEntries,
} from "./timeline-core.js";

/**
 * What each kind of row is called and the glyph it wears, in the card's chip and in the reader's
 * "Filter" menu. A kind is ALWAYS named in words beside its glyph: an icon alone is a guess for a
 * reader on a magnifier, and the chip is the one thing that says a row was written by the system.
 *
 * ⚠ NO SEASON-NAMED KEYS OR CLASSES. The Seasons Change row is one kind among ten, marked by the
 * leaf like the rest; the season itself is named by the period it sits in.
 */
export const KIND_META = {
	hand:       { icon: "fa-feather-pointed" },
	season:     { icon: "fa-leaf" },
	levelup:    { icon: "fa-angles-up" },
	kills:      { icon: "fa-skull" },
	expedition: { icon: "fa-person-hiking" },
	site:       { icon: "fa-mountain-sun" },
	death:      { icon: "fa-door-open" },
	wound:      { icon: "fa-bandage" },
	arcana:     { icon: "fa-wand-sparkles" },
	follower:   { icon: "fa-user-group" },
};

/** The chip on one card: its glyph and its name. */
export function kindChip(source) {
	const kind = KIND_META[source] ? source : "hand";
	return { kind, icon: KIND_META[kind].icon, label: localize(`stonetop.timeline.kind.${kind}`) };
}

/**
 * Every kind the "Filter" menu offers, in TIMELINE_SOURCES order, each marked shown or hidden for
 * this reader.
 *
 * @param {string[]} hidden  The sources this reader unticked.
 */
export function kindMenu(hidden = []) {
	const off = new Set(hidden);
	return TIMELINE_SOURCES.map(source => ({
		source,
		kind:  source,
		icon:  KIND_META[source]?.icon ?? KIND_META.hand.icon,
		label: localize(`stonetop.timeline.show.${source}`),
		shown: !off.has(source),
	}));
}

/**
 * The CSS modifier a season's heading glyph wears.
 *
 * ⚠ "autumn" IS "fall" IN ART AND CSS. The clock says autumn, the icons and the stylesheet say
 * fall, and two places in this system already carry that swap (`seasonIconSrc`, and the Seasons
 * Change block builder). This is the third and must not be the one that forgets.
 */
export function seasonGlyphClass(seasonId) {
	if (!SEASON_IDS.includes(seasonId)) return "";
	return `stonetop-season--${seasonId === "autumn" ? "fall" : seasonId}`;
}

/**
 * The classes a season's HEADING wears to take that season's colour: the shared shape and the one
 * season's modifier. Empty for the undated block, which has no season and stays uncoloured.
 * Named for the clock's own ids ("autumn"), unlike the glyph above: no art file is involved.
 */
export function seasonColourClass(seasonId) {
	if (!SEASON_IDS.includes(seasonId)) return "";
	return `stonetop-timeline-season stonetop-timeline-season--${seasonId}`;
}

/** A kills row's foes as one line: "Crinwin ×3, Bandit Chief". */
export function killSummaryText(foes) {
	return foeLines(foes).join(", ");
}

/** One entry, ready to print. `body` stays raw for the host to enrich. */
function cardVM(entry, { canEdit = false } = {}) {
	const chip = kindChip(entry.source);
	const isKills = entry.source === TIMELINE_KILLS_SOURCE;
	const killCount = isKills ? entry.foes.length : 0;
	return {
		id:        entry.id,
		// A kills row the GM never titled reads as what it is, counted.
		title:     entry.title || (isKills ? format("stonetop.timeline.kills.title", { count: killCount }) : ""),
		place:     entry.place,
		placeUuid: entry.placeUuid,
		// Only a place that IS a document gets a link. Everything else is a name somebody typed,
		// and a link to nowhere reads as a broken one.
		placeLinked: !!entry.placeUuid,
		body:      entry.body,
		kind:      chip.kind,
		kindIcon:  chip.icon,
		kindLabel: chip.label,
		// A row the system wrote for itself rather than one somebody typed. It wears its kind's chip,
		// so a reader can always tell the record from what they wrote. Every row is STORED, so an
		// auto row is edited and removed exactly like a typed one.
		isAuto:    entry.source !== "hand",
		killSummary: isKills ? killSummaryText(entry.foes) : "",
		canEdit,
	};
}

/** One period block, with whatever it holds. `startsYear` and `above` are set by the builders. */
function periodVM(period, entries, opts) {
	return {
		key:         period.key,
		label:       periodLabel(period),
		seasonLabel: period.season ? seasonLabel(period.season) : "",
		yearLabel:   period.season ? yearLabel(period.year) : "",
		year:        period.season ? period.year : 0,
		glyphClass:  seasonGlyphClass(period.season),
		seasonClass: seasonColourClass(period.season),
		undated:     period.key === UNDATED_PERIOD_KEY,
		startsYear:  false,
		above:       true,
		entries:     entries.map(e => cardVM(e, opts)),
	};
}

/**
 * Mark where each year begins, and which side of a sideways axis each period's cards hang on.
 *
 * A year heading opens at the first dated period and wherever the year moves on, so a long campaign
 * reads in years first and seasons within them. The undated block is before every year and opens
 * none. Sides alternate period by period, the slide-deck timeline the reader asked for: one season's
 * cards above the line, the next season's below, so neighbours never crowd each other.
 */
function markYearsAndSides(periods) {
	let lastYear = null;
	periods.forEach((period, index) => {
		period.above = index % 2 === 0;
		if (period.undated) return;
		period.startsYear = period.year !== lastYear;
		lastYear = period.year;
	});
	return periods;
}

/**
 * One track as its own timeline: every period it has anything in, oldest first.
 *
 * `count` and `killTotal` are of the WHOLE track, before the reader's filter: hiding kills must not
 * make a character read as never having killed anything, and an empty track is told apart from a
 * fully filtered one (`isEmpty` against `allHidden`).
 *
 * @param {{trackId, name, entries, actor?}} track
 * @param {{canEdit?: boolean, hidden?: string[]}} [opts]
 */
export function buildTrackVM(track, opts = {}) {
	const all = readEntries(track?.entries ?? []);
	const off = new Set(opts.hidden ?? []);
	const shown = all.filter(e => !off.has(e.source));
	const periods = groupByPeriod(shown);
	return {
		trackId:   track?.trackId ?? "",
		name:      track?.name ?? "",
		portrait:  track?.actor?.img ?? "",
		isEmpty:   !all.length,
		allHidden: all.length > 0 && !shown.length,
		count:     all.length,
		killTotal: killTotal(all),
		periods:   markYearsAndSides(periods.map(p => periodVM(p, p.entries, opts))),
	};
}

/**
 * Every track under ONE spine: the aggregate.
 *
 * The periods are the UNION of what the tracks have between them, so a season in which only one
 * character did anything is still one row across the whole board and the threads stay level with
 * each other. A lane with nothing in that season renders empty rather than being dropped, which is
 * what makes the columns readable as columns.
 *
 * Tracks with no entries at all are kept as lanes: an empty column under a character's name is how
 * the reader sees there is a thread there to write in.
 *
 * TWO SHAPES OF THE SAME CELLS. `periods[].lanes[]` is the board read down (a row per season), and
 * `swimlanes[].cells[]` is it read across (a row per thread, a column per season). Handlebars cannot
 * index one by the other, so the transposition happens here -- and the cells are the SAME objects in
 * both, so enriching one shape enriches the other.
 *
 * @param {Array<{trackId, name, entries, actor?}>} tracks
 * @param {{canEdit?: (trackId: string) => boolean, hidden?: string[]}} [opts]
 */
export function buildAggregateVM(tracks = [], opts = {}) {
	const canEdit = opts.canEdit ?? (() => false);
	const off = new Set(opts.hidden ?? []);

	// One pass over every track: the periods in play, keyed so a season shared by three tracks is
	// one row, and at the same time each track's entries bucketed under that same key.
	//
	// Bucketing here rather than filtering each track's whole list again per cell is what keeps the
	// board linear in the number of entries. Filtering per cell is periods x tracks x entries, which
	// on twenty seasons across five threads is ten thousand key builds to place five hundred cards.
	const byKey = new Map();
	const laneBuckets = new Map();
	const laneFacts = new Map();
	let total = 0;
	for (const track of tracks) {
		const all = sortEntries(track?.entries ?? []);
		total += all.length;
		const buckets = new Map();
		laneBuckets.set(track.trackId, buckets);
		laneFacts.set(track.trackId, { count: all.length });
		for (const entry of all) {
			if (off.has(entry.source)) continue;
			const key = periodKey(entry);
			if (!byKey.has(key)) byKey.set(key, periodFacts(entry));
			if (!buckets.has(key)) buckets.set(key, []);
			buckets.get(key).push(entry);
		}
	}

	const periods = markYearsAndSides([...byKey.values()].sort((a, b) => a.rank - b.rank).map(period => ({
		...periodVM(period, [], {}),
		// The lane, not the block, holds the cards here: a row of this table is one season across
		// every thread, and each cell is what that thread did in it.
		lanes: tracks.map(track => {
			const entries = laneBuckets.get(track.trackId)?.get(period.key) ?? [];
			return {
				trackId: track.trackId,
				name:    track.name,
				isEmpty: !entries.length,
				entries: entries.map(e => cardVM(e, { canEdit: canEdit(track.trackId) })),
			};
		}),
	})));

	const heads = tracks.map(t => ({
		trackId:  t.trackId,
		name:     t.name,
		portrait: t.actor?.img ?? "",
		count:    laneFacts.get(t.trackId)?.count ?? 0,
	}));

	return {
		tracks: heads,
		periods,
		swimlanes: heads.map((head, index) => ({ ...head, cells: periods.map(period => period.lanes[index]) })),
		isEmpty:   total === 0,
		allHidden: total > 0 && !periods.length,
	};
}

/**
 * Enrich every card's body, in place, for whichever shape the host built.
 *
 * The view model stays pure so the three hosts can build it without awaiting anything; this is the
 * one Foundry-only step, and it lives here so a card gaining a second enriched field reaches all
 * three hosts rather than whichever one was remembered.
 *
 * A card with an empty body is skipped rather than enriched to "": most milestone rows have none,
 * and a campaign's worth of them is hundreds of round trips that can only give back what they were
 * handed. The rest go out together, since they do not depend on each other.
 *
 * @param {{periods: Array}} vm  From buildTrackVM or buildAggregateVM. Mutated in place.
 * @returns {Promise<object>} The same vm, for chaining.
 */
export async function enrichTrackVM(vm) {
	const cards = [];
	for (const period of vm?.periods ?? []) {
		for (const card of period.entries ?? []) cards.push(card);
		for (const lane of period.lanes ?? []) cards.push(...lane.entries);
	}
	await Promise.all(cards.map(async (card) => {
		card.enrichedBody = card.body ? await enrichHTML(card.body, {}) : "";
	}));
	return vm;
}
