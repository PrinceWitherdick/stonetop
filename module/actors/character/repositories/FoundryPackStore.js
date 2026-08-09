import { ensurePackIndex } from "../../../utils/pack-index.js";

export class FoundryPackStore {
	constructor(packName, fields) {
		this._packName = packName;
		this._fields   = fields;
	}

	// No local "already indexed" flag: several stores share one pack with different field lists,
	// and each store's own flag let the LAST list narrow what the pack thinks it holds — see
	// utils/pack-index.js, which keeps the union and makes a covered call a no-op.
	async _ensureIndexed() {
		return ensurePackIndex(this._packName, this._fields);
	}

	async findEntry(predicate) {
		const pack = await this._ensureIndexed();
		if (!pack) return null;
		return pack.index.find(predicate) ?? null;
	}

	async filterEntries(predicate) {
		const pack = await this._ensureIndexed();
		if (!pack) return [];
		return [...pack.index].filter(predicate);
	}

	async getAll() {
		const pack = await this._ensureIndexed();
		if (!pack) return [];
		return [...pack.index];
	}

	async getDocument(id) {
		const pack = game.packs.get(this._packName);
		if (!pack) return null;
		return pack.getDocument(id);
	}
}
