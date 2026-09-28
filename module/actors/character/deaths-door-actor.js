import { STONETOP_SCOPE, readableFlags, resolvedFlagProperty } from "./StonetopFlags.js";
import { deletionEntry } from "../../utils/foundry-compat.js";
import {
	DEATHS_DOOR_FLAG, DEATHS_DOOR_ROLL_FLAG, DEATHS_DOOR_ROLLING_FLAG, NEVER_GONNA_KEEP_ME_DOWN, effectiveDeathsDoorState,
	pastDeathKind,
} from "./deaths-door.js";

// How far back through the chat log a roll's card is looked for by its nonce, when the marker never got as far
// as naming it (the page went away while the dice were still in the air). The card is always among the latest.
const CARD_SEARCH_DEPTH = 100;

// The marker is written and cleared with `render: false`. No sheet draws from it, and one roll writes it several
// times (the claim, the dice, each boost, the end), each of which would otherwise redraw every open sheet of the
// character on every client. The Death's Door windows that follow it hear `updateActor`, which core calls all the
// same (dialogs/DeathsDoorDialog.js#_listen).

/**
 * The Death's Door roll in progress on this actor (deaths-door.js#DEATHS_DOOR_ROLLING_FLAG), or null. Read so it
 * never throws: every Death's Door window asks on every draw, including over the stand-ins a sheet is tested with.
 */
export function deathsDoorRollMarker(actor) {
	const marker = actor ? readableFlags(actor)?.[DEATHS_DOOR_ROLLING_FLAG] : null;
	return marker && typeof marker === "object" && marker.userId && marker.nonce ? marker : null;
}

/**
 * The clock a marker's `at` is written and read against: the server's, so two tables' machines a minute apart
 * agree on how long a roll has been sitting.
 */
export function deathsDoorRollClock() {
	const server = Number(globalThis.game?.time?.serverTime);
	return Number.isFinite(server) && server > 0 ? server : Date.now();
}

/**
 * Write the marker whole. Every key goes out, nulls included: a flag update MERGES into what is stored, so a
 * marker written over an older one would otherwise keep that one's card and total. False, writing nothing, for
 * an actor that cannot be updated or a marker with nobody's name on it.
 */
export async function setDeathsDoorRollMarker(actor, marker) {
	if (typeof actor?.update !== "function" || !marker?.userId || !marker?.nonce) return false;
	await actor.update({ [`flags.${STONETOP_SCOPE}.${DEATHS_DOOR_ROLLING_FLAG}`]: {
		userId:    marker.userId,
		userName:  marker.userName ?? "",
		at:        marker.at ?? deathsDoorRollClock(),
		nonce:     marker.nonce,
		messageId: marker.messageId ?? null,
		total:     marker.total ?? null,
		tier:      marker.tier ?? null,
		// An array, which a flag update replaces rather than merges.
		boosts:    Array.isArray(marker.boosts) ? [...marker.boosts] : null,
	} }, { render: false });
	return true;
}

/**
 * Whether a roll in progress reached the table: its card is here to read, or its marker carries a result (the
 * dice's total, or the tier of a 10+ taken without them). Such a roll is spent: whoever picks it up accepts it
 * rather than rolling again.
 */
export function deathsDoorRollPosted(marker, card = null) {
	return !!card || marker?.total != null || marker?.tier != null;
}

/**
 * The character's Death's Door state as it should be read (deaths-door.js#effectiveDeathsDoorState), off the actor
 * alone: for the GM's client ruling on a claim, which has no character model to hand.
 */
export function actorDeathsDoorState(actor) {
	const flags = actor ? readableFlags(actor) : null;
	return effectiveDeathsDoorState({
		state:      flags?.[DEATHS_DOOR_FLAG] ?? null,
		insertSlug: flags?.postDeathInsert?.slug ?? null,
	});
}

/**
 * Clear the marker, but only while it still names roll `nonce`: a roll taken over since, or a newer one, is not
 * this caller's to clear. Whether it wrote anything.
 */
export async function clearDeathsDoorRollMarker(actor, nonce) {
	const marker = deathsDoorRollMarker(actor);
	if (!marker || (nonce && marker.nonce !== nonce) || typeof actor?.update !== "function") return false;
	const [key, value] = deletionEntry(`flags.${STONETOP_SCOPE}.${DEATHS_DOOR_ROLLING_FLAG}`);
	await actor.update({ [key]: value }, { render: false });
	return true;
}

/**
 * The card a roll in progress was posted as: the one its marker names, else the latest carrying its nonce (the
 * card is stamped before the dice animate, the marker only after), else null, which is also the answer on a
 * client the card was never sent to (a private roll).
 */
export function deathsDoorRollCard(marker, messages = globalThis.game?.messages) {
	if (!marker || !messages) return null;
	const named = marker.messageId ? messages.get?.(marker.messageId) : null;
	if (named) return named;
	if (!marker.nonce) return null;
	const all = messages.contents ?? [];
	for (let i = all.length - 1; i >= Math.max(0, all.length - CARD_SEARCH_DEPTH); i--) {
		if (all[i]?.getFlag?.(STONETOP_SCOPE, DEATHS_DOOR_ROLL_FLAG) === marker.nonce) return all[i];
	}
	return null;
}

/**
 * Never Gonna Keep Me Down: "Once per session, when you are at Death's Door, don't roll. You get a
 * 10+." The move's one circle is marked when the Death's Door window takes the 10+, and a new session
 * gives the use back: End of Session clears it on every character it walks. How many were cleared.
 * A character with the circle already clear costs no write.
 *
 * @param {Iterable<Actor>} actors
 */
export async function resetNeverGonnaKeepMeDown(actors = []) {
	let cleared = 0;
	for (const actor of actors ?? []) {
		const resources = actor?.typedActor?.moveResources;
		if (!(Number(resources?.getMoveResources?.()?.[NEVER_GONNA_KEEP_ME_DOWN]) > 0)) continue;
		await resources.setUses(NEVER_GONNA_KEEP_ME_DOWN, 0, { stonetopMove: "End of Session" });
		cleared += 1;
	}
	return cleared;
}

/**
 * What an actor is past the Door — their insert slug ("revenant"/"ghost"/"thrall"), "dead" for
 * one who stepped through the Last Door, or null for the living.
 *
 * The rule itself lives in deaths-door.js, which is deliberately Foundry-free so it can be read
 * and tested without a document; this is the one place that knows where the two answers it needs
 * are STORED. Both are read through `resolvedFlagProperty` so a sheet written before the
 * system-id rename still reports its death (see StonetopFlags).
 *
 * Anything that shows a character's death rather than ruling on it goes through here: the chat
 * drip's stamp, and the expedition Outfit readout, which drops the dead from the party list and
 * darkens whoever came back.
 */
export function actorPastDeathKind(actor) {
	if (!actor) return null;
	return pastDeathKind({
		state:      resolvedFlagProperty(actor, DEATHS_DOOR_FLAG) ?? null,
		insertSlug: resolvedFlagProperty(actor, "postDeathInsert.slug") ?? null,
	});
}
