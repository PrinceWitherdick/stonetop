import { escHtml } from "../utils/strings.js";
import { stonetopChatCard } from "../utils/chat.js";
import { STONETOP_SCOPE, resolvedFlagProperty } from "../actors/character/StonetopFlags.js";
import {
	DEATHS_DOOR_FLAG,
	DEATHS_DOOR_STATE,
	becameDying,
	effectiveDeathsDoorState,
	nextDeathsDoorState,
	raisedFromDead,
	zeroHpMove,
} from "../actors/character/deaths-door.js";
import { getSetting } from "../settings.js";
import { bringDialogToFront } from "../utils/front-on-open.js";

/**
 * Document-update option marking "this write took a dead character above 0 HP". Set by the
 * preUpdate half, read by the update half — Foundry hands both the same options object, which is
 * the only way the second can know what the HP WAS.
 */
export const RAISED_OPTION = "stonetopRaisedFromDead";

/**
 * "When a PC is reduced to 0 HP by an attack that could kill them, they're dying and must
 * make this move" (Book I, Harm & Healing p.245).
 *
 * Nothing used to notice that moment, so the table found out only when someone happened to
 * look at the sheet. This watches the HP write, records the dying state, and posts one card
 * naming the move that PC actually triggers — which is Death's Door only until they take a
 * post-death insert (see deaths-door.js).
 *
 * Nothing here decides that the damage was lethal — that's the GM's call ("an attack that could
 * kill them"). A PC knocked to 0 by something harmless just closes the card.
 *
 * The card posts on preUpdate, not update, for two reasons: the document still holds the
 * OUTGOING HP, so the transition is readable without stashing it; and preUpdate fires only on
 * the client that initiated the change, so the card posts exactly once. The state write is
 * folded into the same `changes` object, so it costs no second document update and can't race
 * the HP write.
 *
 * The walkthrough can also open on its own (setting `deathsDoorAutoOpen`), which is the one
 * thing that CANNOT ride on preUpdate: whoever applied the damage is usually the GM, and a
 * dialog opened there lands on the wrong screen. That half runs on `updateActor` — broadcast to
 * every client — and claims a single one of them; see `autoOpenUserId`. Even auto-opened the
 * dialog remains an invitation, since its Cancel closes it and leaves the card in chat: the
 * book explicitly allows holding the roll off "until the scene wraps up or the other PCs get a
 * little spotlight".
 */
export function onPreUpdateActorDeathsDoor(actor, changes, options = {}) {
	if (actor?.type !== "character") return;

	const raw = foundry.utils.getProperty(changes, "system.attributes.hp.value");
	if (raw === undefined) return;

	// A throw out of a preUpdate hook aborts the document update, so a fault in here would
	// stop HP being written at all — losing damage rather than merely losing the card. Nothing
	// this hook does is worth that, so it fails quiet and lets the write through.
	try {
		const newHp = Number(raw) || 0;
		const oldHp = Number(actor.system?.attributes?.hp?.value) || 0;
		// Read the same way the character model reads it: `fate-pending` is one of the two states
		// this function refuses to move off, so a stale one left beside an insert would freeze this
		// character's state for good — never dying again, and so never announcing it. See
		// effectiveDeathsDoorState for how the pair used to come about.
		const state = effectiveDeathsDoorState({
			state:      resolvedFlagProperty(actor, DEATHS_DOOR_FLAG) ?? null,
			insertSlug: resolvedFlagProperty(actor, "postDeathInsert.slug") ?? null,
		});
		const next  = nextDeathsDoorState({ oldHp, newHp, state });

		if (next !== state) {
			foundry.utils.setProperty(changes, `flags.${STONETOP_SCOPE}.${DEATHS_DOOR_FLAG}`, next ?? null);
		}

		// Someone through the Last Door whose hit points have just gone above 0. Marked on the
		// OPTIONS rather than acted on: `dead` is the one state nothing walks back on its own
		// ("only the rarest of magic can bring them back"), and a GM fixing a typo in the HP box
		// looks identical from here — so the update half asks rather than assuming. The stamp is
		// what makes it a transition: `updateActor` can't see the old HP, and without it a second
		// write while they were up would ask again.
		//
		// NOT subordinate to `deathsDoorPrompt`, unlike the card below and the auto-open. That
		// setting is "Announce When a Character Is Dying" — it silences a piece of table theatre at
		// the moment of a hit. This is not an announcement: it is the only question that can take a
		// sheet back off `dead`, a state nothing else walks back, and a table that wanted the dying
		// card kept quiet has said nothing about wanting resurrections to go unrecorded.
		if (raisedFromDead({ oldHp, newHp, state })) options[RAISED_OPTION] = true;

		if (!becameDying({ oldHp, newHp, state })) return;
		if (!getSetting("deathsDoorPrompt")) return;

		// Fire-and-forget: the card is an announcement, and making the HP write await a chat
		// round-trip would stall damage application behind it.
		postDyingPrompt(actor).catch(err => console.error("Stonetop | Error posting the dying prompt:", err));
	} catch (err) {
		console.error("Stonetop | Error recording the dying state:", err);
	}
}

