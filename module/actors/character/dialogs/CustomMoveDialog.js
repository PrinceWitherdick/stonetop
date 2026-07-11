import { StonetopDialog } from "../../../utils/stonetop-dialog.js";
import { normalizeRollType, STAT_KEYS } from "../../../utils/roll-types.js";
import { customMoveDescriptionToPlainText } from "../../../utils/custom-move-text.js";
import { buildCustomMoveData } from "../../../utils/custom-move-data.js";
import { createWorldItem } from "../../../utils/world-item.js";

/**
 * A "saver" for a custom move backed by an actor-embedded item (the on-sheet
 * Moves-tab flow). Delegates the document shaping + write to StonetopCharacter.
 * @param {object} character - StonetopCharacter wrapper
 */
export function characterMoveSaver(character) {
	return {
		create: (input) => character.addCustomMove(input),
		update: (item, input) => character.updateCustomMove(item.id ?? item._id, input),
	};
}

/**
 * A "saver" for a reusable custom move backed by a WORLD `move` Item (the
 * sidebar "Create Item → Move" flow). The created item can then be dragged onto
 * any number of character sheets (drop embeds it via onDropMove). Uses the same
 * shared shaping as the embedded path, so both flows author identical moves.
 */
export function worldMoveSaver() {
	return {
		create: (input) => createWorldItem(
			{ ...buildCustomMoveData(input), type: "move" },
			"stonetop.character.moves.custom.worldCreated",
		),
		update: (item, input) => item.update(buildCustomMoveData(input)),
	};
}

/**
 * Authoring dialog for a custom "Other" move. Creates or edits a `move` item
 * (moveType "other", flagged stonetop_pwd.custom) through a caller-supplied
 * `saver`, so the same UI drives both the actor-embedded on-sheet flow and the
 * reusable world-item "Create Item → Move" flow. The document shaping lives in
 * the shared builder; this dialog only gathers raw input.
 *
 * Scope (Tier 0): name + description + optional stat roll with 10+/7-9/6- result
 * text (plus an Advanced section: resource track, no-XP-on-miss, self bonuses).
 * A roll move then rolls through the same engine as a shipped move
 * (StonetopItem.roll → rollStat), with no pack involvement.
 */
export class CustomMoveDialog extends StonetopDialog {
	/**
	 * @param {object}   saver          - { create(input), update(item, input) } write target
	 * @param {object}   [opts]
	 * @param {Item}     [opts.item]    - existing custom move to edit; null = create
	 * @param {Function} [opts.onSaved] - called after a successful save (to refresh the sheet)
	 */
	constructor(saver, { item = null, onSaved = null } = {}, options = {}) {
		super(options);
		this._saver = saver;
		this._item = item;
		this._onSaved = onSaved;
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
		const val = (sel) => StonetopDialog.readValue(root, sel);
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
		if (this._item) await this._saver.update(this._item, input);
		else await this._saver.create(input);
		this._onSaved?.();
		this.close();
	}
}
