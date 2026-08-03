import { describe, it, expect, afterEach, vi } from "vitest";
import { makePaintYielder } from "../../module/utils/paint-yield.js";

// Time-sliced rather than count-sliced, and that is the whole point: a loop over a few hundred
// documents that yielded on every iteration would pay the browser's ~4ms nested-timeout clamp
// each time and end up SLOWER than the unnarrated version it replaced.

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

/** Drive the clock the yielder reads, so a test never depends on how fast the machine is. */
function fakeClock(startMs = 0) {
	let time = startMs;
	vi.spyOn(globalThis.performance, "now").mockImplementation(() => time);
	return { advance: (ms) => { time += ms; } };
}

describe("makePaintYielder", () => {
	it("does nothing while the loop is still inside its slice", async () => {
		const clock = fakeClock();
		const yieldToPaint = makePaintYielder({ everyMs: 100 });

		clock.advance(60);
		await expect(yieldToPaint()).resolves.toBe(false);
		clock.advance(30);
		await expect(yieldToPaint()).resolves.toBe(false);
	});

	it("yields once the loop has held the thread for a whole slice", async () => {
		const clock = fakeClock();
		const yieldToPaint = makePaintYielder({ everyMs: 100 });

		clock.advance(100);
		await expect(yieldToPaint()).resolves.toBe(true);
	});

	it("starts a fresh slice after each yield", async () => {
		const clock = fakeClock();
		const yieldToPaint = makePaintYielder({ everyMs: 100 });

		clock.advance(100);
		await yieldToPaint();
		clock.advance(50);
		await expect(yieldToPaint()).resolves.toBe(false);
		clock.advance(50);
		await expect(yieldToPaint()).resolves.toBe(true);
	});

	// The measurement has to exclude the time spent waiting for the frame. If it did not, one
	// slow frame would shorten every slice after it and the loop would yield more and more
	// often for no reason.
	it("does not count the time it spent yielding against the next slice", async () => {
		let time = 0;
		vi.spyOn(globalThis.performance, "now").mockImplementation(() => time);
		const yieldToPaint = makePaintYielder({ everyMs: 100 });

		time = 100;
		// A frame that takes 500ms of wall clock while the yield is in flight.
		const inFlight = yieldToPaint();
		time = 600;
		await inFlight;

		time = 650; // only 50ms of actual loop work since the yield returned
		await expect(yieldToPaint()).resolves.toBe(false);
	});

	// A microtask is not enough: the renderer only runs after the microtask queue drains, so
	// the yield has to be a real task or the bar it is feeding never draws a frame.
	it("hands the thread back through a real task, not just a microtask", async () => {
		fakeClock();
		const timeout = vi.spyOn(globalThis, "setTimeout");
		const yieldToPaint = makePaintYielder({ everyMs: 0 });

		await yieldToPaint();

		expect(timeout).toHaveBeenCalled();
	});
});
