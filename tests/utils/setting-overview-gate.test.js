import { describe, expect, it, beforeEach } from "vitest";
import {
	getSettingOverviewShown,
	markSettingOverviewShown,
	migrateFlatSettingOverviewShown,
} from "../../module/settings.js";

// The Setting Overview once-gate is a CLIENT setting, and client settings live in
// browser localStorage under `namespace.key` alone — with no world in the key. Stored
// as a bare boolean it therefore leaked across worlds: seeing the Overview in one world
// silently suppressed it in every other world opened in the same browser, including a
// brand-new one whose whole point is the fresh-start orientation. So it is keyed by
// world id, and these tests pin that down (mirroring walkthroughResume, which is
// world-keyed for exactly the same reason).

let store;

function useWorld(id) {
	global.game.world = { id };
}

beforeEach(() => {
	store = {};
	global.game = {
		world: { id: "world-a" },
		settings: {
			get: (_ns, key) => store[key],
			set: (_ns, key, value) => { store[key] = value; return Promise.resolve(value); },
		},
	};
	store.settingOverviewShown = {};
});

describe("Setting Overview once-gate", () => {
	it("starts unshown in a fresh world", () => {
		expect(getSettingOverviewShown()).toBe(false);
	});

	it("records the world it was shown in", async () => {
		await markSettingOverviewShown();
		expect(getSettingOverviewShown()).toBe(true);
		expect(store.settingOverviewShown).toEqual({ "world-a": true });
	});

	it("does NOT leak into a different world", async () => {
		await markSettingOverviewShown();
		useWorld("world-b");
		// The regression this whole shape exists to prevent: a second world in the same
		// browser must still offer its own orientation.
		expect(getSettingOverviewShown()).toBe(false);
	});

	it("keeps each world's record when a second world is marked", async () => {
		await markSettingOverviewShown();
		useWorld("world-b");
		await markSettingOverviewShown();
		expect(store.settingOverviewShown).toEqual({ "world-a": true, "world-b": true });
		useWorld("world-a");
		expect(getSettingOverviewShown()).toBe(true);
	});

	it("is idempotent — marking twice writes one entry", async () => {
		await markSettingOverviewShown();
		await markSettingOverviewShown();
		expect(store.settingOverviewShown).toEqual({ "world-a": true });
	});

	// The pre-world-keying value was a bare boolean. Two shapes reach us:
	//   • `true`  — what an old client wrote, and what a raw read would give.
	//   • Object(true) — what FOUNDRY actually hands back now the setting is declared
	//     `type: Object`: Setting#_castType constructs the declared type, so
	//     `new Object(true)` turns the legacy boolean into a Boolean WRAPPER. Miss this
	//     and `=== true` never matches, so the legacy value reads as "not shown".
	describe.each([
		["a bare boolean", () => true],
		["a Boolean wrapper (what Foundry's type cast produces)", () => Object(true)],
	])("legacy value: %s", (_label, legacy) => {
		beforeEach(() => { store.settingOverviewShown = legacy(); });

		it("still reads as shown before the migration runs", () => {
			// An upgrade mid-session must not re-pop the Overview on the very next load.
			expect(getSettingOverviewShown()).toBe(true);
		});

		it("migrates onto the current world, freeing every other world", async () => {
			await migrateFlatSettingOverviewShown();
			expect(store.settingOverviewShown).toEqual({ "world-a": true });
			expect(getSettingOverviewShown()).toBe(true);
			useWorld("world-b");
			expect(getSettingOverviewShown()).toBe(false);
		});

		it("marks cleanly without spreading the legacy value into the map", async () => {
			await markSettingOverviewShown();
			expect(store.settingOverviewShown).toEqual({ "world-a": true });
		});
	});

	it("migration is a no-op once already world-keyed", async () => {
		store.settingOverviewShown = { "world-z": true };
		await migrateFlatSettingOverviewShown();
		expect(store.settingOverviewShown).toEqual({ "world-z": true });
	});

	it("treats a legacy `false` as not shown", async () => {
		// Old clients wrote `false` before the Overview had been seen; that must not be
		// mistaken for a world map, nor latch the gate shut.
		store.settingOverviewShown = Object(false);
		expect(getSettingOverviewShown()).toBe(false);
		await migrateFlatSettingOverviewShown();
		// Nothing to migrate — the next mark writes a clean world map.
		await markSettingOverviewShown();
		expect(store.settingOverviewShown).toEqual({ "world-a": true });
	});
});
