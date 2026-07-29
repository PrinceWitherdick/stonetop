// Change ledger for the "npc" Actor subtype. Mirrors the character/steading ledgers:
// _preUpdate diffs an incoming update into human-readable action strings, which
// _onUpdate appends (stamped with who/when) to a flag on the actor, shown by the
// Ledger header button on the NPC sheet.
//
// An NPC is all `system.*` data (no gameplay flags), so the diff is simpler than
// the character/steading versions — a flat path→label map for the scalar fields,
// plus a few small handlers for the array (impressions), the per-PC relationships
// map, and the rich-text prose fields (which log "updated" rather than dumping HTML).
import { isBlank, valuesEqual, actionForField, coalesceEntries } from "../character/CharacterLedger.js";
import { stripHtmlToText as stripHtml } from "../../utils/strings.js";

const LEDGER_SCOPE = "stonetop-pwd";
const LEDGER_KEY = "ledger";
const LEDGER_MAX_ENTRIES = 300;
const LEDGER_FLAG_PATH = `flags.${LEDGER_SCOPE}.${LEDGER_KEY}`;

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

// One feeling word per heart rating (1-5), matching the sheet's tooltip scale.
// The ledger stores its action text, so we bake the word in as "Neutral (3)"
// rather than a bare number.
const HEART_WORDS = ["Hates", "Dislikes", "Neutral", "Likes", "Loves"];
function heartsLabel(value) {
	const n = Math.max(1, Math.min(5, Math.trunc(Number(value))));
	return `${HEART_WORDS[n - 1]} (${n})`;
}

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
	if (field === "notes")  return { action: actionForField(`Relationship note for ${pcName}`, oldValue, newValue) };
	return null;
}

function actorUpdateEntries(actor, changed) {
	const flat = foundry.utils.flattenObject(changed);
	const entries = [];
	for (const [path, newValue] of Object.entries(flat)) {
		if (!path || path === LEDGER_FLAG_PATH || path.startsWith(`${LEDGER_FLAG_PATH}.`)) continue;

		if (path.startsWith(IMPRESSIONS_PREFIX)) {
			const idx = Number(path.slice(IMPRESSIONS_PREFIX.length).split(".")[0]);
			const oldValue = (actor.system?.impressions ?? [])[idx];
			if (valuesEqual(oldValue, newValue)) continue;
			const entry = impressionEntry(oldValue, newValue);
			if (entry) entries.push(entry);
			continue;
		}

		if (path.startsWith(RELATIONSHIPS_PREFIX)) {
			const oldValue = foundry.utils.getProperty(actor, path);
			if (valuesEqual(oldValue, newValue)) continue;
			const entry = relationshipEntry(path, oldValue, newValue);
			if (entry) entries.push(entry);
			continue;
		}

		if (RICH_TEXT_LABELS[path]) {
			const oldValue = foundry.utils.getProperty(actor, path);
			if (valuesEqual(oldValue, newValue)) continue;
			const entry = richTextEntry(RICH_TEXT_LABELS[path], oldValue, newValue);
			if (entry) entries.push(entry);
			continue;
		}

		const label = SYSTEM_PATH_LABELS[path];
		if (!label) continue;
		const oldValue = foundry.utils.getProperty(actor, path);
		if (valuesEqual(oldValue, newValue)) continue;
		entries.push({ action: actionForField(label, oldValue, newValue) });
	}
	return coalesceEntries(entries);
}

// GM moves are the only embedded documents on an NPC; log their add/remove.
function moveAction(item, verb) {
	return { action: `Move ${verb}: ${item.name}` };
}

export class NpcLedger {
	static getEntries(actor) {
		return actor.getFlag?.(LEDGER_SCOPE, LEDGER_KEY) ?? [];
	}

	static async append(actor, entries, { userId = globalThis.game?.user?.id } = {}) {
		if (actor?.type !== "npc" || !entries?.length) return;
		const current = this.getEntries(actor);
		const user = userId ? globalThis.game?.users?.get?.(userId) : null;
		const stamped = entries.map(entry => ({
			id: globalThis.foundry?.utils?.randomID?.() ?? `${Date.now()}-${Math.random()}`,
			timestamp: Date.now(),
			userId: userId ?? null,
			userName: user?.name ?? globalThis.game?.user?.name ?? "Unknown",
			action: entry.action,
			// Name of the move that caused this change, or null for a plain sheet edit.
			move: entry.move ?? null,
		}));
		await actor.update({
			[LEDGER_FLAG_PATH]: stamped.concat(current.slice(0, LEDGER_MAX_ENTRIES - stamped.length)),
		}, { stonetopLedger: true, render: false });
	}

	static async deleteEntries(actor, ids) {
		if (actor?.type !== "npc" || !ids?.size) return;
		const current = this.getEntries(actor);
		await actor.update({
			[LEDGER_FLAG_PATH]: current.filter(e => !ids.has(e.id)),
		}, { stonetopLedger: true });
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
