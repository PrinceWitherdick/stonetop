export class DeathsDoorDialog extends Application {
	constructor(character, onDone, options = {}) {
		super(options);
		this._character = character;
		this._step = "overview"; // "overview" | "mechanics" | "results"
		this._onDone = onDone;
	}

	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id:        "stonetop-deathsdoor-dialog",
			template:  "systems/stonetop_pwd/templates/dialogs/deaths-door.hbs",
			title:     "Death's Door",
			width:     600,
			height:    520,
			resizable: true,
			classes:   ["stonetop", "stonetop-deathsdoor-dialog"],
		});
	}

	getData() {
		const isOverview = this._step === "overview";
		const isMechanics = this._step === "mechanics";
		const isResults = this._step === "results";

		return {
			isOverview,
			isMechanics,
			isResults,
		};
	}

	activateListeners(html) {
		super.activateListeners(html);

		html.find(".deaths-door-next-btn").on("click", () => this._onNext());
		html.find(".deaths-door-back-btn").on("click", () => this._onBack());
		html.find(".deaths-door-confirm-btn").on("click", () => this._onConfirm());
		html.find(".deaths-door-cancel-btn").on("click", () => this.close());
	}

	_onNext() {
		const steps = ["overview", "mechanics", "results"];
		const currentIndex = steps.indexOf(this._step);
		if (currentIndex < steps.length - 1) {
			this._step = steps[currentIndex + 1];
			this.render(true);
		}
	}

	_onBack() {
		const steps = ["overview", "mechanics", "results"];
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
