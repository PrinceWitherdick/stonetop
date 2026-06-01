import { isBlank, formatValue, valuesEqual, actionForField, coalesceEntries } from "../character/CharacterLedger.js";

const LEDGER_SCOPE = "stonetop";
const LEDGER_KEY = "ledger";
const LEDGER_MAX_ENTRIES = 300;

const SYSTEM_PATH_LABELS = {
	"system.stats.fortunes.value":  "Fortunes",
	"system.stats.defenses.value":  "Defenses",
	"system.attributes.surplus.value": "Surplus",
};

const FLAG_PATH_LABELS = {
	"flags.stonetop.size":  "Size",
	"flags.stonetop.notes": "Notes",
};

const FLAG_NAMESPACE_LABELS = {
	"flags.stonetop.resources":      "Resources",
	"flags.stonetop.fortifications": "Fortifications",
	"flags.stonetop.assets":         "Assets",
	"flags.stonetop.improvements":   "Improvements",
	"flags.stonetop.places":         "Places of interest",
	"flags.stonetop.currencies":     "Currency",
	"flags.stonetop.debilities":     "Debilities",
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

function actorUpdateEntries(actor, changed) {
	const entries = [];
	for (const [path, newValue] of Object.entries(foundry.utils.flattenObject(changed))) {
		if (!path || path === `flags.${LEDGER_SCOPE}.${LEDGER_KEY}` || path.startsWith(`flags.${LEDGER_SCOPE}.${LEDGER_KEY}.`)) continue;
		const label = labelForPath(path);
		if (!label) continue;
		const oldValue = foundry.utils.getProperty(actor, path);
		if (valuesEqual(oldValue, newValue)) continue;
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
