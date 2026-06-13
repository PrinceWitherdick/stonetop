import { getSetting, setSetting } from "../settings.js";
import { info, error } from "../utils/logger.js";
import { invalidateLocationSummaryIndex } from "../locations/location-tooltips.js";

// On a fresh world, copy the system's "Stonetop" JournalEntry compendium (the
// gazetteer — Locations, Lore, and the bundled Journals) into the world's Journal
// sidebar so the GM has it ready to browse and edit without manually importing the
// pack. The bestiary codex (~160 `bestiary`-page reference entries) shares that
// pack but is left out of the world copy — it's best browsed in the compendium,
// and dumping every creature into the sidebar would just clutter it.
//
// Runs once per world, guarded by the `seedingComplete` world setting, GM-only.
// `importJournalPack` recreates the folder tree the seeded entries use under a
// top-level world folder named after the pack, so they keep their organisation.
//
// Cross-links between the imported journals are then rewritten from their
// `@UUID[Compendium…]` form to point at the freshly-created world copies, so a GM
// browsing the seeded journals stays inside the world. Links that target things we
// do NOT seed — the bestiary codex (same pack), and the monster stat-block (Actor)
// and arcana (Item) compendiums — stay pointed at the compendium, where they live.

// Any @UUID into one of this system's compendiums. We only rewrite the ones whose
// target we actually imported (i.e. that resolve in `linkMap`); the rest pass through.
const SYSTEM_LINK = /@UUID\[(Compendium\.stonetop_pwd\.[^\]]+)\]/g;

// The fresh-start orientation journal. Its compendium source is hidden from
// players (`ownership.default: 0`); once seeded we open up the world copy to
// OBSERVER so every player can read it — and `_openSettingOverviewOnce` (in
// hooks/Ready.js) pops it open for each user the first time they connect.
const SETTING_OVERVIEW_NAME = "Setting Overview";

export async function seedCompendiumJournalsOnce() {
	if (!game.user?.isGM) return;
	if (getSetting("seedingComplete")) return;

	const packs = game.packs.filter(
		p => p.documentName === "JournalEntry"
			&& p.metadata?.packageName === "stonetop_pwd"
	);

	// compendium entry uuid → freshly-imported world entry uuid. The generators'
	// cross-links all target whole entries, so an entry-level map is enough and we
	// don't depend on import preserving ids. Entry names are unique within a pack,
	// so name is a safe join key.
	const linkMap = new Map();
	const created = [];

	for (const pack of packs) {
		try {
			const docs = await importJournalPack(pack);
			if (!Array.isArray(docs)) continue;
			await pack.getIndex();
			const worldUuidByName = new Map(docs.map(d => [d.name, d.uuid]));
			for (const idx of pack.index) {
				const worldUuid = worldUuidByName.get(idx.name);
				if (worldUuid) linkMap.set(`Compendium.${pack.collection}.JournalEntry.${idx._id}`, worldUuid);
			}
			created.push(...docs);
		} catch (err) {
			error(`Failed to seed journals from ${pack.collection}:`, err);
		}
	}

	await remapCrossLinks(created, linkMap);
	await openSettingOverviewToPlayers(created);

	// The seeded world journals carry the same `flags.stonetop.summary` as their
	// compendium source; drop the cached tooltip index so it rebuilds and the
	// rewritten (world-uuid) cross-links get their hover summaries.
	invalidateLocationSummaryIndex();

	// Set the flag regardless of partial failures: a retry would re-import the
	// packs that already succeeded and duplicate them, which is worse than a gap.
	await setSetting("seedingComplete", true);

	if (created.length) {
		info(`Seeded ${created.length} journal entries from compendiums into the world.`);
		ui.notifications?.info(`Stonetop: imported ${created.length} journal entries into your world.`);
	}
}

// Import a journal pack into the world EXCEPT its bestiary codex entries (each a
// single `bestiary` page). Foundry's `importAll` is all-or-nothing, so we filter
// here: load the docs, drop the bestiary ones, and recreate just the folder
// subtree the remaining entries use under a top-level world folder named for the
// pack. Folder resolution is best-effort — anything it can't place falls back to
// the top folder rather than failing the whole seed. Returns the created entries.
async function importJournalPack(pack) {
	const docs = await pack.getDocuments();
	const seed = docs.filter(d => !d.pages.some(p => p.type === "bestiary"));
	if (!seed.length) return [];

	const top = await Folder.create({ name: pack.title, type: "JournalEntry" });

	const packFolders = new Map();
	for (const f of pack.folders ?? []) packFolders.set(f.id, f);

	// Recreate a compendium folder (and its ancestors) in the world, memoised.
	const worldFolderId = new Map();
	async function resolveFolder(cf) {
		const id = cf?.id ?? null; // `cf` is a Folder doc (or null)
		if (!id) return top.id;
		if (worldFolderId.has(id)) return worldFolderId.get(id);
		const folder = packFolders.get(id);
		if (!folder) return top.id;
		const parentId = await resolveFolder(folder.folder);
		const wf = await Folder.create({
			name: folder.name, type: "JournalEntry", folder: parentId,
			sort: folder.sort ?? 0, color: folder.color ?? null,
		});
		worldFolderId.set(id, wf.id);
		return wf.id;
	}

	// fromCompendium prepares each doc for world creation (drops the id, stamps
	// `_stats.compendiumSource`) exactly as core's importAll does; we keep sort so
	// the seeded entries retain their authored order, and place them by folder.
	const data = [];
	for (const d of seed) {
		const obj = game.journal.fromCompendium(d, { clearSort: false });
		obj.folder = await resolveFolder(d.folder);
		data.push(obj);
	}
	return JournalEntry.createDocuments(data);
}

// Grant players read access to the seeded Setting Overview journal so the
// fresh-start auto-open (hooks/Ready.js) can show it to them. Edits the world
// copy only; the compendium source stays GM-only.
async function openSettingOverviewToPlayers(entries) {
	const overview = entries.find(e => e.name === SETTING_OVERVIEW_NAME);
	if (!overview) return;
	const observer = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
	if (overview.ownership?.default >= observer) return;
	try {
		await overview.update({ "ownership.default": observer });
	} catch (err) {
		error(`Failed to grant players access to "${SETTING_OVERVIEW_NAME}":`, err);
	}
}

// Rewrite @UUID links that target a seeded journal so they open the world copy.
// Links to documents we didn't import (bestiary, arcana) aren't in `linkMap`, so
// the replacer leaves them as compendium links.
async function remapCrossLinks(entries, linkMap) {
	if (!linkMap.size) return;
	for (const entry of entries) {
		const updates = [];
		for (const page of entry.pages ?? []) {
			const content = page.text?.content;
			if (!content || !content.includes("Compendium.stonetop_pwd.")) continue;
			const rewritten = content.replace(SYSTEM_LINK, (m, uuid) => {
				const world = linkMap.get(uuid);
				return world ? `@UUID[${world}]` : m;
			});
			if (rewritten !== content) updates.push({ _id: page.id, "text.content": rewritten });
		}
		if (updates.length) {
			try { await entry.updateEmbeddedDocuments("JournalEntryPage", updates); }
			catch (err) { error(`Failed to remap cross-links in "${entry.name}":`, err); }
		}
	}
}
