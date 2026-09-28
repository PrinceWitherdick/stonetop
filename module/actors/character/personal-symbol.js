// The Marshal's personal symbol (a special possession).
//
// "Personal symbol (a flag, crest, marking, etc.): when you display or reveal it in a dramatic
//  fashion, your crew holds +1 Loyalty (max 3)."
//
// Whether a display was dramatic is the table's call, so nothing here fires on its own: the
// possession's row on the Gear tab carries a button the player presses once it has happened. It
// shows only while the possession is chosen and the character has a crew (utils/crew.js#crewExists),
// and sits disabled, saying why, once the crew already holds the 3 Loyalty the move stops at.
// The write names the possession to the ledger (`stonetopMove`), and a short chat line says it.

import { STONETOP_SCOPE, readableFlags } from "./StonetopFlags.js";
import { crewExists } from "../../utils/crew.js";
import { postMoveNote } from "../../utils/chat.js";
import { format, localize } from "../../utils/i18n.js";

export const PERSONAL_SYMBOL_SLUG = "personal-symbol";
/** The name the ledger and the chat card give it, as the playbook labels the possession. */
export const PERSONAL_SYMBOL = "Personal symbol";
/** "your crew holds +1 Loyalty (max 3)" */
export const PERSONAL_SYMBOL_LOYALTY_MAX = 3;

/** The crew's Loyalty as the pips store it (the Followers tab's crew card). */
const LOYALTY_PATH = "crew.loyalty";

function crewLoyalty(actor) {
	return Math.max(0, Number(actor?.getFlag?.(STONETOP_SCOPE, LOYALTY_PATH)) || 0);
}

/** The crew's name, or "Your crew" (a tooltip's opening) / "their crew" (mid-sentence in chat). */
function crewName(flags, fallback = "stonetop.personalSymbol.yourCrew") {
	return String(flags?.crew?.name ?? "").trim() || localize(fallback);
}

/**
 * What the possession row's button needs, or null when it should not show at all: the possession
 * not chosen, or no crew to hold the Loyalty.
 *
 * @param {Actor} actor
 * @returns {{slug: string, loyalty: number, max: number, atMax: boolean, tooltip: string}|null}
 */
export function personalSymbolAction(actor) {
	const flags = readableFlags(actor);
	const selected = flags?.possessions?.selected ?? [];
	if (!Array.isArray(selected) || !selected.includes(PERSONAL_SYMBOL_SLUG)) return null;
	if (!crewExists(flags?.crew)) return null;
	const loyalty = crewLoyalty(actor);
	const atMax = loyalty >= PERSONAL_SYMBOL_LOYALTY_MAX;
	return {
		slug: PERSONAL_SYMBOL_SLUG,
		loyalty,
		max: PERSONAL_SYMBOL_LOYALTY_MAX,
		atMax,
		tooltip: atMax
			? format("stonetop.personalSymbol.atMaxTooltip", { crew: crewName(flags), max: PERSONAL_SYMBOL_LOYALTY_MAX })
			: localize("stonetop.personalSymbol.tooltip"),
	};
}

/**
 * The symbol was displayed: the crew holds +1 Loyalty, to at most 3. Reads the LIVE value, so a
 * second click, or a pip clicked since the sheet drew, cannot push it past the cap.
 *
 * @param {Actor} actor
 * @returns {Promise<{applied: boolean, loyalty: number}>}
 */
export async function displayPersonalSymbol(actor) {
	const flags = readableFlags(actor);
	if (!crewExists(flags?.crew)) return { applied: false, loyalty: 0 };
	const current = crewLoyalty(actor);
	if (current >= PERSONAL_SYMBOL_LOYALTY_MAX) {
		globalThis.ui?.notifications?.info?.(format("stonetop.personalSymbol.atMaxTooltip", {
			crew: crewName(flags), max: PERSONAL_SYMBOL_LOYALTY_MAX,
		}));
		return { applied: false, loyalty: current };
	}
	const loyalty = current + 1;
	await actor.update({ [`flags.${STONETOP_SCOPE}.${LOYALTY_PATH}`]: loyalty }, { stonetopMove: PERSONAL_SYMBOL });
	await postMoveNote(actor, PERSONAL_SYMBOL, format("stonetop.personalSymbol.displayed", {
		name: actor.name, crew: crewName(flags, "stonetop.personalSymbol.theirCrew"), loyalty, max: PERSONAL_SYMBOL_LOYALTY_MAX,
	}));
	return { applied: true, loyalty };
}
