// Shared "player character" helpers. Only player characters carry a playbook, so
// "has a playbook" is the system-wide test for which actors are PCs — used by the
// Introductions and Let-Spring-Burst walkthroughs, the playbook picker, and the
// character sheet's avatar art.

import { WBH_PLAYBOOK_NAME, WBH_HERO_FLAG, heroDisplayName, ownsAsteriskMove } from "../actors/character/WouldBeHeroAsterisk.js";
import { STONETOP_SCOPE } from "../actors/character/StonetopFlags.js";

/**
 * A character's playbook slug, from either the embedded `system.playbook` data or
 * a contained playbook item. Returns "" when there's no playbook yet — which also
 * makes it the truthiness test for "is this actor a player character".
 */
export function playbookSlug(actor) {
	return actor?.system?.playbook?.slug
		?? actor?.items?.find?.(i => i.type === "playbook")?.system?.slug
		?? "";
}

/**
 * A character's playbook as it should READ — "The Lightbearer", "The Blessed" — or "" for
 * an actor who hasn't picked one. This is the sheet header's name, not the stored one: a
 * Would-Be Hero who has crossed off "Would-be" is "The Hero" everywhere they are named.
 *
 * The cross-off is only ever consulted for the one playbook it can apply to, so the rest
 * of the party never pays for the item scan behind `ownsAsteriskMove` — this runs once per
 * row of every Actors-sidebar render.
 */
export function playbookTitle(actor) {
	const name = actor?.system?.playbook?.name ?? "";
	if (name !== WBH_PLAYBOOK_NAME) return name;
	const becameHero = !!actor?.getFlag?.(STONETOP_SCOPE, WBH_HERO_FLAG) || ownsAsteriskMove(actor);
	return heroDisplayName(name, becameHero);
}

/**
 * A player character named the way the table says them out loud: "Pim The Lightbearer".
 *
 * DISPLAY ONLY — the Actor document keeps the bare name it was given. The playbook is not
 * part of who somebody is on disk: it can be swapped, it renames itself mid-campaign (see
 * `playbookTitle`), and half this system matches people BY name (the steading roster, the
 * relationships tables, follower recruitment, the chronicle's page-per-PC). Baking the
 * epithet in would either strand those matches or need every one of them rewritten, and a
 * chat speaker would end up "Pim The Lightbearer The Lightbearer" (see the alias stamp in
 * stonetop.js). Surfaces that want the long form ask for it here.
 *
 * Falls back to the plain name, so it is safe to call on any actor.
 */
export function characterFullName(actor) {
	const name  = actor?.name ?? "";
	const title = playbookTitle(actor);
	return title && name ? `${name} ${title}` : name;
}

/** Every world actor that is a player character (a `character` with a playbook). */
export function getPlayerCharacters() {
	return (game.actors?.contents ?? []).filter(a => a.type === "character" && playbookSlug(a));
}

/**
 * The characters a relationships table offers as rows: every `character` actor except
 * `exclude` (an actor id — a sheet never rates itself), preferring the player-owned ones
 * when any exist. The fallback to all characters keeps the section populated while a GM
 * preps, before players have been assigned. Shared so the NPC and character sheets can
 * never disagree about who counts as the party.
 */
export function partyCharacters({ exclude = null } = {}) {
	const chars = (game.actors?.contents ?? []).filter(a => a.type === "character" && a.id !== exclude);
	const owned = chars.filter(a => a.hasPlayerOwner);
	return owned.length ? owned : chars;
}

/**
 * The given actors ordered by the combat tracker's turn order — `combat.turns`
 * (honouring how the GM arranged the table), or the raw combatants before turns
 * are rolled. De-duped by id; actors not on the tracker are dropped, so the result
 * is the intersection of `actors` with the tracker, in turn order. Returns [] when
 * no combat is set up. Pass `getPlayerCharacters()` to order the PC roster.
 */
export function orderByCombatTurns(actors) {
	const combat = game.combat;
	if (!combat) return [];
	// `turns` honours how the GM arranged the table; before turns are built, fall
	// back to the raw combatants — spread to an array (combat.combatants is a
	// Foundry Collection, which has `.size`, not `.length`) so the guard + iteration
	// below work the same for both.
	const order  = combat.turns?.length ? combat.turns : [...combat.combatants];
	if (!order.length) return [];
	const byId   = new Map(actors.map(a => [a.id, a]));
	const seen   = new Set();
	const result = [];
	for (const c of order) {
		const actor = byId.get(c.actorId ?? c.actor?.id);
		if (actor && !seen.has(actor.id)) { seen.add(actor.id); result.push(actor); }
	}
	return result;
}

/**
 * Every `character` the given user explicitly owns — using the per-user OWNER
 * entry, not a GM's blanket ownership, so it returns only the PCs actually
 * assigned to that player.
 */
export function charactersOwnedBy(userId) {
	const owner = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
	return (game.actors?.contents ?? []).filter(
		a => a.type === "character" && (a.ownership?.[userId] ?? 0) >= owner,
	);
}

/**
 * Path to a playbook's avatar art (`assets/icons/playbooks/<slug>_icon.webp`), or
 * `null` for a slug-less actor. Server-root-relative (no leading slash) — the same
 * string stored as the character's avatar on pick, so previews match the art.
 */
export function playbookIconPath(slug) {
	return slug
		? `systems/stonetop_pwd/assets/icons/playbooks/${slug.replace(/-/g, "_")}_icon.webp`
		: null;
}
