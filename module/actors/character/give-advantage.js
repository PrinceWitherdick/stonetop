/**
 * "You or an ally gain advantage on your next roll": a button that holds it (the user's ruling of
 * 2026-09-26, Seeker audit A13). Four Seeker moves print it:
 *
 *  - Countermeasures: "You or an ally gain advantage on your next roll to act on the answer." No roll,
 *    so the button is on the card its text posts.
 *  - Sage Advice: "When another PC asks you for guidance, they get advantage on their next roll to
 *    follow your advice." No roll either, and another PC only.
 *  - Everything Burns, 10+: "you or an ally also gain advantage to act on the info." On that tier of
 *    the roll card (move-roll-options.js).
 *  - Work With What You've Got, 7+: "Create an opportunity that grants you or an ally advantage on the
 *    next roll to exploit it." On both hitting tiers: whether that option was the one picked is the
 *    player's to judge.
 *
 * Pressed, it asks who (the giver, or another player character) and holds advantage on that
 * character's next roll through the one store every held advantage uses (StonetopCharacter#
 * holdAdvantage, as Aid's answer does), named for the move. Once per card. The rules and the button
 * are here; the picker, the write and the GM's relay are give-advantage-flow.js's.
 */

import { ownsLearnedMoveNamed } from "./owns-move.js";
import { escHtml } from "../../utils/strings.js";

/**
 * The moves that give it. `tiers`: the roll card's tiers that carry the button (a move with none
 * carries it on its posted card). `othersOnly`: never the giver (Sage Advice: "they get advantage").
 */
export const GIVE_ADVANTAGE_MOVES = {
	"Countermeasures":           { tiers: null,                     othersOnly: false },
	"Sage Advice":               { tiers: null,                     othersOnly: true },
	"Everything Burns":          { tiers: ["success"],              othersOnly: false },
	"Work With What You've Got": { tiers: ["success", "partial"],   othersOnly: false },
};

function buttonHtml(moveName) {
	const rule = GIVE_ADVANTAGE_MOVES[moveName];
	const label = rule?.othersOnly ? "Give advantage to another PC..." : "Give advantage to...";
	return `<button type="button" class="stonetop-give-advantage" data-move="${escHtml(moveName)}"><i class="fas fa-angles-up"></i> ${escHtml(label)}</button>`;
}

/**
 * The roll card's button, for move-roll-options.js: on the tiers that give advantage, for a character
 * holding the move learned. Null for anyone else, and for a move whose button is on its posted card.
 */
export function giveAdvantageRollOptions(moveName) {
	return actor => {
		const tiers = GIVE_ADVANTAGE_MOVES[moveName]?.tiers;
		if (!tiers?.length || actor?.type !== "character" || !ownsLearnedMoveNamed(actor, moveName)) return null;
		return { tierActions: Object.fromEntries(tiers.map(tier => [tier, buttonHtml(moveName)])) };
	};
}

/**
 * The button for a move whose card is its posted text (Countermeasures, Sage Advice), for the
 * sheet's and the hotbar's description-only posts: "" for any other move, or one not held learned.
 */
export function giveAdvantageCardHtml(actor, moveName) {
	const rule = GIVE_ADVANTAGE_MOVES[moveName];
	if (!rule || rule.tiers || actor?.type !== "character" || !ownsLearnedMoveNamed(actor, moveName)) return "";
	return `<div class="card-buttons stonetop-roll-actions stonetop-give-advantage-row">${buttonHtml(moveName)}</div>`;
}

/** The held advantage's label: the move, and whose it was when it is someone else's. PURE. */
export function givenSource(moveName, giver, target) {
	return target?.id && giver?.id && target.id !== giver.id ? `${giver.name}'s ${moveName}` : moveName;
}

/** Who can be given it, out of `others` (the other player characters): the giver too, unless the move says another PC. PURE. */
export function advantageRecipients(giver, moveName, others = []) {
	const rest = (others ?? []).filter(a => a?.type === "character" && a.id !== giver?.id);
	return GIVE_ADVANTAGE_MOVES[moveName]?.othersOnly ? rest : [giver, ...rest].filter(Boolean);
}
