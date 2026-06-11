import { KeepOnTop } from "../../../utils/keep-on-top.js";
import { getHoverDescriptionSetting } from "../../../settings.js";
import { applyGearTermTooltips } from "../../../utils/gear-term-tooltips.js";

export class OutfitMoveDialog extends Application {
	constructor(character, outfitSnapshot, onDone, options = {}) {
		super(options);
		this._keepOnTop = new KeepOnTop(this);
		this._character      = character;
		this._regularItems   = outfitSnapshot.regularSegments.flatMap(seg => seg.items);
		this._smallItems     = [
			...outfitSnapshot.smallItems,
			...(outfitSnapshot.smallGridItems ?? []),
		];
		this._arcanaItems    = outfitSnapshot.arcanaItems ?? [];
		this._smallItemLimit = outfitSnapshot.smallItemLimit ?? null;
		this._checked = {};
		for (const item of [...this._regularItems, ...this._smallItems, ...this._arcanaItems]) {
			this._checked[item.slug] = item.checked;
		}
		// "Undefined" ◇/□ marks the player reserves without assigning to an item.
		// Seeded from the last Outfit so reopening shows the current state.
		this._undefinedRegular = outfitSnapshot.regularPool?.current ?? 0;
		this._undefinedSmall   = outfitSnapshot.smallPool?.current ?? 0;
		this._onDone = onDone;
	}

	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id: "stonetop-outfit-dialog",
			template: "systems/stonetop_pwd/templates/dialogs/outfit-move.hbs",
			title: game.i18n.localize("stonetop.specialMoves.outfit.title"),
			width: 560,
			height: 600,
			resizable: true,
			classes: ["stonetop", "stonetop-outfit-dialog"],
		});
	}

	async _render(force, options) {
		await super._render(force, options);
		this._keepOnTop.apply();
	}

	async close(options = {}) {
		this._keepOnTop.stop();
		return super.close(options);
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

		const smallItemLimit = this._smallItemLimit;
		const pools = this._resolvePools();

		return {
			regularItems,
			smallItems,
			arcanaItems,
			hasArcana:         arcanaItems.length > 0,
			totalMarks:        pools.totalMarks,
			loadLevel:         pools.loadLevel,
			loadLevelNone:     pools.loadLevel === null,
			loadLevelLight:    pools.loadLevel === "light",
			loadLevelNormal:   pools.loadLevel === "normal",
			loadLevelHeavy:    pools.loadLevel === "heavy",
			undefinedRegular:        pools.undefinedRegular,
			canAddUndefinedRegular:  pools.undefinedRegular < pools.undefinedRegularMax,
			canRemUndefinedRegular:  pools.undefinedRegular > 0,
			undefinedSmall:          pools.undefinedSmall,
			canAddUndefinedSmall:    pools.undefinedSmall < pools.undefinedSmallMax,
			canRemUndefinedSmall:    pools.undefinedSmall > 0,
			totalSmallMarks:   pools.totalSmallMarks,
			smallItemLimit,
			hasSmallItemLimit: smallItemLimit !== null,
		};
	}

	// Clamp the undefined ◇/□ pools to what the checked items leave room for, and
	// derive the load level from the total marks. Mutates the stored pools so the
	// steppers stay in range; getData and _applyOutfit share this one computation.
	_resolvePools() {
		const checkedRegularWeight = this._computeTotalWeight();
		const undefinedRegularMax  = Math.max(0, 9 - checkedRegularWeight);
		this._undefinedRegular     = Math.min(this._undefinedRegular, undefinedRegularMax);

		const checkedSmallCount = this._smallItems.filter(i => this._checked[i.slug]).length;
		const undefinedSmallMax = Math.max(0, (this._smallItemLimit ?? 9) - checkedSmallCount);
		this._undefinedSmall    = Math.min(this._undefinedSmall, undefinedSmallMax);

		const totalMarks = checkedRegularWeight + this._undefinedRegular;
		return {
			undefinedRegular:    this._undefinedRegular,
			undefinedRegularMax,
			undefinedSmall:      this._undefinedSmall,
			undefinedSmallMax,
			totalMarks,
			totalSmallMarks:     checkedSmallCount + this._undefinedSmall,
			loadLevel:           this._loadLevelFor(totalMarks),
		};
	}

	activateListeners(html) {
		super.activateListeners(html);
		this._keepOnTop.start();

		// Gear-term hover descriptions (e.g. "near", "forceful", "x piercing") on
		// item notes — the dialog isn't an actor sheet, so onRenderActorSheet's
		// hook never reaches it; apply them here instead.
		if (getHoverDescriptionSetting("hoverDescriptionsGearTags")) {
			html[0].querySelectorAll(".stonetop-outfit-item-note").forEach(el => applyGearTermTooltips(el));
		}

		html.find(".stonetop-outfit-item-check").on("change", ev => {
			this._checked[ev.currentTarget.dataset.slug] = ev.currentTarget.checked;
			this.render(false);
		});

		html.find(".stonetop-outfit-undefined-btn").on("click", ev => {
			const delta = Number(ev.currentTarget.dataset.dir);
			if (ev.currentTarget.dataset.pool === "regular") {
				this._undefinedRegular = Math.max(0, this._undefinedRegular + delta);
			} else {
				this._undefinedSmall = Math.max(0, this._undefinedSmall + delta);
			}
			this.render(false);
		});

		html.find(".stonetop-outfit-confirm-btn").on("click", async () => {
			await this._applyOutfit();
			this.close();
		});
	}

	async _applyOutfit() {
		const { loadLevel, undefinedRegular, undefinedSmall } = this._resolvePools();
		await this._character.applyOutfit(this._checked, loadLevel, undefinedRegular, undefinedSmall);
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
