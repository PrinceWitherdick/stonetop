import { describe, it, expect, vi, afterEach } from "vitest";

// ARRIVING AT A STEP, AND HOW. StepperDialog tells `_onStepEntered` each time the reader moves onto a
// different step, and whether it was Next, Back or the table of contents. The Expedition walkthrough
// leans on the difference: Next is the party setting out and coming home, and writes the trip onto
// the timeline, where a jump or a Back is only reading the walkthrough. A reload's restore is not the
// reader moving at all, and must not count as arriving.

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock("../../module/utils/logger.js", () => ({ warn, info: () => {}, error: () => {} }));
vi.mock("../../module/dialogs/walkthrough-resume.js", () => ({
	getWalkthroughResume:    () => ({ stepKey: "c" }),
	patchWalkthroughResume:  () => {},
	saveWalkthroughPosition: () => {},
}));

const { StepperDialog } = await import("../../module/dialogs/StepperDialog.js");

function stepper() {
	const d = Object.create(StepperDialog.prototype);
	d._step = 0;
	Object.defineProperty(d, "_steps", { get: () => [{ key: "a" }, { key: "b" }, { key: "c" }] });
	d.render = vi.fn();
	d._onStepEntered = vi.fn();
	return d;
}

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

afterEach(() => vi.restoreAllMocks());

describe("the arrival hook", () => {
	it("hears Next, with the step it left", () => {
		const d = stepper();
		d._advance();
		expect(d._onStepEntered).toHaveBeenCalledWith("b", { from: "a", via: "next" });
	});

	it("hears Back and a table-of-contents jump, each named for what it was", () => {
		const d = stepper();
		d._goTo(2);
		d._retreat();
		expect(d._onStepEntered.mock.calls).toEqual([
			["c", { from: "a", via: "jump" }],
			["b", { from: "c", via: "back" }],
		]);
	});

	// Next on the last step, Back on the first and a click on the step already showing go nowhere.
	it("hears nothing from a move that went nowhere", () => {
		const d = stepper();
		d._retreat();
		d._goTo(0);
		d._step = 2;
		d._advance();
		expect(d._onStepEntered).not.toHaveBeenCalled();
	});

	it("is told after the redraw is asked for, with the cursor already moved", () => {
		const d = stepper();
		d._onStepEntered = vi.fn(() => {
			expect(d._step).toBe(1);
			expect(d.render).toHaveBeenCalledWith(false);
		});
		d._advance();
		expect(d._onStepEntered).toHaveBeenCalledOnce();
	});

	// A reload puts the reader back where they were; nothing happened on the way.
	it("hears nothing from a reload's restore", () => {
		const d = stepper();
		Object.defineProperty(d, "_resumeKey", { get: () => "test" });
		d._restoreStep();
		expect(d._step).toBe(2);
		expect(d._onStepEntered).not.toHaveBeenCalled();
	});

	// The hook is never waited on, so a failure in it has nowhere to go but the console.
	it("warns about a hook that fails, rather than leaving it unhandled", async () => {
		const d = stepper();
		d._onStepEntered = vi.fn(async () => { throw new Error("no"); });
		d._advance();
		await tick();
		expect(warn).toHaveBeenCalled();
		expect(d._step).toBe(1);
	});
});
