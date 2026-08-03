import { getSetting, setSetting } from "../settings.js";
import { info, error } from "../utils/logger.js";
import { compendiumRefTail, seededSourceKeys } from "../migration/compat.js";
import { isPrimaryGM } from "../utils/primary-gm.js";
import { progressSlice, SEED_FOLDER_PHASE, SEED_BULK_CREATE_FRACTION } from "../utils/progress-slice.js";
import { ITEMS_PACK } from "../actors/character/StonetopFlags.js";

// On load, import the Book II treasures — the "Treasures & Wonders" folder of the
// stonetop-items Item compendium — into the world's Items sidebar under a folder of the
// same name, with one subfolder per Book II section (Barrow Builders, Forge Lords, ...)
// mirroring the compendium's layout. These are the notable finds described in the lore
// journals (relics, artifacts, curiosities) that AREN'T ordinary buyable gear, so the GM
// has the whole loot library ready to drag onto a sheet or a scene without opening a compendium.
// Companion to SeedActors (monsters) and SeedCompendiums (journals); all three are
// independent, so an established world whose journals/monsters were seeded long ago still
// gets the treasures on the first load after this ships.
//
// GM-only and once per world (guarded by the `treasureItemsSeeded` world setting). The
// imported items are stamped ownership NONE, so players never see the full loot list in
// their sidebar — they get a treasure only when the GM drags one onto their sheet (which
// re-plants it as an inventory-custom copy). Matches the bestiary's spoiler protection.

const ITEMS_PACK_ID = ITEMS_PACK;
const TREASURE_FOLDER_NAME = "Treasures & Wonders";
// Folder tints, kept in sync with scripts/local/treasures/gen-treasure-items.mjs (the pack
// source) so a freshly-seeded world matches the compendium. The whole tree (root + section
// subfolders) shares one rich gold so it reads as treasure at a glance.
const ROOT_COLOR = "#c9a227";
const SECTION_COLOR = "#c9a227";

/**
 * Whether this world still owes the treasure import. The seed's own guard, lifted out so the
 * first-load setup window (hooks/WorldSetup.js) can list only the work that is really coming
 * without restating the conditions.
 *
 * Primary GM only: the import isn't atomic with the `treasureItemsSeeded` flag (set only
 * after it finishes) and idempotency rests on an alreadySeeded set read before
 * createDocuments — so two GMs both entering ready on a fresh world would each seed the full
 * set and double it. Matches needsBestiaryActorSeed's guard. A missing pack (a dev build
 * without it) means there is nothing to seed either.
 */
export function needsTreasureItemSeed() {
	if (!game.user?.isGM || !isPrimaryGM()) return false;
	if (getSetting("treasureItemsSeeded")) return false;
	return !!game.packs.get(ITEMS_PACK_ID);
}

export async function seedTreasureItemsOnce({ onProgress } = {}) {
	if (!needsTreasureItemSeed()) return;
	const pack = game.packs.get(ITEMS_PACK_ID);

	try {
		const created = await importTreasureItems(pack, { onProgress });
		// Set the flag regardless of how many landed: the import skips items already present,
		// so a re-run would only ever add genuinely-missing ones — but a latched flag also
		// means a GM who deletes some treasures won't have them re-seeded.
		await setSetting("treasureItemsSeeded", true);
		if (created.length) {
			info(`Seeded ${created.length} treasure items into the world "${TREASURE_FOLDER_NAME}" folder.`);
			ui.notifications?.info(`Stonetop: imported ${created.length} treasures into your Items sidebar.`);
		}
	} catch (err) {
		error("Failed to seed the treasure items into the world:", err);
		// Leave `treasureItemsSeeded` unset so the next load retries rather than stranding a
		// half-imported folder.
	}
}

