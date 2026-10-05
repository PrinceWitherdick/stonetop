// A TAG ON A TYPED TIMELINE ENTRY: one kind's chip borrowed, or one the table made for itself.
//
// A row the system records wears its kind's chip and colour (timeline-view.js#KIND_META,
// timeline-colours.js). A row somebody TYPED wore nothing, which left a wound written up by hand,
// or a feast nobody's code knows about, looking like small talk beside the record. So a typed row
// may carry ONE tag (`entry.tag`):
//
//   - a KIND's id ("wound", "arcana", ...), and it reads as that kind: same chip, same colour, same
//     line in the reader's Filter menu. Its `source` stays "hand" -- it is still a row somebody
//     typed, and the writers that find rows by source (`addKills` above all) must never mistake it
//     for one of theirs.
//   - a CUSTOM tag's id (`tag-<random>`), a name and a colour the table chose, kept for the whole
//     world on the Timeline journal (timeline-tag-store.js) so every thread offers the same list.
//
// Pure. The Foundry half (reading and writing the journal's flag) is timeline-tag-store.js.
//
// ⚠ A CUSTOM TAG'S COLOUR IS ONE COLOUR IN, FOUR OUT, as a GM's repainted kind is: the chosen hex
// is walked along its own hue until it reads on each skin (timeline-colours.js#kindColourSet). The
// four answers ride on the card as custom properties and the stylesheet picks the one for the skin
// in force, so no <style> has to be written per tag and a tag made on another client paints the
// moment its row does.

import { TIMELINE_COLOUR_KINDS, kindColourSet } from "./timeline-colours.js";
import { normalizeHex } from "../relmap/relmap-ink.js";
import { clipText } from "../utils/strings.js";

/** The flag on the Timeline journal that holds the world's custom tags, keyed by tag id. */
export const TIMELINE_TAGS_FLAG = "timelineTags";

/** What every custom tag's id starts with, so one can never be mistaken for a kind. */
export const CUSTOM_TAG_PREFIX = "tag-";

/** The longest name a custom tag keeps. A chip is one short word or two, not a sentence. */
export const TAG_NAME_MAX = 32;

/** The colour the New tag field opens on: a slate blue no shipped kind wears. */
export const DEFAULT_TAG_COLOUR = "#3f5f8a";

/** The custom property each skin's answer rides in, in TIMELINE_COLOUR_MODES order. */
const MODE_PROPERTY = Object.freeze({
	light:     "--tl-tag-light",
	dark:      "--tl-tag-dark",
	lightHigh: "--tl-tag-light-high",
	darkHigh:  "--tl-tag-dark-high",
});

/** Is this one of the kinds a typed row may borrow? */
export function isKindTag(tag) {
	return TIMELINE_COLOUR_KINDS.includes(tag);
}

/** Is this the id of a custom tag (whether or not the world still has it)? */
export function isCustomTagId(tag) {
	const id = String(tag ?? "");
	return id.startsWith(CUSTOM_TAG_PREFIX) && id.length > CUSTOM_TAG_PREFIX.length;
}

/** A tag name as it is kept: one line, spaces collapsed, capped. */
export function cleanTagName(name) {
	return clipText(String(name ?? "").replace(/\s+/g, " ").trim(), TAG_NAME_MAX).trim();
}

/**
 * One stored custom tag, cleaned, or null for a row that is not one.
 *
 * ⚠ THE COLOUR IS THE GATE INTO A STYLE ATTRIBUTE, so anything that is not a `#rrggbb` is refused
 * rather than guessed at, exactly as the kinds' colours are (timeline-colours.js).
 */
export function normalizeCustomTag(raw, id = raw?.id) {
	const tagId = String(id ?? "").replace(/\./g, "").trim();
	const name = cleanTagName(raw?.name);
	const colour = normalizeHex(raw?.colour);
	if (!isCustomTagId(tagId) || !name || !colour) return null;
	return { id: tagId, name, colour };
}

/**
 * The world's custom tags, cleaned and in the order a menu lists them: by name.
 *
 * @param {object|null} raw  the journal flag, keyed by tag id.
 * @returns {Array<{id, name, colour}>}
 */
export function readCustomTags(raw) {
	if (!raw || typeof raw !== "object") return [];
	return Object.entries(raw)
		.map(([id, tag]) => normalizeCustomTag(tag, tag?.id || id))
		.filter(Boolean)
		.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

/** The custom tag already called this (case and spacing aside), or null. */
export function findTagByName(tags, name) {
	const wanted = cleanTagName(name).toLocaleLowerCase();
	if (!wanted) return null;
	return (tags ?? []).find(tag => tag.name.toLocaleLowerCase() === wanted) ?? null;
}

/** Tags by id, for the builders that look one up per card. Takes a list or an index already made. */
export function indexCustomTags(tags) {
	if (tags instanceof Map) return tags;
	return new Map((Array.isArray(tags) ? tags : []).map(tag => [tag.id, tag]));
}

/**
 * The inline style a custom tag's marks wear: its colour as each skin reads it. The stylesheet's
 * `.stonetop-timeline-kind--custom` rules choose among them. "" for a colour that is not one.
 * Cheap to call per card: `kindColourSet` caches the walk.
 */
export function customTagStyle(colour) {
	const set = kindColourSet(colour);
	if (!set) return "";
	return Object.entries(MODE_PROPERTY).map(([mode, prop]) => `${prop}: ${set[mode].hex};`).join(" ");
}

/**
 * The tag a typed row is wearing, as the world has it now, or "" for none. A custom tag the world
 * no longer holds is none: the row falls back to a plain typed card rather than a chip with no
 * name. A milestone row's tag is never read; its source is its kind.
 */
export function liveTag(entry, tagIndex) {
	if (entry?.source && entry.source !== "hand") return "";
	const tag = String(entry?.tag ?? "");
	if (isKindTag(tag)) return tag;
	if (isCustomTagId(tag) && indexCustomTags(tagIndex).has(tag)) return tag;
	return "";
}

/**
 * Which line of the reader's Filter menu a row answers to: its source for a milestone, and for a
 * typed row the tag it wears (a borrowed kind files with that kind), or "hand" without one.
 */
export function filterKey(entry, tagIndex) {
	if (entry?.source && entry.source !== "hand") return entry.source;
	return liveTag(entry, tagIndex) || "hand";
}
