const DEFAULT_BASE_Z_INDEX = 100000;
const GUARD_EVENTS = ["pointerdown", "mousedown", "mouseup", "click", "focusin"];

/**
 * Keeps a Foundry Application rendered above other windows, while ensuring
 * hover tooltips (#tooltip) still float above the application itself.
 * Extracted from CharacterOnboardingDialog's keep-on-top behavior so other
 * sheet-spawned dialogs (LevelUpDialog, DeathsDoorDialog, etc.) can share it.
 */
export class KeepOnTop {
	/**
	 * @param {Application} app
	 * @param {object}      [options]
	 * @param {number}      [options.baseZIndex]
	 * @param {string}      [options.childDialogClass] - CSS class marking "child" dialogs
	 *        spawned from `app` (e.g. info popups). These are excluded from the
	 *        z-index race and instead pinned just above `app`, so the host dialog's
	 *        own keep-on-top guard doesn't fight its children for the top spot.
	 */
	constructor(app, { baseZIndex = DEFAULT_BASE_Z_INDEX, childDialogClass = null } = {}) {
		this._app = app;
		this._baseZIndex = baseZIndex;
		this._childDialogClass = childDialogClass;
		this._queued = false;
		this._listener = () => this.queue();
		this._observer = null;
	}

	apply() {
		const app = this._app;
		const el = app.element?.[0];
		if (!el) return;

		const isChild = w => this._childDialogClass && w.element?.[0]?.classList.contains(this._childDialogClass);
		const otherWindowZ = Object.values(globalThis.ui?.windows ?? {})
			.filter(w => w !== app && !isChild(w))
			.map(w => parseInt(w.element?.[0]?.style?.zIndex || 0))
			.filter(Number.isFinite);
		const zIndex = Math.max(this._baseZIndex, ...otherWindowZ) + 1;
		if (el.style.zIndex !== String(zIndex)) {
			el.style.setProperty("z-index", String(zIndex), "important");
		}

		// Pin child dialogs (e.g. info popups) just above their host. Match both the
		// AppV1 (`.window-app`) and AppV2 (`.application`) window roots so a child can
		// be a v13+ sheet — e.g. the Setting Overview journal opened from the playbook
		// picker, which is AppV2 and otherwise opens behind the picker's high z-index.
		let topZ = zIndex;
		if (this._childDialogClass) {
			const childZ = String(zIndex + 1);
			const cls = this._childDialogClass;
			document.querySelectorAll(`.window-app.${cls}, .application.${cls}`).forEach(childEl => {
				if (childEl.style.zIndex !== childZ) childEl.style.setProperty("z-index", childZ, "important");
			});
			topZ = zIndex + 1;
		}

		// Hover tooltips must always float above the dialog (and any children).
		const tooltip = document.querySelector("#tooltip");
		const tooltipZ = String(topZ + 1);
		if (tooltip && tooltip.style.zIndex !== tooltipZ) {
			tooltip.style.setProperty("z-index", tooltipZ, "important");
		}
	}

	queue() {
		if (this._queued || !this._app.rendered) return;
		this._queued = true;
		requestAnimationFrame(() => {
			this._queued = false;
			this.apply();
		});
		// Catches DOM changes that settle after the next frame (e.g. late-loading content).
		setTimeout(() => this.apply(), 50);
	}

	start() {
		for (const eventName of GUARD_EVENTS) {
			document.removeEventListener(eventName, this._listener, true);
			document.addEventListener(eventName, this._listener, true);
		}
		if (!this._observer) {
			this._observer = new MutationObserver(() => this.queue());
			this._observer.observe(document.body, {
				subtree: true,
				childList: true,
				attributes: true,
				attributeFilter: ["class", "style"],
			});
		}
		this.apply();
	}

	stop() {
		for (const eventName of GUARD_EVENTS) {
			document.removeEventListener(eventName, this._listener, true);
		}
		this._observer?.disconnect();
		this._observer = null;
		document.querySelector("#tooltip")?.style.removeProperty("z-index");
	}
}

/**
 * Wires KeepOnTop into an arbitrary Application/Dialog instance by wrapping
 * its _render/activateListeners/close methods. Useful for ad-hoc `new Dialog(...)`
 * popups spawned from sheets, which can't be given their own subclass.
 * Safe to call before or after the app's first render.
 */
export function attachKeepOnTop(app, options) {
	if (app._keepOnTop) return app._keepOnTop;
	const keepOnTop = new KeepOnTop(app, options);
	app._keepOnTop = keepOnTop;

	const baseRender = app._render.bind(app);
	app._render = async function (force, opts) {
		await baseRender(force, opts);
		keepOnTop.apply();
	};

	const baseActivateListeners = app.activateListeners.bind(app);
	app.activateListeners = function (html) {
		baseActivateListeners(html);
		keepOnTop.start();
	};

	const baseClose = app.close.bind(app);
	app.close = async function (opts) {
		keepOnTop.stop();
		return baseClose(opts);
	};

	if (app.rendered) {
		keepOnTop.apply();
		keepOnTop.start();
	}

	return keepOnTop;
}

/**
 * Render-callback hook for `new Dialog(...)`/`Dialog.confirm`/`Dialog.wait`
 * configs, none of which expose the Application instance directly. Resolves
 * it from the rendered html via the window app's data-appid, then attaches
 * KeepOnTop to it. Pass directly as `render`, or call from an existing one.
 */
export function keepDialogOnTop(html) {
	const el = html?.closest?.(".window-app")?.[0];
	const appId = el?.dataset?.appid;
	const app = appId ? globalThis.ui?.windows?.[appId] : null;
	if (app) attachKeepOnTop(app);
}

/**
 * Open a journal(-page) sheet floated as a *child* of a KeepOnTop host, so the
 * host's high z-index doesn't bury it. The window is tagged with `childClass`
 * (the host's `childDialogClass`) the instant it renders, and the host is
 * re-applied so it pins the child just above itself.
 *
 * Listens for both the v12 (`renderJournalSheet`) and v13 (`renderJournalEntrySheet`)
 * hook names and removes BOTH once either fires; a safety timeout removes them even
 * if the sheet never renders, so a cancelled/errored open can't leak the listeners.
 *
 * @param {Application} sheet                The journal- or page-sheet to open.
 * @param {object}      opts
 * @param {string}      opts.childClass      Marker class KeepOnTop floats above the host.
 * @param {KeepOnTop}   opts.keepOnTop       The host's KeepOnTop, re-applied once tagged.
 * @param {object}      [opts.renderOptions] Extra render options (e.g. `{ pageId }`).
 */
export function openJournalSheetAsChild(sheet, { childClass, keepOnTop, renderOptions = {} } = {}) {
	if (!sheet) return;
	const tag = (app) => {
		const el = app?.element?.jquery ? app.element[0] : app?.element;
		el?.classList?.add(childClass);
		keepOnTop?.queue();
	};
	if (sheet.rendered) {
		tag(sheet);
		sheet.bringToTop?.();
		keepOnTop?.queue();
		return;
	}
	let done = false;
	const cleanup = () => {
		if (done) return;
		done = true;
		Hooks.off("renderJournalSheet", onRender);
		Hooks.off("renderJournalEntrySheet", onRender);
	};
	const onRender = (app) => {
		if (app !== sheet) return;
		cleanup();
		tag(app);
	};
	Hooks.on("renderJournalSheet", onRender);
	Hooks.on("renderJournalEntrySheet", onRender);
	// Safety net: never leak the listeners if the sheet never renders.
	setTimeout(cleanup, 10000);
	sheet.render(true, renderOptions);
}
