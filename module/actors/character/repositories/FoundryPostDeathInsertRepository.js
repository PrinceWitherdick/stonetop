import { PostDeathInsertData } from "../../../model/PostDeathInsertData.js";
import { FoundryPackStore } from "./FoundryPackStore.js";
import { ITEMS_PACK } from "../StonetopFlags.js";
import { POST_DEATH_INSERT_SLUGS } from "../deaths-door.js";

export class FoundryPostDeathInsertRepository {
	constructor() {
		// `description` rides along so the sheet can say what each fate is without loading three
		// documents on every render; `name` and `img` are in every compendium index for free.
		this._store = new FoundryPackStore(ITEMS_PACK, ["system.slug", "system.description"]);
		this._cache = new Map();
	}

	/**
	 * The book's three inserts, in the book's order, with the sigil and trigger text a player
	 * needs to tell them apart.
	 *
	 * Driven by the slug list rather than by the pack: the inserts share their document shape
	 * with the playbooks (both are `type: "playbook"` carrying a `system.slug`) and live in the
	 * same compendium as every move, item and treasure, so nothing about an index entry says
	 * "this one is a fate". The book does, so it decides. An insert missing from the pack is
	 * dropped rather than offered as a dead button.
	 */
	async getAll() {
		const entries = await this._store.getAll();
		return POST_DEATH_INSERT_SLUGS
			.map(slug => entries.find(e => e.system?.slug === slug))
			.filter(Boolean)
			.map(e => ({
				slug:        e.system.slug,
				name:        e.name ?? "",
				img:         e.img ?? null,
				// The book's own trigger ("When you die but cling stubbornly to your body…"),
				// which is already the plainest statement of what taking this fate means.
				description: e.system.description ?? null,
			}));
	}

	async findBySlug(slug) {
		if (this._cache.has(slug)) return this._cache.get(slug);
		const entry = await this._store.findEntry(e => e.system?.slug === slug);
		if (!entry) return null;
		const doc  = await this._store.getDocument(entry._id);
		const data = new PostDeathInsertData(doc);
		this._cache.set(slug, data);
		return data;
	}
}
