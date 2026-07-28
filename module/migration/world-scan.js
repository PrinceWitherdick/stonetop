/**
 * Enumerates every place in a world that can carry this system's flags, as a flat list
 * of {label, docs, apply} targets the migration can walk uniformly.
 *
 * Embedded documents matter as much as top-level ones here: character data lives on
 * Actors, but shipped content lives on their embedded Items, journal content lives on
 * Pages, map-pin data lives on Scene Notes, and an unlinked token carries its own
 * ActorDelta with a full copy of the actor's flags.
 *
 * A target may carry `flagOptions`, merged into the copy for its documents alone. That is
 * how the legacy-scope fold reaches actors and nothing else — see ACTOR_FLAG_OPTIONS.
 */

import { LEGACY_FLAG_SCOPES } from "../system-id.js";

/**
 * Actors (and the ActorDeltas that shadow them) are the only documents read through
 * StonetopFlags/resolvedFlags, so they are the only ones whose fallback rungs stop being
 * consulted once the cutover stamp lands — and therefore the only ones that need those
 * rungs folded into the copy. Applying it more widely would duplicate ITEM_FLAG_SCOPE
 * content, which shares the "stonetop" spelling but is not legacy at all.
 */
export const ACTOR_FLAG_OPTIONS = Object.freeze({ legacyScopes: LEGACY_FLAG_SCOPES });

/** Top-level world collections, in the order they are reported to the user. */
export const WORLD_COLLECTIONS = Object.freeze([
	["Actors", "actors"],
	["Items", "items"],
	["Journals", "journal"],
	["Scenes", "scenes"],
	["Macros", "macros"],
	["Chat messages", "messages"],
	["Users", "users"],
	["Roll tables", "tables"],
	["Card stacks", "cards"],
	["Playlists", "playlists"],
	["Combats", "combats"],
	["Folders", "folders"]
]);

/** Embedded collections to walk on each parent, as [parentCollection, property, embeddedName]. */
export const EMBEDDED = Object.freeze([
	["actors", "items", "Item"],
	["actors", "effects", "ActiveEffect"],
	["items", "effects", "ActiveEffect"],
	["journal", "pages", "JournalEntryPage"],
	["scenes", "notes", "Note"],
	["scenes", "tokens", "Token"],
	["scenes", "tiles", "Tile"],
	["scenes", "drawings", "Drawing"],
	["tables", "results", "TableResult"],
	["cards", "cards", "Card"],
	["playlists", "sounds", "PlaylistSound"],
	["combats", "combatants", "Combatant"]
]);

/**
 * Normalize a Foundry collection (or a Set, array, Map-like, or nothing at all) to a plain
 * array. The one such helper for module/migration/ — flip.js's preflight walks users and
 * modules through it too.
 */
export function list(value) {
	if (!value) return [];
	if (typeof value[Symbol.iterator] === "function") return [...value];
	if (typeof value.values === "function") return [...value.values()];
	return [];
}

/**
 * Build the target list for a world.
 *
 * @param {object} game            The Foundry `game` object (or a stand-in in tests).
 * @param {object} [options]
 * @param {object} [options.updateOptions]  Passed to every write; defaults suppress renders.
 * @returns {Array<{label: string, docs: Array, apply: Function}>}
 */
export function collectTargets(game, { updateOptions = { render: false, diff: false } } = {}) {
	const targets = [];

	for (const [label, key] of WORLD_COLLECTIONS) {
		const collection = game?.[key];
		if (!collection) continue;
		const docs = list(collection);
		if (!docs.length) continue;
		targets.push({
			label,
			docs,
			flagOptions: key === "actors" ? ACTOR_FLAG_OPTIONS : undefined,
			apply: (updates) => collection.documentClass.updateDocuments(updates, updateOptions)
		});
	}

	for (const [parentKey, property, embeddedName] of EMBEDDED) {
		const collection = game?.[parentKey];
		if (!collection) continue;
		for (const parent of list(collection)) {
			const docs = list(parent?.[property]);
			if (!docs.length) continue;
			targets.push({
				label: `${parent.name ?? parent.id} › ${embeddedName}`,
				docs,
				apply: (updates) => parent.updateEmbeddedDocuments(embeddedName, updates, updateOptions)
			});
		}
	}

	// An unlinked token's ActorDelta holds its own copy of the actor's flags. It is
	// updated through the token, not as an embedded collection of the scene.
	for (const scene of list(game?.scenes)) {
		for (const token of list(scene?.tokens)) {
			const delta = token?.delta;
			if (!delta?.flags) continue;
			targets.push({
				label: `${scene.name ?? scene.id} › ${token.name ?? token.id} › ActorDelta`,
				docs: [delta],
				flagOptions: ACTOR_FLAG_OPTIONS,
				// The delta is addressed through its token, so `_id` is dropped rather than
				// blanked — an `_id: undefined` key still reaches the schema.
				apply: ([update]) => {
					const data = { ...update };
					delete data._id;
					return token.update({ delta: data }, updateOptions);
				}
			});
		}
	}

	return targets;
}

/**
 * World-level compendium packs (packs created inside the world, not shipped by a
 * package). Their documents are not loaded until asked for, so this is async and is
 * kept separate from the synchronous scan.
 */
export async function collectWorldPackTargets(game, { updateOptions = { render: false } } = {}) {
	const targets = [];
	for (const pack of list(game?.packs)) {
		if (pack?.metadata?.packageType !== "world") continue;
		if (pack.locked) continue;
		const docs = await pack.getDocuments();
		if (!docs.length) continue;
		targets.push({
			label: `Compendium: ${pack.metadata.label ?? pack.collection}`,
			docs,
			apply: (updates) => pack.documentClass.updateDocuments(updates, { ...updateOptions, pack: pack.collection })
		});
	}
	return targets;
}
