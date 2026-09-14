import { SYSTEM_ID } from "../system-id.js";
import { autoOpenUserId, ownerUsers } from "../hooks/DeathsDoorPrompt.js";
import { actorPastDeathKind } from "../actors/character/deaths-door-actor.js";
import { customGroupSize } from "../utils/crew.js";
import { deletionTarget } from "../utils/foundry-compat.js";
import { postMoveToChat } from "../utils/chat.js";
import { capitalizeFirst } from "../utils/strings.js";
import {
	CAMP_FLAG, CAMP_OWED_FLAG, CAMP_STATE, CAMP_STATUS, SETTLE_REFUSAL, UNLIVING_KINDS,
	campLedger, campShareUpdate, campState, count, freezeCampPlan, newCampRecord, readCampRecord, readOwedCamps,
	rollsBedroll,
} from "./camp-rules.js";
import { campSummaryRows } from "./camp-view.js";

/**
 * THE CAMP'S DOCUMENTS: who is sitting at the fire, the choices they make there, and the moment
 * the camp is settled and every share is paid. The arithmetic is camp-rules.js and the words are
 * camp-view.js; this file reads and writes the actors.
 *
 * Three rules hold every write here together.
 *
 *  1. A character's part of the camp is written to that character only, by a client that owns
 *     them. No write in this file reaches into one character's pack on another player's behalf.
 *  2. The host's record is the camp's authority: whether it is open, settled or broken up, and,
 *     once settled, the frozen plan.
 *  3. Each share of a settled camp is paid by exactly ONE client, elected the way Death's Door
 *     elects whose screen its walkthrough opens on: the player the character is assigned to, then
 *     any logged-in player who owns them, then a GM. Every client runs the same election over the
 *     same user list, so they agree without talking to each other, and the share's `applied` mark
 *     stops a client that turns up later from paying it twice.
 *
 * Nothing here needs a socket. Foundry sends every actor update to every connected client, so the
 * host's settle reaches every machine as an ordinary updateActor, and the elected one pays.
 */

const FLAG_PATH = `flags.${SYSTEM_ID}.${CAMP_FLAG}`;
const OWED_PATH = `flags.${SYSTEM_ID}.${CAMP_OWED_FLAG}`;

/** The message flag a camp's join card carries: `{campId, hostId}`, the camp its button leads to. */
export const CAMP_CARD_FLAG = "campJoin";

/** The fields a seated character may change on their own record. `offer` is a map by purse. */
const CHOICE_FIELDS = new Set(["offer", "followers", "eats", "messKit", "benefit", "debility", "bedroll", "peaceful", "ready"]);

/**
 * How far back through the chat log a camp's cards are looked for. A join card is posted the
 * moment a camp opens and the camp lasts minutes, so it is always near the bottom; walking a
 * world's whole log on every settle would be paying for cards that are long over.
 */
const CARD_REFRESH_WINDOW = 200;

function characters() {
	return (game.actors?.contents ?? []).filter(a => a?.type === "character");
}

/** A character's part of a camp, or null. */
export function campRecordOf(actor) {
	return readCampRecord(actor?.getFlag?.(SYSTEM_ID, CAMP_FLAG));
}

/** Where a camp stands (CAMP_STATE), read off its host. */
export function stateOfCamp({ campId, hostId } = {}, now = Date.now()) {
	return campState(campRecordOf(game.actors?.get(hostId)), { campId, hostId }, now);
}

/** Whether a character can sit at a camp at all. The dead cannot. */
export function canCamp(actor) {
	return actor?.type === "character" && actorPastDeathKind(actor) !== "dead";
}

/** A Ghost or a Revenant: at the fire, but no mouth, and the night buys them nothing. */
export function isUnliving(actor) {
	return UNLIVING_KINDS.includes(actorPastDeathKind(actor));
}

/** Every camp in the world that can still be joined, as `{campId, hostId, hostName}`. */
export function openCamps(now = Date.now()) {
	const camps = [];
	for (const actor of characters()) {
		const record = campRecordOf(actor);
		if (!record || record.host !== actor.id || !canCamp(actor)) continue;
		if (campState(record, { campId: record.id, hostId: actor.id }, now) !== CAMP_STATE.OPEN) continue;
		camps.push({ campId: record.id, hostId: actor.id, hostName: actor.name });
	}
	return camps;
}

/** The characters sitting at a camp, whatever state the camp is in. */
export function campActors(campId) {
	if (!campId) return [];
	return characters().filter(a => canCamp(a) && campRecordOf(a)?.id === campId);
}

