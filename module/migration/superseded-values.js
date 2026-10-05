// What "the value the pack shipped" means, for a held copy that may be out of date.
//
// A move, a treasure or a piece of gear is copied onto a character (or into the Items sidebar) when
// it is taken, and the copy never hears about a later release. migration/move-refresh.js brings it
// up to date, but a copy is also where a GM's hand edit lives, and the two have to be told apart.
// The rule: a held value is CORRECTED only when it is one the pack itself shipped at some earlier
// commit (scripts/gen-superseded-fields.js lists every one, as hashes), and differs from what the
// pack ships now. A GM's edit matches no shipped version, so it is left exactly as it is.
//
// This module is the comparison both sides share: the generator hashes the pack's history with it,
// and the sweep hashes the held copy with it. Change how a value is normalized or hashed and every
// generated hash goes stale, so bump SUPERSEDED_FORMAT here and regenerate. PURE: no Foundry.

import { hashString, stableStringify } from "../hooks/journal-sync-core.js";
import { PRIOR_SYSTEM_IDS } from "./compat.js";
import { SYSTEM_ID, ITEM_FLAG_SCOPE } from "../system-id.js";
import { escapeRegExp } from "../utils/strings.js";

/** Bumped whenever canonicalValue or valueHash changes, so stale generated data is refused. */
export const SUPERSEDED_FORMAT = 1;

const has = {
	positive: value => Number(value) > 0,
	isTrue:   value => value === true,
	text:     value => typeof value === "string" && value.trim() !== "",
	object:   value => !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0,
	list:     value => Array.isArray(value) && value.length > 0,
};

/**
 * The fields refreshed on a held MOVE. Each says what counts as "there is one" (`has`, for the fill
 * rule), what to write when the pack has dropped the field (`empty`), whether it is compared key by
 * key (`keys`: a GM who retitled a track keeps the title while its size is corrected), and whether
 * it is only ever filled, never corrected (`fillOnly`).
 *
 * Never here: name, moveType (a move learned from another playbook is stored as "other"), playbook
 * (the key back to the pack), slug, and repeatMax (read off the pack, never the copy).
 */
export const MOVE_FIELDS = {
	description:  { has: has.text, empty: "" },
	rollType:     { has: has.text, empty: "" },
	moveResults:  { has: has.object, empty: null, keys: true },
	resource:     { has: value => Number(value?.max) > 0, empty: null, keys: true },
	requirement:  { has: has.object, empty: null },
	noXpOnMiss:   { has: has.isTrue, empty: false },
	// Pack Horse's +1 to every load cap: a copy from before it shipped still read 3/6/9.
	loadBonus:    { has: has.positive, empty: 0 },
	// Armored's shield at ◆ instead of ◆◆: a copy from before it shipped still paid ◆◆.
	shieldLoadReduction: { has: has.positive, empty: 0 },
	// Carved Out of Wood / Cut from Granite: a Heavy's own copy is counted from the pack, but one
	// taken through a cross-playbook move is counted off the copy, and an old one granted nothing.
	hpBonus:      { has: has.positive, empty: 0 },
	armorBonus:   { has: has.positive, empty: 0 },
	// The Outfit readout's "your load switched this off" (Catlike, Free Running, Stalker, Uncanny Reflexes).
	maxLoad:      { has: has.text, empty: "" },
	requiresUnarmored: { has: has.isTrue, empty: false },
	// Improved / Superior Stat's ceiling: an old copy had none, so its +1 was never re-applied on an
	// onboarding re-run and never cautioned against past the cap.
	cap:          { has: value => value != null, empty: null },
	// Initiate of the Secret Arts' sacred pouch (`grantsPossession`): an old copy granted no pouch.
	crossPlaybook: { has: value => !!value?.playbooks, empty: null },
	// A Mighty Rampart retiring Bulwark: an old copy left Bulwark on offer.
	replaces:     { has: has.text, empty: "" },
	// The Fox's Ambush, Danger Sense, Perceptive and Skill at Arms: an old copy read as a level-up
	// pick, which leaving a background that also grants it took away.
	isStartingMove: { has: has.isTrue, empty: false },
	// Mark lists and their budgets: an own copy is read from the pack, a cross-playbook one off the copy.
	markOptions:  { has: has.list, empty: [] },
	markBudget:   { has: value => value?.base != null, empty: null },
	asterisk:     { has: has.object, empty: null },
	// The post-death lore option a Consequence's or Mark's move belongs to (post-death-moves.js
	// planLoreMoveSync finds its copies by it). Only filled: it is the copy's identity, not its text.
	loreOption:   { has: has.text, empty: "", fillOnly: true },
};

/**
 * The fields refreshed on held GEAR: a treasure, or a catalog item taken straight off the pack.
 * `mirror` marks the keys a treasure also carries in `flags.stonetop` (treasureItemData), which
 * readInventoryItemData reads FIRST, so the flag is the value that counts and both are written.
 */
export const GEAR_FIELDS = {
	description:  { has: has.text, empty: "" },
	note:         { has: has.text, empty: "", mirror: true },
	armor:        { has: value => Number(value?.base) > 0 || Number(value?.modifier) > 0, empty: null, keys: true, mirror: true },
	shield:       { has: has.isTrue, empty: false, mirror: true },
	// Required by MoveModel: a weight the pack dropped is the model's own default, never null.
	weight:       { has: value => value != null, empty: 1, mirror: true },
	inventoryColumn: { has: has.text, empty: "", mirror: true },
	resource:     { has: value => Number(value?.max) > 0, empty: null, keys: true, mirror: true },
	resourceFirst: { has: has.isTrue, empty: false, mirror: true },
	artifactLore: { has: has.text, empty: "" },
};