/**
 * The other half: open the walkthrough on the dying character's own screen.
 *
 * Runs on `updateActor`, which fires on EVERY connected client, so the deciding question is
 * which one of them this is. The signal is the state flag arriving as "dying" in the diff —
 * written by the preUpdate half above, and written only on the transition (nextDeathsDoorState
 * returns the state unchanged otherwise), so this can't re-fire while a downed PC is hit again.
 *
 * Fails quiet for the same reason the preUpdate half does, minus the stakes: a fault here is
 * only a window that didn't open.
 */
export function onUpdateActorDeathsDoorAutoOpen(actor, changes) {
	if (actor?.type !== "character") return;
	if (foundry.utils.getProperty(changes, `flags.${STONETOP_SCOPE}.${DEATHS_DOOR_FLAG}`) !== DEATHS_DOOR_STATE.DYING) return;

	try {
		// Subordinate to the announcement: a table that silenced the card doesn't want a window.
		if (!getSetting("deathsDoorPrompt") || !getSetting("deathsDoorAutoOpen")) return;
		if (autoOpenUserId(ownerUsers(actor)) !== game.user?.id) return;

		openZeroHpMove(actor).catch(err => console.error("Stonetop | Error opening the dying walkthrough:", err));
	} catch (err) {
		console.error("Stonetop | Error deciding whether to open the dying walkthrough:", err);
	}
}

/**
 * Ask whether a character through the Last Door is being raised, when their hit points go above 0.
 *
 * `dead` is the only state nothing walks back on its own, deliberately: the book leaves the door
 * open ("only the rarest of magic can bring them back") without letting a hit point do it. But the
 * two things that put HP on a dead sheet look identical to code — a table playing out a
 * resurrection, and a GM tidying a number — so this asks instead of choosing, and the answer is
 * what clears the state.
 *
 * Asked of the user who made the change and nobody else. Every other prompt in this file has to
 * work out which client to claim (see autoOpenUserId); this one doesn't, because the question is
 * about an edit somebody just made and they are the one who can answer it. `userId` is Foundry's
 * own answer to who that was.
 */
export function onUpdateActorDeathsDoorRaised(actor, changes, options = {}, userId = null) {
	if (actor?.type !== "character" || !options?.[RAISED_OPTION]) return;
	if (userId && userId !== game.user?.id) return;

	try {
		promptRaiseFromDead(actor, { fromHp: true })
			.catch(err => console.error("Stonetop | Error asking about the raise:", err));
	} catch (err) {
		console.error("Stonetop | Error asking about the raise:", err);
	}
}

/**
 * The question itself. Two ways in: the hit points going above 0 (above), and the `Dead` tag on the
 * sheet, which is clickable for exactly this — a table that plays out a resurrection without
 * touching HP first has no other route back. `fromHp` adds the one sentence that only makes sense
 * on the first of those.
 *
 * Its own buttons rather than `Dialog.confirm`'s stock Yes/No: against "is that what happened?"
 * both of those read as a shrug, and one of the two answers is a resurrection. The affirmative
 * takes the left, Foundry's order, and neither is the default — closing the window with the X
 * leaves the sheet exactly as it was, which is the safe answer to a question nobody meant to
 * raise.
 *
 * "No" writes nothing at all. The hit points stay where they were put: a GM may well be setting up
 * a body, a vision, or a corpse with numbers on it, and none of that is this hook's business. The
 * only thing at stake here is whether the sheet still says they are dead.
 */
export function promptRaiseFromDead(actor, { fromHp = false } = {}) {
	const name = actor.name ?? "This character";
	const l = (key, data) => (data
		? game.i18n.format(`stonetop.postDeath.${key}`, data)
		: game.i18n.localize(`stonetop.postDeath.${key}`));

	return new Promise(resolve => {
		new Dialog({
			title:   l("raiseTitle", { name }),
			content: `<p>${l("raiseBody", { name })}${fromHp ? ` ${l("raiseHpNote")}` : ""}</p>`
				+ `<p>${l("raiseAsk")}</p>`,
			buttons: {
				yes: {
					icon:     '<i class="fas fa-heart-pulse"></i>',
					label:    l("raiseYes"),
					callback: () => resolve(applyRaise(actor, name, l)),
				},
				no: {
					icon:  '<i class="fas fa-skull"></i>',
					label: l("raiseNo"),
					callback: () => resolve(),
				},
			},
			close:  () => resolve(),
			render: bringDialogToFront,
		}, { classes: ["dialog", "stonetop", "stonetop-raise-dialog"] }).render(true);
	});
}

/** Clear the dead state, and say so. The sheet's black and its tag both hang off this flag. */
async function applyRaise(actor, name, l) {
	try {
		await actor.unsetFlag(STONETOP_SCOPE, DEATHS_DOOR_FLAG);
		ui.notifications?.info?.(l("raised", { name }));
	} catch (err) {
		console.error("Stonetop | Could not clear the dead state:", err);
		ui.notifications?.warn?.(l("raiseFailed"));
	}
}

