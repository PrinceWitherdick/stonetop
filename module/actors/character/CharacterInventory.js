import {
	InventoryItemSnapshotBuilder,
	InventorySegmentSnapshot,
	InventorySnapshot,
	LoadOptionSnapshot,
	LoadSnapshotBuilder,
	OtherItemSnapshotBuilder,
	OutfitSnapshotBuilder,
	ResourceBuilder,
} from "../../model/CharacterSnapshot.js";

export class CharacterInventory {
	constructor(flags, inventoryRepo, arcana, possessions, actor) {
		this._flags      = flags;
		this._repo       = inventoryRepo;
		this._arcana     = arcana;
		this._possessions = possessions;
		this._actor      = actor;
	}

	get checked()      { return this._flags.getFlag("checked") ?? {}; }
	get resources()    { return this._flags.getFlag("resources") ?? {}; }
	get loadLevel()    { return this._flags.getFlag("loadLevel") ?? null; }
	get regularPool()  { return this._flags.getFlag("regularPool") ?? 0; }
	get smallPool()    { return this._flags.getFlag("smallPool") ?? 0; }

	async setItemChecked(slug, isChecked) {
		await this._flags.setFlag("checked", { ...this.checked, [slug]: isChecked });
	}

	async setResource(slug, count) {
		await this._flags.setFlag("resources", { ...this.resources, [slug]: count });
	}

	async setLoadLevel(level) {
		await this._flags.setFlag("loadLevel", level);
	}

	async setRegularPool(count) {
		await this._flags.setFlag("regularPool", count);
	}

	async setSmallPool(count) {
		await this._flags.setFlag("smallPool", count);
	}

	async addCustomItem(name, weight) {
		await this._actor.createEmbeddedDocuments("Item", [{
			name,
			type: "equipment",
			system: { equipmentType: "inventory-custom", inventoryColumn: "regular", weight: Math.max(1, weight) },
		}]);
	}

	async addCustomSmallItem(name) {
		await this._actor.createEmbeddedDocuments("Item", [{
			name,
			type: "equipment",
			system: { equipmentType: "inventory-custom", inventoryColumn: "small" },
		}]);
	}

	async removeCustomItem(itemId) {
		await this._actor.deleteEmbeddedDocuments("Item", [itemId]);
	}

	calculateArmor(allItems) {
		const equipped  = allItems.filter(item => this.checked[item.slug] && item.armor);
		const bases     = equipped.filter(i => i.armor.base     != null).map(i => i.armor.base);
		const modifiers = equipped.filter(i => i.armor.modifier != null).map(i => i.armor.modifier);
		const base = bases.length > 0 ? Math.max(...bases) : 0;
		return base + modifiers.reduce((s, m) => s + m, 0);
	}

	async getArmor() {
		const allItems = await this._repo.getAll();
		return this.calculateArmor(allItems);
	}

	async buildSnapshot(playbookData, ownedAllByName, actorLevel, actorItems) {
		const checked   = this.checked;
		const resources = this.resources;
		const rPool     = this.regularPool;
		const sPool     = this.smallPool;
		const loadLevel = this.loadLevel;
		const allItems  = await this._repo.getAll();

		const mapItem = (outfitItem) => {
			const res = outfitItem.resource;
			return new InventoryItemSnapshotBuilder()
				.withSlug(outfitItem.slug)
				.withName(outfitItem.name)
				.withNote(outfitItem.note)
				.withWeight(outfitItem.weight)
				.withChecked(checked[outfitItem.slug] ?? false)
				.withResource(res ? new ResourceBuilder()
					.withCurrent(resources[outfitItem.slug] ?? 0)
					.withMax(res.max)
					.withTitle(res.title ?? null)
					.withLabels(res.labels ?? [])
					.build() : null)
				.withIsCustom(false)
				.withOwnedId(null)
				.withTwoCol(outfitItem.twoCol)
				.withBreakBefore(outfitItem.breakBefore)
				.build();
		};

		const customItems = actorItems.filter(i =>
			i.type === "equipment" && i.system?.equipmentType === "inventory-custom"
		);
		const mapCustomItem = item => new InventoryItemSnapshotBuilder()
			.withSlug(item._id)
			.withName(item.name)
			.withNote(null)
			.withWeight(item.system.weight ?? 1)
			.withChecked(checked[item._id] ?? false)
			.withResource(null)
			.withIsCustom(true)
			.withOwnedId(item._id)
			.withTwoCol(false)
			.withBreakBefore(false)
			.build();

		const arcanaItems = await this._arcana.weightedInventoryItems();
		const allSmall = allItems.filter(i => i.inventoryColumn === "small");
		const flatRegular = [
			...allItems.filter(i => i.inventoryColumn === "regular").map(mapItem),
			...customItems.filter(i => i.system.inventoryColumn === "regular").map(mapCustomItem),
			...arcanaItems.filter(i => i.inventoryColumn === "regular").map(mapItem),
		];

		const possessions = this._possessions.buildSnapshot(
			playbookData?.specialPossessions ?? null, ownedAllByName, actorLevel
		);

		const other = actorItems
			.filter(i => i.type === "move" && i.system?.moveType === "other")
			.map(i => new OtherItemSnapshotBuilder()
				.withId(i._id)
				.withName(i.name)
				.withDescription(i.system?.description ?? null)
				.withMoveType(i.system?.moveType ?? null)
				.withOwnedId(i._id)
				.build()
			);

		const load = new LoadSnapshotBuilder()
			.withInstruction(_loc("stonetop.inventory.outfit.heading"))
			.withSelected(loadLevel ?? null)
			.withLoadLevelLight(loadLevel === "light")
			.withLoadLevelNormal(loadLevel === "normal")
			.withLoadLevelHeavy(loadLevel === "heavy")
			.withOptions([
				new LoadOptionSnapshot("light",  "Light",  _loc("stonetop.inventory.outfit.light")),
				new LoadOptionSnapshot("normal", "Normal", _loc("stonetop.inventory.outfit.normal")),
				new LoadOptionSnapshot("heavy",  "Heavy",  _loc("stonetop.inventory.outfit.heavy")),
			])
			.build();

		const outfit = new OutfitSnapshotBuilder()
			.withLoad(load)
			.withRegularItems(flatRegular)
			.withRegularSegments(_segmentByTwoCol(flatRegular))
			.withRegularPool(new ResourceBuilder().withCurrent(rPool).withMax(9).withTitle(null).withLabels([]).build())
			.withSmallItems([
				...allSmall.filter(i => !i.smallGrid).map(mapItem),
				...customItems.filter(i => i.system.inventoryColumn === "small").map(mapCustomItem),
				...arcanaItems.filter(i => i.inventoryColumn === "small").map(mapItem),
			])
			.withSmallGridItems(allSmall.filter(i => i.smallGrid).map(mapItem))
			.withSmallPool(new ResourceBuilder().withCurrent(sPool).withMax(9).withTitle(null).withLabels([]).build())
			.build();

		return new InventorySnapshot(outfit, possessions, other);
	}
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _loc(key) {
	return typeof game !== "undefined" ? game.i18n.localize(key) : key;
}

function _segmentByTwoCol(items) {
	const segments = [];
	let current = null;
	let currentType = null;
	for (const item of items) {
		const type = item.twoCol ? "grid" : "list";
		if (!current || currentType !== type) {
			current = new InventorySegmentSnapshot(type === "grid", item.breakBefore ?? false, []);
			segments.push(current);
			currentType = type;
		}
		current.items.push(item);
	}
	return segments;
}
