// WHEN A SITE WAS VISITED, AND THE ROW THAT VISIT WRITES. Pure.
//
// A site is GM prep: nothing in play says "they went there" by itself, so the GM says it, from the
// card (site-visit.js). Each visit is remembered on the site page as the season it happened in, and
// written onto the timeline of everyone who went and onto Stonetop's own.
//
// A SECOND VISIT IN A LATER SEASON IS ITS OWN ROW. The key carries the season, so going back to the
// Barrow in winter does not vanish into the summer it was first found in; marking the same season
// twice is one row.

import { format } from "../utils/i18n.js";
import { campaignYear, periodLabel, seasonRank, seasonStampKey } from "../seasons/current-season.js";

/** The site page flag holding every visit, as `[{season, year}]`, oldest first. */
export const SITE_VISITS_FLAG = "visits";

/** A site's visits, cleaned: dated ones only, one per season, oldest first. */
export function readVisits(raw) {
	const seen = new Set();
	return (Array.isArray(raw) ? raw : [])
		.filter(v => v?.season)
		.map(v => ({ season: v.season, year: campaignYear(v.year) }))
		.filter(v => {
			const key = seasonStampKey(v);
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		})
		.sort((a, b) => seasonRank(a) - seasonRank(b));
}

/** The visits with one more, unless that season is already among them. */
export function addVisit(raw, when) {
	return readVisits([...readVisits(raw), when]);
}

/** What the GM's card says about visits: the latest season, or nothing for a site never visited. */
export function visitedLabel(raw) {
	const last = readVisits(raw).at(-1);
	return last ? format("stonetop.sites.visit.visited", { when: periodLabel(last) }) : "";
}

/**
 * The row a visit writes.
 *
 * ⚠ NO `placeUuid`. The page is GM prep in a GM-only journal; a link to it on a player's timeline
 * would be a link they cannot open. The NAME is all that goes across, and that is the GM's choice
 * the moment they mark it visited (the picker says so).
 */
export function siteVisitMilestone(page, when) {
	return {
		source: "site",
		key:    `site:${page?.id ?? ""}:${when?.year ?? 1}:${when?.season ?? ""}`,
		title:  format("stonetop.timeline.milestone.site", { name: page?.name ?? "" }),
		place:  page?.name ?? "",
		season: when?.season ?? "",
		year:   when?.year ?? 1,
	};
}
