// Change ledger for the "npc" Actor subtype. Mirrors the character/steading ledgers:
// _preUpdate diffs an incoming update into human-readable action strings, which
// _onUpdate appends (stamped with who/when) to a flag on the actor, shown by the
// Ledger header button on the NPC sheet.
//
// An NPC is all `system.*` data (no gameplay flags), so the diff is simpler than
// the character/steading versions — a flat path→label map for the scalar fields,
// plus a few small handlers for the array (impressions), the per-PC relationships
// map, and the rich-text prose fields (which log "updated" rather than dumping HTML).
import {
	isLedgerPath,
	appendLedgerEntries, deleteLedgerEntries, getLedgerEntries,
	isBlank, valuesEqual, actionForField, coalesceEntries,
} from "../../utils/ledger-core.js";
import { stripHtmlToText as stripHtml } from "../../utils/strings.js";
import { heartsLabel } from "../../utils/heart-words.js";

// Scalar fields — one dot-path per label. Rich-text and structured fields are
// handled by the dedicated helpers below, not here.
const SYSTEM_PATH_LABELS = {
	"name":                                 "Name",
	"system.pronouns":                      "Pronouns",
	"system.occupation":                    "Occupation",
	"system.traits":                        "Traits",
	"system.instinct":                      "Instinct",
	"system.status":                        "Status",
	"system.home":                          "Home",
	"system.relations":                     "Relations",
	"system.embodiment":                    "Embodiment",
	"system.hasStats":                      "Game stats",
	"system.attributes.hp.value":           "HP",
	"system.attributes.hp.max":             "Max HP",
	"system.attributes.armor.value":        "Armor",
	"system.attributes.armor.source":       "Armor source",
	"system.attributes.damage.value":       "Damage",
	"system.attributes.damage.rollFormula": "Damage formula",
	"system.tags":                          "Tags",
	"system.statBlock":                     "Stat block link",
	"system.threat":                        "Threat link",
};

// Prose (HTMLField) fields: log that they changed, not the raw markup.
const RICH_TEXT_LABELS = {
	"system.connections": "Connections",
	"system.motivations": "Motivations",
	"system.notes":       "Notes",
};

const IMPRESSIONS_PREFIX  = "system.impressions.";
const RELATIONSHIPS_PREFIX = "system.relationships.";

// Blank ↔ content ↔ content transitions for a rich-text field, without dumping the HTML.
function richTextEntry(label, oldValue, newValue) {
	const oldBlank = !stripHtml(oldValue);
	const newBlank = !stripHtml(newValue);
	if (oldBlank && newBlank) return null;
	if (oldBlank) return { action: `${label} added` };
	if (newBlank) return { action: `${label} cleared` };
	return { action: `${label} updated` };
}

// One of up to three sensory-impression slots (system.impressions.<idx>).
function impressionEntry(oldValue, newValue) {
	if (isBlank(oldValue) && isBlank(newValue)) return null;
	if (isBlank(oldValue)) return { action: `Impression added: ${newValue}` };
	if (isBlank(newValue)) return { action: `Impression cleared: ${oldValue}` };
	return { action: `Impression changed from ${oldValue} to ${newValue}` };
}

// A per-PC affinity entry, written as { hearts, notes } under the character's id.
// Resolve the id back to the PC's name so a change reads "Relationship with Blodwen changed…".
function relationshipEntry(path, oldValue, newValue) {
	const rest  = path.slice(RELATIONSHIPS_PREFIX.length);
	const dot   = rest.indexOf(".");
	const id    = dot >= 0 ? rest.slice(0, dot) : rest;
	const field = dot >= 0 ? rest.slice(dot + 1) : "";
	const pcName = globalThis.game?.actors?.get?.(id)?.name ?? "a character";
	if (field === "hearts") {
		const oldLabel = isBlank(oldValue) ? oldValue : heartsLabel(oldValue);
		const newLabel = isBlank(newValue) ? newValue : heartsLabel(newValue);
		return { action: actionForField(`Relationship with ${pcName}`, oldLabel, newLabel) };
	}
	// Blank → blank is not a change worth a line: an undefined → "" diff is not "equal", so
	// clearing a note that was already empty would otherwise log a phantom "note set to
	// blank". updateRelationship no longer writes `notes` for a row that never had one, so
	// a first-time RATING never reaches here at all — but an explicit clear still can, and
	// so can a world written by an earlier build, which holds `notes: ""` throughout.
	// Mirrors impressionEntry's own blank-to-blank guard above.
	if (field === "notes") {
		if (isBlank(oldValue) && isBlank(newValue)) return null;
		return { action: actionForField(`Relationship note for ${pcName}`, oldValue, newValue) };
	}
	return null;
}

