// "Give me one" — the randomizer beside each GM Moves heading. Picks a move out of that
// section's list and whispers it to the GM.
//
// The paper playbook's lists are for reading down when there is time. This is for the other
// case: the table has just handed the GM a golden opportunity, everyone is looking at them,
// and the list has gone to soup. One move, named, with its gloss, is something to react to in
// a way that thirty of them is not.
//
// WHISPERED, never public, and that is not a preference. A GM move lands when it arrives as
// fiction — "the bridge gives" — so posting the mechanical name of the move to the table
// announces the trick before it is played, and hands the players the move the GM has not made
// yet. Public would break the thing this is meant to help with.
//
// The pick is a pure function over an injectable `rng`, the way every other random pick in
// this system is written (pickRandomPortrait, rollOnTable, rollTerrain), so the tests pin the
// roll rather than hoping for one.
import { gmMoveSection } from "./gm-moves.js";
import { pickRandomExcluding } from "../utils/arrays.js";
import { stonetopChatCard, moveChatCard } from "../utils/chat.js";
import { escHtml } from "../utils/strings.js";
import { localize } from "../utils/i18n.js";

/**
 * One move out of a section's list, at random.
 *
 * Prefers a move OTHER than `exclude` — the caller passes the last one it drew for this
 * section, so clicking twice always moves on. A randomizer that says "Hurt someone" twice in a
 * row reads as broken rather than random, and with seven moves in the shortest list that is a
 * one-in-seven event, not a curiosity. Falls back to the whole list when excluding would leave
 * nothing, which is only a one-move section.
 *
 * @param   {string} sectionKey  "basic" | "exploration" | "homefront"
 * @param   {object} [options]
 * @param   {() => number} [options.rng]  Injectable for the tests.
 * @param   {string} [options.exclude]    Name of the move to avoid repeating.
 * @returns {import("./gm-moves.js").GmMove|null}  null for an unknown section key.
 */
export function randomGmMove(sectionKey, { rng = Math.random, exclude = "" } = {}) {
	const moves = gmMoveSection(sectionKey)?.moves ?? [];
	return pickRandomExcluding(moves, { exclude, rng, keyOf: m => m?.name ?? m });
}

/**
 * Draw a move and whisper it to the GMs. Returns the move drawn, so the caller can hold it as
 * the next call's `exclude`; null when nothing was posted.
 *
 * @param   {string} sectionKey
 * @param   {object} [options]
 * @param   {() => number} [options.rng]
 * @param   {string} [options.exclude]
 * @param   {object} [options.speaker]  ChatMessage speaker data.
 * @returns {Promise<import("./gm-moves.js").GmMove|null>}
 */
export async function postRandomGmMove(sectionKey, { rng, exclude, speaker } = {}) {
	// The section is resolved here for its `noteKey` (the second title line) and again inside
	// randomGmMove for its moves. That is one `Array.find` over a three-row frozen table —
	// cheaper than the private third function that existed to avoid it.
	const section = gmMoveSection(sectionKey);
	const move = randomGmMove(sectionKey, { rng, exclude });
	if (!move) return null;
	if (!globalThis.ChatMessage?.create) return null;

	await ChatMessage.create({
		// Two-line title: the prompt, then the section's own note under it ("Any time you owe
		// the table a move"). The note rather than the section TITLE, which would read "Make a
		// GM move / GM Moves"; the note says which list this came out of AND when that list
		// applies, which is the half a GM mid-sentence actually needs.
		//
		// The gloss goes through escHtml because moveChatCard renders its description RAW (it
		// is built for move text that was escaped at storage). These glosses are plain prose
		// from module source, and one of them carries quote marks.
		content: stonetopChatCard(
			[localize("stonetop.gmToolkit.moves.randomTitle"), localize(section.noteKey)],
			moveChatCard(move.name, escHtml(move.gloss)),
			"stonetop-gm-move-chat-card",
		),
		// All GMs, which is what "GM only" means here: a second GM at the table is running the
		// same fiction and is not who this is being hidden from. Players are.
		whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id),
		speaker,
	});
	return move;
}
