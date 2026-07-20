import { FrontOnOpen } from "../utils/front-on-open.js";
import { getSetting } from "../settings.js";

// ── StepperDialog ────────────────────────────────────────────────────────────
// Shared scaffolding for the linear "walkthrough" dialogs (Spring Burst,
// Expedition, Create Follower): a `_step` cursor over a list of steps, the
// FrontOnOpen lifecycle, Back/Next navigation, and the per-render nav context.
//
// Subclasses provide the steps via `get _steps()`, spread `_stepNav()` into their
// `getData`, call `_bindStepNav(html)` from `activateListeners`, and may override
// `_onBeforeStepChange()` to flush focused-but-unblurred fields before navigating.
//
// A "result" wizard (Make a Hazard, the Things Below wizards) is awaited via `promise()`
// and settles it with `_resolveWith(value)` on finish (or null on cancel-close). A
// content-hugging window overrides `get _autoHeight()` to re-fit its height each render.
export class StepperDialog extends Application {
	constructor(options = {}) {
		super(options);
		this._step      = 0;
		this._frontOnOpen = new FrontOnOpen(this);
		// Set by promise(); settled once by _resolveWith on finish, or null on cancel-close.
		this._resolve   = null;
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

	/** Override to true for a content-hugging window that re-fits its height each render. */
	get _autoHeight() { return false; }

	async _render(force, options) {
		await super._render(force, options);
		this._frontOnOpen.apply();
		// Auto-height wizards recompute height after each render so the window hugs the
		// current step's content (AppV1 caps the result via CSS max-height).
		if (this._autoHeight) this.setPosition({ height: "auto" });
	}

	// Result-dialog protocol: a caller awaits promise(); the dialog collects input and
	// calls _resolveWith(value) to settle it and close, or resolves null if cancelled.
	/** Open the dialog; resolves to the value passed to _resolveWith, or null if cancelled. */
	promise() {
		return new Promise(resolve => { this._resolve = resolve; this.render(true); });
	}

	/** Settle promise() with a result and close. Nulls _resolve first so close() won't re-resolve. */
	_resolveWith(result) {
		const resolve = this._resolve;
		this._resolve = null;
		this.close();
		resolve?.(result);
	}

	async close(options = {}) {
		this._frontOnOpen.stop();
		// A close without finishing (Cancel, Escape, X) resolves an open promise() to null.
		if (this._resolve) { const resolve = this._resolve; this._resolve = null; resolve(null); }
		return super.close(options);
	}

	// Per-render navigation context: the active step plus its position labels. The
	// `steps` list lets a template render a jump-to-step table of contents (only the
	// Expedition dialog does today); it's harmless extra data for the others.
	_stepNav() {
		const steps = this._steps;
		const step  = steps[this._step];
		const nav = {
			step,
			steps: steps.map((s, i) => ({
				index:    i,
				title:    s.title,
				icon:     s.icon,
				isActive: i === this._step,
			})),
			stepIndex: this._step + 1,
			stepCount: steps.length,
			stepLabel: `Step ${this._step + 1} of ${steps.length}`,
			isFirst:   this._step === 0,
			isLast:    !!step.isFinal,
		};
		// Key-based steps expose an `is_<key>` boolean so a template can switch on the active
		// step (`{{#if is_themes}}`); numeric-only steppers (Spring/Expedition) have no key.
		if (step?.key) nav[`is_${step.key}`] = true;
		return nav;
	}

	// Start the front-on-open watcher and wire the shared Back/Next buttons plus any
	// jump-to-step table-of-contents buttons.
	_bindStepNav(html) {
		this._frontOnOpen.start();
		html.find(".stonetop-spring-back").on("click", () => this._retreat());
		html.find(".stonetop-spring-next").on("click", () => this._advance());
		html.find(".stonetop-guide-toc-btn").on("click", ev => this._goTo(Number(ev.currentTarget.dataset.stepIndex)));
	}

	// Hook for subclasses to capture live field values before changing steps.
	_onBeforeStepChange() {}

	// ── Shared step-form helpers (the pick-and-roll wizards) ─────────────────────

	/** Add or remove `value` from a Set based on a checkbox's checked state. */
	_toggleInSet(set, value, on) { if (on) set.add(value); else set.delete(value); }

	/** Add every rolled table entry's `.id` into a Set (uncapped "roll into the picks"). */
	_addIds(set, items) { for (const it of items) set.add(it.id); }

	/** Snapshot a classed group of `[data-index]` text inputs back into a parallel string
	 *  array — the add/remove row lists that don't re-render on each keystroke. Indices absent
	 *  from the array are ignored so a stale input can't grow it. `root` may be the app element
	 *  or its jQuery wrapper; defaults to the live element. */
	_captureRowInputs(root, selector, arr) {
		const el = root?.jquery ? root[0] : (root ?? this.element?.[0]);
		el?.querySelectorAll?.(selector).forEach(input => {
			const i = Number(input.dataset.index);
			if (i in arr) arr[i] = input.value;
		});
	}

	_advance() {
		this._onBeforeStepChange();
		if (this._step < this._steps.length - 1) { this._step++; this.render(false); }
	}

	_retreat() {
		this._onBeforeStepChange();
		if (this._step > 0) { this._step--; this.render(false); }
	}

	// Jump straight to a step (table-of-contents click). Flushes the current field
	// first, like Back/Next.
	_goTo(index) {
		if (!Number.isInteger(index) || index < 0 || index >= this._steps.length || index === this._step) return;
		this._onBeforeStepChange();
		this._step = index;
		this.render(false);
	}
}