// An NPC's fields split between the numbers that matter in a fight and everything describing
// who they are; the ledger dialog's subject dropdown groups by these. Paths listed here file
// under "stats", everything else under "character".
const STAT_PATHS = new Set([
	"system.attributes.hp.value", "system.attributes.hp.max", "system.attributes.armor.value",
	"system.attributes.armor.source", "system.attributes.damage.value",
	"system.attributes.damage.rollFormula", "system.tags", "system.hasStats",
]);

function actorUpdateEntries(actor, changed) {
	const flat = foundry.utils.flattenObject(changed);
	const entries = [];
	for (const [path, newValue] of Object.entries(flat)) {
		if (!path || isLedgerPath(path)) continue;

		if (path.startsWith(IMPRESSIONS_PREFIX)) {
			const idx = Number(path.slice(IMPRESSIONS_PREFIX.length).split(".")[0]);
			const oldValue = (actor.system?.impressions ?? [])[idx];
			if (valuesEqual(oldValue, newValue)) continue;
			const entry = impressionEntry(oldValue, newValue);
			if (entry) entries.push({ category: "relations", ...entry });
			continue;
		}

		if (path.startsWith(RELATIONSHIPS_PREFIX)) {
			const oldValue = foundry.utils.getProperty(actor, path);
			if (valuesEqual(oldValue, newValue)) continue;
			const entry = relationshipEntry(path, oldValue, newValue);
			if (entry) entries.push({ category: "relations", ...entry });
			continue;
		}

		if (RICH_TEXT_LABELS[path]) {
			const oldValue = foundry.utils.getProperty(actor, path);
			if (valuesEqual(oldValue, newValue)) continue;
			const entry = richTextEntry(RICH_TEXT_LABELS[path], oldValue, newValue);
			if (entry) entries.push({ category: "notes", ...entry });
			continue;
		}

		const label = SYSTEM_PATH_LABELS[path];
		if (!label) continue;
		const oldValue = foundry.utils.getProperty(actor, path);
		if (valuesEqual(oldValue, newValue)) continue;
		entries.push({
			category: STAT_PATHS.has(path) ? "stats" : "character",
			action: actionForField(label, oldValue, newValue),
		});
	}
	return coalesceEntries(entries);
}

// GM moves are the only embedded documents on an NPC; log their add/remove.
function moveAction(item, verb) {
	return { category: "moves", action: `Move ${verb}: ${item.name}` };
}

export class NpcLedger {
	static getEntries(actor) {
		return getLedgerEntries(actor);
	}

	static async append(actor, entries, options = {}) {
		if (actor?.type !== "npc") return;
		await appendLedgerEntries(actor, entries, options);
	}

	static async deleteEntries(actor, ids) {
		if (actor?.type !== "npc") return;
		await deleteLedgerEntries(actor, ids);
	}

	static entriesForActorUpdate(actor, changed) {
		return actorUpdateEntries(actor, changed);
	}

	static entriesForCreatedItems(items) {
		return items.filter(i => i.type === "npcMove").map(i => moveAction(i, "added"));
	}

	static entriesForDeletedItems(items) {
		return items.filter(i => i.type === "npcMove").map(i => moveAction(i, "removed"));
	}
}
