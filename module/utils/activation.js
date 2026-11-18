// ── Capture-phase delegation off a rendered root ─────────────────────────────
// The two shapes a sheet's delegated controls keep being wired in. Both listen in the CAPTURE
// phase on `root`, so the control is claimed before any handler bound deeper in the markup (or
// the sheet's own bubble-phase delegation) can see the event.

/**
 * Find the control `sel` the event came from, claim it (stopPropagation) and act. `when` is a
 * guard checked BEFORE the event is claimed, so a refused control's event travels on untouched.
 *
 * @param {HTMLElement} root
 * @param {string}      type  the event type ("click", "change", …)
 * @param {string}      sel
 * @param {(el: HTMLElement, ev: Event) => any} fn
 * @param {(el: HTMLElement) => boolean} [when]
 */
export function onCapture(root, type, sel, fn, when = () => true) {
	root.addEventListener(type, ev => {
		const el = ev.target.closest(sel);
		if (!el || !when(el)) return;
		ev.stopPropagation();
		return fn(el, ev);
	}, true);
}

/**
 * The click + Enter/Space pair for a non-button control (a role="button" span, a link with no
 * href). The key is tested before walking ancestors, so typing into the root's fields stays free;
 * preventDefault covers the keydown too, or Space would scroll the page out from under the control.
 *
 * @param {HTMLElement} root
 * @param {string}      sel
 * @param {(el: HTMLElement, ev: Event) => any} fn
 */
export function onActivate(root, sel, fn) {
	const handler = ev => {
		if (ev.type === "keydown" && ev.key !== "Enter" && ev.key !== " ") return;
		const el = ev.target.closest?.(sel);
		if (!el) return;
		ev.preventDefault();
		ev.stopPropagation();
		return fn(el, ev);
	};
	root.addEventListener("click", handler, true);
	root.addEventListener("keydown", handler, true);
}
