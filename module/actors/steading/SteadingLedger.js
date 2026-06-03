import { isBlank, formatValue, valuesEqual, actionForField, coalesceEntries } from "../character/CharacterLedger.js";

const LEDGER_SCOPE = "stonetop";
const LEDGER_KEY = "ledger";
const LEDGER_MAX_ENTRIES = 300;

const SYSTEM_PATH_LABELS = {
	"system.stats.fortunes.value":   "Fortunes",
	"system.stats.defenses.value":   "Defenses",
	"system.attributes.population.value": "Population",
	"system.attributes.prosperity.value": "Prosperity",
	"system.attributes.surplus.value":    "Surplus",
	"system.attributes.debilities.options.diminished.value":  "Diminished debility",
	"system.attributes.debilities.options.lacking.value":     "Lacking debility",
	"system.attributes.debilities.options.malcontent.value":  "Malcontent debility",
};

const FLAG_PATH_LABELS = {
	"flags.stonetop.steading.size":  "Size",
	"flags.stonetop.steading.notes": "Notes",
};

const FLAG_NAMESPACE_LABELS = {
	"flags.stonetop.steading.resources":      "Resources",
	"flags.stonetop.steading.fortifications": "Fortifications",
	"flags.stonetop.steading.assets":         "Assets",
	"flags.stonetop.steading.improvements":   "Improvements",
	"flags.stonetop.steading.places":         "Places of interest",
};

const SORTED_NAMESPACE_PREFIXES = Object.keys(FLAG_NAMESPACE_LABELS).sort((a, b) => b.length - a.length);

function isSteadingActor(actor) {
	return actor?.type === "stonetop" || actor?.system?.customType === "stonetop";
}

function labelForPath(path) {
	if (SYSTEM_PATH_LABELS[path]) return SYSTEM_PATH_LABELS[path];
	if (FLAG_PATH_LABELS[path]) return FLAG_PATH_LABELS[path];
	const namespace = SORTED_NAMESPACE_PREFIXES.find(p => path === p || path.startsWith(`${p}.`));
	if (namespace) return FLAG_NAMESPACE_LABELS[namespace];
	return null;
}

function itemName(item) {
	return String(item?.name ?? "").trim();
}

function listEntries(label, oldValue, newValue) {
	if (!Array.isArray(oldValue) || !Array.isArray(newValue)) return null;
	const entries = [];
	const max = Math.max(oldValue.length, newValue.length);

	for (let i = 0; i < max; i++) {
		const oldItem = oldValue[i] ?? {};
		const newItem = newValue[i] ?? {};
		const oldName = itemName(oldItem);
		const newName = itemName(newItem);

		if (oldName !== newName) {
			if (!oldName && newName) entries.push({ action: `${label} added: ${newName}` });
			else if (oldName && !newName) entries.push({ action: `${label} removed: ${oldName}` });
			else entries.push({ action: `${label} renamed from ${oldName} to ${newName}` });
		}

		if (oldName || newName) {
			const name = newName || oldName;
			const oldChecked = !!oldItem.checked;
			const newChecked = !!newItem.checked;
			if (oldChecked !== newChecked) {
				entries.push({ action: `${name} ${newChecked ? "selected" : "deselected"}` });
			}
		}
	}

	return entries;
}

function placeEntries(oldValue, newValue) {
	if (!Array.isArray(oldValue) || !Array.isArray(newValue)) return null;
	const entries = [];
	const max = Math.max(oldValue.length, newValue.length);

	for (let i = 0; i < max; i++) {
		const oldPlace = oldValue[i] ?? {};
		const newPlace = newValue[i] ?? {};
		const letter = newPlace.letter ?? oldPlace.letter ?? "?";
		const oldName = itemName(oldPlace);
		const newName = itemName(newPlace);
		if (oldName === newName) continue;
		if (!oldName && newName) entries.push({ action: `Place ${letter} set to ${newName}` });
		else if (oldName && !newName) entries.push({ action: `Place ${letter} cleared (${oldName})` });
		else entries.push({ action: `Place ${letter} changed from ${oldName} to ${newName}` });
	}

	return entries;
}

