import { describe, it, expect } from "vitest";
import { ResourceDef } from "../../module/model/Resource.js";

describe("ResourceDef", () => {
	it("stores max, maxStat, title, labels from data", () => {
		const def = new ResourceDef({ max: 3, maxStat: null, title: "Ammo", labels: ["plenty", "low"] });
		expect(def.max).toBe(3);
		expect(def.maxStat).toBeNull();
		expect(def.title).toBe("Ammo");
		expect(def.labels).toEqual(["plenty", "low"]);
	});

	it("defaults max to null when absent", () => {
		expect(new ResourceDef({}).max).toBeNull();
	});

	it("defaults maxStat to null when absent", () => {
		expect(new ResourceDef({}).maxStat).toBeNull();
	});

	it("defaults title to null when absent", () => {
		expect(new ResourceDef({}).title).toBeNull();
	});

	it("defaults labels to [] when absent", () => {
		expect(new ResourceDef({}).labels).toEqual([]);
	});

	it("defaults spendOptions to [] and spendTooltip to null when absent", () => {
		const def = new ResourceDef({});
		expect(def.spendOptions).toEqual([]);
		expect(def.spendTooltip).toBeNull();
	});

	it("builds a spend tooltip from spendOptions", () => {
		const def = new ResourceDef({ title: "Nerve", spendOptions: ["Slip away", "Hold steady"] });
		expect(def.spendOptions).toEqual(["Slip away", "Hold steady"]);
		expect(def.spendTooltip).toBe("Spend 1 to:<br>• Slip away<br>• Hold steady");
	});

	it("coerces a non-array labels/spendOptions rather than throwing", () => {
		// `system.resource` is hand-authored and preserved verbatim across worlds, so a string
		// here is a shape that really arrives. It has to degrade to "no tooltip": this runs
		// inside buildSnapshot, and a throw takes the whole actor sheet down with it.
		for (const bad of ["Slip away", 42, {}, true]) {
			const def = new ResourceDef({ labels: bad, spendOptions: bad });
			expect(def.labels).toEqual([]);
			expect(def.spendOptions).toEqual([]);
			expect(def.spendTooltip).toBeNull();
		}
	});
});
