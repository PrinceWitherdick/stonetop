import { error } from "./logger.js";

/**
 * A progress bar for a long job that has no window of its own.
 *
 * The system already narrates its two big waits in a window (WorldSetupDialog for the
 * first-load imports, the Import Book Art macro's own modal for the PDF extraction). Neither
 * fits a job that is nobody's dialog: a once-per-world migration sweep on the ready path, or
 * a handful of Scenes being built after the setup window has already closed itself. Opening a
 * whole Application for those is more furniture than the wait deserves.
 *
 * Foundry's own notification bar does exactly this and the system had never used it. Core
 * takes `pct` on 0..1, so this speaks the same `{ fraction, detail }` the seeds and
 * progress-slice.js already report and does the translating in one place.
 *
 * Two behaviours worth knowing, both of them the reason this is a wrapper rather than a
 * two-line call:
 *
 *  • DEFERRED OPEN. A bar that flashes up and vanishes reads as a glitch, and most of these
 *    jobs are instant on a world with nothing to do. Nothing is shown until the job has been
 *    running for `delayMs`, so a fast run stays silent and a slow one explains itself. When
 *    the bar does open it opens at the progress already made, rather than snapping back to 0.
 *
 *  • DELIBERATE FINISH. Core keeps a progress notification on screen forever (it exempts them
 *    from the usual lifetime) and dismisses one only when `pct` is exactly 1, half a second
 *    later. So `close()` sets exactly 1 rather than letting the caller's arithmetic land on
 *    0.9999 and leave a bar stuck on screen for the rest of the session.
 *
 * Every method is safe to call whether or not a bar was ever shown, and safe after close(),
 * so a caller never has to ask whether anyone is watching.
 *
 * @param {string} message  the standing label, e.g. "Stonetop: tidying up this world"
 * @param {object} [options]
 * @param {number} [options.delayMs=400]  how long the job may run before a bar appears.
 *                                        Pass 0 for work the user explicitly asked for and
 *                                        is waiting on, where instant feedback is the point.
 * @returns {{update: (p?: {fraction?: number, detail?: string}) => void, close: (detail?: string) => void}}
 */
const DEFAULT_DELAY_MS = 400;

export function openProgressNotification(message, { delayMs = DEFAULT_DELAY_MS } = {}) {
	let handle = null;
	let timer = null;
	let closed = false;
	let broken = false;
	let fraction = 0;
	let detail = "";

	const paint = () => {
		if (broken || !handle?.update) return;
		try {
			// `format` rather than an interpolated string: core escapes every format value and
			// then skips its HTML sanitiser, which is both the safe path and the cheap one. It
			// matters because `detail` is not ours — the sweep's detail is a document label the
			// GM typed, and it routinely contains characters (">") that mean something in HTML.
			handle.update(detail
				? { pct: clampFraction(fraction), message: "{label} ({detail})", format: { label: message, detail }, escape: true }
				: { pct: clampFraction(fraction), message });
		} catch (err) {
			// A core API that moved under us must not take the job down with it. Stop driving the
			// bar so every later tick is a no-op instead of throwing once per item — but KEEP the
			// handle. The bar is still on screen, and core exempts a progress notification from
			// the usual lifetime, so the handle is the only way it ever comes down again. Dropping
			// it here is what would strand it there for the rest of the session.
			error("Progress notification: could not update the bar", err);
			broken = true;
		}
	};

	// Take the bar off the screen. The one path that ends a bar which cannot be driven to 100%,
	// so both abandon() and a broken close() go through it.
	const remove = () => {
		try { handle?.remove?.(); }
		catch (err) { error("Progress notification: could not remove the bar", err); }
		handle = null;
	};

	const open = () => {
		timer = null;
		if (closed || handle) return;
		try {
			// `console: false` because this bar ticks once per document target, and core logs a
			// line per tick otherwise. The one load that runs the sweep is the one where a
			// readable console matters most, and the run writes its own summary anyway. Core's
			// own per-texture loading bar opts out the same way.
			handle = globalThis.ui?.notifications?.info?.(message, { progress: true, console: false }) ?? null;
		} catch (err) {
			error("Progress notification: could not open a bar", err);
			handle = null;
		}
		paint();
	};

	// The timer can only fire once the job hands the thread back, which is what makePaintYielder
	// is for. A job that blocks straight through never shows a bar, correctly: it could not have
	// drawn one anyway.
	if (delayMs > 0) timer = setTimeout(open, delayMs);
	else open();

	return {
		update(progress = {}) {
			if (closed) return;
			if (progress.fraction !== undefined) fraction = progress.fraction;
			if (progress.detail !== undefined) detail = progress.detail;
			paint();
		},

		/** Finish the bar. `detail` replaces the trailing note for the moment it lingers. */
		close(finalDetail) {
			if (closed) return;
			closed = true;
			if (timer) { clearTimeout(timer); timer = null; }
			if (!handle) return;   // never opened — the fast run this delay exists for
			// Core dismisses a progress bar only on `pct === 1`, so one we can no longer drive
			// there has to be taken away outright. Otherwise the very failure that stopped the
			// updates is what pins the bar on screen.
			if (broken || !handle.update) { remove(); return; }
			fraction = 1;
			detail = finalDetail ?? "";
			paint();
			handle = null;
		},

		/**
		 * Take the bar away WITHOUT completing it, for a job that gave up. close() would drive
		 * it to 100% first, which is how core dismisses one, and a crashed run that signs off
		 * with a full bar is worse than no bar at all: the GM is told the thing succeeded.
		 */
		abandon() {
			if (closed) return;
			closed = true;
			if (timer) { clearTimeout(timer); timer = null; }
			remove();
		},
	};
}

// Exactly 1 matters: core tests `pct === 1` to decide the bar is finished, so a fraction that
// arrives as 1.0000000001 from a division would leave the notification up for good.
function clampFraction(value) {
	const n = Number(value);
	if (!Number.isFinite(n)) return 0;
	return Math.max(0, Math.min(1, n));
}
