import { KeepOnTop } from "../utils/keep-on-top.js";
import { getSetting } from "../settings.js";

// ── StepperDialog ────────────────────────────────────────────────────────────
// Shared scaffolding for the linear "walkthrough" dialogs (Spring Burst,
// Expedition, Create Follower): a `_step` cursor over a list of steps, the
// KeepOnTop lifecycle, Back/Next navigation, and the per-render nav context.
//
// Subclasses provide the steps via `get _steps()`, spread `_stepNav()` into their
// `getData`, call `_bindStepNav(html)` from `activateListeners`, and may override
// `_onBeforeStepChange()` to flush focused-but-unblurred fields before navigating.
export class StepperDialog extends Application {
	constructor(options = {}) {
		super(options);
		this._step      = 0;
		this._keepOnTop = new KeepOnTop(this);
	}

	/** @returns {Array<object>} The ordered steps; the final one is flagged `isFinal`. */
	get _steps() { return []; }

	/** The world-setting key holding this dialog's persisted Q&A notes. Subclasses
	 *  that show note fields override this; others leave it null. */
	get _answersSetting() { return null; }

	/** The persisted answers blob, read fresh each render so navigating Back/Next
	 *  shows whatever the GM has already typed. */
	_answers() {
		return (this._answersSetting ? getSetting(this._answersSetting) : null) ?? {};
	}

	async _render(force, options) {
		await super._render(force, options);
		this._keepOnTop.apply();
	}

	async close(options = {}) {
		this._keepOnTop.stop();
		return super.close(options);
	}

	// Per-render navigation context: the active step plus its position labels.
	_stepNav() {
		const steps = this._steps;
		const step  = steps[this._step];
		return {
			step,
			stepIndex: this._step + 1,
			stepCount: steps.length,
			stepLabel: `Step ${this._step + 1} of ${steps.length}`,
			isFirst:   this._step === 0,
			isLast:    !!step.isFinal,
		};
	}

	// Start the keep-on-top watcher and wire the shared Back/Next buttons.
	_bindStepNav(html) {
		this._keepOnTop.start();
		html.find(".stonetop-spring-back").on("click", () => this._retreat());
		html.find(".stonetop-spring-next").on("click", () => this._advance());
	}

	// Hook for subclasses to capture live field values before changing steps.
	_onBeforeStepChange() {}

	_advance() {
		this._onBeforeStepChange();
		if (this._step < this._steps.length - 1) { this._step++; this.render(false); }
	}

	_retreat() {
		this._onBeforeStepChange();
		if (this._step > 0) { this._step--; this.render(false); }
	}
}
