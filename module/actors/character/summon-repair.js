// Putting right a follower summoned before its card's picks were asked for.
//
// The beautiful scroll's tulpa used to be added with all five moves, no instinct and no cost,
// whatever the player had ticked on the card (Book II p.527: the first move, then "pick 2
// additional tags, an instinct, 2 additional moves, and its cost"). Which two moves the player
// meant was never recorded anywhere, so no migration can settle it; only the player can.
//
// So when the owner opens the sheet, each such follower gets the same ask a new summon gets
// (ArcanaSummonDialog), saying what is off and opening on what it carries plus the card's ticks.
// "Save these picks" rewrites what the picks decide (applySummonRepair), "Keep it as it is" leaves
// it and stops asking, and "Remind me later" asks again next session. Both answers but the last
// stamp `picksSettled`, which every new summon is born with.

import { STONETOP_SCOPE } from "./StonetopFlags.js";
import { creationFlowOpen } from "./creation-flow.js";
import { ArcanaSummonDialog } from "./dialogs/ArcanaSummonDialog.js";
import {
	summonEntryFor, summonRepair, summonNeedsRepair, applySummonRepair, summonPickTicks,
} from "../../data/arcana-summons.js";

// Asked this session, as `actorId:followerId`, so a re-render or a second sheet never re-asks
// behind an open window, and "Remind me later" means the next session rather than the next click.
const _asked = new Set();

/**
 * Is `actor` this user's to put right? One answer per character, so a table where every player
 * owns every character isn't all asked about the same tulpa:
 *   • a character assigned to a player is that player's alone;
 *   • otherwise, the players who own it by name (not just through default ownership);
 *   • and when no player claims it either way, the GM's.
 */
function _asksUser(actor, user, users) {
	if (!actor?.isOwner || !user) return false;
	const OWNER = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;
	const players = [...(users ?? [])].filter(u => u && !u.isGM);
	const assignee = players.find(u => u.character?.id === actor.id);
	if (assignee) return assignee.id === user.id;
	const named = players.filter(u => (actor.ownership?.[u.id] ?? 0) >= OWNER);
	if (named.length) return named.some(u => u.id === user.id);
	return !!user.isGM;
}

/** The card a follower's picks are ticked on, when this character holds it; else no boxes. */
async function _cardFor(actor, slug) {
	const character = actor.typedActor;
	if (!character?.ownedArcanaSlugs?.has?.(slug)) return { slug };
	// Marks stored against an older printing of the card move first, so they are read right.
	await character.settleArcanumBoxLayouts?.({ slug });
	const arcanum = await character.getArcanum(slug);
	return { backDescription: arcanum?.back?.description ?? "", slug, boxStates: character.arcanaBoxStates ?? {} };
}

/**
 * Offer to put right each of the character's followers that was summoned before its picks were
 * asked for. Fire-and-forget from the sheet's render; asks one follower at a time.
 *
 * @param {Actor} actor
 * @param {object} [o]
 * @param {User} [o.user]
 * @param {Iterable<User>} [o.users]  everyone who might be asked instead (game.users)
 */
export async function offerSummonRepairs(actor, { user = globalThis.game?.user, users = globalThis.game?.users } = {}) {
	if (actor?.type !== "character" || !_asksUser(actor, user, users?.contents ?? users) || creationFlowOpen()) return;
	const followers = actor.getFlag(STONETOP_SCOPE, "customFollowers") ?? {};
	for (const [id, stored] of Object.entries(followers)) {
		const key = `${actor.id}:${id}`;
		if (_asked.has(key)) continue;
		const entry = summonEntryFor(stored);
		if (!entry?.choices?.length || stored?.picksSettled) continue;
		// Marked before the first await, so a second render arriving meanwhile passes it by.
		_asked.add(key);
		const slug = String(stored.sourceUuid).split(":")[0];
		const card = await _cardFor(actor, slug);
		if (!summonNeedsRepair(stored, card)) continue;

		const { groups, issues } = summonRepair(stored, entry, card);
		const name = stored.name || entry.name;
		const answer = await ArcanaSummonDialog.repair(entry, groups, { name, issues });
		if (!answer) continue;
		// Re-read: the follower may have changed, or gone, while the window was open, or a
		// co-owner may have settled it from their own screen meanwhile.
		const current = actor.getFlag(STONETOP_SCOPE, `customFollowers.${id}`);
		if (!current || current.picksSettled) continue;
		const path = `flags.${STONETOP_SCOPE}.customFollowers.${id}`;
		if (answer.action === "keep") {
			await actor.update({ [`${path}.picksSettled`]: true });
			continue;
		}
		const fields = applySummonRepair(current, entry, answer.picks);
		await actor.update(Object.fromEntries(Object.entries(fields).map(([k, v]) => [`${path}.${k}`, v])));
		const ticks = summonPickTicks(groups, answer.picks);
		if (card.backDescription && Object.keys(ticks).length) {
			await actor.typedActor?.setArcanumBoxesChecked?.(slug, "back", ticks);
		}
	}
}

/** For tests: forget what has been asked this session. */
export function _resetSummonRepairAsks() { _asked.clear(); }
