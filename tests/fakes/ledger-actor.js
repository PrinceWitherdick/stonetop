// A stand-in actor whose ledger flag answers updates the way Foundry's merge does, for both
// storage shapes: the keyed form (`flags.<scope>.ledger.<id>`, merged per key, deleted with
// `-=<id>` / a ForcedDeletion) and the legacy whole ARRAY (replaced outright), plus the v13
// `==ledger` forced replacement the one-time conversion writes.
//
// `delay` makes `update` resolve on a later tick, which is what a real server round trip does and
// what every race needs: two writers that both read before either wrote.
import { LEDGER_SCOPE, LEDGER_KEY, LEDGER_FLAG_PATH, getLedgerEntries } from "../../module/utils/ledger-core.js";

const isForcedDeletion = (value) => value instanceof globalThis.foundry.data.operators.ForcedDeletion;
const isPlain = (value) => !!value && typeof value === "object" && !Array.isArray(value);

export function applyLedgerUpdate(store, data) {
	for (const [key, value] of Object.entries(data)) {
		if (key === `flags.${LEDGER_SCOPE}.==${LEDGER_KEY}`) {
			store.raw = structuredClone(value);
			continue;
		}
		if (key === LEDGER_FLAG_PATH) {
			if (isForcedDeletion(value)) store.raw = undefined;
			else if (isPlain(value) && isPlain(store.raw)) store.raw = { ...store.raw, ...structuredClone(value) };
			else store.raw = structuredClone(value);
			continue;
		}
		if (!key.startsWith(`${LEDGER_FLAG_PATH}.`)) throw new Error(`unexpected ledger write key ${key}`);
		const id = key.slice(LEDGER_FLAG_PATH.length + 1);
		if (Array.isArray(store.raw)) throw new Error("a keyed write landed on an array ledger");
		store.raw ??= {};
		if (id.startsWith("-=") && value === null) delete store.raw[id.slice(2)];
		else if (isForcedDeletion(value)) delete store.raw[id];
		else store.raw[id] = { ...(store.raw[id] ?? {}), ...structuredClone(value) };
	}
}

/**
 * @param {object} [o]
 * @param {string} [o.id]       the actor id (the write chain falls back to it)
 * @param {string} [o.uuid]     the key the write chain prefers
 * @param {*}      [o.raw]      what the ledger flag holds to begin with
 * @param {object} [o.store]    share one store between two fakes to model two clients
 * @param {boolean} [o.delay]   resolve `update` on a later tick
 */
export function makeLedgerActor({ id, uuid, raw, store = { raw: structuredClone(raw) }, delay = false, type = "character", isOwner } = {}) {
	const actor = {
		id, uuid, type, isOwner,
		updates: [],
		getFlag: (scope, key) => (scope === LEDGER_SCOPE && key === LEDGER_KEY ? store.raw : undefined),
		update: async (data, options) => {
			if (delay) await new Promise(resolve => setTimeout(resolve, 0));
			actor.updates.push({ data, options });
			applyLedgerUpdate(store, data);
		},
		get raw() { return store.raw; },
		get entries() { return getLedgerEntries(actor); },
		store,
	};
	return actor;
}
