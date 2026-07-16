// Folder tints for the seeded gazetteer's four top-level categories in the Journal
// sidebar: the Bestiary codex, the Lore tree, Places, and Reference. Muted, distinct
// hues (spread around the wheel) chosen to stay legible on both the light parchment
// theme and Foundry's default dark sidebar, and to tell the trees apart at a glance.
//
// Each `name` is the seeded top-level folder; the colour applies to it and every
// descendant. They MUST match the `color` stamped on the pack source folder docs:
//   packs/src/stonetop-bestiary-journal/_folders/   (Bestiary codex tree)
//   packs/src/stonetop-lore/_folders/               (Lore tree)
//   packs/src/stonetop-locations/_folders/          (Places tree)
//   packs/src/stonetop-journals/_folders/           (Reference tree)
// so a freshly-seeded world (which copies the compendium folder colours during the
// import, see SeedCompendiums.resolveFolder) and an already-seeded world (recoloured
// in place by syncSeededFolderColors) end up with identical folders.
// tests/pack/folder-colors.test.js guards that the pack docs stay in sync with this.
export const SEEDED_FOLDER_COLORS = [
	{ name: "Bestiary",  color: "#6a9165" }, // sage green — the bestiary codex
	{ name: "Lore",      color: "#8b74ad" }, // heather violet — gods, factions, world lore
	{ name: "Places",    color: "#5f86a8" }, // dusty blue — regions, settlements, byways
	{ name: "Reference", color: "#b08a4f" }, // muted ochre — rules & world reference
];

// The "The World" root folder groups the four category trees in the world sidebar. It
// exists ONLY in the world (the seeder creates it — see SeedCompendiums), never in the
// compendium, so it isn't a pack folder doc. A neutral stone-slate that reads as the
// structural trunk and stands apart from the four coloured children. Applied to the
// root folder ALONE — deliberately not in SEEDED_FOLDER_COLORS, whose colours cascade
// to descendants; the world root must not tint its category children.
export const WORLD_ROOT_FOLDER_COLOR = "#6b6f76";

// A stable fingerprint of the whole colour scheme above. syncSeededFolderColors stamps
// this into a world setting after it runs and re-runs whenever it changes — so adding a
// category, or re-tinting one, propagates to already-seeded worlds on their next load
// instead of being locked out by a one-shot "done" flag. (Still idempotent; it recolours
// only folders still at the default or still holding a colour from the previous scheme, so
// re-running never clobbers a GM's own tint.)
export function seededFolderColorSignature() {
	return [
		...SEEDED_FOLDER_COLORS.map(s => `${s.name}=${s.color}`),
		`The World=${WORLD_ROOT_FOLDER_COLOR}`,
	].join("|");
}

// Parent folder id of a Folder, whether `.folder` is a Folder document (Foundry
// runtime) or a bare id / null (raw pack data or a test double).
function parentFolderId(folder) {
	const parent = folder?.folder;
	return (parent && typeof parent === "object" ? parent.id : parent) ?? null;
}

// The raw stored folder colour — the hex string authored on the doc — or null when
// unset. Reads `_source` first to bypass Foundry's ColorField getter, which turns a
// blank colour into a Color instance; a null result here means "still the default",
// which is the signal syncSeededFolderColors uses to avoid overwriting a colour
// the GM chose themselves.
export function rawFolderColor(folder) {
	const colour = folder?._source?.color ?? folder?.color ?? null;
	if (!colour) return null;
	return typeof colour === "string" ? colour : (colour.css ?? null);
}

// Plan the folder-colour updates for the seeded gazetteer. For each category
// (Bestiary, Lore) find its seeded folder — preferring the one nested under the
// "The World" root, else a loose root-level folder of that name — and recolour it
// plus every descendant that is STILL at the default colour, leaving any folder the
// GM has already tinted alone. When `worldRootColor` is given, the "The World" root
// folder itself is coloured too — root ONLY, never its category children (those keep
// their own cascading colours). Pure over a folder list so it can be unit-tested
// without a live Foundry. Returns an array of `{ _id, color }` update objects.
export function planSeededFolderColorUpdates(folders, specs, worldFolderName, worldRootColor = null, ownedColors = null) {
	const journal = Array.from(folders ?? []).filter(f => f.type === "JournalEntry");

	// parent id → child folders, so we can walk each category's subtree.
	const childrenOf = new Map();
	for (const folder of journal) {
		const pid = parentFolderId(folder);
		if (!childrenOf.has(pid)) childrenOf.set(pid, []);
		childrenOf.get(pid).push(folder);
	}

	const world = journal.find(f => f.name === worldFolderName && !parentFolderId(f)) ?? null;

	// A folder is ours to (re)colour when it is still at the default OR still carries a colour
	// we applied under a previous scheme (in `ownedColors`) — so re-tinting a category
	// propagates to already-seeded worlds — but never when it already IS the target colour
	// (no-op) or the GM has since chosen their own tint (an unrecognised non-default colour).
	const owned = ownedColors instanceof Set ? ownedColors : null;
	const recolourTo = (folder, color) => {
		const cur = rawFolderColor(folder);
		if (cur === color) return false;
		return !cur || (owned?.has(cur) ?? false);
	};

	const updates = [];

	// The "The World" root — coloured alone (no descendant walk).
	if (worldRootColor && world && recolourTo(world, worldRootColor)) {
		updates.push({ _id: world.id, color: worldRootColor });
	}

	for (const { name, color } of specs) {
		let root = world ? (childrenOf.get(world.id) ?? []).find(f => f.name === name) : null;
		root ??= journal.find(f => f.name === name && !parentFolderId(f)) ?? null;
		if (!root) continue;

		const stack = [root];
		while (stack.length) {
			const folder = stack.pop();
			if (recolourTo(folder, color)) updates.push({ _id: folder.id, color });
			for (const child of childrenOf.get(folder.id) ?? []) stack.push(child);
		}
	}
	return updates;
}
