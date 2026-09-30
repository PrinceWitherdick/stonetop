import { ITEM_FLAG_SCOPE } from "../system-id.js";
import { decodeEntities } from "./strings.js";
import { buildUsesResource, circleLabelsToLines } from "./gear-note.js";

/**
 * Shape a custom inventory item's document data, shared by every save target: the
 * actor-embedded item (moveType "inventory-custom", via createCustomInventoryItem)
 * and the reusable world Item the GM drags onto any sheet (moveType "inventory",
 * whose drop re-plants an "inventory-custom" copy). Returns `{ name, type, system }`.
 * Pure (no Foundry calls) so it stays unit-testable.
 *
 * @param {object}  input
 * @param {string}  input.name
 * @param {string} [input.column="regular"]   "regular" | "small"
 * @param {number} [input.weight=1]           ◇ load (regular column only)
 * @param {string} [input.note=""]            freeform tags/notes (already <em>-wrapped)
 * @param {object|null} [input.resource=null] { max, title, labels } uses/ammo track
 * @param {object|null} [input.armor=null]    { base } worn body armor (best one wins, no
 *        stacking) or { modifier } a shield/bonus (adds on top). See calculateArmor.
 * @param {boolean} [input.shield=false]     the item is a shield: on top of its armor it
 *        buys "+1 Readiness on a 7+ to Defend" (p.216). See StonetopCharacter#bearsShield.
 * @param {boolean} [input.resourceFirst=false] print the ○ track before the tags, as the book
 *        prints the bullseye lantern ("○○○○○ Oil, near")
 * @param {string} [input.moveType="inventory"] item's moveType
 * @param {boolean} [input.isTreasure=false]  a Book II journal treasure — groups the
 *        item under the gear tab's "Treasures" heading rather than the write-in columns
 * @param {string|null} [input.img=null]      document art. Omitted when falsy so Foundry
 *        applies its own default rather than being pinned to an empty path.
 * @param {object|null} [input.artifact=null] identification state for an artifact the GM has
 *        hidden — { state, hint, lore, lead }, see actors/character/artifact-identify.js. Each
 *        key is written only when non-empty, so ordinary gear carries none of them and reads
 *        exactly as it did before the feature existed.
 */
export function buildInventoryItemData({ name, column = "regular", weight = 1, note = "", resource = null, armor = null, shield = false, resourceFirst = false, moveType = "inventory", isTreasure = false, img = null, artifact = null }) {
	const isRegular = column !== "small";
	const system = {
		moveType,
		inventoryColumn: isRegular ? "regular" : "small",
	};
	if (isRegular) {
		const w = Number(weight);
		system.weight = Math.max(1, Number.isFinite(w) ? w : 1);
	}
	if (note) system.note = note;
	if (resource) system.resource = resource;
	if (armor) system.armor = armor;
	// A shield also buys "+1 Readiness on a 7+ to Defend" (p.216), so a dropped or
	// hand-written one has to say it is a shield for bearsShield to see it.
	if (shield) system.shield = true;
	if (resourceFirst && resource) system.resourceFirst = true;
	if (isTreasure) system.isTreasure = true;
	if (artifact?.state) system.identifyState = artifact.state;
	if (artifact?.hint)  system.artifactHint  = artifact.hint;
	if (artifact?.lore)  system.artifactLore  = artifact.lore;
	if (artifact?.lead)  system.artifactLead  = artifact.lead;
	const data = { name: String(name ?? "").trim() || "New Item", type: "move", system };
	if (img) data.img = img;
	return data;
}


/**
 * The inverse of buildInventoryItemData: resolve one item document's gear metadata out of
 * WHEREVER it is actually stored.
 *
 * Gear metadata lives in two places by design. Shipped catalog items carry it under
 * `flags.stonetop` (packs/src/stonetop-items/inventory-items/*.json); anything authored in play
 * writes `system.*` through the builder above; a dragged Book II treasure writes both
 * (utils/treasure-drops.js). Flags win, because a catalog item that has been re-planted onto a
 * sheet carries the catalog values in its flags and the sheet copy's in `system`.
 *
 * One reader, for the same reason there is one builder: every consumer that resolved these
 * field-by-field for itself resolved a slightly different set in a slightly different order —
 * the item sheet read `system.armor` alone, so a hauberk that stores its 2 armor in flags showed
 * none at all, and it preferred `system.isTreasure` where the drop path prefers the flag.
 *
 * Returns raw values, NOT defaults: `undefined` means "the document does not say", which is what
 * lets each caller apply its own fallback (a drop lands at weight 1; a readout prints nothing).
 *
 * @param {object} itemData  anything shaped like an Item — `{ system, flags }`
 * @returns {{column: string|undefined, weight: *, note: string, resource: object|null,
 *           armor: object|null, shield: boolean, resourceFirst: boolean, isTreasure: boolean,
 *           artifact: {state: *, hint: string, lore: string, lead: string}}}
 */
