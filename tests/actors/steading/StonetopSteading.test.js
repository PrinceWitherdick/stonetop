import { describe, it, expect, vi } from "vitest";
import { StonetopSteading } from "../../../module/actors/steading/StonetopSteading.js";

function makeSteadingActor({ system = {}, steadingFlags = {} } = {}) {
	return {
		type: "stonetop",
		system,
		getFlag: (scope, key) => {
			if (scope !== "stonetop" || key !== "steading") return null;
			return steadingFlags;
		},
		update: vi.fn(),
	};
}

describe("StonetopSteading", () => {
	it("prefers flag-backed track values when building the sheet snapshot", async () => {
		const actor = makeSteadingActor({
			system: { stats: { fortunes: { value: 1 } } },
			steadingFlags: { system: { stats: { fortunes: { value: 2 } } } },
		});
		const snapshot = await new StonetopSteading(actor).buildSnapshot();
		expect(snapshot.system.stats.fortunes.value).toBe(2);
	});

	it("persists track changes to both system data and the steading flag fallback", async () => {
		const actor = makeSteadingActor();
		await new StonetopSteading(actor).setSystemValue("attributes.prosperity.value", 2);
		expect(actor.update).toHaveBeenCalledWith({
			"system.attributes.prosperity.value": 2,
			"flags.stonetop.steading.system.attributes.prosperity.value": 2,
		});
	});
});
