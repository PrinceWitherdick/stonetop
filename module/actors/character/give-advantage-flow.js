/**
 * The "Give advantage to..." button at the table (the rules and the button are give-advantage.js's).
 *
 * Only whoever can write the card and the giver presses it (the giver's player, or the GM:
 * chat.js#canRewriteCard). A character this client owns is written here; any other goes to the GM's
 * client (GIVE_ADVANTAGE_QUERY), whose handler checks the asker plays the giver and has the move
 * learned, as Piety's Blessing is given. The card is latched on the press (GIVING_FLAG) and
 * remembers who it gave it to (GIVEN_FLAG), so the button goes once pressed.
 */

import { SYSTEM_ID } from "../../system-id.js";
import { ownsLearnedMoveNamed } from "./owns-move.js";
import { GIVE_ADVANTAGE_MOVES, advantageRecipients, givenSource, mayReceive } from "./give-advantage.js";
import { asteriskMoveUsed } from "./WouldBeHeroAsterisk.js";
import { pickPersonOnMap } from "../../dialogs/RelationshipLinkDialog.js";
import { partyCharacters } from "../../utils/playbook-actors.js";
import { canRewriteCard } from "../../utils/chat.js";
import { belongsToMessage } from "../../utils/picked-option-button.js";
import { speakerActor } from "../../utils/speaker-actor.js";
import { isPrimaryGM } from "../../utils/primary-gm.js";
import { askGMClient, queryAsker, resolveSync } from "../../utils/foundry-compat.js";
import { withCardLatch } from "../../utils/card-latch.js";

/** The User query a gift of advantage goes through when this client cannot write the character. */
export const GIVE_ADVANTAGE_QUERY = "stonetop.giveAdvantage";
/** Message flag: who this card gave its advantage to, `{name, move}`. */
export const GIVEN_FLAG = "advantageGiven";
/**
 * Message flag: the user whose press is giving it (card-latch.js#withCardLatch), written before the
 * picker opens, so another client's button goes while they choose.
 */
export const GIVING_FLAG = "advantageGiving";

/** The cards this client is choosing on right now, by message id. */
const _choosing = new Set();

/**
 * Hold advantage on `target`'s next roll for `moveName`: written here when this client owns them,
 * otherwise by the GM's client. Whether it was held.
 */
export async function giveAdvantage(giver, target, moveName, {
	gm = globalThis.game?.users?.activeGM ?? null, userId = globalThis.game?.user?.id ?? null,
} = {}) {
	if (target?.type !== "character") return false;
	if (!mayReceive(giver, target, moveName)) return false;
	if (target.isOwner) {
		await target.typedActor?.holdAdvantage?.(givenSource(moveName, giver, target));
		return true;
	}
	return !!(await askGMClient(gm, GIVE_ADVANTAGE_QUERY, {
		giverUuid: giver?.uuid ?? null, targetUuid: target.uuid, moveName, userId,
	}, { fallback: false, what: "give advantage" }));
}

/**
 * The GM's side of GIVE_ADVANTAGE_QUERY, for the primary GM only: the asker must play the giver, the
 * giver hold the move learned, and the target be a character the move allows. Who asked is read as
 * roll-boosts.js reads it (foundry-compat.js#queryAsker). Whether it was held.
 */
export async function handleGiveAdvantageQuery(data, context = {}, deps = {}) {
	const { users = globalThis.game?.users, resolve = resolveSync } = deps;
	if (!globalThis.game?.user?.isGM || !isPrimaryGM()) return false;
	const user = queryAsker(data, context, users);
	const giver = data?.giverUuid ? resolve(data.giverUuid) : null;
	const target = data?.targetUuid ? resolve(data.targetUuid) : null;
	const moveName = data?.moveName;
	if (!user || !GIVE_ADVANTAGE_MOVES[moveName] || !giver?.testUserPermission?.(user, "OWNER")) return false;
	if (!ownsLearnedMoveNamed(giver, moveName) || target?.type !== "character") return false;
	if (!mayReceive(giver, target, moveName)) return false;
	await target.typedActor?.holdAdvantage?.(givenSource(moveName, giver, target));
	return true;
}

/**
 * Ask who, give it, and write it on the card. Whether it was given. `stillMine`, from the card's
 * button, answers whether this client still holds the card's latch once someone is picked: when
 * another client pressed it too, the later press holds the card, and this one gives nothing and
 * answers true, so the latch it lost is not taken back from the other.
 *
 * A `selfOnly` move (Resourceful, Inquiring Minds) asks nobody: the giver is the one who holds it.
 */
