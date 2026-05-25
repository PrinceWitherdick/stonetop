export class OutfitMoveDialog extends Application {
	constructor(character, outfitSnapshot, onDone, options = {}) {
		super(options);
		this._character    = character;
		this._regularItems = outfitSnapshot.regularSegments.flatMap(seg => seg.items);
		this._smallItems   = [
			...outfitSnapshot.smallItems,
			...(outfitSnapshot.smallGridItems ?? []),
		];
		this._arcanaItems  = outfitSnapshot.arcanaItems ?? [];
		this._checked = {};
		for (const item of [...this._regularItems, ...this._smallItems, ...this._arcanaItems]) {
			this._checked[item.slug] = item.checked;
		}
		this._onDone = onDone;
	}

	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id: "stonetop-outfit-dialog",
			template: "modules/stonetop/templates/dialogs/outfit-move.hbs",
			title: game.i18n.localize("stonetop.specialMoves.outfit.title"),
			width: 560,
			height: "auto",
			resizable: true,
			classes: ["stonetop", "stonetop-outfit-dialog"],
		});
	}

	getData() {
		const regularItems = this._regularItems.map(item => ({
			slug:    item.slug,
			name:    item.name,
			note:    item.note,
			weight:  item.weight,
			checked: this._checked[item.slug] ?? false,
		}));

		const smallItems = this._smallItems.map(item => ({
			slug:    item.slug,
			name:    item.name,
			note:    item.note,
			checked: this._checked[item.slug] ?? false,
		}));

		const arcanaItems = this._arcanaItems.map(item => ({
			slug:    item.slug,
			name:    item.name,
			note:    item.note,
			weight:  item.weight,
			checked: this._checked[item.slug] ?? false,
		}));

		const totalWeight = this._computeTotalWeight();
		const loadLevel = this._loadLevelFor(totalWeight);

		return {
			regularItems,
			smallItems,
			arcanaItems,
			hasArcana:       arcanaItems.length > 0,
			totalWeight,
			loadLevel,
			loadLevelNone:   loadLevel === null,
			loadLevelLight:  loadLevel === "light",
			loadLevelNormal: loadLevel === "normal",
			loadLevelHeavy:  loadLevel === "heavy",
		};
	}

	activateListeners(html) {
		super.activateListeners(html);

		html.find(".stonetop-outfit-item-check").on("change", ev => {
			this._checked[ev.currentTarget.dataset.slug] = ev.currentTarget.checked;
			this.render(false);
		});

		html.find(".stonetop-outfit-confirm-btn").on("click", async () => {
			await this._applyOutfit();
			this.close();
		});
	}

	async _applyOutfit() {
		const loadLevel = this._loadLevelFor(this._computeTotalWeight());
		await this._character.applyOutfit(this._checked, loadLevel);
		if (this._onDone) this._onDone();
	}

	_computeTotalWeight() {
		return [...this._regularItems, ...this._arcanaItems]
			.filter(i => this._checked[i.slug])
			.reduce((sum, i) => sum + (i.weight ?? 0), 0);
	}

	_loadLevelFor(weight) {
		if (weight === 0) return null;
		if (weight <= 3)  return "light";
		if (weight <= 6)  return "normal";
		return "heavy";
	}
}
