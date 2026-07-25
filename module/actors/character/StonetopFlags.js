export const STONETOP_SCOPE = "stonetop_pwd";
export const LEGACY_STONETOP_SCOPE = "stonetop";

// Compendium pack ids, derived from the system scope so the roadmapped stonetop_pwd → stonetop
// rename touches only STONETOP_SCOPE. Import these; do not retype the literal pack path.
export const ITEMS_PACK  = `${STONETOP_SCOPE}.stonetop-items`;
export const ARCANA_PACK = `${STONETOP_SCOPE}.stonetop-arcana`;
// Compendium item documents store their custom flags under the original system ID.
// This intentionally differs from STONETOP_SCOPE (actor flags).
export const ITEM_FLAG_SCOPE = "stonetop";
const _scope = STONETOP_SCOPE;

export class StonetopFlags {
	_namespace;


	constructor(actor, namespace) {
		this._actor = actor;
		this._namespace = namespace;
	}

	getFlag(key) {
		return this._actor.getFlag(_scope, this.buildKey(key))
			?? this._actor.flags?.[LEGACY_STONETOP_SCOPE]?.[this.buildKey(key)];
	}

	async setFlag(key, value, options) {
		// With document options (e.g. { render: false }) route through actor.update so the
		// caller can suppress the automatic sheet re-render; setFlag() takes no options.
		if (options) await this._actor.update(this.updateData(key, value), options);
		else await this._actor.setFlag(_scope, this.buildKey(key), value);
	}

	async unsetFlag(key) {
		await this._actor.unsetFlag(_scope, this.buildKey(key));
	}

	// Write a single nested sub-key of a flag object without rewriting its sibling keys, so two
	// writes to different sub-keys can't clobber each other via a stale `{ ...current }` spread
	// (e.g. rapid clicks on a card's back-power track and its back-item ammo track). `subKey` is
	// a literal object key used as one dot-path segment — a ':' (as in an arcanum's "<slug>:item"
	// resource) is safe; it must not contain '.'. `options` (e.g. { render: false }) routes
	// through actor.update.
	async setSubKey(key, subKey, value, options) {
		const path = `flags.${_scope}.${this.buildKey(key)}.${subKey}`;
		await this._actor.update({ [path]: value }, options);
	}

	// Returns an `actor.update()` fragment that writes this flag, so callers can
	// batch it into a single document update alongside other field changes.
	updateData(key, value) {
		return { [`flags.${_scope}.${this.buildKey(key)}`]: value };
	}

	// Apply several flag writes and/or sub-key deletions in ONE actor.update (a single
	// document write / sheet re-render) instead of many sequential setFlag/unsetFlag calls.
	// `sets` is { key: value } — each REPLACES that flag wholesale (an array/primitive
	// replaces; note a plain-object value still deep-MERGES, so use `deletes` to drop keys).
	// `deletes` is { key: [subKey, …] } — each subKey is removed from that flag object via
	// Foundry's "-=key" syntax (a subKey may contain ':' but not '.').
	async batch({ sets = {}, deletes = {} } = {}, options) {
		const data = {};
		for (const [key, value] of Object.entries(sets)) {
			data[`flags.${_scope}.${this.buildKey(key)}`] = value;
		}
		for (const [key, subKeys] of Object.entries(deletes)) {
			for (const sub of subKeys) data[`flags.${_scope}.${this.buildKey(key)}.-=${sub}`] = null;
		}
		if (Object.keys(data).length) await this._actor.update(data, options);
	}

	buildKey(key) {
		return `${this._namespace}.${key}`;
	}
}

export function resolvedFlags(actor) {
	return actor.flags?.[_scope] ?? actor.flags?.[LEGACY_STONETOP_SCOPE] ?? {};
}

export function resolvedFlagProperty(actor, path) {
	const scoped = actor.flags?.[_scope] ?? actor.flags?.[LEGACY_STONETOP_SCOPE];
	return foundry.utils.getProperty(scoped, path) ?? scoped?.[path];
}
