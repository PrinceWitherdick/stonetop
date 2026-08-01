import { describe, it, expect, vi } from "vitest";
import { progressSlice, progressSubSlice } from "../../module/utils/progress-slice.js";

// The arithmetic the seeds used to spell out three different ways. What matters is that a
// child's 0–1 lands inside its own slice and nowhere else, so a set of phases tiles the
// parent bar without a gap or an overlap.
describe("progressSlice", () => {
	it("maps a child's 0–1 onto its slice of the parent bar", () => {
		const parent = vi.fn();
		const report = progressSlice(parent, [0.55, 0.85]);

		report({ fraction: 0 });
		report({ fraction: 0.5 });
		report({ fraction: 1 });

		expect(parent.mock.calls.map(([p]) => p.fraction)).toEqual([0.55, 0.7, 0.85]);
	});

	it("passes the detail line through untouched", () => {
		const parent = vi.fn();
		progressSlice(parent, [0, 0.5])({ fraction: 0.5, detail: "Linking cross-references" });
		expect(parent).toHaveBeenCalledWith({ fraction: 0.25, detail: "Linking cross-references" });
	});

	it("treats a detail-only report as the start of the slice", () => {
		const parent = vi.fn();
		progressSlice(parent, [0.2, 0.4])({ detail: "Reading" });
		expect(parent).toHaveBeenCalledWith({ fraction: 0.2, detail: "Reading" });
	});

	it("hands back nothing when nobody is listening, so the child builds no progress objects", () => {
		expect(progressSlice(undefined, [0, 1])).toBeUndefined();
	});
});

describe("progressSubSlice", () => {
	it("splits a phase into equal consecutive slices that meet exactly", () => {
		const bounds = progressSubSlice([0, 0.55], 2);
		expect(bounds(0)).toEqual([0, 0.275]);
		expect(bounds(1)).toEqual([0.275, 0.55]);
	});

	it("survives an empty collection rather than dividing by zero", () => {
		expect(progressSubSlice([0, 1], 0)(0)).toEqual([0, 1]);
	});

	it("composes with progressSlice so a child of a child still lands in range", () => {
		const parent = vi.fn();
		const bounds = progressSubSlice([0, 0.55], 4);
		progressSlice(parent, bounds(3))({ fraction: 1 });
		expect(parent.mock.calls[0][0].fraction).toBeCloseTo(0.55, 10);
	});
});
