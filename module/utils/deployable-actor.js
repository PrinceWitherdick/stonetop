// A world Actor to put on the map, for an Actor that may live in a compendium.
//
// Shared by the two surfaces that place actors in bulk: the GM Toolkit's encounter Deploy
// (actors/gmtoolkit/gm-bundle-tab.js) and the Fight tab's "Start a fight" search (fight/start-fight.js).
// Moved here out of the first so the second cannot grow its own copy of the one rule that matters:
// NEVER IMPORT A MONSTER THE WORLD ALREADY HAS.
//
// A token needs a WORLD actor to point at, so a compendium entry has to become one. Core's own canvas
// drop (`TokenLayer#_onDropActorData`) imports unconditionally, without ever looking for a copy already
// in the world, and this world SEEDS the whole bestiary into `game.actors` on ready
// (hooks/SeedActors.js). Handed a pack uuid, core would mint a duplicate of an already-imported monster
// every time. Matched on the compendium source with the package id stripped (`compendiumRefTail`), so a
// world seeded under an older system id still counts as having it.

import { worldCopiesBySource, compendiumRefTail } from "../migration/compat.js";

/**
 * "The world's copy of this pack document, if it has one", asked cheaply many times over.
 *
 * The index is `worldCopiesBySource` in migration/compat.js, deferred to the first question so a
 * deploy of world actors alone never pays to build it.
 *
 * @returns {((tail: string) => Actor|null) & {remember: (tail: string, actor: Actor) => void}}
 */
export function worldActorsBySource() {
	let index = null;
	const find = tail => {
		if (!tail) return null;
		index ??= worldCopiesBySource(globalThis.game?.actors ?? []);
		return index.get(tail) ?? null;
	};
	// IT HAS TO LEARN, or the index defeats the very duplication it exists to prevent. The map is
	// built on the first question and the deploy that asked it goes on to IMPORT what it could not
	// find, so a second row pointing at the same pack Actor ("three hillfolk raiders", listed three
	// times) would miss against a snapshot taken before the first import and mint a second and a third
	// copy from one press. The live `.find()` this index replaced could not: it saw the copy the
	// previous entry had just made.
	find.remember = (tail, actor) => {
		if (tail && actor && index) index.set(tail, actor);
	};
	return find;
}

/**
 * The world Actor to make a token of, and whether making it available meant importing one. Null for
 * a uuid that is not an Actor, or a pack Actor this user may not import.
 *
 * The caller's stored uuid is NOT rewritten to the imported copy: the pack entry is the stable
 * identity (a world copy can be deleted), and this finds the copy again next time without help.
 *
 * @param {string} uuid
 * @param {ReturnType<typeof worldActorsBySource>} [worldCopy]  share one across a batch
 * @returns {Promise<{actor: Actor, imported: boolean}|null>}
 */
export async function resolveDeployableActor(uuid, worldCopy = worldActorsBySource()) {
	const doc = await globalThis.fromUuid(uuid).catch(() => null);
	if (doc?.documentName !== "Actor") return null;
	if (!doc.pack) return { actor: doc, imported: false };

	const tail = compendiumRefTail(doc.uuid);
	const copy = worldCopy(tail);
	if (copy) return { actor: copy, imported: false };

	const game = globalThis.game;
	if (!globalThis.Actor?.canUserCreate?.(game?.user)) return null;
	const created = await globalThis.Actor.create(game.actors.fromCompendium(doc), { fromCompendium: true });
	if (!created) return null;
	// Told to the index straight away: the next entry in this same batch asks the same question of a
	// map that was built before this import, and would otherwise import again.
	worldCopy.remember?.(tail, created);
	return { actor: created, imported: true };
}
