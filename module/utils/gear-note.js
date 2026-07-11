import { GEAR_TERMS } from "../data/gear-terms.js";
import { findGearTerm } from "./gear-term-tooltips.js";
import { escHtml } from "./strings.js";

// Quick-insert tag chips for the Add-Item dialog. Each chip drops its `insert`
// text into the freeform note field (comma-separated); `wrapGearNoteTerms` later
// wraps the recognised terms in <em> so they render italic and pick up the shared
// gear-term tooltips. The tooltip on the chip itself is GEAR_TERMS' own wording.
//
// `insert` stays plain here (no markup) so the note field reads cleanly while the
// player edits it; the <em> wrapping happens once, on save.
export const GEAR_NOTE_CHIPS = [
	// Range — how far the item reaches.
	{ group: "range", insert: "hand",  term: "hand" },
	{ group: "range", insert: "close", term: "close" },
	{ group: "range", insert: "reach", term: "reach" },
	{ group: "range", insert: "near",  term: "near" },
	{ group: "range", insert: "far",   term: "far" },
	// Qualities — how the item behaves.
	{ group: "tag", insert: "thrown",   term: "thrown" },
	{ group: "tag", insert: "reload",   term: "reload" },
	{ group: "tag", insert: "forceful", term: "forceful" },
	{ group: "tag", insert: "messy",    term: "messy" },
	{ group: "tag", insert: "area",     term: "area" },
	{ group: "tag", insert: "slow",     term: "slow" },
	{ group: "tag", insert: "awkward",  term: "awkward" },
	{ group: "tag", insert: "dangerous", term: "dangerous" },
	{ group: "tag", insert: "grabby",   term: "grabby" },
	// Bonuses — numeric modifiers. "x piercing" scales with the steading's
	// Prosperity at render time (see _transformPiercingNote).
	{ group: "bonus", insert: "+1 damage",  term: "damage" },
	{ group: "bonus", insert: "x piercing", term: "piercing" },
	{ group: "bonus", insert: "+1 armor",   term: "armor" },
];

/**
 * The chip list decorated with the tooltip text pulled from GEAR_TERMS, so the
 * dialog can render `data-tooltip` without re-deriving it. Chips whose term has
 * no entry (should not happen) fall back to no tooltip.
 */
export function gearNoteChips() {
	return GEAR_NOTE_CHIPS.map(c => ({ ...c, tooltip: GEAR_TERMS[c.term] ?? "" }));
}

/**
 * Wrap each comma-separated part of a freeform note in <em> when it is a
 * recognised gear term, leaving prose untouched. Idempotent-ish: a part that
 * already contains markup won't match findGearTerm, so it is left as typed.
 *
 * The "x piercing" family keeps its leading count OUTSIDE the <em> (so the note
 * reads `x <em>piercing</em>`), because _transformPiercingNote matches that exact
 * shape to swap in the steading's live Prosperity.
 *
 * The note renders RAW on the sheet (triple-stache {{{note}}}), so every part of
 * the player's input is HTML-escaped here; only the <em> tags this function itself
 * emits are live markup. Otherwise a note like `<img onerror=…>` would execute on
 * render. (Whitespace lead/trail come from a \s* match, so they need no escaping.)
 *
 * @param {string} note
 * @returns {string}
 */
export function wrapGearNoteTerms(note) {
	if (!note) return "";
	return note.split(",").map(part => {
		const trimmed = part.trim();
		if (!trimmed) return part;
		const lead  = part.match(/^\s*/)[0];
		const trail = part.match(/\s*$/)[0];
		const pierce = trimmed.match(/^([x\d]+)\s+piercing$/i);
		if (pierce) return `${lead}${escHtml(pierce[1])} <em>piercing</em>${trail}`;
		if (findGearTerm(trimmed)) return `${lead}<em>${escHtml(trimmed)}</em>${trail}`;
		return escHtml(part);
	}).join(",");
}

/**
 * Build a resource track for a uses/ammo circle count. A plain uses track is
 * `max` unlabelled circles; ammunition mirrors the shipped bows/crossbows, tagging
 * the last two circles "low ammo" / "all out" (or just "all out" for a single one).
 * Lives here beside the other gear-note helpers so any gear authoring path can reuse it.
 *
 * @param {number}  uses    circle count
 * @param {boolean} isAmmo  label the track as ammunition
 * @returns {{ max:number, title:null, labels:string[] }}
 */
export function buildUsesResource(uses, isAmmo) {
	const labels = new Array(uses).fill("");
	if (isAmmo) {
		if (uses >= 2) { labels[uses - 2] = "low ammo"; labels[uses - 1] = "all out"; }
		else { labels[0] = "all out"; }
	}
	return { max: uses, title: null, labels };
}
