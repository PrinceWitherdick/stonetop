// Pure helpers for seeding the Monsters (stonetop-bestiary) actor compendium into the
// world's Actors sidebar. No Foundry globals are touched here, so tests drive this without
// a live Foundry (see tests/pack/bestiary-actor-seed.test.js). The runtime that realises
// the plan lives in SeedActors.js.
import { SEEDED_FOLDER_COLORS } from "./seeded-folder-colors.js";

// The world-side folder the monster sheets seed into. It carries the SAME brick-red the
// Bestiary journal codex uses, so the Actors sidebar reads like the codex — a single
// source of truth (SEEDED_FOLDER_COLORS) shared with the journal tree.
export const BESTIARY_ROOT_NAME = "Bestiary";
export const BESTIARY_FOLDER_COLOR =
	SEEDED_FOLDER_COLORS.find(s => s.name === BESTIARY_ROOT_NAME)?.color ?? "#a8544c";

// Plan the world folder tree for the seeded bestiary. Given the compendium's folder docs
// as plain records `{ id, name, parentId, sort }`, return an ordered creation plan for a
// single top-level "<rootName>" folder with the pack's subtree recreated beneath it, every
// folder tinted `color`. The list is ordered parents-before-children, so a runtime that
// creates folders in order always has each parent's freshly-minted world id on hand.
//
// `parentPackId: null` on a plan entry means "directly under the synthetic root". A pack
// folder that is ITSELF a top-level "<rootName>" folder — present once the compendium is
// rebuilt with its own Bestiary wrapper — is COLLAPSED onto the synthetic root: it isn't
// emitted as its own folder, and anything parented to it reparents up to the root, so a
// rebuilt pack never produces a nested duplicate "Bestiary". Collapsed ids are returned so
// the runtime can point actors filed directly under a pack wrapper at the world root.
export function planBestiaryFolderTree(packFolders, { rootName, color }) {
	const folders = Array.from(packFolders ?? []);
	const byId = new Map(folders.map(f => [f.id, f]));

	// Top-level folders named rootName collapse onto the synthetic root.
	const collapsedIds = new Set(
		folders.filter(f => f.name === rootName && (f.parentId ?? null) === null).map(f => f.id)
	);

	// A folder's effective parent: null (place under the root) when its stored parent is
	// missing, unknown, or a collapsed root; otherwise the stored parent id.
	const effectiveParent = (f) => {
		const p = f.parentId ?? null;
		if (p === null || collapsedIds.has(p) || !byId.has(p)) return null;
		return p;
	};

	const emitted = new Set();
	const out = [];
	const emit = (f) => {
		if (emitted.has(f.id) || collapsedIds.has(f.id)) return;
		const parentPackId = effectiveParent(f);
		if (parentPackId !== null && !emitted.has(parentPackId)) emit(byId.get(parentPackId));
		out.push({ packId: f.id, name: f.name, parentPackId, color, sort: f.sort ?? 0 });
		emitted.add(f.id);
	};
	for (const f of folders) emit(f);

	return { root: { name: rootName, color }, folders: out, collapsedIds };
}
