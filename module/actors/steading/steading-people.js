// Residents & Neighbors of Stonetop are backed by "npc" Actors: each row in the
// steading's `residents`/`neighbors` flag arrays is a {uuid, id, name} pointer to
// an NPC actor, and the row's Occupation / Traits / Relations / Home / Notes cells
// read and write that actor's fields live. This module owns the folders the actors
// live in, the create + resolve helpers the sheet uses, and the one-time migration
// that converts legacy plain-text rows into NPC actors.
import { isDefaultImg } from "../../utils/strings.js";
import { enrichHTML } from "../../utils/foundry-compat.js";

const DEFAULT_MEMBER_AVATAR = "systems/stonetop_pwd/assets/icons/people/default_profile.svg";

// The empty field shape resolvePersonRow returns when a row has no live actor to
// pull from — spread into the no-row and deleted-actor fallbacks so the blank
// template shape lives in one place. `notes` is the plain (stripped) preview text and
// `notesHtml` the enriched rich version the roster cell renders.
const BLANK_PERSON_FIELDS = { occupation: "", traits: "", relations: "", home: "", notes: "", notesHtml: "", resolvedOccupation: "", profileImg: DEFAULT_MEMBER_AVATAR };

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

/** Strip tags/entities so rich notes collapse to one line for a tooltip / plain preview. */
export function stripHtmlToText(value) {
	if (value == null) return "";
	return String(value)
		.replace(/<\s*br\s*\/?>/gi, " ")
		.replace(/<[^>]*>/g, " ")
		.replace(/&nbsp;/gi, " ")
		.replace(/&amp;/gi, "&")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/\s+/g, " ")
		.trim();
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
	};
}

/** Find or create the Actor folder for a people list. GM-only (folder creation writes). */
export async function ensurePeopleFolder(list) {
	const spec = PEOPLE_FOLDERS[list];
	if (!spec) return null;
	const existing = game.folders?.find(f => f.type === "Actor" && f.name === spec.name);
	if (existing) return existing;
	return Folder.create({ name: spec.name, type: "Actor", color: spec.color });
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
