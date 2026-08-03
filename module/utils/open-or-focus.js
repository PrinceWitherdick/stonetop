// Open a singleton Application, or bring the already-open one to the front
// instead of stacking a duplicate. `id` is the Application's defaultOptions.id;
// `open` mints (and renders) a fresh instance when none is showing.
//
// Returns the live Application either way (bringToTop itself returns nothing), so a caller
// that drives the window after opening it — a progress panel being fed by a background job —
// gets the same handle whether it opened the window or found it.
export function openOrFocus(id, open) {
	const existing = Object.values(ui.windows).find(w => w.id === id);
	if (existing?.rendered) { existing.bringToTop(); return existing; }
	return open();
}
