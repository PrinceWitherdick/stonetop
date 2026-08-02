import { describe, it, expect, vi, afterEach } from "vitest";
import { deletionEntry, getDragEventData, hasVideoExtension, setAppOption } from "../../module/utils/foundry-compat.js";

describe("deletionEntry", () => {
	afterEach(() => {
		// Restore the operator class that tests/setup.js installs, and clear the version stub.
		globalThis.foundry = { ...(globalThis.foundry ?? {}), data: { operators: { ForcedDeletion: class ForcedDeletion {} } } };
		delete globalThis.game;
	});

	it("uses a fresh ForcedDeletion INSTANCE on v14+ (key path unchanged)", () => {
		globalThis.game = { release: { generation: 14 } };
		const ForcedDeletion = foundry.data.operators.ForcedDeletion;
		const [key, val] = deletionEntry("flags.stonetop.checks.c1");
		expect(key).toBe("flags.stonetop.checks.c1");
		// Core removes a key only when the value is `instanceof ForcedDeletion` — the
		// class itself would NOT match, so we must hand back a `new` instance.
		expect(val).toBeInstanceOf(ForcedDeletion);
		// A nested key path is left intact for the instance form.
		const [key2, val2] = deletionEntry("flags.stonetop.arcana.minorDraw");
		expect(key2).toBe("flags.stonetop.arcana.minorDraw");
		expect(val2).toBeInstanceOf(ForcedDeletion);
	});

	it("uses the `-=leaf`/null form on v13 even though the operator class exists", () => {
		// v13 exposes ForcedDeletion but doesn't apply a nested one via update() — the key
		// would silently survive. Gate on the running generation, not the class's presence.
		globalThis.game = { release: { generation: 13 } };
		expect(foundry.data.operators.ForcedDeletion).toBeTypeOf("function");
		expect(deletionEntry("flags.stonetop.checks.c1")).toEqual(["flags.stonetop.checks.-=c1", null]);
		expect(deletionEntry("flags.stonetop.customFollowers.abc123")).toEqual(["flags.stonetop.customFollowers.-=abc123", null]);
	});

	it("falls back to the legacy `-=leaf`/null form on v12 (no sentinel)", () => {
		globalThis.game = { release: { generation: 12 } };
		foundry.data.operators = undefined;
		expect(deletionEntry("flags.stonetop.checks.c1")).toEqual(["flags.stonetop.checks.-=c1", null]);
		expect(deletionEntry("flags.stonetop.arcana.minorDraw")).toEqual(["flags.stonetop.arcana.-=minorDraw", null]);
	});
});

describe("getDragEventData", () => {
	afterEach(() => {
		delete globalThis.TextEditor;
		globalThis.foundry = { ...(globalThis.foundry ?? {}), data: { operators: { ForcedDeletion: class ForcedDeletion {} } } };
	});

	it("prefers the V13 namespaced TextEditor implementation", () => {
		const ev = {};
		const ns = vi.fn(() => ({ type: "Actor", uuid: "x" }));
		globalThis.foundry = { ...(globalThis.foundry ?? {}), applications: { ux: { TextEditor: { implementation: { getDragEventData: ns } } } } };
		globalThis.TextEditor = { getDragEventData: vi.fn(() => ({ type: "global" })) };

		expect(getDragEventData(ev)).toEqual({ type: "Actor", uuid: "x" });
		expect(ns).toHaveBeenCalledWith(ev);
		expect(globalThis.TextEditor.getDragEventData).not.toHaveBeenCalled();
	});

	it("falls back to the bare global when the namespaced impl is absent (v12)", () => {
		globalThis.foundry = { ...(globalThis.foundry ?? {}), applications: undefined };
		globalThis.TextEditor = { getDragEventData: vi.fn(() => ({ type: "global" })) };

		expect(getDragEventData({})).toEqual({ type: "global" });
	});
});

describe("hasVideoExtension", () => {
	afterEach(() => { delete globalThis.VideoHelper; });

	it("asks core's VideoHelper when one is reachable", () => {
		globalThis.VideoHelper = { hasVideoExtension: vi.fn(() => true) };
		expect(hasVideoExtension("wren.webp")).toBe(true);
		expect(globalThis.VideoHelper.hasVideoExtension).toHaveBeenCalledWith("wren.webp");
	});

	it("falls back to core's own extension list with no helper in reach", () => {
		expect(hasVideoExtension("wren.webm")).toBe(true);
		expect(hasVideoExtension("wren.mp4?v=2")).toBe(true);
		expect(hasVideoExtension("wren.webp")).toBe(false);
		expect(hasVideoExtension(null)).toBe(false);
	});
});

describe("setAppOption", () => {
	it("swaps in a fresh frozen copy for an ApplicationV2's frozen options", () => {
		const app = { options: Object.freeze({ src: "old.webp", window: { title: "Wren" } }) };

		setAppOption(app, "src", "new.webp");

		expect(app.options.src).toBe("new.webp");
		// The rest of the configuration survives the swap, and the copy stays frozen.
		expect(app.options.window.title).toBe("Wren");
		expect(Object.isFrozen(app.options)).toBe(true);
	});

	it("writes an AppV1 window's mutable options in place", () => {
		const options = { src: "old.webp" };
		const app = { options };

		setAppOption(app, "src", "new.webp");

		expect(app.options).toBe(options);
		expect(options.src).toBe("new.webp");
	});

	it("no-ops on an app with no options yet", () => {
		expect(() => setAppOption({}, "src", "new.webp")).not.toThrow();
		expect(() => setAppOption(null, "src", "new.webp")).not.toThrow();
	});
});
