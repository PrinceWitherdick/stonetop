// The Actor behind a follower card.
//
// A follower is flag data on a character, but what it describes is a creature at the table: it
// stands on the map, takes damage, and is ordered about. So every follower gets an `npc` Actor
// made for it — the same Actor the canvas drop has always found or built
// (module/hooks/FollowerDrop.js), except that it is now made when the follower is ADDED rather
// than only when somebody first drags them onto a scene.
//
// ONE place decides both halves of that, because the two have to agree:
//
//   • WHO a follower already is (followerActorFromLink), so nothing creates a second copy of a
//     creature that exists — the drop, the card's Tokenizer pip, and this sweep all ask here.
//   • What making one MEANS (createFollowerActor): the folder, the provenance stamp, and the
//     ownership, which is the character's own — your follower's NPC is yours, whoever's client
//     happened to make it.
//
// Never a one-shot. Followers arrive from a dozen places (the walkthrough, a converted monster
// or NPC, a possession, an arcana summon, the onboarding dialog's animal companion / crew /
// initiates), and a "followersMigrated" flag would strand every follower written after the pass
// that set it — the mistake migrateSteadingPeople carries a paragraph about. Instead the sweep is
// cheap enough to run on every render and does nothing in the steady state.

import { FOLLOWER_FOLDER, followerNpcActorData } from "../../data/follower-actor.js";
import { ensureNamedActorFolder } from "../steading/steading-people.js";
import { resolvedFlags } from "./StonetopFlags.js";
import { SYSTEM_ID } from "../../system-id.js";

/**
 * The Actor folder followers-turned-actors are filed in, created on demand. A player can't
 * create folders, so they just land at the sidebar root — an unfiled actor beats no actor.
 */
export const ensureFollowerFolder = () => ensureNamedActorFolder(FOLLOWER_FOLDER);

/** A world Actor for a uuid, or null. World only: fromUuidSync hands back a bare index stub for
 *  a compendium entry, which is not a document anything here can act on. */
function worldActorFromUuid(uuid) {
	if (!uuid) return null;
	try {
		const doc = globalThis.fromUuidSync?.(String(uuid));
		return doc?.documentName === "Actor" && !doc.pack ? doc : null;
	} catch (_) {
		return null;
	}
}

/**
 * The Actor that IS this follower, if one exists yet — never one made on the spot.
 *
 * Two steps, and the drop resolves the same two before it falls through to creating: the actor
 * already made for this card (`actorUuid`, written back onto it the first time one was made),
 * else the NPC they were recruited from, because "a follower is first an NPC" (Book I, p.475)
 * and that person already exists at the table. A `sourceUuid` pointing anywhere else — a
 * bestiary monster, the compendium item behind a possession-follower — is provenance rather than
 * identity: that entry is a template for its kind, while this follower is one individual with
 * their own name, tags and hit points.
 *
 * Synchronous, because the sheet has to answer while it builds a card.
 *
 * @param {{actorUuid?: string, sourceUuid?: string}} link  a follower's stored links
 */
export function followerActorFromLink({ actorUuid, sourceUuid } = {}) {
	const linked = worldActorFromUuid(actorUuid);
	if (linked) return linked;
	const source = worldActorFromUuid(sourceUuid);
	return source?.type === "npc" ? source : null;
}

/**
 * Has this follower been answered for — either by an actor of their own or by the NPC they are?
 *
 * Keyed on the STORED link rather than on whether it still resolves. A card whose actor has been
 * deleted keeps its stale uuid and is deliberately left alone: deleting the NPC is a decision,
 * and a sweep that ran on "does it resolve" would undo it on the next render, which would make
 * the actor impossible to be rid of. Dragging the card onto a scene still makes a fresh one —
 * that is an explicit act, and the drop is where it belongs.
 */
function answeredFor(snapshot, storedUuid) {
	if (String(storedUuid ?? "").trim()) return true;
	return !!followerActorFromLink({ sourceUuid: snapshot?.follower?.sourceUuid });
}

/** The uuid currently stored on a follower's own flags, read live rather than off a snapshot. */
function storedActorUuid(character, detailBase) {
	if (!character || !detailBase) return "";
	const value = foundry.utils.getProperty(resolvedFlags(character), `${detailBase}.actorUuid`);
	return String(value ?? "").trim();
}

/**
 * Make the Actor for one follower snapshot (the character sheet's `_followerDragSnapshot` shape).
 * Returns it, or null when creation was refused — a caller is expected to carry on with the rest.
 *
 * `ownership` is the CHARACTER's, so a follower's NPC is owned by exactly the people who own the
 * follower. Without it the actor would belong to whoever's client happened to make it: a GM
 * tidying up a player's sheet would create an NPC that player cannot see, and the token they were
 * ordering about a moment ago would stop opening for them.
 *
 * @param {object} snapshot   {ftype, slug, follower: {...}}
 * @param {Actor}  character  whose follower it is
 * @param {object} [opts]
 * @param {string|null} [opts.folder]  folder id, resolved once by a batching caller
 */
