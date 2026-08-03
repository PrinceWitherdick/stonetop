// The two stand-in faces a person with no art of their own can show, and the one test that
// says "either of these means no portrait".
//
// PERSON_DEFAULT_IMG is what the ACTOR WEARS — the Book I p.392 "human, individual"
// creature-type mark, the same one an art-less follower gets, so people, followers and
// monsters all read as one family of marks. It is written onto the NPC itself
// (StonetopActor#_preCreate, plus the load-time backfill in hooks/Ready.js) rather than
// supplied at render, so every surface that shows `actor.img` knowing nothing about this
// system — the sidebar directory, a drag preview, a chat portrait — gets it too, instead of
// Foundry's mystery-man.
//
// PERSON_ROSTER_IMG is what the STEADING ROSTER DRAWS in that person's avatar cell. The
// Residents / Neighbors tables are dense grids of 22px avatars, and a column of dark discs
// there reads as clutter rather than as blanks, so an unfilled slot shows the lighter empty
// figure instead. Display only: nothing stores it, and the actor keeps the mark above.
//
// Both stay PLACEHOLDERS, not art: isDefaultImg (utils/strings.js) reports both as "no art",
// so every "has this person a portrait?" test — the NPC sheet's header, the People gallery's
// already-taken scan, a follower card built from an NPC — keeps answering honestly whichever
// one it meets. That is why this lives in its own module rather than beside its first
// consumer: strings.js has to see it, and strings.js is a leaf that migration/compat.js
// depends on, so nothing here may import anything but the system id.

import { SYSTEM_ID, LEGACY_FLAG_SCOPES } from "../system-id.js";

const PERSON_PLACEHOLDER_SUFFIXES = [
	"assets/icons/people/default_profile.svg", // stored on the actor
	"assets/icons/people/empty_profile.svg",   // drawn by the roster
];

/** The mark an art-less NPC wears, under the ACTIVE system id — what every write stores. */
export const PERSON_DEFAULT_IMG = `systems/${SYSTEM_ID}/${PERSON_PLACEHOLDER_SUFFIXES[0]}`;

/** The empty-slot figure the Residents/Neighbors roster draws. Rendered, never stored. */
export const PERSON_ROSTER_IMG = `systems/${SYSTEM_ID}/${PERSON_PLACEHOLDER_SUFFIXES[1]}`;

// Both files under every id this package has shipped under, so an actor stamped before a
// rename still reads as un-portraited rather than as someone's chosen art. Mirrors
// migration/compat.js#systemAssetVariants, which cannot be imported here without a cycle
// (compat imports strings.js, and strings.js imports this).
const PERSON_PLACEHOLDER_IMGS = new Set(
	[SYSTEM_ID, ...LEGACY_FLAG_SCOPES].flatMap(
		id => PERSON_PLACEHOLDER_SUFFIXES.map(suffix => `systems/${id}/${suffix}`))
);

/**
 * True when `img` is one of this system's people placeholders rather than a portrait somebody
 * chose. Tolerates a leading slash, so `/systems/...` matches the same as the bare path.
 */
export function isPersonPlaceholderImg(img) {
	if (!img) return false;
	return PERSON_PLACEHOLDER_IMGS.has(String(img).replace(/^\//, ""));
}
