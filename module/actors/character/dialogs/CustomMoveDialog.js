import { FrontOnOpen } from "../../../utils/front-on-open.js";
import { normalizeRollType, STAT_KEYS } from "../../../utils/roll-types.js";
import { customMoveDescriptionToPlainText } from "../../../utils/custom-move-text.js";

/**
 * Player-facing authoring dialog for a custom "Other" move on the character's
 * Moves tab. Creates or edits an actor-embedded `move` item (moveType "other",
 * flagged stonetop_pwd.custom). The shaping of the document — forced moveType,
 * the flag, and the moveResults sub-object — lives in StonetopCharacter so this
 * dialog only gathers raw input.
 *
 * v1 scope (Tier 0): name + description + optional stat roll with 10+/7-9/6-
 * result text. A roll move then rolls through the same engine as a shipped move
 * (StonetopItem.roll → rollStat), with no pack involvement.
 */
export class CustomMoveDialog extends Application {
	/**
	 * @param {object}   stonetopCharacter - StonetopCharacter wrapper (for the item write)
	 * @param {object}   [opts]
	 * @param {Item}     [opts.item]       - existing custom move to edit; null = create
	 * @param {Function} [opts.onSaved]    - called after a successful save (to refresh the sheet)
	 */
	constructor(stonetopCharacter, { item = null, onSaved = null } = {}, options = {}) {
		super(options);
		this._character = stonetopCharacter;
		this._item = item;
		this._onSaved = onSaved;
		this._frontOnOpen = new FrontOnOpen(this);
	}

	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			// No fixed id: edit and create dialogs (or two edits) may be open at once,
			// and a shared DOM id would collide. The class below is the styling hook.
			template: "systems/stonetop_pwd/templates/dialogs/custom-move.hbs",
			width: 520,
			height: "auto",
			resizable: true,
			classes: ["stonetop", "stonetop-custom-move-dialog"],
		});
	}

	get title() {
		return game.i18n.localize(this._item
			? "stonetop.character.moves.custom.editTitle"
			: "stonetop.character.moves.custom.createTitle");
	}

	async _render(force, options) {
		await super._render(force, options);
		this._frontOnOpen.apply();
	}

	async close(options = {}) {
		this._frontOnOpen.stop();
		return super.close(options);
	}

	getData() {
		const sys = this._item?.system ?? {};
		const rollType = normalizeRollType(sys.rollType) ?? "";
		const mr = sys.moveResults ?? {};
		const rollOptions = [
			{ value: "", label: game.i18n.localize("stonetop.character.moves.custom.rollNone"), selected: rollType === "" },
			...STAT_KEYS.map(k => ({ value: k, label: Handlebars.helpers.statLabel(k), selected: rollType === k })),
			{ value: "ask", label: game.i18n.localize("stonetop.character.moves.custom.rollAsk"), selected: rollType === "ask" },
		];
		const res = sys.resource ?? {};
		return {
			isEdit: !!this._item,
			name: this._item?.name ?? "",
			description: customMoveDescriptionToPlainText(sys.description),
			rollOptions,
			hasRoll: rollType !== "",
			results: {
				success: mr.success?.value ?? "",
				partial: mr.partial?.value ?? "",
				failure: mr.failure?.value ?? "",
			},
			noXpOnMiss: !!sys.noXpOnMiss,
			resource: {
				title: res.title ?? "",
				max: res.max ?? "",
				labels: Array.isArray(res.labels) ? res.labels.join(", ") : "",
			},
			bonuses: {
				hp: sys.hpBonus || "",
				armor: sys.armorBonus || "",
				load: sys.loadBonus || "",
			},
		};
	}

	activateListeners(html) {
		super.activateListeners(html);
		this._frontOnOpen.start();
		const root = html[0];

		// Show the 10+/7-9/6- result fields only when the move actually rolls.
		const results = root.querySelector(".stonetop-custom-move-results");
		const rollSelect = root.querySelector("[name=rollType]");
		const syncResults = () => results?.classList.toggle("is-hidden", !rollSelect?.value);
		rollSelect?.addEventListener("change", syncResults);
		syncResults();

		root.querySelector(".stonetop-custom-move-save")?.addEventListener("click", () => this._save(root));
		root.querySelector(".stonetop-custom-move-cancel")?.addEventListener("click", () => this.close());
	}

	async _save(root) {
		const val = (sel) => root.querySelector(sel)?.value ?? "";
		const name = val("[name=name]").trim();
		if (!name) {
			ui.notifications.warn(game.i18n.localize("stonetop.character.moves.custom.nameRequired"));
			root.querySelector("[name=name]")?.focus();
			return;
		}
		const input = {
			name,
			description: val("[name=description]"),
			rollType: val("[name=rollType]"),
			results: {
				success: val("[name=success]"),
				partial: val("[name=partial]"),
				failure: val("[name=failure]"),
			},
			noXpOnMiss: !!root.querySelector("[name=noXpOnMiss]")?.checked,
			resource: {
				title: val("[name=resourceTitle]"),
				max: val("[name=resourceMax]"),
				labels: val("[name=resourceLabels]"),
			},
			hpBonus: val("[name=hpBonus]"),
			armorBonus: val("[name=armorBonus]"),
			loadBonus: val("[name=loadBonus]"),
		};
		if (this._item) await this._character.updateCustomMove(this._item._id, input);
		else await this._character.addCustomMove(input);
		this._onSaved?.();
		this.close();
	}
}