/**
 * The debilities a character has marked right now, named from what they published on joining.
 * Which ones are marked is read live: a debility cleared by Recover while the camp sits open must
 * not stay on offer.
 */
function markedDebilities(actor, vitals) {
	const marked = actor?.system?.attributes?.debilities?.options ?? {};
	const named  = new Map((vitals?.debilities ?? []).map(d => [d.key, d.name]));
	return Object.keys(marked)
		.filter(key => marked[key]?.value)
		.map(key => ({ key, name: named.get(key) ?? capitalizeFirst(key) }));
}

/** One character at the fire, in the shape camp-rules.js reads (its CampMember). */
export function campMember(actor, hostId) {
	const record = campRecordOf(actor);
	return {
		actorId:          actor.id,
		name:             actor.name,
		img:              actor.img ?? "",
		isHost:           actor.id === hostId,
		record,
		resources:        actor.getFlag?.(SYSTEM_ID, "inventory.resources") ?? {},
		hpValue:          count(actor.system?.attributes?.hp?.value),
		// The published max is the computed one. The stored field is a mirror that only moves when
		// the owner's sheet renders, so it is the fallback, not the source.
		maxHp:            record?.vitals.maxHp || count(actor.system?.attributes?.hp?.max),
		activeDebilities: markedDebilities(actor, record?.vitals),
		unliving:         isUnliving(actor),
	};
}

/** Everyone at a camp, as CampMembers. */
export function campMembers(campId, hostId) {
	return campActors(campId).map(actor => campMember(actor, hostId));
}

/** The one user whose client pays this character's share of a settled camp, or null for nobody. */
export function campWriterId(actor) {
	return autoOpenUserId(ownerUsers(actor));
}

/** Whether THIS client is the one that pays this character's share. */
export function isCampWriter(actor) {
	const me = game.user?.id;
	return !!me && !!actor && campWriterId(actor) === me;
}

/**
 * Whether `user` plays this character, as opposed to merely being allowed to edit it.
 *
 * A table that lets the party read each other's sheets gives every player ownership of every
 * character, and a GM owns them all, so ownership cannot say whose row is whose. The assigned
 * character can, when there is one; a player with none assigned plays what they own.
 */
export function playsCharacter(actor, user = game.user) {
	if (!actor || !user) return false;
	if (user.character) return user.character.id === actor.id;
	return !user.isGM && !!actor.testUserPermission?.(user, "OWNER");
}

/** The living characters this user plays and can write, which are the ones they can bring to a camp. */
export function myCampCharacters() {
	return characters().filter(a => canCamp(a) && a.isOwner && playsCharacter(a));
}

/**
 * The numbers a character publishes on sitting down, from their own character model. Only a
 * client that owns them can build that, which is exactly who sits them down: their player, or a
 * GM bringing them along.
 *
 * A model that fails to build still lets them sit. The stored max stands in, and nothing counts
 * as carried, which errs toward a bedroll left unrolled rather than one rolled that is not there.
 */
export async function campVitalsFor(actor) {
	const storedMax = count(actor?.system?.attributes?.hp?.max);
	try {
		const snapshot = await actor.typedActor?.buildSnapshot?.();
		const outfit   = snapshot?.inventory?.outfit?.regularItems ?? [];
		const carried  = slug => !!outfit.find(item => item.slug === slug)?.checked;
		return {
			maxHp:      count(snapshot?.vitals?.hp?.max) || storedMax,
			bedroll:    carried("bedroll"),
			messKit:    carried("mess-kit"),
			debilities: (snapshot?.debilities ?? []).map(d => ({ key: d.key, name: d.name })),
		};
	} catch (err) {
		console.warn(`Stonetop | Make Camp: could not read ${actor?.name}'s sheet, so the stored max HP stands in`, err);
		return { maxHp: storedMax, bedroll: false, messKit: false, debilities: [] };
	}
}

/**
 * The mouths a character brings besides their own: every living follower they have marked as
 * travelling with the party, a group follower counting as its whole headcount. Only where the
 * count starts; the player changes it at the fire.
 */
export function partyFollowerMouths(actor) {
	const followers = actor?.getFlag?.(SYSTEM_ID, "customFollowers") ?? {};
	return Object.values(followers)
		.filter(f => f?.party && !f?.dead)
		.reduce((sum, f) => sum + (f.isGroup ? customGroupSize(f) : 1), 0);
}

