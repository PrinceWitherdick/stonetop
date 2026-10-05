// The one reading of a stored wound record (Book I, Harm & Healing: the problematic/permanent
// wounds the sheet tracks beside HP and debilities). Shared by the character model's wound CRUD
// and snapshot, the character ledger's wound diff, and the roll card's wound notices, so a record
// the sheet shows as one thing can't be read as another anywhere else. Pure, and light enough
// for utils/roll-engine.js to import without pulling in the character class.

// Valid wound enum values. Kept here (not as StringField `choices`) so the read path
// can coerce anything unexpected (a wound record written by a newer build, or a
// hand-edited world) back to a safe default instead of wedging the sheet.
export const WOUND_STATUSES = ["problematic", "stabilized", "permanent"];
export const WOUND_ORIGINS  = ["wound", "deaths-door"];

function _mintId() {
	return globalThis.foundry?.utils?.randomID?.() ?? Math.random().toString(36).slice(2, 18);
}

/**
 * Coerce a stored/partial wound record into the canonical shape the schema and sheet expect,
 * filling defaults and normalizing the two enum fields. `keepId` false mints a fresh id (used
 * when adding); true preserves whatever id came in (used when editing), falling back to
 * `fallbackId` for a record with none, so a blank id reads the same on every read rather than
 * as a new random one each time. Anything that isn't an object reads as an empty record.
 */
export function normalizeWound(w = {}, { keepId = true, fallbackId = null } = {}) {
	const src = w && typeof w === "object" ? w : {};
	const stored = typeof src.id === "string" && src.id ? src.id : "";
	return {
		id:              keepId ? (stored || fallbackId || _mintId()) : _mintId(),
		text:            typeof src.text === "string" ? src.text : "",
		status:          WOUND_STATUSES.includes(src.status) ? src.status : "problematic",
		origin:          WOUND_ORIGINS.includes(src.origin) ? src.origin : "wound",
		requirementNote: typeof src.requirementNote === "string" ? src.requirementNote : "",
		planNote:        typeof src.planNote === "string" ? src.planNote : "",
		planRequirements: Array.isArray(src.planRequirements)
			? src.planRequirements
				.map(r => ({ text: typeof r?.text === "string" ? r.text : "", done: !!r?.done }))
				.filter(r => r.text)
			: [],
		mechanicalTag:   typeof src.mechanicalTag === "string" ? src.mechanicalTag : "",
		reminderMove:    typeof src.reminderMove === "string" ? src.reminderMove : "",
		healed:          !!src.healed,
	};
}

/**
 * The whole stored list, normalized. Entries that aren't records (null, a stray string) drop
 * out. A record with no id, or one repeating an id already read, takes `wound-<position>` from
 * its place in the stored array: the same on every read, so the sheet row, the editor, Tend and
 * Remove all find it, and the first write persists it. Not an array at all reads as no wounds.
 */
export function normalizeWoundList(arr) {
	if (!Array.isArray(arr)) return [];
	const seen = new Set();
	const out = [];
	arr.forEach((w, i) => {
		if (!w || typeof w !== "object") return;
		const n = normalizeWound(w, { fallbackId: `wound-${i}` });
		if (seen.has(n.id)) n.id = `wound-${i}`;
		seen.add(n.id);
		out.push(n);
	});
	return out;
}
