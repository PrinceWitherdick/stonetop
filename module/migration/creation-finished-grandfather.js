// A character now reads as finished only once its walkthrough's Finish stamps CREATION_FINISHED_FLAG
// (actors/character/onboarding-progress.js): a committed playbook alone is not enough, because
// "Save & close" commits one part-way through.
//
// The stamp is new, though, and every character a world already has was made before anything wrote
// it. Those all read as finished under the old rule (a playbook meant done), and without this one
// whose last edit pass left an `onboardingProgress` flag behind would wake up as "exited onboarding",
// draw the Replace dialog's "still being created" warning, and be re-filed on the steading roster
// by its next Finish, undoing a GM who had taken them off it.
//
// So every character with a committed playbook and no stamp is stamped, ONCE PER WORLD. Not once per
// version: the release that ships this keeps writing the stamp itself, so a later re-run would only
// reach characters saved and closed part-way under the new code, and mark them finished when they
// are not. The world's own sweep record says whether it has run: once-per-version stamps the key
// after the first success, and any stamp at all means a later version skips the work.

import { STONETOP_SCOPE } from "../actors/character/StonetopFlags.js";
import { CREATION_FINISHED_FLAG } from "../actors/character/onboarding-progress.js";
import { sweepVersion } from "./once-per-version.js";

export const CREATION_FINISHED_SWEEP = "creationFinishedGrandfather";

/** The characters to stamp: a committed playbook, and no finished stamp yet. PURE. */
export function unstampedFinishedCharacters(actors) {
	return Array.from(actors ?? []).filter(a =>
		a?.type === "character"
		&& !!a.system?.playbook?.slug
		&& !a.flags?.[STONETOP_SCOPE]?.[CREATION_FINISHED_FLAG]);
}

/**
 * Stamp every pre-stamp character with a playbook as finished (see above). Does nothing in a world
 * that has run it before, under any version.
 *
 * @param {object} [options]
 * @param {Iterable} [options.actors]
 * @returns {Promise<number>} how many characters were written to
 */
export async function grandfatherCreationFinished({ actors = globalThis.game?.actors ?? [] } = {}) {
	if (sweepVersion(CREATION_FINISHED_SWEEP)) return 0;
	let written = 0;
	for (const actor of unstampedFinishedCharacters(actors)) {
		await actor.setFlag(STONETOP_SCOPE, CREATION_FINISHED_FLAG, true);
		written += 1;
	}
	return written;
}
