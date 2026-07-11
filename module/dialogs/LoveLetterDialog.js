import { StonetopDialog } from "../utils/stonetop-dialog.js";
import { normalizeRollType } from "../utils/roll-types.js";
import { customMoveDescriptionToPlainText } from "../utils/custom-move-text.js";
import {
	createLoveLetter, updateLoveLetter,
	loveLetterRecipientOptions, loveLetterRollOptions,
} from "../actors/character/love-letters.js";

/**
 * GM authoring dialog for a love letter (Book I, p.568) — a single-use move addressed to
 * one PC. Launched from the "Write a Love Letter" hotbar macro (create mode: pick the
 * recipient) or from the pencil on a letter's card (edit mode: recipient is fixed). On
 * save it writes an embedded `move` item onto the recipient character; the shaping of that
 * document lives in love-letters.js so this dialog only gathers raw input.
 */
export class LoveLetterDialog extends StonetopDialog {
	/**
	 * @param {object}   [opts]
	 * @param {Item}     [opts.item]    - existing love letter to edit; null = create
	 * @param {Actor}    [opts.actor]   - the recipient (edit mode); ignored in create mode
	 * @param {Function} [opts.onSaved] - called after a successful save
	 */
	constructor({ item = null, actor = null, onSaved = null } = {}, options = {}) {
		super(options);
		this._item = item;
		this._actor = actor ?? item?.parent ?? null;
		this._onSaved = onSaved;
	}

	// Convenience entry point for the hotbar macro / console: game.stonetop.openLoveLetter().
	static open() {
		if (!game.user?.isGM) {
			return void ui.notifications.warn(game.i18n.localize("stonetop.character.moves.loveLetter.gmOnly"));
		}
		if (!game.actors.some(a => a.type === "character")) {
			return void ui.notifications.warn(game.i18n.localize("stonetop.character.moves.loveLetter.noRecipients"));
		}
		return new LoveLetterDialog().render(true);
	}

	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			template: "systems/stonetop_pwd/templates/dialogs/love-letter.hbs",
			width: 520,
			height: "auto",
			resizable: true,
			classes: ["stonetop", "stonetop-love-letter-dialog"],
		});
	}

	get title() {
		return game.i18n.localize(this._item
			? "stonetop.character.moves.loveLetter.editTitle"
			: "stonetop.character.moves.loveLetter.createTitle");
	}

	getData() {
		const sys = this._item?.system ?? {};
		const rollType = normalizeRollType(sys.rollType) ?? "";
		const mr = sys.moveResults ?? {};
		return {
			isEdit: !!this._item,
			recipients: this._item ? [] : loveLetterRecipientOptions(),
			recipientName: this._actor?.name ?? "",
			name: this._item?.name ?? "",
			description: customMoveDescriptionToPlainText(sys.description),
			rollOptions: loveLetterRollOptions(rollType),
			hasRoll: rollType !== "",
			results: {
				success: mr.success?.value ?? "",
				partial: mr.partial?.value ?? "",
				failure: mr.failure?.value ?? "",
				pickSuccess: mr.success?.pick || "",
				pickPartial: mr.partial?.pick || "",
				pickFailure: mr.failure?.pick || "",
			},
			// The shared "choose from this list" pool, one option per line for the textarea.
			options: (sys.pickOptions ?? []).join("\n"),
			// A miss marks XP by default (checkbox checked); an existing letter reflects
			// whatever the GM last saved.
			markXp: this._item ? !sys.noXpOnMiss : true,
			signed: sys.signed ?? "",
		};
	}

	activateListeners(html) {
		super.activateListeners(html);
		const root = html[0];

		// Reveal the 10+/7-9/6- result fields only when the letter actually rolls.
		const results = root.querySelector(".stonetop-love-letter-results");
		const rollSelect = root.querySelector("[name=rollType]");
		const syncResults = () => results?.classList.toggle("is-hidden", !rollSelect?.value);
		rollSelect?.addEventListener("change", syncResults);
		syncResults();

		root.querySelector(".stonetop-love-letter-save")?.addEventListener("click", () => this._save(root));
		root.querySelector(".stonetop-love-letter-cancel")?.addEventListener("click", () => this.close());
	}

	async _save(root) {
		const val = (sel) => StonetopDialog.readValue(root, sel);

		// Create mode needs a recipient; edit mode keeps the letter on its current actor.
		let actor = this._actor;
		if (!this._item) {
			const recipientId = val("[name=recipient]");
			actor = recipientId ? game.actors.get(recipientId) : null;
			if (!actor) {
				ui.notifications.warn(game.i18n.localize("stonetop.character.moves.loveLetter.recipientRequired"));
				root.querySelector("[name=recipient]")?.focus();
				return;
			}
		}

		const name = val("[name=name]").trim();
		if (!name) {
			ui.notifications.warn(game.i18n.localize("stonetop.character.moves.loveLetter.nameRequired"));
			root.querySelector("[name=name]")?.focus();
			return;
		}

		const input = {
			name,
			description: val("[name=description]"),
			rollType: val("[name=rollType]"),
			signed: val("[name=signed]"),
			// "Mark XP on a miss" checked ⇒ mark XP (noXpOnMiss false), and vice versa.
			noXpOnMiss: !root.querySelector("[name=markXp]")?.checked,
			// Shared pick-from pool (one option per line) + how many to pick per tier.
			options: val("[name=options]"),
			picks: {
				success: val("[name=pickSuccess]"),
				partial: val("[name=pickPartial]"),
				failure: val("[name=pickFailure]"),
			},
			results: {
				success: val("[name=success]"),
				partial: val("[name=partial]"),
				failure: val("[name=failure]"),
			},
		};

		if (this._item) await updateLoveLetter(this._item, input);
		else {
			const created = await createLoveLetter(actor, input);
			if (created) {
				ui.notifications.info(game.i18n.format("stonetop.character.moves.loveLetter.created", { name: actor.name }));
			}
		}
		this._onSaved?.();
		this.close();
	}
}
