import { describe, it, expect } from "vitest";
import { circleLabelsFromLines, circleLabelsToLines, buildUsesResource } from "../../module/utils/gear-note.js";
import {
	buildInventoryItemData, inventoryItemFormValues, inventoryItemUpdateData, readInventoryItemData,
} from "../../module/utils/inventory-item-data.js";

// A track's labels are positional (label i follows circle i), which is why a blank line in the
// authoring box has to survive: it is a circle with nothing after it.
describe("circleLabelsFromLines", () => {
	it("keeps blank lines between labels and drops the trailing ones", () => {
		expect(circleLabelsFromLines("\n\n\n\n\n\n\n\nuses, Value 2\n\n")).toEqual(["", "", "", "", "", "", "", "", "uses, Value 2"]);
		expect(circleLabelsFromLines("  low \r\nout")).toEqual(["low", "out"]);
		expect(circleLabelsFromLines("")).toEqual([]);
		expect(circleLabelsFromLines(null)).toEqual([]);
	});

	it("round-trips through the form text", () => {
		const labels = ["", "", "", "running low", "out"];
		expect(circleLabelsFromLines(circleLabelsToLines(labels))).toEqual(labels);
		expect(circleLabelsToLines(["a", "", ""])).toBe("a");
	});
});

describe("authored gear: circle labels and the track-first layout", () => {
	const lantern = {
		name: "Bullseye lantern", column: "regular", weight: 1, note: "<em>near</em>",
		resource: { max: 5, title: "Oil", labels: ["", "", "", "running low", "out"] },
		resourceFirst: true,
	};

	it("stores resourceFirst only for gear that has a track", () => {
		expect(buildInventoryItemData(lantern).system.resourceFirst).toBe(true);
		expect(buildInventoryItemData({ ...lantern, resource: null }).system.resourceFirst).toBeUndefined();
	});

	it("reads resourceFirst from the catalog's flags or an authored item's system", () => {
		expect(readInventoryItemData({ flags: { stonetop: { resourceFirst: true } }, system: {} }).resourceFirst).toBe(true);
		expect(readInventoryItemData(buildInventoryItemData(lantern)).resourceFirst).toBe(true);
		expect(readInventoryItemData({ system: {} }).resourceFirst).toBe(false);
	});

	it("opens the form on the labels as lines, and on the Ammunition box for the ammo pair", () => {
		const v = inventoryItemFormValues(buildInventoryItemData(lantern));
		expect(v.usesLabels).toBe("\n\n\nrunning low\nout");
		expect(v.isAmmo).toBe(false);
		expect(v.resourceFirst).toBe(true);
		const bow = inventoryItemFormValues(buildInventoryItemData({ name: "Bow", resource: buildUsesResource(3, true) }));
		expect(bow.isAmmo).toBe(true);
		expect(bow.usesLabels).toBe("");
	});

	it("clears resourceFirst on an edit that leaves it off, and mirrors it into the catalog's flags", () => {
		const catalogItem = { system: { moveType: "inventory" }, flags: { stonetop: { resourceFirst: true, resource: lantern.resource } } };
		const update = inventoryItemUpdateData(catalogItem, { ...lantern, resourceFirst: false });
		expect(update.system.resourceFirst).toBe(false);
		expect(update["flags.stonetop.resourceFirst"]).toBe(false);
	});
});
