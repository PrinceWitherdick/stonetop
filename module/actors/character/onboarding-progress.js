// ── Where a player has got to in character creation ────────────────────────────
// The creation flow stamps its position on the character as
// flags.stonetop_pwd.onboardingProgress (see StonetopCharacterSheet#_setOnboardingState),
// which is the only part of a player's local, uncommitted progress the GM can read.
//
// Two surfaces read it, and they must agree: the Welcome guide's player roster ("on page
// 4 of 9"), and the confirmation shown before a replacement mint deletes that character —
// where "they are halfway through creation" is the fact that should stop the GM's hand.

import { STONETOP_SCOPE } from "./StonetopFlags.js";

/**
 * Turn a character's onboardingProgress flag (+ its committed playbook, if any) into a
 * short note — { playbook, text, status }, where status keys the styling and playbook
 * names the chosen playbook (committed wins; otherwise the in-progress pick the flow
 * stamps onto the flag, since the GM can't read the player's local resume snapshot).
 * With no flag, a character with no playbook yet hasn't been touched; one that has a
 * playbook is finished.
 */
export function progressLabel(p, playbook) {
	const hasPlaybook = !!playbook?.slug;
	// Committed name wins; before commit, fall back to the playbook stamped on the
	// progress flag (blank at the picker stage, where nothing is chosen yet).
	const name = (hasPlaybook ? playbook.name : p?.playbook) || "";
	// A committed playbook means creation is done (or was explicitly saved), so it
	// always reads "Finished" — even if a mid-creation "Save & close" or an edit pass
	// left a stale onboardingProgress flag behind that hasn't been cleared yet. The
	// live "picker"/"on page N" states only apply before a playbook is committed,
	// which is exactly when there's no playbook. `playbook` is attached once at the
	// return, so each branch only carries its own status text.
	const label =
		hasPlaybook          ? { text: "Finished", status: "finished" } :
		!p                   ? { text: "not started yet", status: "not-started" } :
		p.state === "picker" ? { text: "on playbook picker", status: "picker" } :
		p.state === "exited" ? { text: "exited onboarding", status: "exited" } :
		// "onboarding" — or a legacy flag with just step/total and no state. A
		// known page count reads "on page N of M"; otherwise (a partial/legacy flag
		// with no usable total) still show the player as mid-creation rather than
		// dropping them from the roster entirely.
		p.total > 0          ? { text: `on page ${p.step} of ${p.total}`, status: "onboarding" } :
		                       { text: "in character creation", status: "onboarding" };
	return { playbook: name, ...label };
}

/** A character's progress note, read straight off the actor. */
export function progressFor(actor) {
	return progressLabel(actor?.getFlag?.(STONETOP_SCOPE, "onboardingProgress"), actor?.system?.playbook);
}

/**
 * Has someone started building this character without finishing it?
 *
 * True for every live creation state — at the picker, part-way through onboarding, or
 * backed out with answers saved — and false both for an untouched character and a
 * finished one. This is the question worth asking before deleting a character: the two
 * false cases lose nothing, and the true ones lose work the player can't get back.
 */
export function isMidCreation(actor) {
	const { status } = progressFor(actor);
	return status !== "finished" && status !== "not-started";
}
