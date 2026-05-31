import { OutfitItemBuilder } from "../../../model/OutfitItem.js";
import { FoundryPackStore } from "./FoundryPackStore.js";

const FIELDS = [
	"system.moveType",
	"flags.stonetop.slug", "flags.stonetop.inventoryColumn", "flags.stonetop.sortOrder",
	"flags.stonetop.weight", "flags.stonetop.note", "flags.stonetop.resource",
	"flags.stonetop.prosperityResource",
	"flags.stonetop.breakBefore", "flags.stonetop.smallGrid", "flags.stonetop.twoCol",
	"flags.stonetop.armor",
];

export class FoundryOutfitItemRepository {
	constructor() {
		this._store = new FoundryPackStore("stonetop.stonetop-items", FIELDS);
		this._cache = null;
	}

	async getAll() {
		if (this._cache) return this._cache;
		const entries = await this._store.filterEntries(e => e.system?.moveType === "inventory");
		this._cache = entries
			.sort((a, b) => (a.flags?.stonetop?.sortOrder ?? 0) - (b.flags?.stonetop?.sortOrder ?? 0))
			.map(item => {
				const st = item.flags?.stonetop ?? {};
				return new OutfitItemBuilder()
					.withSlug(st.slug)
					.withName(item.name)
					.withWeight(st.weight ?? 0)
					.withNote(st.note ?? null)
					.withInventoryColumn(st.inventoryColumn ?? null)
					.withResource(st.resource ?? null)
					.withProsperityResource(st.prosperityResource ?? false)
					.withTwoCol(st.twoCol ?? false)
					.withSmallGrid(st.smallGrid ?? false)
					.withBreakBefore(st.breakBefore ?? false)
					.withArmor(st.armor ?? null)
					.build();
			});
		return this._cache;
	}
}