export async function createFollowerActor(snapshot, character, { folder = null } = {}) {
	if (!snapshot?.follower || !character) return null;
	const data = followerNpcActorData(snapshot.follower, {
		folder: folder ?? (await ensureFollowerFolder())?.id ?? null,
		origin: { characterUuid: character.uuid ?? null, ftype: snapshot.ftype ?? null, slug: snapshot.slug ?? null },
	});
	data.ownership = foundry.utils.deepClone(character.ownership ?? {});
	try {
		return await Actor.create(data);
	} catch (err) {
		console.error("Stonetop | Could not create the actor for follower", snapshot.follower?.name, err);
		return null;
	}
}

// Characters a sweep is mid-flight on. A follower add re-renders the sheet, and so does the
// write this sweep makes at the end of it — without this, the second pass would see the same
// unanswered followers as the first (its creates have not landed yet) and make them twice.
const _sweepsInFlight = new Set();

// How long a client that is NOT first in line waits before looking again. Two people with the
// same sheet open both see every write to it, so both would otherwise start creating in the same
// instant; staggering them means the later one re-reads the flags and finds the work already
// done. Ranked by user id rather than randomly, so the order is stable — and it is only a
// stagger, not an election: if the first in line never renders this sheet, the next one still
// makes them a beat later, which is what keeps this working at a table with no GM present.
const MAKER_STAGGER_MS = 500;

const _wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** This client's place in the queue of connected owners: 0 goes first, and waits for nobody. */
function makerRank(character) {
	const owners = (game.users?.contents ?? [])
		.filter(u => u.active && character?.testUserPermission?.(u, "OWNER"))
		.map(u => u.id)
		.sort();
	const rank = owners.indexOf(game.user?.id);
	return rank < 0 ? 0 : rank;
}

/**
 * Give every follower on this character an Actor, and remember it on the card.
 *
 * Run from the character sheet after it renders, which is the one place a follower card is
 * finished enough to be turned into an actor — the numbers on it come from the playbook, the
 * override layer and the stat passes, not from the raw flags. Every route a follower can arrive
 * by ends in that render, so none of them has to know about this.
 *
 * Returns how many were made, for the tests and for a caller that wants to log.
 *
 * @param {Actor}    character
 * @param {object[]} snapshots  the finished cards' drag snapshots (_followerDragSnapshot)
 */
export async function ensureFollowerActors(character, snapshots = []) {
	// Cheap scan first, and in this order: the steady state is "every follower has one", and the
	// price of that answer on every render must be one walk of a handful of snapshots — not a
	// permission lookup and a user sweep.
	const missing = (snapshots ?? []).filter(s => s?.detailBase && !answeredFor(s, s.follower?.actorUuid));
	if (!missing.length) return 0;
	if (!character?.isOwner) return 0;
	// A world whose GM revoked the permission this system grants players
	// (hooks/Ready.js#_ensurePlayerActorCreationGrant) leaves the followers to whoever can — the
	// GM, next time they have the sheet open. Silent: a player who cannot create actors can do
	// nothing about it, and a notification on every render would be noise, not news.
	if (!Actor.canUserCreate(game.user)) return 0;
	if (_sweepsInFlight.has(character.id)) return 0;

	_sweepsInFlight.add(character.id);
	try {
		const rank = makerRank(character);
		if (rank > 0) await _wait(rank * MAKER_STAGGER_MS);

		// One folder for the batch: every create would otherwise ask after it again, and the
		// first of them is what makes it.
		const folder = (await ensureFollowerFolder())?.id ?? null;

		// Re-read each link off the document rather than trusting the snapshot: it was taken
		// before the wait above, and the whole point of that wait is to let another client's
		// writes land first.
		const made = new Map();
		for (const snapshot of missing) {
			if (answeredFor(snapshot, storedActorUuid(character, snapshot.detailBase))) continue;
			const actor = await createFollowerActor(snapshot, character, { folder });
			if (actor) made.set(snapshot.detailBase, actor);
		}
		if (!made.size) return 0;

		// One update for the lot, built from what is on the document NOW — the creates above
		// awaited, and a follower's HP or Loyalty may well have been clicked in the meantime.
		// Only the actorUuid keys are written, so nothing else can be trodden on, and they are
		// written to SYSTEM_ID: resolvedFlags above is what READS a world not yet cut over from
		// the legacy scope, but everything in this system writes to the current one.
		const update = {};
		const lost = [];
		for (const [base, actor] of made) {
			// Claimed while this pass was still creating — the check before each create above
			// cannot cover the ones made before it. Take our own copy back out rather than write
			// over their link: two clients each keeping the NPC they made is the duplicate this
			// is all here to avoid, and an unwritten one is worse still, since nothing would
			// point at it and the sidebar would just quietly grow. Safe to delete: we made it a
			// moment ago and it was never linked to anything.
			if (storedActorUuid(character, base)) lost.push(actor);
			else update[`flags.${SYSTEM_ID}.${base}.actorUuid`] = actor.uuid;
		}
		for (const actor of lost) {
			await actor.delete?.().catch(err =>
				console.warn("Stonetop | Could not remove a duplicate follower actor.", err));
		}
		if (Object.keys(update).length) await character.update(update);
		return Object.keys(update).length;
	} catch (err) {
		console.error("Stonetop | Could not make this character's follower actors.", err);
		return 0;
	} finally {
		_sweepsInFlight.delete(character.id);
	}
}