/**
 * The settled camps this character hosted whose plans may still owe somebody a share: the ones set
 * aside under CAMP_OWED_FLAG, and the one on their own camp record, while it is settled.
 */
function owedCamps(host) {
	const camps  = readOwedCamps(host?.getFlag?.(SYSTEM_ID, CAMP_OWED_FLAG));
	const record = campRecordOf(host);
	if (record && record.host === host.id && record.status === CAMP_STATUS.SETTLED && record.plan) {
		camps.push({ id: record.id, plan: record.plan });
	}
	return camps;
}

/** A settled camp's plan cut down to the shares still unpaid, or null once every one is paid. */
function unpaidPart({ id, plan }) {
	const unpaid = plan.filter(entry => {
		const theirs = campRecordOf(game.actors?.get(entry?.actorId));
		return theirs?.id === id && !theirs.applied;
	});
	return unpaid.length ? { id, plan: unpaid } : null;
}

/** Sit a character down at a camp: one write of a whole fresh record. */
async function sitDown(actor, { campId, hostId }) {
	const vitals = await campVitalsFor(actor);
	const record = newCampRecord({
		id:                 campId,
		hostId,
		actorId:            actor.id,
		now:                Date.now(),
		vitals,
		followers:          partyFollowerMouths(actor),
		hpValue:            actor.system?.attributes?.hp?.value,
		activeDebilityKeys: markedDebilities(actor, vitals).map(d => d.key),
		unliving:           isUnliving(actor),
	});
	const update = { [FLAG_PATH]: record };
	// The fresh record replaces the one a settled camp's plan is kept on. Whatever of that plan is
	// still owed to somebody (a player who was away when it settled, with no GM on to pay for them)
	// moves aside in the same write, and a camp paid in full is let go.
	const kept = readOwedCamps(actor.getFlag?.(SYSTEM_ID, CAMP_OWED_FLAG));
	const owed = owedCamps(actor).map(unpaidPart).filter(Boolean);
	if (owed.length || kept.length) update[OWED_PATH] = owed;
	// Bookkeeping, not an event in the character's life: the ledger hears about the camp when the
	// share is paid, as "via Make Camp", and not about every stepper on the way there.
	await actor.update(update, { stonetopLedger: true });
	return record;
}

/** Open a new camp with this character as its host. */
export async function hostCamp(actor) {
	const camp = { campId: foundry.utils.randomID(), hostId: actor.id };
	await sitDown(actor, camp);
	return camp;
}

/**
 * Sit this character down at an existing camp. Whatever camp they were at before, they have left.
 * Every client's watch (onUpdateActorCamp) redraws the camp cards when anybody sits down, this
 * client included, so the Join button this character just used comes back as "Open the camp".
 */
export async function joinCamp(actor, camp) {
	await sitDown(actor, camp);
}

/**
 * Write some of a seated character's own choices. Keys are record fields, and `offer.<slug>` for
 * one purse; anything else throws, because a typo here would write a field nothing ever reads.
 */
export async function setCampChoices(actor, patch = {}) {
	const update = {};
	for (const [key, value] of Object.entries(patch)) {
		if (!CHOICE_FIELDS.has(key.split(".")[0])) throw new Error(`Stonetop | Make Camp: "${key}" is not a camp choice`);
		update[`${FLAG_PATH}.${key}`] = value;
	}
	if (Object.keys(update).length) await actor.update(update, { stonetopLedger: true });
}

/** Get up from the fire. A host leaving their own camp breaks it up: nobody else could settle it. */
export async function leaveCamp(actor) {
	const record = campRecordOf(actor);
	if (!record) return;
	if (record.host === actor.id) return breakCamp(actor);
	await actor.unsetFlag(SYSTEM_ID, CAMP_FLAG);
}

/** Break a camp up without anyone eating. Nothing is spent and nothing is gained. */
export async function breakCamp(host) {
	await host.update({ [`${FLAG_PATH}.status`]: CAMP_STATUS.CANCELLED }, { stonetopLedger: true });
}

/** The camps this client is settling right now, by id. */
const settling = new Set();

