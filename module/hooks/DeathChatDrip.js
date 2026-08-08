import { STONETOP_SCOPE, resolvedFlagProperty } from "../actors/character/StonetopFlags.js";
import { DEATHS_DOOR_FLAG, POST_DEATH_INSERT_SLUGS, pastDeathKind } from "../actors/character/deaths-door.js";

/**
 * The dead keep talking, and the log should say so.
 *
 * A character who stepped through the Last Door — or who came back wearing one of the three
 * post-death inserts — gets a dark fringe hanging off the bottom edge of everything they say
 * in chat. It carries no rule and clicks nothing; it is there so a Ghost's line doesn't scroll
 * past reading like anyone else's.
 *
 * STAMPED AT CREATION, not read at render. The kind rides along on the message as a flag, so a
 * message means "spoken while dead" for good: the log stays a record of when they died rather
 * than being rewritten the moment they do. (It also keeps the render pass off the actor
 * documents, which matters when a long backlog re-renders.) The cost is that messages already
 * in the log when a PC dies never pick the fringe up — which is the reading we want anyway.
 */

/** Message flag (under the system scope) holding the speaker's {@link pastDeathKind}. */
export const DEATH_DRIP_FLAG = "deathDrip";

const DRIP_CLASS = "stonetop-death-drip";

/**
 * The `updateSource` fragment stamping a message with its speaker's death, or null for a living
 * speaker. Returned as a fragment rather than a bare value so the flag path lives only here and
 * the preCreate hook can fold it in with the changes it is already making.
 */
export function deathDripStamp(actor) {
	const kind = pastDeathKind({
		state:      resolvedFlagProperty(actor, DEATHS_DOOR_FLAG) ?? null,
		insertSlug: resolvedFlagProperty(actor, "postDeathInsert.slug") ?? null,
	});
	return kind ? { [`flags.${STONETOP_SCOPE}.${DEATH_DRIP_FLAG}`]: kind } : null;
}

/**
 * Put the fringe on a rendered message (dispatched from stonetop.js renderChatMessageHTML).
 *
 * Three classes at most. The base one carries the whole effect and the kind modifier only
 * re-tints the ink, so an unrecognised kind from a hand-edited flag still drips rather than
 * silently doing nothing. `--insert` says the speaker came BACK rather than merely died, which
 * is the line the black card repaint is drawn on — the same distinction, and the same reason,
 * as the sheet's `stonetop-past-death` (see StonetopCharacterSheet._stampPastDeath). Named once
 * here rather than spelled out as a three-way `:is()` on every rule that wants it.
 */
export function markDeathDrip(message, html) {
	const root = html?.[0] ?? html;
	if (!root?.classList) return;

	const kind = message?.getFlag?.(STONETOP_SCOPE, DEATH_DRIP_FLAG);
	if (!kind) return;

	root.classList.add(DRIP_CLASS, `${DRIP_CLASS}--${kind}`);
	if (POST_DEATH_INSERT_SLUGS.includes(kind)) root.classList.add(`${DRIP_CLASS}--insert`);
}
