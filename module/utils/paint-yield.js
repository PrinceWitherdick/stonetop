/**
 * Let the browser draw a frame part-way through a long loop.
 *
 * A progress bar is worthless if the loop feeding it never gives up the main thread: the
 * window opens, the browser has no chance to lay it out, and the GM watches an empty rectangle
 * until the whole job is finished. That is not a hypothetical — the system-id sweep's two
 * passes are pure `toObject()` + string scanning over every document in the world, with no
 * awaits at all on a world that turns out to have nothing stale.
 *
 * `await` alone does NOT fix it. Awaiting an already-resolved promise queues a microtask, and
 * the renderer only runs after the microtask queue drains; it takes a real task (a timeout) to
 * hand the frame back. But a timeout per iteration is its own bug: browsers clamp nested
 * timeouts to ~4ms, so yielding on each of 450 targets would add nearly two seconds to a job
 * we are trying to make feel shorter.
 *
 * So this is TIME-sliced rather than count-sliced. Call it every iteration and it does nothing
 * until the loop has held the thread for `everyMs`, then yields once. Roughly ten frames a
 * second, at a cost measured in tens of milliseconds over a run, and it stays honest whether
 * an iteration is a 200-document journal or a single token.
 *
 * @param {object}  [options]
 * @param {number}  [options.everyMs=100]  how long the loop may hold the thread before yielding
 * @returns {() => Promise<boolean>}  resolves true when it actually yielded, false when it
 *                                    decided the loop had not run long enough yet
 */
const DEFAULT_SLICE_MS = 100;

export function makePaintYielder({ everyMs = DEFAULT_SLICE_MS } = {}) {
	let last = now();
	return async function yieldToPaint() {
		if (now() - last < everyMs) return false;
		await new Promise(resolve => setTimeout(resolve, 0));
		// Re-read AFTER the yield so the slice measures time the loop spent working, not time
		// it spent waiting for the frame. Otherwise a slow frame shortens the next slice and
		// the loop yields progressively more often for no reason.
		last = now();
		return true;
	};
}

// performance.now() is monotonic, so it cannot be dragged backwards by a clock adjustment
// mid-run (which would stall the yielder until real time caught up). Date.now() is the
// fallback for a bare test environment.
function now() {
	return globalThis.performance?.now?.() ?? Date.now();
}
