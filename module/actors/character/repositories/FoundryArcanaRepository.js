import { MinorArcanum } from "../../../model/MinorArcanum.js";
import { FoundryPackStore } from "./FoundryPackStore.js";
import { ITEM_FLAG_SCOPE } from "../StonetopFlags.js";

// Shared slug → world-arcanum-Item index. Built lazily and reused across every repository
// instance and every render, so resolving a homebrew slug is O(1) instead of a full
// game.items linear scan per slug per sheet render. Invalidated on any Item CRUD (so a new
// or deleted card is reflected) and rebuilt when the backing collection changes identity
// (covers test global swaps). The index stores live Item references, so edits to an
// existing card's flags are read fresh on each lookup — no stale snapshots.
let _worldArcanaIndex = null;
let _indexedItemsRef  = null;
let _worldIndexHooksBound = false;

function _invalidateWorldArcanaIndex() { _worldArcanaIndex = null; }

function _bindWorldIndexHooks() {
	if (_worldIndexHooksBound) return;
	const Hooks = globalThis.Hooks;
	if (!Hooks?.on) return;
	for (const hook of ["createItem", "updateItem", "deleteItem"]) Hooks.on(hook, _invalidateWorldArcanaIndex);
	_worldIndexHooksBound = true;
}

function _worldArcanumItem(slug) {
	const items = globalThis.game?.items;
	if (!items) return null;
	if (!_worldArcanaIndex || _indexedItemsRef !== items) {
		_bindWorldIndexHooks();
		_indexedItemsRef  = items;
		_worldArcanaIndex = new Map();
		for (const i of items) {
			if (i.type !== "move" || i.system?.moveType !== "arcanum") continue;
			const s = i.flags?.[ITEM_FLAG_SCOPE]?.slug;
			if (s && !_worldArcanaIndex.has(s)) _worldArcanaIndex.set(s, i);
		}
	}
	return _worldArcanaIndex.get(slug) ?? null;
}

export class FoundryArcanaRepository {
	constructor() {
		this._store = new FoundryPackStore("stonetop_pwd.stonetop-arcana", [`flags.${ITEM_FLAG_SCOPE}.slug`]);
		this._cache = new Map();
	}

	async findBySlug(slug) {
		if (this._cache.has(slug)) return this._cache.get(slug);
		// Shipped (compendium) arcana take precedence on slug collision and are
		// immutable at runtime, so they're safe to cache forever.
		const packArc = await this._findInPack(slug);
		if (packArc) {
			this._cache.set(slug, packArc);
			return packArc;
		}
		// Homebrew arcana live as world Items. Resolve them through the shared, hook-
		// invalidated index (O(1)) and rebuild the MinorArcanum from the item's live flags
		// each call, so edits show up immediately without caching a stale snapshot.
		return this._findInWorld(slug);
	}

	async _findInPack(slug) {
		const entry = await this._store.findEntry(e => e.flags?.[ITEM_FLAG_SCOPE]?.slug === slug);
		if (!entry) return null;
		const doc = await this._store.getDocument(entry._id);
		return new MinorArcanum({ ...doc.flags[ITEM_FLAG_SCOPE], img: doc.img });
	}

	_findInWorld(slug) {
		const item = _worldArcanumItem(slug);
		if (!item) return null;
		return new MinorArcanum({ ...item.flags[ITEM_FLAG_SCOPE], img: item.img });
	}

	async findBySlugs(slugs) {
		return (await Promise.all(slugs.map(s => this.findBySlug(s)))).filter(Boolean);
	}
}
