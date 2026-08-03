import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { openProgressNotification } from "../../module/utils/progress-notification.js";

// The bar for a long job that is nobody's dialog. Two of its behaviours are easy to get wrong
// against Foundry's notification API and invisible until you are watching a real world load:
// a job that turns out to be instant must never flash a bar, and a finished one has to land on
// EXACTLY 1 or core leaves the notification up for the rest of the session.

let opened;

function fakeNotifications() {
	opened = [];
	return {
		// Core only hands back a live handle when progress was asked for.
		info: vi.fn((message, { progress } = {}) => {
			if (!progress) return undefined;
			const handle = { message, update: vi.fn(), remove: vi.fn() };
			opened.push(handle);
			return handle;
		}),
	};
}

beforeEach(() => {
	vi.useFakeTimers();
	globalThis.ui = { notifications: fakeNotifications() };
});

afterEach(() => {
	vi.useRealTimers();
	delete globalThis.ui;
});

/** The core call a paint with a trailing note turns into. Detail goes through core's escaping. */
const painted = (pct, detail) => (detail === undefined
	? { pct, message: "Working" }
	: { pct, message: "{label} ({detail})", format: { label: "Working", detail }, escape: true });

describe("openProgressNotification", () => {
	it("shows nothing at all for a job that finishes inside the delay", () => {
		const bar = openProgressNotification("Working");
		bar.update({ fraction: 0.4 });
		bar.close();
		vi.advanceTimersByTime(5000);

		expect(opened).toHaveLength(0);
		expect(globalThis.ui.notifications.info).not.toHaveBeenCalled();
	});

	it("opens once the job outlasts the delay, at the progress already made", () => {
		const bar = openProgressNotification("Working", { delayMs: 400 });
		bar.update({ fraction: 0.7, detail: "most of the way" });
		expect(opened).toHaveLength(0);

		vi.advanceTimersByTime(400);

		expect(opened).toHaveLength(1);
		// Not 0: a bar that appears late and then rewinds to the start reads as a job restarting.
		expect(opened[0].update).toHaveBeenCalledWith(painted(0.7, "most of the way"));
	});

	it("opens immediately when the caller asks for no delay", () => {
		openProgressNotification("Working", { delayMs: 0 });
		expect(opened).toHaveLength(1);
	});

	// This bar ticks once per document target. Core logs a line per tick unless told not to,
	// and the load that runs the sweep is the one where a readable console matters most.
	it("opens quietly, so a per-item job does not flood the console", () => {
		openProgressNotification("Working", { delayMs: 0 });

		expect(globalThis.ui.notifications.info)
			.toHaveBeenCalledWith("Working", expect.objectContaining({ progress: true, console: false }));
	});

	// `detail` is not ours: the sweep's detail is a document label the GM typed, and it
	// routinely contains ">" by construction. Core escapes format values; it does not escape
	// a string we interpolated ourselves.
	it("hands the trailing note to core to escape rather than splicing it in", () => {
		const bar = openProgressNotification("Working", { delayMs: 0 });
		bar.update({ fraction: 0.5, detail: "Scene <b>A</b> > Tokens" });

		expect(opened[0].update).toHaveBeenLastCalledWith({
			pct: 0.5,
			message: "{label} ({detail})",
			format: { label: "Working", detail: "Scene <b>A</b> > Tokens" },
			escape: true,
		});
	});

	it("lands on exactly 1 when closed, which is what dismisses it", () => {
		const bar = openProgressNotification("Working", { delayMs: 0 });
		bar.update({ fraction: 0.9 });
		bar.close("all done");

		expect(opened[0].update).toHaveBeenLastCalledWith(painted(1, "all done"));
	});

	// (index + 1) / length arithmetic can land a hair over 1, and core compares pct === 1.
	it("clamps a fraction that overshoots, so the bar can still finish", () => {
		const bar = openProgressNotification("Working", { delayMs: 0 });
		bar.update({ fraction: 1.0000000000000002 });

		expect(opened[0].update).toHaveBeenLastCalledWith(painted(1));
	});

	it("ignores a garbage fraction rather than passing NaN to core", () => {
		const bar = openProgressNotification("Working", { delayMs: 0 });
		bar.update({ fraction: undefined, detail: "thinking" });
		bar.update({ fraction: Number.NaN });

		expect(opened[0].update).toHaveBeenLastCalledWith(painted(0, "thinking"));
	});

	// A crashed job that signs off with a full bar tells the GM the opposite of the truth.
	it("abandon() takes the bar away without completing it", () => {
		const bar = openProgressNotification("Working", { delayMs: 0 });
		bar.update({ fraction: 0.4 });
		opened[0].update.mockClear();
		bar.abandon();

		expect(opened[0].remove).toHaveBeenCalled();
		expect(opened[0].update).not.toHaveBeenCalled();
	});

	it("abandon() before the bar was ever shown cancels the pending open", () => {
		const bar = openProgressNotification("Working", { delayMs: 400 });
		bar.abandon();
		vi.advanceTimersByTime(5000);

		expect(opened).toHaveLength(0);
	});

	it("goes quiet after close, so a straggling report cannot reopen the bar", () => {
		const bar = openProgressNotification("Working", { delayMs: 0 });
		bar.close();
		opened[0].update.mockClear();
		bar.update({ fraction: 0.5 });

		expect(opened[0].update).not.toHaveBeenCalled();
		expect(opened).toHaveLength(1);
	});

	it("survives a world with no notifications at all", () => {
		delete globalThis.ui;
		const bar = openProgressNotification("Working", { delayMs: 0 });

		expect(() => { bar.update({ fraction: 0.5 }); bar.close(); }).not.toThrow();
	});

	// A core API that moves under us must cost the job its bar, not its run.
	it("stops driving the bar instead of throwing when core's update rejects the call", () => {
		const bar = openProgressNotification("Working", { delayMs: 0 });
		opened[0].update.mockImplementation(() => { throw new Error("moved"); });
		vi.spyOn(console, "error").mockImplementation(() => {});

		expect(() => bar.update({ fraction: 0.5 })).not.toThrow();
		opened[0].update.mockClear();
		bar.update({ fraction: 0.6 });
		expect(opened[0].update).not.toHaveBeenCalled();
	});

	// The bar core will never time out on its own. Once update() has thrown there is no way to
	// drive it to the exact 1 that dismisses it, so the only honest ending is to take it away —
	// and that needs the handle the failure is tempting to throw away.
	it("removes a bar it can no longer drive, rather than leaving it up for the session", () => {
		const bar = openProgressNotification("Working", { delayMs: 0 });
		opened[0].update.mockImplementation(() => { throw new Error("moved"); });
		vi.spyOn(console, "error").mockImplementation(() => {});
		bar.update({ fraction: 0.5 });

		bar.close("all done");
		expect(opened[0].remove).toHaveBeenCalled();
	});

	it("removes a broken bar on abandon() too", () => {
		const bar = openProgressNotification("Working", { delayMs: 0 });
		opened[0].update.mockImplementation(() => { throw new Error("moved"); });
		vi.spyOn(console, "error").mockImplementation(() => {});
		bar.update({ fraction: 0.5 });

		bar.abandon();
		expect(opened[0].remove).toHaveBeenCalled();
	});

	it("still finishes a healthy bar the way core dismisses one, rather than removing it", () => {
		const bar = openProgressNotification("Working", { delayMs: 0 });
		bar.update({ fraction: 0.5 });
		bar.close();

		expect(opened[0].update).toHaveBeenLastCalledWith(painted(1));
		expect(opened[0].remove).not.toHaveBeenCalled();
	});
});
