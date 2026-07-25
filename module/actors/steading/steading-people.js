// Residents & Neighbors of Stonetop are backed by "npc" Actors: each row in the
// steading's `residents`/`neighbors` flag arrays is a {uuid, id, name} pointer to
// an NPC actor, and the row's Occupation / Traits / Relations / Home / Notes cells
// read and write that actor's fields live. This module owns the folders the actors
// live in, the create + resolve helpers the sheet uses, and the one-time migration
// that converts legacy plain-text rows into NPC actors.
import { isDefaultImg, stripHtmlToText } from "../../utils/strings.js";
import { enrichHTML } from "../../utils/foundry-compat.js";
import { npcStatusMeta } from "../../data-models/npc-status.js";

const DEFAULT_MEMBER_AVATAR = "systems/stonetop_pwd/assets/icons/people/default_profile.svg";

// The empty field shape resolvePersonRow returns when a row has no live actor to
// pull from — spread into the no-row and deleted-actor fallbacks so the blank
// template shape lives in one place. `notes` is the plain (stripped) preview text and
// `notesHtml` the enriched rich version the roster cell renders.
const BLANK_PERSON_FIELDS = { occupation: "", traits: "", relations: "", home: "", notes: "", notesHtml: "", resolvedOccupation: "", profileImg: DEFAULT_MEMBER_AVATAR, status: "", statusLabel: "", statusInactive: false };

// The two Actor folders the people live in. Colours echo the warm parchment palette.
const PEOPLE_FOLDERS = {
	residents: { name: "Residents of Stonetop", color: "#7a5c3e" },
	neighbors: { name: "Neighbors of Stonetop", color: "#5c6b7a" },
};

// Which NPC field each editable column writes to. "name" is the document name; the
// rest are system fields. Home is neighbors-only. "notes" maps to the NPC's rich-text
// `system.notes` — but it is edited through a pop-up ProseMirror editor (see the sheet's
// notes-edit handler / npc-notes-dialog.js), NOT as an inline plain-text cell, so a
// table edit never flattens the field's HTML. Kept here only so legacy (pre-migration)
// plain-text rows, which still use an inline input, stay editable.
const PERSON_FIELD_PATHS = {
	name:       "name",
	occupation: "system.occupation",
	traits:     "system.traits",
	relations:  "system.relations",
	home:       "system.home",
	notes:      "system.notes",
};

const EDITABLE_COLUMNS = {
	residents: ["name", "occupation", "traits", "relations", "notes"],
	neighbors: ["name", "home", "occupation", "traits", "relations", "notes"],
};

/** Update path for a Residents/Neighbors column, or null if the column isn't editable. */
export function personFieldPath(list, field) {
	if (!EDITABLE_COLUMNS[list]?.includes(field)) return null;
	return PERSON_FIELD_PATHS[field] ?? null;
}

/** True when a row points at an NPC actor (post-migration shape) rather than legacy text. */
export function isActorRow(row) {
	return !!(row && (row.uuid || row.id));
}

/**
 * Distinct, non-empty names of a steading's Residents + Neighbors, for name-suggestion
 * datalists (e.g. Create-a-Follower). Reads the nested `stonetop_pwd.steading` flag where
 * the people rows actually live — the flat `getFlag(…, "residents")` path is never written.
 * Best-effort: a missing/unlinked steading (or any read error) just yields [].
 */
export function peopleNames(steading) {
	try {
		const flags = steading?.getFlag?.("stonetop_pwd", "steading") ?? {};
		const rows = Object.keys(PEOPLE_FOLDERS).flatMap(list => Array.isArray(flags[list]) ? flags[list] : []);
		return [...new Set(rows.map(r => String(r?.name ?? "").trim()).filter(Boolean))];
	} catch { return []; }
}

/**
 * Resolve one Residents/Neighbors row to the display shape the template expects.
 * Actor-backed rows pull their fields live off the linked NPC; legacy text rows (or
 * a row whose actor was deleted) fall back to the row's own stored fields so nothing
 * silently vanishes before/without migration. Always returns an object (never drops a
 * slot) so the resolved array stays index-aligned with the stored flag array — the
 * template's @index is what edits/deletes target.
 *
 * Async because the Notes cell shows the NPC's rich `system.notes` enriched (@UUID
 * links etc.); `notes` is the plain stripped text (tooltip / legacy input), `notesHtml`
 * the rendered rich version.
 *
 * @param {object} row   a residents/neighbors flag entry
 * @returns {Promise<object>} display row
 */
