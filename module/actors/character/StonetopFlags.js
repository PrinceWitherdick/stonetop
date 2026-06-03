const _scope = "stonetop_pwd";
const _legacyScope = "stonetop";

export class StonetopFlags {
	_namespace;


	constructor(actor, namespace) {
		this._actor = actor;
		this._namespace = namespace;
	}

	getFlag(key) {
		const fullKey = this.buildKey(key);
		const current = this._actor.getFlag(_scope, fullKey);
		if (current !== undefined && current !== null) return current;
		const legacyFlags = this._actor.flags?.[_legacyScope] ?? {};
		return legacyFlags[fullKey] ?? foundry.utils.getProperty(legacyFlags, fullKey);
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