export function readInventoryItemData(itemData) {
	const st  = itemData?.flags?.[ITEM_FLAG_SCOPE] ?? {};
	const sys = itemData?.system ?? {};
	return {
		// `column` is the legacy spelling of inventoryColumn; a drop off an old world can carry it.
		column:     st.inventoryColumn ?? sys.inventoryColumn ?? st.column ?? sys.column,
		weight:     st.weight ?? sys.weight,
		note:       st.note ?? sys.note ?? "",
		resource:   st.resource ?? sys.resource ?? null,
		armor:      st.armor ?? sys.armor ?? null,
		shield:     !!(st.shield ?? sys.shield),
		resourceFirst: !!(st.resourceFirst ?? sys.resourceFirst),
		isTreasure: !!(st.isTreasure ?? sys.isTreasure),
		artifact: {
			state: st.identifyState ?? sys.identifyState,
			hint:  st.artifactHint  ?? sys.artifactHint  ?? "",
			lore:  st.artifactLore  ?? sys.artifactLore  ?? "",
			lead:  st.artifactLead  ?? sys.artifactLead  ?? "",
		},
	};
}


// --- The tag line, taken apart and put back together ------------------------------------
//
// Book II prints a thing's Value at the END of its tag line ("fragile, magical, Value 3"),
// and an immobile thing says so at the FRONT ("immobile, dangerous"). A dragged treasure
// stores both exactly that way, inside `note` (treasureItemData), so this does too. Two
// things follow from keeping them there rather than in fields of their own: the identify
// ladder already hides the tags AND the Value together (p.430, "what it's worth" is a 7+
// answer), and every reader of a note (the gear row, the readout, the weapon parser) needs
// nothing new. The authoring dialog shows them as fields; these two functions are the whole
// translation between the fields and the line.

/** One "Value N" clause, optionally qualified: "Value 2 to the right buyer". */
const VALUE_PART = /^Value\s+(\d+)(?:\s+(.+))?$/i;
const IMMOBILE_PART = /^immobile$/i;

/**
 * The plain-text tag line for a thing, before wrapGearNoteTerms dresses it.
 *
 * @param {object}  parts
 * @param {string} [parts.tags=""]        the freeform comma-separated tags
 * @param {boolean}[parts.immobile=false] lead with "immobile" (deduped against the tags)
 * @param {*}      [parts.value]          Value as typed; blank or not a number means none
 * @param {string} [parts.valueTo=""]     who it's worth that to ("to the right buyer")
 * @returns {string}
 */
export function composeInventoryNote({ tags = "", immobile = false, value = null, valueTo = "" } = {}) {
	let list = String(tags ?? "").split(",").map(t => t.trim()).filter(Boolean);
	if (immobile) list = ["immobile", ...list.filter(t => !IMMOBILE_PART.test(t))];
	const n = Number.parseInt(String(value ?? "").trim(), 10);
	if (Number.isFinite(n) && n >= 0) {
		const to = String(valueTo ?? "").replace(/\s+/g, " ").trim();
		list.push(to ? `Value ${n} ${to}` : `Value ${n}`);
	}
	return list.join(", ");
}

/**
 * The inverse: a stored note (authored markup, <em>-wrapped and escaped) back into the
 * dialog's fields. Lossless by construction: anything it does not recognise stays in `tags`.
 *
 * Only a LONE Value clause at the very end is lifted out. The book's harder cases ("Value 0 to
 * most, Value 1 to those-who-know", "or Value 3 to the right person") are prose, not one
 * number and a buyer, so they stay in the tags where the GM can read and edit them as written.
 * `immobile` is read only for a small-column thing, which is where the column choice puts it.
 *
 * @param {string} note
 * @param {{column?: string}} [opts]
 * @returns {{tags: string, immobile: boolean, value: number|null, valueTo: string}}
 */