export async function resolvePersonRow(row) {
	if (!row) return { ...BLANK_PERSON_FIELDS, name: "" };
	if (isActorRow(row)) {
		const actor = (row.id ? game.actors?.get(row.id) : null)
			|| (row.uuid ? game.actors?.find(a => a.uuid === row.uuid) : null)
			|| null;
		if (!actor) {
			// Actor deleted out from under the row: show the cached name so the GM can
			// notice and re-link/remove it, rather than an empty row.
			return { ...BLANK_PERSON_FIELDS, uuid: row.uuid ?? "", id: row.id ?? "",
				name: row.name ?? "", unresolved: true, checked: !!row.checked };
		}
		const s = actor.system ?? {};
		const occupation = s.occupation ?? "";
		// Lifecycle status → an at-a-glance badge + dim/strike in the roster name cell.
		const status = npcStatusMeta(s.status);
		return {
			uuid:       actor.uuid,
			id:         actor.id,
			name:       actor.name,
			occupation,
			traits:     s.traits ?? "",
			relations:  s.relations ?? "",
			home:       s.home ?? "",
			notes:      stripHtmlToText(s.notes),
			notesHtml:  await enrichHTML(s.notes ?? ""),
			resolvedOccupation: occupation,
			profileImg: isDefaultImg(actor.img) ? DEFAULT_MEMBER_AVATAR : actor.img,
			checked:    !!row.checked,
			unresolved: false,
			status:         status.value,
			statusLabel:    status.label,
			statusInactive: status.inactive,
		};
	}
	// Legacy plain-text row: pass through, filling the shape the template reads.
	const legacyNotes = row.notes ?? row.etc ?? "";
	return {
		...row,
		occupation: row.occupation ?? "",
		traits:     row.traits ?? "",
		relations:  row.relations ?? "",
		home:       row.home ?? "",
		notes:      legacyNotes,
		notesHtml:  await enrichHTML(legacyNotes),
		resolvedOccupation: row.occupation ?? "",
		profileImg: !isDefaultImg(row.img ?? "") ? row.img : DEFAULT_MEMBER_AVATAR,
		legacy:     true,
		status:     "", statusLabel: "", statusInactive: false,
	};
}

/**
 * Find (or, for a GM, create) the Actor folder for a people list. Folder creation is a
 * GM/assistant privilege players lack, so a player who adds the first-ever resident when
 * the folder doesn't exist yet must not throw: return null and let the NPC land at the
 * sidebar root instead. The GM proactively creates both folders on load (see
 * ensurePeopleFolders), so this fallback is rare — the folder is normally already there.
 */
export async function ensurePeopleFolder(list) {
	const spec = PEOPLE_FOLDERS[list];
	if (!spec) return null;
	const existing = game.folders?.find(f => f.type === "Actor" && f.name === spec.name);
	if (existing) return existing;
	if (!Folder.canUserCreate(game.user)) return null; // player: no folder-create right
	try {
		return await Folder.create({ name: spec.name, type: "Actor", color: spec.color });
	} catch (err) {
		console.warn(`Stonetop | Could not create the "${spec.name}" folder; NPC will land at root.`, err);
		return null;
	}
}

/** Ensure both Residents/Neighbors Actor folders exist. GM-only; run once on load so a
 *  player adding the first member never has to create the folder (which they can't). */
export async function ensurePeopleFolders() {
	if (!game.user?.isGM) return;
	for (const list of Object.keys(PEOPLE_FOLDERS)) {
		try { await ensurePeopleFolder(list); }
		catch (err) { console.error("Stonetop | ensurePeopleFolders failed for", list, err); }
	}
}

/**
 * Create an NPC actor for a Residents/Neighbors entry from initial field data and
 * return it. Fields not relevant to the list (home for residents) are ignored.
 *
 * @param {"residents"|"neighbors"} list
 * @param {object} data  { name, occupation, traits, relations, home, notes, img }
 */
export async function createPersonNpc(list, data = {}) {
	const folder = await ensurePeopleFolder(list);
	const system = {
		occupation: data.occupation ?? "",
		traits:     data.traits ?? "",
		relations:  data.relations ?? "",
		// The roster row's note seeds the NPC's `notes` field. Legacy rows stored it under
		// `notes`/`etc`, so fall back to both so migration carries that text over instead
		// of dropping it.
		notes:      data.notes ?? data.etc ?? "",
	};
	if (list === "neighbors") system.home = data.home ?? "";
	// Residents live in Stonetop by definition, so seed their Home with "Stonetop"
	// (the NPC sheet shows it; a specific home can still be typed to override). A
	// non-blank home carried in by migration is respected.
	else if (list === "residents") system.home = (data.home ?? "").trim() || "Stonetop";
	const createData = {
		name: data.name?.trim() || "New " + (list === "neighbors" ? "Neighbor" : "Resident"),
		type: "npc",
		system,
		folder: folder?.id ?? null,
		// Residents/Neighbors are shown on the (often player-visible) steading sheet, so
		// players should be able to see them — unlike GM-prep monsters/threats. Default
		// OBSERVER keeps the steading rows rendering for players as they did pre-migration.
		ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER },
	};
	if (data.img && !isDefaultImg(data.img)) createData.img = data.img;
	return Actor.create(createData);
}