/**
 * Settle the camp: freeze the plan onto the host, then say what happened.
 *
 * Only the host's owner or a GM may ask for it, since only they can write the host. ONE CLIENT
 * SETTLES: the one elected to pay the host's share (isCampWriter), which is the host's own player
 * whenever they are on. Anybody else pressing Make Camp writes a fresh `settleAsk` onto the host,
 * and the elected client settles from that update (onUpdateActorCamp). With two settlers, the
 * host's player and a GM pressing in the same moment would each still see the camp open, each roll
 * the bedrolls, and each write a plan and post a summary. `settling` stops the elected client
 * answering its own press and somebody else's request both.
 *
 * The shares are NOT paid here. The plan landing on the host is an updateActor on every client,
 * and the client elected for each character pays that character's share from it
 * (applyCampShares), this one included.
 *
 * @returns {Promise<{ok: true, plan: object[]|null} | {ok: false, reason: string}>}  `plan` is null
 *          when the settle was handed to the elected client; `reason` is a SETTLE_REFUSAL
 */
export async function settleCamp(camp) {
	const { campId, hostId } = camp ?? {};
	const host = game.actors?.get(hostId);
	if (!host || stateOfCamp(camp) !== CAMP_STATE.OPEN) return { ok: false, reason: SETTLE_REFUSAL.CLOSED };
	if (!(game.user?.isGM || host.isOwner)) return { ok: false, reason: SETTLE_REFUSAL.NOT_YOURS };
	const ledger = campLedger(campMembers(campId, hostId));
	if (!ledger.canSettle) return { ok: false, reason: SETTLE_REFUSAL.SHORT };
	if (!isCampWriter(host)) {
		await host.update({ [`${FLAG_PATH}.settleAsk`]: foundry.utils.randomID() }, { stonetopLedger: true });
		return { ok: true, plan: null };
	}
	if (settling.has(campId)) return { ok: false, reason: SETTLE_REFUSAL.CLOSED };
	settling.add(campId);
	try {
		return await settleHere(camp, host, ledger);
	} finally {
		settling.delete(campId);
	}
}

/** The elected client's half of settleCamp: the dice, the plan, and telling the table. */
async function settleHere(camp, host, ledger) {
	// The dice now and their messages last: a plan that then failed to write would otherwise leave
	// bedroll rolls in the log for a night that never happened.
	const rolls = [];
	for (const member of ledger.rows) {
		if (rollsBedroll(member, ledger)) rolls.push({ member, roll: await new Roll("1d6").evaluate() });
	}
	// Somebody else may have settled it, or broken it up, while the dice were out.
	if (stateOfCamp(camp) !== CAMP_STATE.OPEN) return { ok: false, reason: SETTLE_REFUSAL.CLOSED };

	const plan = freezeCampPlan(ledger, {
		bedrolls: Object.fromEntries(rolls.map(({ member, roll }) => [member.actorId, roll.total])),
	});
	await host.update({
		[`${FLAG_PATH}.status`]:    CAMP_STATUS.SETTLED,
		[`${FLAG_PATH}.plan`]:      plan,
		[`${FLAG_PATH}.settledAt`]: Date.now(),
	}, { stonetopLedger: true });

	// Each bedroll is its own die in the log, the way the one-person camp always rolled it: a die
	// the table can watch land, spoken by the character it heals.
	for (const { member, roll } of rolls) {
		await roll.toMessage({
			speaker: ChatMessage.getSpeaker({ actor: game.actors?.get(member.actorId) }),
			flavor:  "Bedroll (1d6 extra HP)",
		});
	}
	postMoveToChat(host, "Make Camp", campSummaryRows(ledger, plan));
	return { ok: true, plan };
}

/**
 * The shares this client has claimed and is writing right now, as `campId:actorId`.
 *
 * The `applied` mark is written by the very update that pays a share, so between the write going
 * out and coming back it cannot stop a second attempt; and that update is itself an updateActor
 * that runs this again. The latch covers that gap.
 */
const paying = new Set();

/**
 * Pay every share this host's settled camps still owe that is this client's to pay: the camp on
 * their record, and any set aside when they sat down again (CAMP_OWED_FLAG).
 *
 * Safe to call as often as anything likes: a share already paid, one another client is elected
 * for, or one whose character has since moved on to a different camp is passed over.
 */
export async function applyCampShares(host) {
	for (const camp of owedCamps(host)) {
		for (const entry of camp.plan) {
			const actor  = game.actors?.get(entry?.actorId);
			const theirs = campRecordOf(actor);
			// The flag first: the election tests every user's ownership, and most shares are long paid.
			if (!theirs || theirs.id !== camp.id || theirs.applied || !isCampWriter(actor)) continue;
			await payShare(actor, entry, camp.id);
		}
	}
}