export async function offerAdvantage(message, giver, moveName, {
	pick = pickPersonOnMap, party = partyCharacters, give = giveAdvantage, scope = SYSTEM_ID, stillMine = null,
} = {}) {
	const selfOnly = !!GIVE_ADVANTAGE_MOVES[moveName]?.selfOnly;
	const recipients = advantageRecipients(giver, moveName, selfOnly ? [] : party({ exclude: giver?.id }));
	if (!recipients.length) {
		globalThis.ui?.notifications?.info?.("There is no other player character to give it to.");
		return false;
	}
	const id = selfOnly ? giver?.id : await pick({
		options: recipients.map(actor => ({ id: actor.id, name: actor.name, actor, hint: actor.id === giver?.id ? "You" : "" })),
		title: `${moveName}: advantage on the next roll`,
		hint: "Who gains advantage on their next roll?",
		icon: "fa-angles-up",
		buttonLabel: "Choose someone",
		formatLabel: name => `Give ${name} advantage`,
	});
	const target = recipients.find(actor => actor.id === id) ?? null;
	if (!target) return false;
	if (stillMine && !stillMine()) return true;
	if (!(await give(giver, target, moveName))) {
		globalThis.ui?.notifications?.warn?.(`${target.name} could not be given advantage: no GM is online to write it.`);
		return false;
	}
	await message.setFlag(scope, GIVEN_FLAG, { name: target.name, move: moveName });
	globalThis.ui?.notifications?.info?.(`${target.name} has advantage on their next roll (${moveName}).`);
	// Voice of Experience's advice given is a use of the starred move: the first crosses off "Would-be"
	// (WouldBeHeroAsterisk.js). Never at the cost of the gift, which is already held and written.
	await asteriskMoveUsed(giver, moveName).catch(err => console.warn(`Stonetop | could not note ${moveName}'s use`, err));
	return true;
}

/**
 * Wire a card's "Give advantage to..." buttons (stonetop.js renderChatMessageHTML). Once given, the
 * button is replaced by who has it; before then, only whoever can write the card and the giver sees
 * it.
 */
export function wireGiveAdvantage(message, html, deps = {}) {
	const root = html?.[0] ?? html;
	const scope = deps.scope ?? SYSTEM_ID;
	const buttons = [...(root?.querySelectorAll?.(".stonetop-give-advantage") ?? [])].filter(btn => belongsToMessage(btn, message));
	if (!buttons.length) return;
	const giver = deps.giver ?? speakerActor(message);
	const given = message?.getFlag?.(scope, GIVEN_FLAG) ?? null;
	const usable = deps.usable ?? canRewriteCard(message, giver);
	const me = deps.userId ?? globalThis.game?.user?.id ?? "";
	// Someone is choosing: another user, or this client already (a re-render mid-choice). A latch of
	// this user's own with nothing in flight (a reload mid-choice) is theirs to press again.
	const giving = message?.getFlag?.(scope, GIVING_FLAG) ?? null;
	const heldElsewhere = (!!giving && giving !== me) || _choosing.has(message?.id);
	for (const btn of buttons) {
		if (given?.name) {
			const doc = root.ownerDocument ?? globalThis.document;
			const note = doc.createElement("span");
			note.className = "stonetop-give-advantage-readout";
			note.textContent = `${given.name} has advantage on their next roll.`;
			btn.replaceWith(note);
			continue;
		}
		const moveName = btn.dataset?.move;
		if (!usable || !giver || !GIVE_ADVANTAGE_MOVES[moveName]) { btn.remove(); continue; }
		btn.disabled = heldElsewhere;
		if (btn.dataset.giveWired === "1") continue;
		btn.dataset.giveWired = "1";
		// Latched on the card FIRST (card-latch.js), as every once-per-card button is: the GM and
		// the giver's player can both press it, and a gift is given once.
		btn.addEventListener("click", async () => {
			if (btn.disabled) return;
			const stillMine = () => message.getFlag(scope, GIVING_FLAG) === me;
			_choosing.add(message.id);
			try {
				await withCardLatch(message, GIVING_FLAG, me, buttons,
					() => offerAdvantage(message, giver, moveName, { ...deps, stillMine }));
			} catch (err) {
				console.error(`Stonetop | ${moveName}'s advantage could not be given`, err);
			} finally {
				_choosing.delete(message.id);
			}
		});
	}
}
