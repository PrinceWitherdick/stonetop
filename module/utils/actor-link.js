/**
 * Resolving the actor behind a row that names a person.
 *
 * Several tables list people who are backed by an Actor — the steading's Player Characters,
 * Residents and Neighbors, and the shared relationships component on all three sheets. Each
 * row carries the same pair of `data-` attributes, and every consumer resolved them the same
 * way: prefer the uuid (which survives a move into a compendium or a folder), fall back to
 * the world id (which is what older rows stored), and warn when neither finds anybody.
 *
 * Rows are written by templates, so the actor they point at can be gone by the time it is
 * clicked — deleted between renders, or a world imported without it. Every path therefore
 * has to handle "no longer there", which is why the notification lives in here rather than
 * being remembered separately at each call site.
 */

/** i18n keys for the "that person is gone" warning, by what the row lists. */
export const ACTOR_LINK_MISSING = {
	character: "stonetop.actorLink.gone",
	npc:       "stonetop.actorLink.goneNpc",
};

/**
 * The Actor a link element points at, or null.
 *
 * @param {HTMLElement|DOMStringMap} link  the clicked element, or its dataset
 * @returns {Promise<Actor|null>}
 */
export async function resolveLinkedActor(link) {
	const { actorUuid, actorId } = link?.dataset ?? link ?? {};
	return (actorUuid ? await fromUuid(actorUuid) : null)
		|| (actorId ? game.actors?.get(actorId) : null)
		|| null;
}

/**
 * Resolve a link and hand the actor to `use`, warning instead when it cannot be found.
 *
 * @param {HTMLElement} link      the clicked element
 * @param {Function}    use       called with the resolved actor
 * @param {string}     [missing]  i18n key for the warning; see {@link ACTOR_LINK_MISSING}
 */
export async function withLinkedActor(link, use, missing = ACTOR_LINK_MISSING.character) {
	const actor = await resolveLinkedActor(link);
	if (actor) return use(actor);
	ui.notifications?.warn?.(game.i18n.localize(missing));
	return undefined;
}

/** The common case: open the linked actor's sheet. */
export function openLinkedActorSheet(link, missing = ACTOR_LINK_MISSING.character) {
	return withLinkedActor(link, actor => actor.sheet?.render(true), missing);
}
