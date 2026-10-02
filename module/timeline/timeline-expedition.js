// AN EXPEDITION, ON THE TIMELINES OF EVERYONE WHO WENT.
//
// Pure: who went, where they were bound, and the row that says so. The writing is next door, in
// timeline-expedition-record.js, which reads the trip out of the expedition log and puts this row
// on each thread.
//
// WHO SAYS WHEN. The Expedition walkthrough (dialogs/ExpeditionDialog.js) stamps the season the party
// SET OUT in when the GM steps into Running the Journey by Next, and writes the row when the GM first
// steps into the homecoming by Next. Stepping back, or jumping by the table of contents, is reading
// the walkthrough rather than making the trip, and records nothing. The Return Triumphant move
// (actors/steading/return-triumphant.js) marks the trip triumphant once it has been made, from
// whichever surface it was opened on; from the steading sheet, only a trip that came home this
// season (timeline-expedition-record.js#cameHomeNow).
//
// ONE ROW PER TRIP PER THREAD, keyed by the trip, dated the season they came HOME (the trip is
// something that happened to them once it was over). The season they set out in is said in the row,
// so a trip that ran from summer into autumn reads that way. Returning Triumphant after the row is
// written updates its words rather than adding a second.

import { escHtml, joinNames } from "../utils/strings.js";
import { format, localize } from "../utils/i18n.js";
import { periodLabel } from "../seasons/current-season.js";
import { travelPlace } from "../data/travel-times.js";
import { normalizeJourney } from "../utils/travel-route.js";
import { customStops } from "../utils/custom-route.js";

/** Who went: every character not ticked out of this trip's party (the Outfit step's chips). */
export function expeditionParty(trip, characters = []) {
	const out = trip?.partyOut ?? {};
	return characters.filter(pc => pc?.id && !out[pc.id]);
}

/**
 * Where a trip was bound, by name: the far end of a drawn way when one is ticked on, else the
 * picked destination. "" when it was bound nowhere the books name.
 *
 * Off the trip's stored journey alone, the way the route step reads it (`normalizeJourney`), so a
 * trip can be named from outside the walkthrough with nothing open.
 */
export function tripBoundToName(trip) {
	const { start, destination, custom } = normalizeJourney(trip?.journey);
	const stops = custom?.on ? customStops(start, custom) : [];
	const place = stops.length > 1 ? travelPlace(stops.at(-1).slug) : travelPlace(destination);
	return place?.name ?? "";
}

/**
 * The row an expedition writes.
 *
 * @param {object} opts
 * @param {string} opts.tripId
 * @param {string} opts.label        The trip's name as the walkthrough calls it (expeditionLabel).
 * @param {string} [opts.place]      Where they were bound, by name.
 * @param {{season: string, year: number}|null} [opts.setOut]  When they left, if it was stamped.
 * @param {boolean} [opts.triumphant]  They Returned Triumphant.
 * @param {string[]} [opts.partyNames]
 */
export function expeditionMilestone({ tripId, label, place = "", setOut = null, triumphant = false, partyNames = [] } = {}) {
	const lines = [];
	if (setOut?.season) lines.push(format("stonetop.timeline.milestone.expeditionSetOut", { when: periodLabel(setOut) }));
	if (partyNames.length) lines.push(format("stonetop.timeline.milestone.expeditionParty", { names: joinNames(partyNames) }));
	if (triumphant) lines.push(localize("stonetop.timeline.milestone.expeditionTriumphant"));
	return {
		source: "expedition",
		key:    `expedition:${tripId}`,
		title:  format("stonetop.timeline.milestone.expedition", { label }),
		place:  String(place ?? ""),
		body:   lines.map(line => `<p>${escHtml(line)}</p>`).join(""),
		// The words may change after the row is written (a triumph, a renamed destination); the
		// title and the date are the GM's once it exists.
		refresh: ["body", "place"],
	};
}
