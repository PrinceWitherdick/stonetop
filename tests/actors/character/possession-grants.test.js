import { describe, it, expect } from "vitest";
import { grantsToCreate } from "../../../module/actors/character/possession-grants.js";

const APIARY = [
	{ name: "Beeswax", column: "small" },
	{ name: "Honey", column: "small" },
	{ name: "Bee smokers", column: "regular", weight: 1 },
	{ name: "Hat & veils", column: "regular", weight: 1 },
];

describe("grantsToCreate", () => {
	it("maps small items to the small column with no weight", () => {
		const out = grantsToCreate([{ name: "Honey", column: "small" }], new Set(), { slug: "apiary", sourceLabel: "Apiary" });
		expect(out).toEqual([{
			name: "Honey",
			type: "move",
			system: {
				moveType: "inventory-custom",
				inventoryColumn: "small",
				sourcePossession: "apiary",
				sourceKey: "Honey",
				sourceLabel: "Apiary",
			},
		}]);
		expect(out[0].system).not.toHaveProperty("weight");
	});

	it("maps regular items to the regular column carrying their weight", () => {
		const [item] = grantsToCreate([{ name: "Bee smokers", column: "regular", weight: 2 }], new Set(), { slug: "apiary", sourceLabel: "Apiary" });
		expect(item.system.inventoryColumn).toBe("regular");
		expect(item.system.weight).toBe(2);
	});

	it("defaults a regular item's weight to 1 ◇ when unspecified", () => {
		const [item] = grantsToCreate([{ name: "Notebook", column: "regular" }], new Set(), { slug: "scribes-tools" });
		expect(item.system.weight).toBe(1);
	});

	it("skips items already present (matched by sourceKey)", () => {
		const out = grantsToCreate(APIARY, new Set(["Beeswax", "Bee smokers"]), { slug: "apiary", sourceLabel: "Apiary" });
		expect(out.map(i => i.name)).toEqual(["Honey", "Hat & veils"]);
	});

	it("returns nothing when every item is already present", () => {
		const out = grantsToCreate(APIARY, new Set(["Beeswax", "Honey", "Bee smokers", "Hat & veils"]), { slug: "apiary" });
		expect(out).toEqual([]);
	});

	it("ignores entries without a name and tolerates an empty/undefined list", () => {
		expect(grantsToCreate([{ column: "small" }], new Set(), { slug: "x" })).toEqual([]);
		expect(grantsToCreate(undefined, new Set(), { slug: "x" })).toEqual([]);
		expect(grantsToCreate()).toEqual([]);
	});

	it("carries a null sourceLabel through when none is supplied", () => {
		const [item] = grantsToCreate([{ name: "Honey", column: "small" }], new Set(), { slug: "apiary" });
		expect(item.system.sourceLabel).toBeNull();
	});

	it("passes a worn item's armor shape through to system.armor", () => {
		const [item] = grantsToCreate(
			[{ name: "Boiled leather cuirass (1 armor)", column: "regular", weight: 1, armor: { modifier: 1 } }],
			new Set(), { slug: "tannery", sourceLabel: "Tannery" },
		);
		expect(item.system.armor).toEqual({ modifier: 1 });
	});

	it("leaves armor off items that don't grant any", () => {
		const [item] = grantsToCreate([{ name: "Lime", column: "small" }], new Set(), { slug: "tannery" });
		expect(item.system).not.toHaveProperty("armor");
	});
});
