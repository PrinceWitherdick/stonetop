// Love letters (Book I, "Writing Moves & Love Letters", p.568) — single-use, GM-authored
// moves addressed to one PC. Mechanically a love letter is an embedded `move` item, forced
// to moveType "other" (so it's a plain narrative/roll move) and flagged loveLetter so the
// sheet surfaces it in its own top-of-Moves section and consumes it (deletes it) once the
// player resolves it. Unlike a player custom move it is NOT flagged `custom`, so it never
// shows the player an edit affordance and never lands in the "Other Moves" list.
//
// The document shaping lives here so both the authoring dialog (LoveLetterDialog, launched
// from the GM hotbar macro) and any later edit reuse the exact same shape.

import { STONETOP_SCOPE } from "./StonetopFlags.js";
import { normalizeRollType, STAT_KEYS } from "../../utils/roll-types.js";
import { formatCustomMoveDescription } from "../../utils/custom-move-text.js";
import { buildMoveTierResults, parseTierInput } from "../../utils/move-results.js";
import { clampInt } from "../../utils/custom-move-data.js";

export const LOVE_LETTER_FLAG = "loveLetter";

// Coerce the dialog's pick-options input (a newline-separated textarea string, or an
// already-split array) into a clean array of non-blank option strings.
function normalizeOptions(raw) {
	const list = Array.isArray(raw) ? raw : String(raw ?? "").split("\n");
	return list.map((o) => String(o).trim()).filter(Boolean);
}

// True for a love letter (flagged at creation in buildLoveLetterData). The flag keeps it
// out of the custom-move / foreign-move "other" list and into its own section.
export function isLoveLetter(item) {
	return !!item?.flags?.[STONETOP_SCOPE]?.[LOVE_LETTER_FLAG];
}

// Shape raw dialog input into the embedded-item document data (used by both create and
// update). A love letter is a single-use move: name (its title), body prose, and an
// optional fixed-stat roll with 10+/7-9/6- result text. moveResults follows the shape
// rollStat consumes: { success|partial|failure: { label, value } }, or null for a no-roll
// (read-aloud) letter. rollType is limited to the six character stats — a love letter is
// authored for one specific scene, so "ask a stat each time" isn't offered. `noXpOnMiss`
// mirrors the "Mark XP on a miss" checkbox (inverted), and `signed` is the closing sign-off.
export function buildLoveLetterData(input) {
	const { rollType, success, partial, failure } = parseTierInput(input, STAT_KEYS);

	// A shared "choose from this list" pool (one option per line) plus a per-tier count of
	// how many to pick — the book's "on a 10+, pick 1; on a 7-9, pick 2; …" love letters.
	const options = normalizeOptions(input?.options);
	const p = input?.picks ?? {};
	const pickN = (v) => clampInt(v, 0, 20);
	const pS = pickN(p.success), pP = pickN(p.partial), pF = pickN(p.failure);

	const moveResults = (rollType && (success || partial || failure || pS || pP || pF || options.length))
		? buildMoveTierResults({ success, partial, failure }, { success: pS, partial: pP, failure: pF })
		: null;

	return {
		name: String(input?.name ?? "").trim() || "Love Letter",
		type: "move",
		system: {
			moveType: "other",
			description: formatCustomMoveDescription(input?.description ?? ""),
			rollType,
			moveResults,
			// The shared pick-from pool only makes sense alongside a roll (the roll picks how
			// many); a no-roll read-aloud letter carries none.
			pickOptions: rollType ? options : [],
			// A miss on a PbtA move marks XP by default; the GM opts out per-letter when
			// they don't want to reward a failed love letter (see rollStat's noXpOnMiss).
			noXpOnMiss: !!input?.noXpOnMiss,
			// Closing sign-off rendered at the foot of the posted letter.
			signed: String(input?.signed ?? "").trim(),
		},
		flags: { [STONETOP_SCOPE]: { [LOVE_LETTER_FLAG]: true } },
	};
}

// Create a love letter on the given recipient character. Returns the created item (or null).
export async function createLoveLetter(actor, input) {
	if (!actor) return null;
	const data = buildLoveLetterData(input);
	const created = await actor.createEmbeddedDocuments("Item", [data]);
	return created?.[0] ?? null;
}

// Rewrite an existing love letter in place (GM edit).
export async function updateLoveLetter(item, input) {
	if (!item) return;
	// name/type/system/flags — the same shape create uses, so an edit fully re-derives
	// the roll block (adding or clearing a roll as the GM changes it).
	await item.update(buildLoveLetterData(input));
}

// The character actors a love letter can be addressed to, for the recipient picker. Every
// world character the GM can see, most-recently-updated ish (game.actors order), as
// { id, name, selected } rows.
export function loveLetterRecipientOptions(selectedId = null) {
	return game.actors
		.filter(a => a.type === "character")
		.map(a => ({ id: a.id, name: a.name, selected: a.id === selectedId }));
}

// The roll-type dropdown options: no-roll + the six stats (no "ask"). `stat` is the
// currently-selected value ("" for none).
export function loveLetterRollOptions(stat = "") {
	const current = normalizeRollType(stat) ?? "";
	return [
		{ value: "", label: game.i18n.localize("stonetop.character.moves.loveLetter.rollNone"), selected: current === "" },
		...STAT_KEYS.map(k => ({ value: k, label: Handlebars.helpers.statLabel(k), selected: current === k })),
	];
}