async function payShare(actor, entry, campId) {
	const key = `${campId}:${actor.id}`;
	if (paying.has(key)) return;
	paying.add(key);
	try {
		const character = actor.typedActor;
		const { update, shortfall } = campShareUpdate(entry, {
			resources:     actor.getFlag(SYSTEM_ID, "inventory.resources") ?? {},
			hpValue:       actor.system?.attributes?.hp?.value,
			resourceData:  (slug, count) => character.inventoryResourceData(slug, count),
			advantageData: source => character.heldAdvantageData(source),
		});
		await actor.update(update, { stonetopMove: "Make Camp" });
		if (shortfall > 0) {
			ui.notifications?.warn?.(`By the time the camp was settled, ${actor.name}'s pack held ${shortfall} ${shortfall === 1 ? "use" : "uses"} less than was shared from it.`);
		}
	} catch (err) {
		console.error(`Stonetop | Make Camp: could not pay ${actor.name}'s share of the camp`, err);
		ui.notifications?.error?.(`${actor.name}'s share of the camp could not be recorded. Check the sheet before the next roll.`);
	} finally {
		paying.delete(key);
	}
}

/** Pay any settled camp's shares still owed by this client: at startup, or when who is online changes. */
export async function payPendingShares() {
	for (const actor of characters()) await applyCampShares(actor);
}

/**
 * Redraw the join cards of one camp, or of every camp, on this client only.
 *
 * A card's button depends on its camp's state, which lives on an actor, and a chat message does
 * not re-render when an actor changes. Nothing is written: each client redraws its own copy of
 * the log, which is also why a player who could never write the card still sees it close.
 */
export function refreshCampCards(campId = null) {
	const messages = game.messages?.contents ?? [];
	for (const message of messages.slice(-CARD_REFRESH_WINDOW)) {
		const card = message?.getFlag?.(SYSTEM_ID, CAMP_CARD_FLAG);
		if (!card || (campId && card.campId !== campId)) continue;
		ui.chat?.updateMessage?.(message);
	}
}

/** Whether an actor update wrote, or removed, a character's camp flag. */
export function touchesCamp(changes) {
	const scoped = changes?.flags?.[SYSTEM_ID];
	return !!scoped && Object.keys(scoped).some(key => key.replace(/^-=/, "") === CAMP_FLAG);
}

/**
 * The world's half of a camp, on every client whether or not its window is open: the cards are
 * redrawn when anybody sits down, gets up, or a camp changes state; a request to settle reaches the
 * one client that settles; and a settled camp gets its shares paid.
 *
 * Every camp card is redrawn rather than only one camp's. The update carries the new record, not
 * the old one, and the old camp's cards (a host who moved to another fire and took an empty camp
 * with them) are exactly the ones that just closed. A choice made at the fire redraws nothing: no
 * card shows one.
 */
export function onUpdateActorCamp(actor, changes) {
	if (actor?.type !== "character" || !touchesCamp(changes)) return;
	// No record's fields when the flag was removed outright, which is somebody getting up. A removal
	// is spelled one of two ways depending on the core (utils/foundry-compat.js#deletionTarget).
	const delta  = changes.flags[SYSTEM_ID][CAMP_FLAG];
	const fields = delta && typeof delta === "object" && !deletionTarget(FLAG_PATH, delta) ? delta : null;
	if (!fields || "id" in fields || "status" in fields) refreshCampCards();
	const record = campRecordOf(actor);
	if (!record || record.host !== actor.id) return;
	if (record.status === CAMP_STATUS.OPEN && fields && "settleAsk" in fields && isCampWriter(actor)) {
		settleCamp({ campId: record.id, hostId: actor.id })
			.catch(err => console.error(`Stonetop | Make Camp: could not settle ${actor.name}'s camp`, err));
	}
	if (record.status === CAMP_STATUS.SETTLED) applyCampShares(actor);
}

/** Registered once, at module scope in stonetop.js. */
export function registerCampHooks() {
	Hooks.on("updateActor", onUpdateActorCamp);
	// A share can be owed to a client that was not there when its camp settled: a player who dropped
	// out mid-camp with no GM on to pay it for them. Their next login pays it.
	Hooks.once("ready", () => { payPendingShares(); });
	// And somebody connecting or dropping out can move a share onto this client, GM or player alike.
	// Every client looks, and each pays only what is now its own.
	Hooks.on("userConnected", () => { payPendingShares(); });
}
