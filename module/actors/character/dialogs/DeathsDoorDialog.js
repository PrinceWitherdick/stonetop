import { StonetopDialog } from "../../../utils/stonetop-dialog.js";
import { stonetopChatCard, rollFormulaChip, rollResultNumber } from "../../../utils/chat.js";
import { classifyResult, multiDieFaces } from "../../../utils/roll-engine.js";

// Death's Door result labels, keyed by the shared 2d6 tier (classifyResult().key).
const _DEATHS_DOOR_LABELS = {
	success: "10+ &mdash; You wrest yourself back to the realm of the living.",
	partial: "7-9 &mdash; No longer dying, but out of the action.",
	failure: "6- &mdash; Your time has come.",
};

// One-tap suggestions for the 10+ mark (the book's own examples), filled into the
// input so recording a mark mid-session is a single click.
const _DEATHS_DOOR_MARK_CHIPS = [
	"a nasty scar",
	"a lost eye",
	"visions of the Last Door",
	"a murder of crows, always nearby",
];

const _DEATHS_DOOR_STEPS = ["overview", "mechanics", "results"];

export class DeathsDoorDialog extends StonetopDialog {
	constructor(character, onDone, options = {}) {
		super(options);
		this._character = character;
		this._step = "overview"; // "overview" | "mechanics" | "results"
		this._onDone = onDone;
	}

	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id:        "stonetop-deathsdoor-dialog",
			template:  "systems/stonetop-pwd/templates/dialogs/deaths-door.hbs",
			title:     "Death's Door",
			width:     600,
			height:    "auto",
			resizable: true,
			classes:   ["stonetop", "stonetop-deathsdoor-dialog"],
		});
	}

	/** Content-hugging: re-fit the window height to the current step each render. */
	get _autoHeight() { return true; }

	getData() {
		const isOverview = this._step === "overview";
		const isMechanics = this._step === "mechanics";
		const isResults = this._step === "results";

		const total = this._rolledTotal ?? null;
		const key = total === null ? null : classifyResult(total).key;

		return {
			isOverview,
			isMechanics,
			isResults,
			rolledTotal: total,
			isStrong:    key === "success",
			isWeak:      key === "partial",
			isMiss:      key === "failure",
			// On a 10+ the character is "marked in mind, body, or soul" — offer to record
			// that mark straight onto the sheet as a permanent, Death's-Door wound.
			markChips:   _DEATHS_DOOR_MARK_CHIPS,
			markSeeded:  !!this._markSeeded,
		};
	}

	activateListeners(html) {
		super.activateListeners(html);

		html.find(".deaths-door-next-btn").on("click", () => this._onNext());
		html.find(".deaths-door-back-btn").on("click", () => this._onBack());
		html.find(".deaths-door-roll-btn").on("click", () => this._onRoll());
		html.find(".deaths-door-confirm-btn").on("click", () => this._onConfirm());
		html.find(".deaths-door-cancel-btn").on("click", () => this.close());

		// 10+ mark: a chip fills the input; "Record mark" seeds the permanent wound.
		html.find(".deaths-door-mark-chip").on("click", (ev) => {
			this.element.find(".deaths-door-mark-input").val(ev.currentTarget.dataset.mark ?? "");
		});
		html.find(".deaths-door-mark-add").on("click", () => this._onSeedMark());
	}

	async _onSeedMark() {
		if (this._markSeeded || !this._character?.addWound) return;
		// Latch synchronously, before the await, so a rapid double-click on the still-live
		// button can't slip a second identical wound in during the write. Released on failure
		// so a genuinely failed write can still be retried.
		this._markSeeded = true;
		const text = (this.element.find(".deaths-door-mark-input").val() ?? "").trim();
		try {
			await this._character.addWound({
				text: text || "Marked in mind, body, or soul — describe the mark",
				status: "permanent",
				origin: "deaths-door",
			});
		} catch (err) {
			this._markSeeded = false;
			throw err;
		}
		ui.notifications?.info?.("Death's-Door mark recorded on your sheet. Bring it up often.");
		this.render(true);
	}

	async _onRoll() {
		const actor = this._character?._actor ?? null;
		const roll  = await new Roll("2d6").evaluate();
		const total = roll.total;
		const { key } = classifyResult(total);

		const dieFaces = multiDieFaces(roll);
		const flavor = stonetopChatCard("Death's Door", `<div class="card-content">
				${rollFormulaChip(roll.formula, dieFaces)}
				<div class="stonetop-roll-result ${key}">
					${rollResultNumber(total, dieFaces)}
					<div class="stonetop-roll-result-body">
						<span class="stonetop-roll-result-label">${_DEATHS_DOOR_LABELS[key]}</span>
						<span class="stonetop-roll-result-details"></span>
					</div>
				</div>
			</div>`);

		await roll.toMessage({
			speaker:  actor ? ChatMessage.getSpeaker({ actor }) : ChatMessage.getSpeaker(),
			flavor,
			rollMode: game.settings.get("core", "rollMode"),
		});

		// Act like Continue was pressed: advance to the screen describing this result.
		// The tier is re-derived from this total in getData(), so only the total is stored.
		this._rolledTotal = total;
		this._step        = key === "failure" ? "results" : "mechanics";
		// A fresh roll is a fresh brush with death: re-arm the 10+ mark seeder so a
		// re-roll that lands on another 10+ can record its own mark.
		this._markSeeded  = false;
		this.render(true);
	}

	_onNext() {
		const steps = _DEATHS_DOOR_STEPS;
		const currentIndex = steps.indexOf(this._step);
		if (currentIndex < steps.length - 1) {
			this._step = steps[currentIndex + 1];
			this.render(true);
		}
	}

	_onBack() {
		const steps = _DEATHS_DOOR_STEPS;
		const currentIndex = steps.indexOf(this._step);
		if (currentIndex > 0) {
			this._step = steps[currentIndex - 1];
			this.render(true);
		}
	}

	async _onConfirm() {
		// Add a note to the character that they understand Death's Door
		ui.notifications?.info?.("You now understand Death's Door. When you are dying, you can roll +nothing to face it.");
		this.close();
		this._onDone?.();
	}
}
