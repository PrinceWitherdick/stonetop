import { FrontOnOpen } from "./front-on-open.js";

/**
 * Base class for Stonetop's authoring dialogs (custom move, love letter, add inventory
 * item, monster builder, love-letter reader). It centralises the one piece of lifecycle
 * every one of them repeated: wiring FrontOnOpen so a dialog launched from an actor sheet
 * stays above it (below tooltips), applied on render, started on activateListeners, stopped
 * on close. It also offers a tiny form-value reader so each dialog's `_save` stops
 * re-declaring the same `root.querySelector(sel)?.value ?? ""`.
 *
 * Subclasses set their own fields AFTER `super(options)`. When a subclass overrides
 * activateListeners / close / _render to add its own behaviour, it MUST call the matching
 * `super.…` so the FrontOnOpen lifecycle still runs.
 */
export class StonetopDialog extends Application {
	constructor(options = {}) {
		super(options);
		this._frontOnOpen = new FrontOnOpen(this);
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
		return super.close(options);
	}

	/** Read a form field's value by selector from a root element; "" when the field is absent. */
	static readValue(root, selector) {
		return root.querySelector(selector)?.value ?? "";
	}
}