/**
 * Every user who owns this actor, as the plain shape `autoOpenUserId` rules on.
 *
 * `assigned` is the one that actually answers "who died": the user this character is set as
 * the character OF, in the Foundry user configuration. Ownership can't answer it — a table that
 * lets the party read each other's sheets has several owners per PC, and a player running two
 * characters owns both.
 */
function ownerUsers(actor) {
	const users = game.users?.contents ?? game.users ?? [];
	return [...users]
		.filter(u => actor?.testUserPermission?.(u, "OWNER"))
		.map(u => ({
			id:       u.id,
			isGM:     !!u.isGM,
			active:   !!u.active,
			assigned: !!actor?.id && u.character?.id === actor.id,
		}));
}

/**
 * The one client that opens the walkthrough, or null for nobody. Pure, and exported for the
 * tests: whose screen this lands on is the whole feature.
 *
 * Three rungs, and the first one is the point of the whole thing:
 *
 *  1. The player this character is ASSIGNED to. It's their brush with death, so it opens in
 *     front of them and nobody else — however many other people can see the sheet.
 *  2. Failing that, any logged-in player who owns them. Covers a PC nobody is playing as their
 *     assigned character: a shared NPC-ish PC, a second character run by one player.
 *  3. Failing that, the GM — but only then. A GM is an owner of every actor in the world and is
 *     usually the one who just applied the damage; they should not catch a window meant for a
 *     player who is sitting right there.
 *
 * Ties within a rung break by lowest id rather than opening for everyone in it: every client
 * runs this same function over the same user list, so they must all reach the same answer or
 * the dialog opens two or three times over.
 */
export function autoOpenUserId(owners = []) {
	const active = owners.filter(u => u?.active);
	const first  = (pool) => pool.map(u => u.id).sort()[0] ?? null;
	return first(active.filter(u => u.assigned))
		?? first(active.filter(u => !u.isGM))
		?? first(active.filter(u => u.isGM));
}

/**
 * Open the character's 0-HP walkthrough. Both ways in — the card's button and the auto-open —
 * come through here, so there is one answer to "what does facing the Door actually open".
 *
 * Goes through the sheet rather than constructing a dialog: the sheet owns the character model,
 * and its `_onDeathsDoorOpen` routes an insert-carrying character to their own move's
 * walkthrough instead. Re-implementing either here would be a second copy of the same rules.
 */
export async function openZeroHpMove(actor) {
	const sheet = actor?.sheet;
	if (!sheet) return;
	await sheet.render(true);
	await sheet._onDeathsDoorOpen?.();
}

/**
 * The card itself. Public: a PC going down is the whole table's business, and the book has the
 * other players Aiding the roll. The button opens the walkthrough for owners only.
 */
export async function postDyingPrompt(actor) {
	const insertSlug = resolvedFlagProperty(actor, "postDeathInsert.slug") ?? null;
	const move = zeroHpMove(insertSlug);
	const who  = escHtml(actor.name);

	// Death's Door has a walkthrough; an insert's 0-HP move is the character's own move, so the
	// card hands them that instead of a dialog that would say the wrong thing.
	const button = move.dialog
		? `<button type="button" class="stonetop-dying-btn stonetop-dying-open" data-actor="${escHtml(actor.uuid)}">
				<i class="fas fa-door-open"></i> Face Death's Door
			</button>`
		: `<button type="button" class="stonetop-dying-btn stonetop-dying-move" data-actor="${escHtml(actor.uuid)}" data-move="${escHtml(move.name)}">
				<i class="fas fa-skull"></i> ${escHtml(move.name)}
			</button>`;

	const lead = move.dialog
		? `<p><strong>${who}</strong> is at 0 HP &mdash; they're <strong>dying</strong>.</p>`
		: `<p><strong>${who}</strong> is at 0 HP. Death's Door is behind them &mdash; <strong>${escHtml(move.name)}</strong> triggers instead.</p>`;

	return ChatMessage.create({
		speaker: ChatMessage.getSpeaker({ actor }),
		content: stonetopChatCard(move.dialog ? "Death's Door" : move.name, `<div class="card-content">
			${lead}
			<p class="stonetop-dying-trigger">${move.trigger}</p>
			<div class="card-buttons stonetop-card-buttons stonetop-dying-actions">${button}</div>
		</div>`, "stonetop-dying-card"),
		flags: { [STONETOP_SCOPE]: { dying: { actorUuid: actor.uuid, move: move.name } } },
	});
}

/**
 * Wire the prompt card's button (dispatched from stonetop.js renderChatMessageHTML).
 * Non-owners see it disabled: whose brush with death this is matters.
 */
export function wireDyingPrompt(message, html) {
	const root = html?.[0] ?? html;
	const btn = root.querySelector(".stonetop-dying-btn");
	if (!btn) return;

	const doc   = fromUuidSync(btn.dataset.actor);
	const actor = doc?.actor ?? doc;
	if (!actor?.isOwner) { btn.disabled = true; return; }

	btn.addEventListener("click", () => openZeroHpMove(actor));
}