/**
 * The value at a dotted path ("system.attributes.hp.max"). Foundry-free, so the generator and the
 * sweeps resolve a path the same way. PURE.
 */
export const valueAt = (doc, path) => path.split(".").reduce((v, k) => v?.[k], doc);

/**
 * The parts of a compendium source, `Compendium.<package>.<pack>.<Type>.<id>`: `{ pack, type, id }`,
 * or null for anything else. The package is not returned: a source stamped under an id this system
 * used to have is still this system's. PURE.
 */
export function compendiumSourceParts(source) {
	if (typeof source !== "string" || !source.startsWith("Compendium.")) return null;
	const [, , pack, type, id] = source.split(".");
	return { pack, type, id: id ?? null };
}

/**
 * A sweep's generated data (module/migration/data/*), or `{}` when it was generated under another
 * format: hashed by an older comparison, nothing in it can be trusted to match, so nothing is
 * corrected.
 *
 * @param {() => Promise<object>} importer  the dynamic import of the data module
 * @param {{formatKey: string, expected: number, exportName: string, stale: string}} opts
 *   `stale` is what the console is told when the data is refused
 */
export async function loadGenerated(importer, { formatKey, expected, exportName, stale }) {
	const data = await importer();
	if (data[formatKey] !== expected) {
		console.warn(`Stonetop | ${stale}`);
		return {};
	}
	return data[exportName];
}

/** Whether an item is a piece of gear (any inventory kind) rather than a move. PURE. */
export function isGear(item) {
	return String(item?.system?.moveType ?? "").startsWith("inventory");
}

/** The field spec an item is refreshed by. PURE. */
export function fieldsFor(item) {
	return isGear(item) ? GEAR_FIELDS : MOVE_FIELDS;
}

/**
 * The value a field has on an item, read as the sheet reads it: a gear field the flags mirror is
 * the flag's value where there is one (readInventoryItemData's order). PURE.
 */
export function fieldValue(item, field, spec = fieldsFor(item)) {
	const flags = item?.flags?.[ITEM_FLAG_SCOPE];
	if (spec[field]?.mirror && flags && field in flags && flags[field] !== undefined) return flags[field];
	return item?.system?.[field];
}

// A stored link or asset path written under an id this system used to have.
const OLD_ID_PATTERN = PRIOR_SYSTEM_IDS.length
	? new RegExp(`(Compendium\\.|systems/)(${PRIOR_SYSTEM_IDS.map(escapeRegExp).join("|")})([./])`, "g")
	: null;

/**
 * Text as it compares: what Foundry's own round trip and the system's renames could have changed
 * on a copy that nobody edited. Trimmed, non-breaking spaces and runs of whitespace made single
 * spaces, a self-closing tag's slash dropped, and a link under an old system id read as the
 * current one. PURE.
 */
export function canonicalText(text) {
	let out = String(text).replace(/\u00a0/g, " ").replace(/\s+/g, " ").replace(/\s*\/>/g, ">").trim();
	if (OLD_ID_PATTERN) out = out.replace(OLD_ID_PATTERN, `$1${SYSTEM_ID}$3`);
	return out;
}

/**
 * A value as it compares, or undefined for "there is none": blank text, an empty list or object,
 * and null all read as absent, inside objects too (a GM's armor edit writes `{base: 2, modifier:
 * null}`, which is the same armor as `{base: 2}`). At the top of a field, `false` and `0` are
 * absent as well, because that is what the data model writes for a field the pack leaves out. PURE.
 */
export function canonicalValue(value, { top = true } = {}) {
	if (value == null) return undefined;
	if (typeof value === "string") {
		const text = canonicalText(value);
		return text === "" ? undefined : text;
	}
	if (Array.isArray(value)) {
		const list = value.map(v => canonicalValue(v, { top: false }) ?? null);
		return list.length ? list : undefined;
	}
	if (typeof value === "object") {
		const out = {};
		for (const [k, v] of Object.entries(value)) {
			const c = canonicalValue(v, { top: false });
			if (c !== undefined) out[k] = c;
		}
		return Object.keys(out).length ? out : undefined;
	}
	if (top && (value === false || value === 0)) return undefined;
	return value;
}

/** The hash a value is listed under. Absent values all share one hash. PURE. */
export function valueHash(value, { top = true } = {}) {
	return hashString(stableStringify(canonicalValue(value, { top }) ?? null));
}

/** Whether two values compare as the same. PURE. */
export function sameValue(a, b, { top = true } = {}) {
	return valueHash(a, { top }) === valueHash(b, { top });
}

/**
 * Every path a field is listed under: the field itself and, for a keyed field, each of its keys
 * ("resource.max"), with the value at that path. PURE.
 *
 * @returns {Array<[string, *, {top: boolean}]>}
 */
export function fieldPaths(field, value, spec) {
	const out = [[field, value, { top: true }]];
	if (spec?.keys && value && typeof value === "object" && !Array.isArray(value)) {
		for (const [k, v] of Object.entries(value)) out.push([`${field}.${k}`, v, { top: false }]);
	}
	return out;
}

/**
 * A fingerprint of everything refreshable on a pack entry, as the generator saw it. The sweep
 * compares it with the pack it reads, so data generated from an older pack is noticed. PURE.
 */
export function entryFingerprint(entry) {
	const spec = fieldsFor(entry);
	const fields = {};
	for (const field of Object.keys(spec)) {
		const c = canonicalValue(fieldValue(entry, field, spec));
		if (c !== undefined) fields[field] = c;
	}
	return hashString(stableStringify(fields));
}
