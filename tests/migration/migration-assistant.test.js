import { describe, it, expect, vi, beforeEach } from "vitest";

// The claim under test: the flip can never run on a hosted server, because the two paths
// are separated by WHICH preflight they ask, not by which button the template drew.
const preflight = vi.fn();
const prepareWorld = vi.fn().mockResolvedValue({ documents: 3, settings: { created: 2, updated: 0 }, locations: 5 });
const flipAndShutDown = vi.fn().mockResolvedValue({ ok: true, stage: "done" });

vi.mock("../../module/migration/flip.js", () => ({ preflight: (...a) => preflight(...a) }));
vi.mock("../../module/migration/run.js", () => ({
	allTargets: vi.fn().mockResolvedValue([]),
	previewMigration: vi.fn().mockResolvedValue({ documents: 3, settings: 2, locations: 5, alreadyDone: 0 }),
	prepareWorld: (...a) => prepareWorld(...a),
	flipAndShutDown: (...a) => flipAndShutDown(...a)
}));

const { MigrationAssistant } = await import("../../module/migration/MigrationAssistant.js");

/** A bare instance: the prototype's logic without Foundry's Application machinery. */
function app() {
	const a = Object.create(MigrationAssistant.prototype);
	Object.assign(a, {
		_migrationState: "ready", _gate: null, _preview: null, _targets: null,
		_progress: null, _error: null, _prepared: null, _hosted: false,
		// Object.create skips StonetopDialog's constructor, so the renderThrottled bookkeeping
		// it would have installed has to be seeded here or the fixture stops modelling the
		// class. Not `_progressRenderedAt`: the assistant's own throttle was dropped in favour
		// of the base class's, and a fixture still carrying the dead field reads as coverage
		// of a code path that no longer exists.
		_throttledRenderAt: 0, _throttledRenderTimer: null
	});
	a.render = vi.fn().mockResolvedValue(undefined);
	return a;
}

const allowHostedArg = () => preflight.mock.calls.at(-1)[1].allowHosted;

describe("MigrationAssistant gate routing", () => {
	beforeEach(() => {
		globalThis.game = { user: { isGM: true } };
		preflight.mockReset().mockResolvedValue({ ok: true, blockers: [], warnings: [], hosted: true });
		prepareWorld.mockClear();
		flipAndShutDown.mockClear();
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	it("_prepare asks the relaxed gate and NEVER flips", async () => {
		const a = app();
		await a._prepare();

		expect(allowHostedArg()).toBe(true);
		expect(prepareWorld).toHaveBeenCalledTimes(1);
		expect(flipAndShutDown).not.toHaveBeenCalled();
		expect(a._migrationState).toBe("prepared");
		expect(a._prepared).toMatchObject({ documents: 3 });
	});

	it("_migrate asks the STRICT gate, so a hosted world is refused even in hosted mode", async () => {
		// The window believes it is hosted and the strict gate refuses, which is the state a
		// template bug would produce. The flip must not happen anyway.
		preflight.mockResolvedValue({ ok: false, blockers: ["hosted Foundry"], warnings: [], hosted: true });
		const a = app();
		a._hosted = true;
		await a._migrate();

		expect(allowHostedArg()).toBe(false);
		expect(prepareWorld).not.toHaveBeenCalled();
		expect(flipAndShutDown).not.toHaveBeenCalled();
		expect(a._migrationState).toBe("blocked");
	});

	it("_migrate still works normally on a self-hosted world", async () => {
		preflight.mockResolvedValue({ ok: true, blockers: [], warnings: [], hosted: false });
		const a = app();
		await a._migrate();

		expect(prepareWorld).toHaveBeenCalledTimes(1);
		expect(flipAndShutDown).toHaveBeenCalledTimes(1);
	});

	it("a blocked prepare renders the blockers and runs nothing", async () => {
		preflight.mockResolvedValue({ ok: false, blockers: ["2 people are logged in"], warnings: [], hosted: true });
		const a = app();
		await a._prepare();

		expect(prepareWorld).not.toHaveBeenCalled();
		expect(a._migrationState).toBe("blocked");
		expect(a._gate.blockers).toEqual(["2 people are logged in"]);
	});

	it("reports the prepared counts to the template with settings summed", async () => {
		prepareWorld.mockResolvedValueOnce({ documents: 7, settings: { created: 4, updated: 3 }, locations: 9 });
		const a = app();
		await a._prepare();
		expect(a._preparedCounts()).toEqual({ documents: 7, settings: 7, locations: 9 });
	});

	it("a failed prepare is reported as survivable, not as a half-migrated world", async () => {
		prepareWorld.mockRejectedValueOnce(new Error("pack would not load"));
		const a = app();
		await a._prepare();

		expect(a._migrationState).toBe("failed");
		expect(a._error).toMatch(/nothing was lost/i);
	});
});
