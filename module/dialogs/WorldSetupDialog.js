import { StonetopDialog } from "../utils/stonetop-dialog.js";
import { openOrFocus } from "../utils/open-or-focus.js";
import {
	STEP_STATE, makeSetupSteps, updateSetupStep, stepStateIcon, setupOverallFraction, setupSummary,
} from "./world-setup-steps.js";

// ── WorldSetupDialog ─────────────────────────────────────────────────────────
// The GM-only "setting your world up" window. A brand-new world imports the whole
// gazetteer (~160 journal entries), the bestiary (~200 monster actors) and the treasure
// library (168 items) in the background — a long, silent pause where the sidebar is
// visibly empty and nothing tells the GM that anything is happening. This narrates it:
// one row per job with its own state, plus an overall bar.
//
// It never blocks. The work runs whether or not this window is open, so the button
// closes it and nothing else — and the window auto-closes itself once everything lands.
// Modelled on the "Import Book Art" macro's progress modal, which does the same job for
// the (also long, also silent) PDF extraction.
//
// The step state itself lives in world-setup-steps.js so it can be reasoned about — and
// tested — without a browser; this class is the renderer and the throttle.

// How long the finished window lingers before closing itself. Long enough to read
// "your world is ready", short enough not to be in the way of the Welcome guide.
const AUTO_CLOSE_MS = 2200;

export class WorldSetupDialog extends StonetopDialog {
	constructor(stepDefs = [], options = {}) {
		super(options);
		this._steps = makeSetupSteps(stepDefs);
		this._closeTimer = null;
		// Latched by close(). AppV1 ignores a close() on a window whose first render is still
		// in flight, so on a world where every step settles faster than the open animation the
		// window would appear AFTER it was told to go and then never leave. _render re-closes.
		this._closed = false;
		// Set once every step settles, so the window can swap to its closing message
		// (and stop pretending there is still work in flight).
		this._complete = false;
	}

	/**
	 * Open the window on the given steps and hand back the live instance — the handle the
	 * orchestrator drives every step through. Singleton like the system's other standing
	 * windows, so a second setup run (a re-entrant ready, a manual call) narrates into the
	 * open window rather than stacking a duplicate over it.
	 */
	static open(stepDefs) {
		const dialog = openOrFocus("stonetop-world-setup", () => {
			const created = new WorldSetupDialog(stepDefs);
			created.render(true);
			return created;
		});
		// The window openOrFocus found may be an EARLIER run's, whose rows describe that run's
		// work rather than this one's. Re-seat it, or the mismatch is silent both ways:
		// updateSetupStep no-ops on a key it does not know, so a lane this run owns would never
		// narrate at all, while finish() would tick off rows nobody is working on.
		dialog?.adoptSteps(stepDefs);
		return dialog;
	}

	/**
	 * Point an open window at a new run's step list. A no-op when the rows already match,
	 * which is the ordinary case — including the call that immediately follows a fresh
	 * construction — so this costs nothing on the path that does not need it.
	 *
	 * Clears the auto-close timer along with the completion state: a previous run that had
	 * already settled would otherwise close the window part-way through this one.
	 */
	adoptSteps(stepDefs = []) {
		const keyOf = list => list.map(s => s.key).join("|");
		if (keyOf(stepDefs) === keyOf(this._steps)) return;
		this._steps = makeSetupSteps(stepDefs);
		this._complete = false;
		if (this._closeTimer) { clearTimeout(this._closeTimer); this._closeTimer = null; }
		this.renderNow();
	}

