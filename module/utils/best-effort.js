/**
 * Run one startup step, and log rather than throw if it fails.
 *
 * Foundry does not await a `ready` callback, so a bare `await` that rejects does not fail the
 * load out loud: it silently ends the hook there, and for whoever it happened to, everything after
 * it never runs (no hotbar macros, no game.stonetop, no window restore). Each step the rest of the
 * load does not depend on goes through here instead.
 *
 * @param {string} label    what failed, for the log ("chronicle flag-scope repair")
 * @param {() => any} work
 */
export async function bestEffort(label, work) {
	try { await work(); }
	catch (err) { console.error(`Stonetop | ${label} failed`, err); }
}
