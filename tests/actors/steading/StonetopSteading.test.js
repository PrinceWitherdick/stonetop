import { describe, it, expect, vi } from "vitest";
import { StonetopSteading } from "../../../module/actors/steading/StonetopSteading.js";

function makeSteadingActor({ system = {}, steadingFlags = {} } = {}) {
	return {
		type: "stonetop",
		system,
		flags: { stonetop: { steading: steadingFlags } },
		getFlag: (scope, key) => {
			if (scope !== "stonetop_pwd" || key !== "steading") return null;
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
			"flags.stonetop_pwd.steading.system.attributes.prosperity.value": 2,
		});
	});

	it("marks improvements as earned when completed or requirement progress exists", async () => {
		const actor = makeSteadingActor({
			steadingFlags: {
				improvements: {
					standingWatch: { completed: true, r: [] },
					palisade: { completed: false, r: [true] },
				},
			},
		});
		const snapshot = await new StonetopSteading(actor).buildSnapshot();
		const bySlug = Object.fromEntries(snapshot.improvements.map(imp => [imp.slug, imp]));

		expect(bySlug.standingWatch.earned).toBe(true);
		expect(bySlug.palisade.earned).toBe(true);
		expect(bySlug.weaponsOfWar.earned).toBe(false);
	});

	it("includes dragged player characters in the sheet snapshot", async () => {
		const actor = makeSteadingActor({
			steadingFlags: {
				players: [{ uuid: "Actor.hero", name: "Wren", img: "wren.webp", checked: true }],
			},
		});

		const snapshot = await new StonetopSteading(actor).buildSnapshot();

		expect(snapshot.players).toEqual([
			{ uuid: "Actor.hero", name: "Wren", img: "wren.webp", checked: true,
			  traits: "", relations: "", notes: "", resolvedOccupation: "" },
		]);
	});
});
