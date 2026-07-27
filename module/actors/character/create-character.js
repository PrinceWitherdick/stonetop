// Minting a player character. Shared by the Welcome guide's player roster and the
// sidebar "Create Actor" picker so both entry points mint identically: replacing a
// player's existing character is confirmed first (it can't be undone), the player gets
// ownership AND the assignment, and their client is greeted with the creation intro
// rather than a blank sheet (see _maybeOpenCharacterCreation in hooks/Ready.js).

import { charactersOwnedBy } from "../../utils/playbook-actors.js";
import { bringDialogToFront } from "../../utils/front-on-open.js";
import { STONETOP_SCOPE } from "./StonetopFlags.js";

/**
 * Create a character, hand it to a player, and greet them with character creation.
 *
 * @param {string|null} userId            The player it belongs to; null mints it unassigned.
 * @param {object} [options]
 * @param {string|null} [options.folder]  Actor folder id to file the sheet under.
 * @param {string} [options.name]         Explicit name; defaults to "<player>'s Character".
 * @returns {Promise<Actor|null>}  The new character, or null if the GM cancelled the
 *                                 replacement or creation failed (already reported).
 */
export async function createCharacterForUser(userId, { folder = null, name = "" } = {}) {
	const user = userId ? game.users?.get(userId) ?? null : null;
	if (userId && !user) return null;

	// A player only ever has one character, so making a new one for someone who already
	// has one is a replacement, not an addition. Confirm the deletion before discarding
	// their existing sheet — it can't be undone.
	if (user) {
		const existing = charactersOwnedBy(user.id);
		if (existing.length) {
			// Deleting an Actor needs Assistant GM or better — Actor's metadata overrides
			// only `create` and `update`, so `delete` keeps the base "ASSISTANT" default,
			// and owning the sheet doesn't help. Players still reach this flow, because the
			// system grants them ACTOR_CREATE so the sidebar's Create Actor button works
			// (_ensurePlayerActorCreationGrant). Bail here rather than walking them through
			// an irreversible-deletion confirmation the server would then refuse.
			if (!existing.every(a => a.canUserModify(game.user, "delete"))) {
				ui.notifications?.warn?.(existing.length === 1
					? `You already have a character (${existing[0].name}). Ask your GM to replace it.`
					: "You already have a character. Ask your GM to replace it.");
				return null;
			}
			if (!await _confirmReplacement(user, existing)) return null;
			if (!await _deleteCharacters(existing, user)) return null;
		}
	}

	// Granting ownership is a GM privilege; a player creating their own character is made
	// its owner by the server anyway, so there's nothing to stamp. Assignment is wider:
	// core lets any user update their own User document, so a self-mint can claim its own
	// character (BaseUser.#canUpdate: "Players may only modify themselves").
	const isGM = !!game.user?.isGM;
	const isSelf = !!user && user.id === game.user?.id;
	const createData = {
		name: name?.trim() || (user ? `${user.name}'s Character` : "New Character"),
		type: "character",
	};
	if (folder) createData.folder = folder;
	if (user && isGM) createData.ownership = { [user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER };
	// The owner's client greets the player with the creation intro, then clears this — on
	// the next createActor, or on their next login. See _maybeOpenCharacterCreation.
	if (user) createData.flags = { [STONETOP_SCOPE]: { autoOpenFor: user.id } };

	let actor;
	try {
		actor = await getDocumentClass("Actor").create(createData);
	} catch (err) {
		console.error("Stonetop | failed to create character", err);
		ui.notifications?.error?.(user
			? `Couldn't create a character for ${user.name}.`
			: "Couldn't create the character.");
		return null;
	}
	if (!actor) return null;

	// Ownership alone only grants the player permission to edit the sheet — it doesn't
	// make this their character. Assign it as the user's player character too, so Foundry
	// treats it as their PC everywhere (the player list, token assignment, default
	// speaker, "release control", etc.).
	if (user && (isGM || isSelf)) {
		try {
			await user.update({ character: actor.id });
		} catch (err) {
			console.error("Stonetop | failed to assign character to player", err);
			ui.notifications?.warn?.(`Created “${actor.name}” but couldn't set it as ${user.name}'s character.`);
			return actor;
		}
	}

	_announce(actor, user);
	return actor;
}

/** Confirm discarding the player's current character (or characters). */
function _confirmReplacement(user, existing) {
	const names = existing.map(a => `<strong>${a.name}</strong>`).join(", ");
	const it = existing.length === 1 ? "it" : "them";
	return Dialog.confirm({
		title: `Replace ${user.name}'s character?`,
		content:
			`<p><strong>${user.name}</strong> already has a character assigned: ${names}.</p>` +
			`<p>Creating a new character will <strong>permanently delete</strong> ${it}. ` +
			`This can't be undone.</p>`,
		defaultYes: false,
		render: bringDialogToFront,
	});
}

/** Delete the characters being replaced. Returns false (and reports) if the delete failed. */
async function _deleteCharacters(existing, user) {
	try {
		await getDocumentClass("Actor").deleteDocuments(existing.map(a => a.id));
		return true;
	} catch (err) {
		console.error("Stonetop | failed to delete old character", err);
		ui.notifications?.error?.(`Couldn't replace ${user.name}'s character.`);
		return false;
	}
}

/** Say where the new sheet went, and whether its player is there to be greeted by it. */
function _announce(actor, user) {
	const info = message => ui.notifications?.info?.(message);
	if (!user) return info(`Created “${actor.name}”. Assign it to a player when you're ready.`);
	if (user.id === game.user?.id) return info(`Created “${actor.name}”. Starting character creation.`);
	if (user.active) return info(`Created “${actor.name}” and started character creation on ${user.name}'s screen.`);
	return info(`Created “${actor.name}” for ${user.name}. It'll be waiting when they log in.`);
}
