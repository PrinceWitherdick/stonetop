import { MinorArcanum } from "../../../model/MinorArcanum.js";
import { FoundryPackStore } from "./FoundryPackStore.js";
import { ITEM_FLAG_SCOPE } from "../StonetopFlags.js";

export class FoundryArcanaRepository {
	constructor() {
		this._store = new FoundryPackStore("stonetop_pwd.stonetop-items", [`flags.${ITEM_FLAG_SCOPE}.slug`]);
		this._cache = new Map();
	}

	async findBySlug(slug) {
		if (this._cache.has(slug)) return this._cache.get(slug);
		const entry = await this._store.findEntry(e => e.flags?.[ITEM_FLAG_SCOPE]?.slug === slug);
		if (!entry) return null;
		const doc    = await this._store.getDocument(entry._id);
		const arcanum = new MinorArcanum(doc.flags[ITEM_FLAG_SCOPE]);
		this._cache.set(slug, arcanum);
		return arcanum;
	}

	async findBySlugs(slugs) {
		return (await Promise.all(slugs.map(s => this.findBySlug(s)))).filter(Boolean);
	}
}