	// The row list is fixed-length and only its states change, so the window hugs its
	// content once and then holds still.
	get _autoHeight() { return true; }

	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id:        "stonetop-world-setup",
			title:     "Setting up your world",
			template:  "systems/stonetop-pwd/templates/dialogs/world-setup.hbs",
			width:     480,
			height:    "auto",
			resizable: true,
			classes:   ["stonetop", "stonetop-world-setup-dialog"],
		});
	}

	getData() {
		const fraction = setupOverallFraction(this._steps);
		return {
			steps: this._steps.map(step => ({ ...step, stateIcon: stepStateIcon(step.state) })),
			percent:  Math.round(fraction * 100),
			complete: this._complete,
			summary:  this._complete ? setupSummary(this._steps) : "",
		};
	}

	// ---- progress API -------------------------------------------------------
	// Every call is safe after the GM has closed the window (or after finish()): the
	// state still updates and the render is a no-op on an unrendered Application, so the
	// caller never has to ask whether anyone is watching.

	/** Mark a step as under way. `detail` is the small line under its label. */
	start(key, detail = "") {
		this._patch(key, { state: STEP_STATE.RUNNING, detail, fraction: null });
	}

	/**
	 * Report progress within the running step. `fraction` is 0–1, or null to go back to
	 * indeterminate; omit it to update only the detail line.
	 */
	step(key, { fraction, detail } = {}) {
		const patch = {};
		if (fraction !== undefined) patch.fraction = fraction;
		if (detail !== undefined) patch.detail = detail;
		this._patch(key, patch);
	}

	/** Mark a step finished. */
	done(key, detail = "") {
		this._patch(key, { state: STEP_STATE.DONE, detail, fraction: 1 }, { immediate: true });
	}

	/** Mark a step as having had nothing to do — a normal outcome, not a failure. */
	skip(key, detail = "") {
		this._patch(key, { state: STEP_STATE.SKIPPED, detail, fraction: 1 }, { immediate: true });
	}

	/** Mark a step as having given up. The next world load retries it. */
	fail(key, detail = "") {
		this._patch(key, { state: STEP_STATE.FAILED, detail, fraction: 1 }, { immediate: true });
	}

	/**
	 * Everything is settled. Swaps to the closing message and, when nothing failed, closes
	 * the window after a beat so the GM isn't left dismissing it. A run with failures stays
	 * open — that is the one case worth reading.
	 *
	 * Resolves once the window is actually gone, so a caller with a follow-up question (the
	 * poster-map offer) can wait for the floor rather than talking over it. A failed run,
	 * which keeps the window up, resolves as soon as the GM dismisses it.
	 */
	finish() {
		// Anything still pending/running when the orchestrator finishes never reported an
		// outcome; call it done rather than leaving a row spinning forever.
		for (const s of this._steps) {
			if (s.state === STEP_STATE.PENDING || s.state === STEP_STATE.RUNNING) {
				this._steps = updateSetupStep(this._steps, s.key, { state: STEP_STATE.DONE, fraction: 1 });
			}
		}
		this._complete = true;
		this.renderNow();
		if (this._closed) return Promise.resolve();
		// The base class settles _resultResolve to null on close, from whichever exit the
		// window takes — so a GM who dismisses it themselves releases the caller just as the
		// auto-close does, and there is only one settle path to reason about.
		const closed = new Promise(resolve => { this._resultResolve = resolve; });
		if (!this._steps.some(s => s.state === STEP_STATE.FAILED)) {
			this._closeTimer = setTimeout(() => { this._closeTimer = null; this.close(); }, AUTO_CLOSE_MS);
		}
		return closed;
	}

	// ---- rendering ----------------------------------------------------------

	_patch(key, patch, { immediate = false } = {}) {
		const next = updateSetupStep(this._steps, key, patch);
		if (next === this._steps) return;
		this._steps = next;
		if (immediate) this.renderNow();
		else this.renderThrottled();
	}

	// `render(false)` is a no-op once the GM has closed the window, which is exactly what we
	// want: the work carries on, unwatched. Skipping it outright also stops a trailing
	// throttled tick from re-opening a dismissed window.
	renderNow() {
		if (this._closed) { this._cancelThrottledRender(); return; }
		super.renderNow();
	}

	async _render(force, options) {
		await super._render(force, options);
		// A close that landed while this render was still in flight: honour it now, rather
		// than leaving a finished window on screen.
		if (this._closed) this.close();
	}

	activateListeners(html) {
		super.activateListeners(html);
		html.find('[data-action="hide"]').on("click", () => this.close());
	}

	async close(options = {}) {
		this._closed = true;
		if (this._closeTimer) { clearTimeout(this._closeTimer); this._closeTimer = null; }
		return super.close(options);
	}
}
