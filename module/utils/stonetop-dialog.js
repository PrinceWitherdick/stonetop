import { FrontOnOpen } from "./front-on-open.js";

/**
 * Base class for Stonetop's authoring dialogs (custom move, love letter, add inventory
 * item, monster builder, love-letter reader). It centralises the two pieces of lifecycle
 * every one of them repeated:
 *
 *  • FrontOnOpen, so a dialog launched from an actor sheet stays above it (below tooltips)
 *    — applied on render, started on activateListeners, stopped on close; and
 *  • the result-dialog protocol below, for a dialog whose caller awaits its answer.
 *
 * It also offers a tiny form-value reader so each dialog's `_save` stops re-declaring the
 * same `root.querySelector(sel)?.value ?? ""`.
 *
 * Subclasses set their own fields AFTER `super(options)`. When a subclass overrides
 * activateListeners / close / _render to add its own behaviour, it MUST call the matching
 * `super.…` so the FrontOnOpen lifecycle still runs.
 */
export class StonetopDialog extends Application {
	constructor(options = {}) {
		super(options);
		this._frontOnOpen = new FrontOnOpen(this);
		// Set by promise(); settled once by _resolveWith on finish, or null on cancel-close.
		// Named _resultResolve, not _resolve: a subclass is free to have a _resolve() METHOD
		// (CallUpDeepOnesDialog does), which a same-named field here would silently shadow.
		this._resultResolve = null;
	}

	// Result-dialog protocol: a caller awaits promise(); the dialog collects input and calls
	// _resolveWith(value) to settle it and close. Every exit resolves — a dialog dismissed by
	// Cancel, Escape or the X settles to null rather than leaving its caller awaiting forever.
	// A dialog nobody awaits simply never calls promise(), and these are inert.

	/** Open the dialog; resolves to the value passed to _resolveWith, or null if cancelled. */
	promise() {
		return new Promise(resolve => { this._resultResolve = resolve; this.render(true); });
	}

	/** Settle promise() with a result and close. Cleared first so close() won't re-resolve. */
	_resolveWith(result) {
		const resolve = this._resultResolve;
		this._resultResolve = null;
		this.close();
		resolve?.(result);
	}

	/** Override to true for a content-hugging window that re-fits its height each render. */
	get _autoHeight() { return false; }

	async _render(force, options) {
		await super._render(force, options);
		this._frontOnOpen.apply();
		// Auto-height dialogs re-fit their height after each render so the window hugs the
		// current content (AppV1 caps the result via CSS max-height).
		if (this._autoHeight) this.setPosition({ height: "auto" });
	}

	activateListeners(html) {
		super.activateListeners(html);
		this._frontOnOpen.start();
	}

	async close(options = {}) {
		this._frontOnOpen.stop();
		// A close without finishing (Cancel, Escape, X) resolves an open promise() to null.
		if (this._resultResolve) { const resolve = this._resultResolve; this._resultResolve = null; resolve(null); }
		return super.close(options);
	}

	/** Read a form field's value by selector from a root element; "" when the field is absent. */
	static readValue(root, selector) {
		return root.querySelector(selector)?.value ?? "";
	}
}