/**
 * One-time, idempotent migration: convert a steading's legacy plain-text Residents/
 * Neighbors rows into NPC actors and rewrite each row as a {uuid, id, name} pointer.
 * Rows that already point at an actor are left alone (so re-running is a no-op), and
 * blank rows are dropped. GM-only — it creates actors and writes the steading flags.
 *
 * @param {Actor} steading  an Actor of type "stonetop"
 * @returns {Promise<number>} how many rows were converted
 */
export async function migrateSteadingPeople(steading) {
	if (!game.user?.isGM || steading?.type !== "stonetop") return 0;
	// Converted on a prior load — skip the deep-clone + per-row rescan each startup.
	if (steading.flags?.stonetop_pwd?.steading?.peopleMigrated) return 0;
	// The steading stores its lists nested under flags.stonetop_pwd.steading (see
	// StonetopSteading#_flags / setFlags), so read and rewrite that sub-object — not
	// the top-level scope — and merge it back the same way the sheet does.
	const steadingFlags = foundry.utils.deepClone(steading.flags?.stonetop_pwd?.steading ?? {});
	let converted = 0;
	let changed = false;

	for (const list of ["residents", "neighbors"]) {
		const rows = Array.isArray(steadingFlags[list]) ? steadingFlags[list] : [];
		if (!rows.length) continue;
		// Nothing to convert if every row is already an actor pointer.
		if (rows.every(r => isActorRow(r) || !(r?.name ?? "").trim())) {
			// Still prune blank legacy slots so the list is clean.
			const pruned = rows.filter(r => isActorRow(r) || (r?.name ?? "").trim());
			if (pruned.length !== rows.length) { steadingFlags[list] = pruned; changed = true; }
			continue;
		}
		const newRows = [];
		for (const row of rows) {
			if (isActorRow(row)) { newRows.push(row); continue; }
			const name = (row?.name ?? "").trim();
			if (!name) continue; // drop blank slots
			const actor = await createPersonNpc(list, row);
			newRows.push({ uuid: actor.uuid, id: actor.id, name: actor.name, checked: !!row.checked });
			converted++;
		}
		steadingFlags[list] = newRows;
		changed = true;
	}

	if (changed) {
		steadingFlags.peopleMigrated = true;
		await steading.setFlag("stonetop_pwd", "steading", steadingFlags);
	}
	return converted;
}

/** Migrate every steading in the world (GM ready hook). */
export async function migrateAllSteadingPeople() {
	if (!game.user?.isGM) return;
	const steadings = (game.actors?.contents ?? []).filter(a => a.type === "stonetop");
	for (const s of steadings) {
		try { await migrateSteadingPeople(s); }
		catch (err) { console.error("Stonetop | migrateSteadingPeople failed for", s?.name, err); }
	}
}

/**
 * One-time, idempotent backfill: give every already-linked Resident-of-Stonetop NPC
 * whose Home is blank the value "Stonetop" (residents live there by definition). New
 * residents get this at creation via createPersonNpc; this catches those linked before
 * that default existed. Residents with a specific Home already typed are left alone.
 * GM-only; guarded by its own steading flag so it runs once even on already-migrated
 * worlds. Uses setFlag, which merges — the flag write keeps the residents list intact.
 *
 * @param {Actor} steading  an Actor of type "stonetop"
 * @returns {Promise<number>} how many resident NPCs were updated
 */
export async function backfillResidentHomes(steading) {
	if (!game.user?.isGM || steading?.type !== "stonetop") return 0;
	if (steading.flags?.stonetop_pwd?.steading?.residentHomesBackfilled) return 0;
	const rows = steading.flags?.stonetop_pwd?.steading?.residents;
	let updated = 0;
	for (const row of (Array.isArray(rows) ? rows : [])) {
		if (!isActorRow(row)) continue;
		const actor = (row.id ? game.actors?.get(row.id) : null)
			|| (row.uuid ? game.actors?.find(a => a.uuid === row.uuid) : null);
		if (!actor || actor.type !== "npc") continue;
		if (String(actor.system?.home ?? "").trim()) continue;
		try { await actor.update({ "system.home": "Stonetop" }); updated++; }
		catch (err) { console.warn("Stonetop | Could not backfill Home for", actor?.name, err); }
	}
	await steading.setFlag("stonetop_pwd", "steading", { residentHomesBackfilled: true });
	return updated;
}

/** Backfill resident Homes across every steading in the world (GM ready hook). */
export async function backfillAllResidentHomes() {
	if (!game.user?.isGM) return;
	const steadings = (game.actors?.contents ?? []).filter(a => a.type === "stonetop");
	for (const s of steadings) {
		try { await backfillResidentHomes(s); }
		catch (err) { console.error("Stonetop | backfillResidentHomes failed for", s?.name, err); }
	}
}