// Import every "Treasures & Wonders" item from `pack` into the world, recreating the
// compendium's "Treasures & Wonders" > section subtree. Idempotent: reuses existing world
// folders (match on name+parent) and skips items already imported (matched on
// compendiumSource), so a partial run — or a reload mid-import — recovers on the next load
// without duplicating. Returns the created items.
async function importTreasureItems(pack, { onProgress } = {}) {
	onProgress?.({ fraction: 0, detail: "Reading the Treasures & Wonders compendium" });
	const docs = await pack.getDocuments();
	// The treasures share the "inventory" moveType with ordinary gear; the isTreasure flag
	// is what sets them apart (and what keeps them out of the outfit picker — see
	// FoundryOutfitItemRepository), so filter on it rather than on the folder name.
	const treasures = docs.filter(d => d.flags?.stonetop?.isTreasure);
	if (!treasures.length) return [];

	// Recreate the pack's folder tree: the root "Treasures & Wonders" folder and its section
	// children. Map each pack folder id → world folder id so items file against the right one.
	const rootId = await ensureItemFolder(TREASURE_FOLDER_NAME, null, ROOT_COLOR);
	const packRoot = Array.from(pack.folders ?? []).find(f => f.name === TREASURE_FOLDER_NAME && !f.folder);
	const worldFolderId = new Map(); // packFolderId -> worldFolderId
	if (packRoot) {
		worldFolderId.set(packRoot.id, rootId);
		const sections = Array.from(pack.folders ?? [])
			.filter(f => (f.folder?.id ?? null) === packRoot.id)
			.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
		const reportFolder = progressSlice(onProgress, SEED_FOLDER_PHASE);
		for (const [i, sec] of sections.entries()) {
			worldFolderId.set(sec.id, await ensureItemFolder(sec.name, rootId, SECTION_COLOR));
			// One folder per Book II section, created serially — the only part of this import
			// with per-item motion, so it owns the head of the step's bar (see SEED_FOLDER_PHASE).
			reportFolder?.({ fraction: (i + 1) / sections.length, detail: "Building the treasure folders" });
		}
	}

	// Items already carried into the world (by an earlier seed, or a GM drag from the
	// compendium) are matched on their compendium source and left alone — no duplicates.
	// Matched without the package id, so a world seeded under an older system id is not
	// re-imported wholesale.
	const alreadySeeded = seededSourceKeys(game.items);

	const data = [];
	for (const d of treasures) {
		if (alreadySeeded.has(compendiumRefTail(d.uuid))) continue;
		// fromCompendium prepares the doc for world creation (drops the id, stamps
		// `_stats.compendiumSource`); keep sort so the authored order is preserved.
		const obj = game.items.fromCompendium(d, { clearSort: false });
		const pf = d.folder?.id ?? null;
		obj.folder = (pf && worldFolderId.has(pf)) ? worldFolderId.get(pf) : rootId;
		// GM-only content: players must not find the loot list in their Items sidebar.
		obj.ownership = { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE };
		data.push(obj);
	}
	if (!data.length) return [];
	onProgress?.({ fraction: SEED_BULK_CREATE_FRACTION, detail: `Creating ${data.length} treasures` });
	return Item.createDocuments(data);
}

// Find-or-create a world Item folder by name+parent, tinting it. Reuses an existing match
// (from an earlier partial seed, or a GM-made folder of the same name in the same place)
// rather than duplicating — and, if that folder is still uncoloured, back-fills the tint so a
// world part-seeded before the colours shipped catches up (a GM's own tint is left alone).
// Returns the folder id, or null if creation fails — in which case the caller files the items
// at the sidebar root, so a single failure never aborts the import.
async function ensureItemFolder(name, parentId, color) {
	const existing = (game.folders ?? []).find(f =>
		f.type === "Item" && f.name === name && (f.folder?.id ?? null) === (parentId ?? null)
	);
	if (existing) {
		if (color && !existing._source?.color) {
			try { await existing.update({ color }); } catch (err) { error(`Failed to tint the "${name}" item folder:`, err); }
		}
		return existing.id;
	}
	try {
		const created = await Folder.create({ name, type: "Item", folder: parentId ?? null, color: color ?? null });
		return created?.id ?? null;
	} catch (err) {
		error(`Failed to create the "${name}" item folder:`, err);
		return null;
	}
}
