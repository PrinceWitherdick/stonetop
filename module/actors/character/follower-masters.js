// Whose follower an NPC is.
//
// A follower is flag data on a character, and the NPC Actor that stands for them on the map is linked
// back to that character in one of two ways, depending on how the NPC came to exist:
//  • MADE FOR THE CARD (follower-actors.js#createFollowerActor): the actor carries its provenance,
//    `flags.<system>.followerOrigin.characterUuid`.
//  • RECRUITED (an existing NPC turned follower, "a follower is first an NPC", Book I p.475): the
//    NPC carries nothing, and the link is on the character's side, as the card's `sourceUuid`. A
//    card whose actor was made later remembers it as `actorUuid` too.
//
// Both are read here, so a list that wants a character's followers beside them (the Start a fight
// window) finds the recruited ones as well as the made ones. The NPC sheet's "Following" line reads
// the second of these for itself.

import { SYSTEM_ID } from "../../system-id.js";
import { readableFlags } from "./StonetopFlags.js";

/** Where a character keeps its followers (the character sheet's _FOLLOWER_FLAGS roots). */
const FOLLOWER_ROOTS = Object.freeze(["animalCompanion", "crew", "initiateDetails", "beastDetails", "customFollowers"]);
const LINK_KEYS = new Set(["actorUuid", "sourceUuid"]);

/** Every actor link stored under a character's followers, a few levels deep at most. */
function followerLinks(character) {
	const links = new Set();
	const walk = (node, depth) => {
		if (!node || typeof node !== "object" || depth > 3) return;
		for (const [key, value] of Object.entries(node)) {
			if (LINK_KEYS.has(key)) {
				if (typeof value === "string" && value.trim()) links.add(value.trim());
			} else if (value && typeof value === "object") {
				walk(value, depth + 1);
			}
		}
	};
	const flags = readableFlags(character);
	for (const root of FOLLOWER_ROOTS) walk(flags[root], 0);
	return links;
}

/**
 * Which character each follower NPC follows.
 *
 * Only `npc` actors are followers: a card's `sourceUuid` can also point at the bestiary monster a
 * follower was converted from, or the item behind a possession, and neither of those is the follower.
 * An NPC claimed by two characters goes to the first, in the order the characters are given.
 *
 * @param {object} p
 * @param {Actor[]} p.characters  the characters whose followers to find
 * @param {Actor[]} p.actors      every actor that might be one
 * @returns {Map<string, Actor>}  follower actor id -> the character
 */
export function followerMasterIndex({ characters = [], actors = [] } = {}) {
	const byUuid = new Map();
	for (const character of characters) {
		if (character?.uuid && !byUuid.has(character.uuid)) byUuid.set(character.uuid, character);
	}
	const claimed = new Map();
	for (const character of characters) {
		for (const uuid of followerLinks(character)) if (!claimed.has(uuid)) claimed.set(uuid, character);
	}
	const masters = new Map();
	for (const actor of actors) {
		if (actor?.type !== "npc" || !actor.id) continue;
		const origin = actor.flags?.[SYSTEM_ID]?.followerOrigin?.characterUuid;
		const master = byUuid.get(origin) ?? claimed.get(actor.uuid) ?? null;
		if (master && master.id !== actor.id) masters.set(actor.id, master);
	}
	return masters;
}