const _currencyEntry = (label, o, n) =>
	valuesEqual(o, n) ? [] : [{ action: actionForField(label, o, n) }];

const PATH_HANDLERS = {
	"flags.stonetop.steading.resources":            (o, n) => listEntries("Resource",      o, n),
	"flags.stonetop.steading.fortifications":       (o, n) => listEntries("Fortification", o, n),
	"flags.stonetop.steading.assets":               (o, n) => listEntries("Asset",         o, n),
	"flags.stonetop.steading.places":               placeEntries,
	"flags.stonetop.steading.silver.purses":        (o, n) => _currencyEntry("Silver purses",    o, n),
	"flags.stonetop.steading.silver.handfuls":      (o, n) => _currencyEntry("Silver handfuls",  o, n),
	"flags.stonetop.steading.silver.coins":         (o, n) => _currencyEntry("Silver coins",     o, n),
	"flags.stonetop.steading.gold.purses":          (o, n) => _currencyEntry("Gold purses",      o, n),
	"flags.stonetop.steading.gold.handfuls":        (o, n) => _currencyEntry("Gold handfuls",    o, n),
	"flags.stonetop.steading.gold.coins":           (o, n) => _currencyEntry("Gold coins",       o, n),
};

function actorUpdateEntries(actor, changed) {
	const entries = [];
	for (const [path, newValue] of Object.entries(foundry.utils.flattenObject(changed))) {
		if (!path || path === `flags.${LEDGER_SCOPE}.${LEDGER_KEY}` || path.startsWith(`flags.${LEDGER_SCOPE}.${LEDGER_KEY}.`)) continue;

		const handler = PATH_HANDLERS[path];
		if (handler) {
			const oldValue = foundry.utils.getProperty(actor, path);
			entries.push(...(handler(oldValue, newValue) ?? []));
			continue;
		}

		// Skip sub-paths of namespace prefixes — handlers above cover the
		// top-level path; sub-paths (e.g. resources.0.name) would produce noise.
		const isSubPath = SORTED_NAMESPACE_PREFIXES.some(p => path !== p && path.startsWith(`${p}.`));
		if (isSubPath) continue;

		const oldValue = foundry.utils.getProperty(actor, path);
		if (valuesEqual(oldValue, newValue)) continue;
		const label = labelForPath(path);
		if (!label) continue;
		entries.push({ action: actionForField(label, oldValue, newValue) });
	}
	return coalesceEntries(entries);
}

export class SteadingLedger {
	static getEntries(actor) {
		return actor.getFlag?.(LEDGER_SCOPE, LEDGER_KEY) ?? [];
	}

	static async append(actor, entries, { userId = globalThis.game?.user?.id } = {}) {
		if (!isSteadingActor(actor) || !entries?.length) return;
		const current = this.getEntries(actor);
		const user = userId ? globalThis.game?.users?.get?.(userId) : null;
		const stamped = entries.map(entry => ({
			id: globalThis.foundry?.utils?.randomID?.() ?? `${Date.now()}-${Math.random()}`,
			timestamp: Date.now(),
			userId: userId ?? null,
			userName: user?.name ?? globalThis.game?.user?.name ?? "Unknown",
			action: entry.action,
		}));
		await actor.update({
			[`flags.${LEDGER_SCOPE}.${LEDGER_KEY}`]: stamped.concat(current.slice(0, LEDGER_MAX_ENTRIES - stamped.length)),
		}, { stonetopLedger: true, render: false });
	}

	static async deleteEntries(actor, ids) {
		if (!isSteadingActor(actor) || !ids?.size) return;
		const current = this.getEntries(actor);
		await actor.update({
			[`flags.${LEDGER_SCOPE}.${LEDGER_KEY}`]: current.filter(e => !ids.has(e.id)),
		}, { stonetopLedger: true });
	}

	static entriesForActorUpdate(actor, changed) {
		return actorUpdateEntries(actor, changed);
	}
}
