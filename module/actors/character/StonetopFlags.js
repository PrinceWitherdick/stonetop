export const STONETOP_SCOPE = "stonetop_pwd";
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
		return this._actor.getFlag(_scope, this.buildKey(key));
	}

	async setFlag(key, value) {
		await this._actor.setFlag(_scope, this.buildKey(key), value);
	}

	async unsetFlag(key) {
		await this._actor.unsetFlag(_scope, this.buildKey(key));
	}

	buildKey(key) {
		return `${this._namespace}.${key}`;
	}
}

export function resolvedFlags(actor) {
	return actor.flags?.[_scope] ?? {};
}

export function resolvedFlagProperty(actor, path) {
	return foundry.utils.getProperty(actor.flags?.[_scope], path);
}