export function splitInventoryNote(note, { column } = {}) {
	const text = decodeEntities(String(note ?? "").replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
	let list = text ? text.split(",").map(t => t.trim()).filter(Boolean) : [];
	let value = null;
	let valueTo = "";
	const last = list.at(-1);
	const m = last ? VALUE_PART.exec(last) : null;
	if (m && list.filter(t => /^Value\b/i.test(t)).length === 1) {
		value = Number(m[1]);
		valueTo = m[2] ?? "";
		list = list.slice(0, -1);
	}
	const immobile = column === "small" && list.some(t => IMMOBILE_PART.test(t));
	if (immobile) list = list.filter(t => !IMMOBILE_PART.test(t));
	return { tags: list.join(", "), immobile, value, valueTo };
}

/**
 * Everything the authoring dialog prefills from an existing item, in the dialog's own terms
 * (an "immobile" column, a Value, the uses track's label). Reads through readInventoryItemData,
 * so a treasure that keeps its metadata in flags opens as whole as one that keeps it in system.
 *
 * @param {object} itemData  anything shaped like an Item: `{ name, img, system, flags }`
 */
export function inventoryItemFormValues(itemData) {
	const read = readInventoryItemData(itemData);
	const column = read.column === "regular" ? "regular" : "small";
	const note = splitInventoryNote(read.note, { column });
	const res = read.resource;
	const labels = Array.isArray(res?.labels) ? res.labels : [];
	const max = Math.max(0, Math.trunc(Number(res?.max) || 0));
	const isAmmo = !!max && circleLabelsToLines(labels) === circleLabelsToLines(buildUsesResource(max, true).labels);
	const armor = read.armor ?? {};
	const armorBase = Number(armor.base) || 0;
	return {
		name:      itemData?.name ?? "",
		img:       itemData?.img ?? "",
		column:    note.immobile ? "immobile" : column,
		weight:    Math.max(1, Number(read.weight) || 1),
		tags:      note.tags,
		value:     note.value,
		valueTo:   note.valueTo,
		uses:      max,
		isAmmo,
		// The circles' own labels, one line per circle, unless they are exactly the ammunition
		// pair the Ammunition box writes (then the box says it, and the lines stay empty).
		usesLabels: isAmmo ? "" : circleLabelsToLines(labels),
		usesLabel: res?.title ?? "",
		resourceFirst: read.resourceFirst,
		armor:     armorBase || Number(armor.modifier) || 0,
		armorWorn: armorBase > 0,
		shield:    read.shield,
		isTreasure: read.isTreasure,
		artifact: {
			state: read.artifact.state ?? "",
			hint:  read.artifact.hint,
			lore:  read.artifact.lore,
			lead:  read.artifact.lead,
		},
	};
}

/**
 * `flags.stonetop.<this>`: the GM has edited this item's write-up by hand, so the book's text
 * must not be poured back in (SeedItems backfillTreasureWriteups). Carried through a drop by
 * addDroppedInventoryItem, since the back-fill also walks the copies on sheets.
 */
export const WRITEUP_EDITED_FLAG = "writeupEdited";

// The gear keys a treasure mirrors into flags (see treasureItemData). readInventoryItemData
// reads the flag FIRST, so an edit that rewrote only `system` would be shadowed by the stale
// copy and look as if it never saved.
const FLAG_MIRROR_KEYS = ["inventoryColumn", "weight", "note", "resource", "armor", "shield", "resourceFirst", "isTreasure"];

/**
 * The `item.update` payload that makes an existing item match freshly authored `input` (the
 * same shape buildInventoryItemData takes). Unlike a create, an update MERGES, so every field
 * the new input leaves out has to be cleared explicitly or the old value survives: a Value
 * removed, a uses track taken off, armor zeroed.
 *
 * `artifact` is touched only when the input carries one. The plain-gear form has no artifact
 * fields, and editing a write-in's tags must not wipe a write-up the GM added some other way.
 *
 * @param {object} itemData  the item being edited (its `flags` decide what is mirrored)
 * @param {object} input     as for buildInventoryItemData
 */
export function inventoryItemUpdateData(itemData, input) {
	const built = buildInventoryItemData({ ...input, moveType: itemData?.system?.moveType ?? input.moveType });
	const sys = built.system;
	const system = {
		inventoryColumn: sys.inventoryColumn,
		weight:     sys.weight ?? 1,
		note:       sys.note ?? "",
		resource:   sys.resource ?? null,
		armor:      sys.armor ?? null,
		shield:     !!sys.shield,
		resourceFirst: !!sys.resourceFirst,
	};
	// Same rule as `artifact` below: only a form that asks the question answers it.
	if ("isTreasure" in input) system.isTreasure = !!sys.isTreasure;
	if (input.artifact) {
		system.identifyState = sys.identifyState ?? "";
		system.artifactHint  = sys.artifactHint ?? "";
		system.artifactLore  = sys.artifactLore ?? "";
		system.artifactLead  = sys.artifactLead ?? "";
	}
	const update = { name: built.name, system };
	// The write-up is now the GM's, even if they cleared it: backfillTreasureWriteups refills a
	// BLANK write-up by name on every load, and must not put back one taken out on purpose.
	if (input.artifact) update[`flags.${ITEM_FLAG_SCOPE}.${WRITEUP_EDITED_FLAG}`] = true;
	// Blank means "not this form's call". To CLEAR the art, the caller passes Foundry's default
	// icon: the img field is not nullable, and that path is what isDefaultImg reads as "none".
	if (input.img) update.img = input.img;
	const mirrored = itemData?.flags?.[ITEM_FLAG_SCOPE] ?? {};
	for (const key of FLAG_MIRROR_KEYS) {
		if (key in mirrored && key in system) update[`flags.${ITEM_FLAG_SCOPE}.${key}`] = system[key];
	}
	return update;
}
