// Open a singleton Application, or bring the already-open one to the front
// instead of stacking a duplicate. `id` is the Application's defaultOptions.id;
// `open` mints (and renders) a fresh instance when none is showing.
//
// Returns the live Application either way (bringToTop itself returns nothing), so a caller
// that drives the window after opening it — a progress panel being fed by a background job —
// gets the same handle whether it opened the window or found it.
import { findOpenApp } from "./open-windows.js";

export function openOrFocus(id, open) {
	// Both registries: a V1 app lives in ui.windows, an ApplicationV2 in
	// foundry.applications.instances. Looking in only one turns this silently into
	// "always open a second copy" the day the app it guards is migrated.
	const existing = findOpenApp(w => w.id === id);
	if (existing?.rendered) { existing.bringToTop(); return existing; }
	return open();
}
