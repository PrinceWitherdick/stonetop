// WHERE THE WORLD'S CUSTOM TIMELINE TAGS LIVE: a flag on the Timeline journal.
//
// On the journal rather than in a world setting because the journal is OWNER for every player
// (timeline-store.js says why), and a player tagging their own thread must be able to make the tag
// they want. A world setting can be written by the GM alone, which would make "a way to create new
// tags" a GM's errand.
//
// Each tag is its own key under the flag, written by a dotted path, so two players naming tags in
// the same moment both keep theirs: the same reason the entries are keyed (TimelinePageModel).

import { SYSTEM_ID } from "../system-id.js";
import { findTimelineJournal } from "./timeline-store.js";
import {
	CUSTOM_TAG_PREFIX, TIMELINE_TAGS_FLAG, cleanTagName, findTagByName, normalizeCustomTag, readCustomTags,
} from "./timeline-tags.js";
import { normalizeHex } from "../relmap/relmap-ink.js";

/** The world's custom tags, by name. [] in a world with no Timeline journal yet. */
export function worldCustomTags(journal = findTimelineJournal()) {
	return readCustomTags(journal?.getFlag?.(SYSTEM_ID, TIMELINE_TAGS_FLAG) ?? null);
}

/**
 * Make a custom tag, or hand back the one already called that.
 *
 * A second "Hunters" would be two lines in the Filter menu that mean the same thing, so a name the
 * world already has answers with that tag (its colour unchanged) rather than minting a twin.
 *
 * @returns {Promise<{tag: {id, name, colour}|null, existed: boolean, reason?: string}>}
 *          `reason` is "name", "colour" or "journal" when nothing could be made.
 */
export async function createCustomTag({ name, colour }, {
	journal = findTimelineJournal(),
	makeId = () => foundry.utils.randomID(),
} = {}) {
	const clean = cleanTagName(name);
	if (!clean) return { tag: null, existed: false, reason: "name" };
	const hex = normalizeHex(colour);
	if (!hex) return { tag: null, existed: false, reason: "colour" };
	if (!journal?.isOwner) return { tag: null, existed: false, reason: "journal" };

	const twin = findTagByName(worldCustomTags(journal), clean);
	if (twin) return { tag: twin, existed: true };

	const tag = normalizeCustomTag({ name: clean, colour: hex }, `${CUSTOM_TAG_PREFIX}${makeId()}`);
	await journal.update({ [`flags.${SYSTEM_ID}.${TIMELINE_TAGS_FLAG}.${tag.id}`]: tag });
	return { tag, existed: false };
}
