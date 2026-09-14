// Open a singleton Application, or bring the already-open one to the front
// instead of stacking a duplicate. `id` is the Application's defaultOptions.id;
// `open` mints (and renders) a fresh instance when none is showing.
//
// Returns the live Application either way (bringToTop itself returns nothing), so a caller
// that drives the window after opening it — a progress panel being fed by a background job —
// gets the same handle whether it opened the window or found it.
//
// ⚠ A WINDOW STILL OPENING IS OPEN. Core files a V1 window in `ui.windows` only part-way through its
// first render, and a window whose render awaits something of its own before that (the relationship
// map does: its first page, the party's board and the village's) is neither there nor `rendered` for
// the length of the wait. Two opens inside that breath each found nothing and each minted a window
// with the same DOM id: two frames stacked on one another, every world hook wired twice, both seating
// the party at once, and closing one leaving its twin standing underneath. A double click on the
// hotbar macro is enough, so the window minted for an id is remembered until it has either rendered or
// given up. An opener that hands back something other than a window (a promise, say) is not
// remembered, and behaves exactly as it did.
//
// ⚠ BUT NOT FOR EVER. A window that has not begun to draw looks the same whether its render is still
// awaiting something or has returned without drawing at all (a sheet the reader may not view warns and
// does exactly that), so one still undrawn after OPENING_GRACE_MS is taken to have given up, and the
// next press opens afresh. And every call first forgets the windows that have finished opening, drawn
// or not: a window only ever looked up again by an id nobody asks for twice (one per camp, one per
// picture) would otherwise be held here, closed, for the rest of the session.
import { findOpenApp } from "./open-windows.js";

/**
 * How long a window minted and not yet drawing is still taken to be on its way. Longer than any wait
 * a window makes before it draws, and than a reload's restore, which mints each window it reopens at
 * once and draws them 120ms apart (utils/window-restore.js).
 */
const OPENING_GRACE_MS = 10000;

/** The window each id last minted, and when, for the breath before core can find it. */
const opening = new Map();

/** Minted and asked to render, and not yet drawn, closed or failed. */
function stillOpening({ app, at }, now) {
	const states = app?.constructor?.RENDER_STATES;
	if (!states) return false;
	const state = app._state ?? app.state;
	if (state === states.RENDERING) return true;
	return state === states.NONE && now - at < OPENING_GRACE_MS;
}

export function openOrFocus(id, open) {
	const now = Date.now();
	for (const [key, entry] of opening) {
		if (!stillOpening(entry, now)) opening.delete(key);
	}
	// Both registries: a V1 app lives in ui.windows, an ApplicationV2 in
	// foundry.applications.instances. Looking in only one turns this silently into
	// "always open a second copy" the day the app it guards is migrated.
	const existing = findOpenApp(w => w.id === id);
	if (existing?.rendered) {
		opening.delete(id);
		// A MINIMIZED WINDOW IS IN FRONT OF NOBODY. `bringToTop` only restacks it, so the press that
		// asked for it left a collapsed title bar and looked as though it had done nothing -- and a
		// window reopened after a reload comes back minimized if that is how it was left. Core's own
		// `render(true)` restores one first, and so does this.
		if (existing.minimized ?? existing._minimized) existing.maximize?.();
		existing.bringToTop();
		return existing;
	}
	// Whatever the sweep above left standing is a window still on its way.
	const pending = opening.get(id);
	if (pending) return pending.app;
	const app = open();
	const minted = { app, at: now };
	if (stillOpening(minted, now)) opening.set(id, minted);
	return app;
}
