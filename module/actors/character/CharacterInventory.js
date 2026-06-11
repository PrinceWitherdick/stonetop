export class CharacterInventory {
	constructor(flags) {
		this._flags = flags;
	}

	get checked()      { return this._flags.getFlag("checked") ?? {}; }
	get resources()    { return this._flags.getFlag("resources") ?? {}; }
	get addedSpecial() { return this._flags.getFlag("addedSpecial") ?? []; }
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

	async setAllChecked(checkedMap) {
		await this._flags.setFlag("checked", { ...this.checked, ...checkedMap });
	}

	async addSpecial(slug) {
		if (this.addedSpecial.includes(slug)) return;
		await this._flags.setFlag("addedSpecial", [...this.addedSpecial, slug]);
	}

	async removeSpecial(slug) {
		await this._flags.setFlag("addedSpecial", this.addedSpecial.filter(s => s !== slug));
		// Clear its carried/checked state so a removed item no longer counts toward load or armor.
		if (slug in this.checked) {
			const next = { ...this.checked };
			delete next[slug];
			await this._flags.setFlag("checked", next);
		}
	}

	async resetSelections() {
		await Promise.all([
			this._flags.unsetFlag("checked"),
			this.setLoadLevel(null),
			this._flags.unsetFlag("regularPool"),
		]);
	}

	calculateArmor(allItems) {
		const equipped  = allItems.filter(item => this.checked[item.slug] && item.armor);
		const bases     = equipped.filter(i => i.armor.base     != null).map(i => i.armor.base);
		const modifiers = equipped.filter(i => i.armor.modifier != null).map(i => i.armor.modifier);
		const base = bases.length > 0 ? Math.max(...bases) : 0;
		return base + modifiers.reduce((s, m) => s + m, 0);
	}
}
