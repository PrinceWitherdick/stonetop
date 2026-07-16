// Factory for the folder/list/create/rename CRUD shared by the "GM-prep page" families —
// threats and hazards. Each is a set of single-page JournalEntries (one `threat`/`hazard`
// page apiece), grouped in a per-steading folder the steading points at via a flag, where
// "reveal to players" is the entry's baseline-ownership flip. See threat-store.js for the
// full one-entry-per-page rationale (it contains the player-visibility blast radius; reveal
// is UI-level hiding only, since v14 still broadcasts world journals in full).
//
// Threats and hazards share this entire surface and differ only in the config constants
// below plus the seed→system shaper, so the CRUD lives once here. The reveal/doom-tick/
// delete helpers are entry-level and page-shape generic, so they stay in threat-store and
// hazards reuse them directly.
import { STONETOP_SCOPE, resolvedFlagProperty } from "../actors/character/StonetopFlags.js";

// Looked up lazily (not at module load) so callers import cleanly outside Foundry.
const OWN = () => CONST.DOCUMENT_OWNERSHIP_LEVELS;

/**
 * @param {object} cfg
 * @param {string} cfg.pageType      JournalEntryPage type ("threat" | "hazard").
 * @param {string} cfg.entryFlag     Boolean flag marking an entry as ours (flags.<scope>.<entryFlag>).
 * @param {string} cfg.folderFlagId  Steading flag holding the folder id (e.g. "threatsFolderId").
 * @param {string} cfg.folderForFlag Folder flag pointing back at the steading (e.g. "threatsFor").
 * @param {string} cfg.folderSuffix  Folder name suffix (e.g. "Threats" → "<Steading> Threats").
 * @param {string} cfg.defaultName   Fallback name for a nameless page (e.g. "New Threat").
 * @param {(seed:object)=>object} cfg.shapeSystem  Creation/edit seed → page.system data.
 * @returns {{folderId,getFolder,listEntries,pageOf,pageById,listPages,ensureFolder,create,setName}}
 */
export function makeGmPrepPageStore({ pageType, entryFlag, folderFlagId, folderForFlag, folderSuffix, defaultName, shapeSystem }) {
	/** The id of the steading's folder for this page family, if one has been created. */
	const folderId = (steadingActor) => resolvedFlagProperty(steadingActor, "steading")?.[folderFlagId] ?? null;

	/** Resolve the steading's folder, or null. Never creates. */
	const getFolder = (steadingActor) => {
		const id = folderId(steadingActor);
		return id ? (game.folders?.get(id) ?? null) : null;
	};

	/** The steading's entries (each holds one page), in sort order. For a player this only
	 *  yields revealed entries — hidden ones aren't on their client. */
	const listEntries = (steadingActor) => {
		const folder = getFolder(steadingActor);
		if (!folder) return [];
		return folder.contents
			.filter(e => e.getFlag?.(STONETOP_SCOPE, entryFlag))
			.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
	};

	/** The single page inside an entry. */
	const pageOf = (entry) => entry?.pages?.find(p => p.type === pageType) ?? null;

	/** Resolve a page from an entry/page id pair (as a scene Note links it), or null. */
	const pageById = (entryId, pageId) => {
		if (!entryId || !pageId) return null;
		const page = game.journal?.get(entryId)?.pages?.get(pageId);
		return page?.type === pageType ? page : null;
	};

	/** The steading's pages, in order. */
	const listPages = (steadingActor) => listEntries(steadingActor).map(pageOf).filter(Boolean);

	/** Resolve the steading's folder, creating it (GM-only) on first use. */
	const ensureFolder = async (steadingActor) => {
		const existing = getFolder(steadingActor);
		if (existing) return existing;
		if (!game.user?.isGM) return null;

		const folder = await Folder.create({
			name: `${steadingActor.name} ${folderSuffix}`,
			type: "JournalEntry",
			flags: { [STONETOP_SCOPE]: { [folderForFlag]: steadingActor.id } },
		});
		await steadingActor.typedActor.setFlags({ [folderFlagId]: folder.id });
		return folder;
	};

	/** Create a new page as its own hidden (GM-only) JournalEntry. Returns the page; its
	 *  ownership stays INHERIT, so revealing the entry reveals the page. */
	const create = async (steadingActor, seed = {}) => {
		const folder = await ensureFolder(steadingActor);
		if (!folder) return null;

		const name = String(seed.name ?? "").trim() || defaultName;
		const entry = await JournalEntry.create({
			name,
			folder: folder.id,
			ownership: { default: OWN().NONE },
			flags: { [STONETOP_SCOPE]: { [entryFlag]: true } },
			pages: [{ type: pageType, name, system: shapeSystem(seed) }],
		});
		return pageOf(entry);
	};

	/** Rename everywhere the name is identity: the page, the parent ENTRY (the sidebar /
	 *  share / delete key off it), and any placed scene Note pins (label stamped at drop). */
	const setName = async (page, name) => {
		const clean = String(name ?? "").trim() || defaultName;
		if (!page) return;
		if (page.name !== clean) await page.update({ name: clean });
		const entry = page.parent;
		if (entry && entry.name !== clean) await entry.update({ name: clean });
		if (game.user?.isGM && game.scenes && entry) {
			for (const scene of game.scenes) {
				const updates = scene.notes
					.filter(n => n.entryId === entry.id && n.text !== clean)
					.map(n => ({ _id: n.id, text: clean }));
				if (updates.length) await scene.updateEmbeddedDocuments("Note", updates).catch(() => {});
			}
		}
	};

	return { folderId, getFolder, listEntries, pageOf, pageById, listPages, ensureFolder, create, setName };
}
