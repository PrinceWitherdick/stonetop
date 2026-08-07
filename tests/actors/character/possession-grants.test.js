import { describe, it, expect } from "vitest";
import {
	grantsToCreate,
	grantAdoptionKeys,
	grantSourceMap,
	itemGrantKey,
} from "../../../module/actors/character/possession-grants.js";

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

// The rule for recognising UNTAGGED legacy gear — gear from before MoveModel declared
// `sourcePossession`, which therefore names no owner. Shared by the gear tab (which renders it
// inside a possession's card), the select path (which declines to duplicate it) and the deselect
// path (which DELETES it), so its edges are exactly where a player's own write-in is safe.
describe("grantAdoptionKeys", () => {
	const BURGLARS_KIT = {
		slug: "burglars-kit",
		grantsItems: [
			{ name: "Grappling hook", column: "regular", weight: 1 },
			{ name: "Lockpicks", column: "small" },
		],
	};
	const CARPENTERS = {
		slug: "carpenters-tools",
		grantsItems: [{ name: "Firkins", column: "regular", weight: 1 }, { name: "Nails", column: "small" }],
	};
	const DISTILLERY = {
		slug: "distillery",
		grantsItems: [
			{ name: "Firkins", column: "regular", weight: 1 },
			// The shape that first broke the collision guard: sourceKey repeated in aliases.
			{
				name: "Skins of fine whisky",
				sourceKey: "Fine whisky (advantage to Persuade)",
				aliases: ["Fine whisky (advantage to Persuade)", "Fine whisky"],
				column: "small",
			},
		],
	};

	const item = (name, inventoryColumn) => ({ name, system: { inventoryColumn } });

	it("keys a grant by the column it lands in as well as its name", () => {
		const keys = grantAdoptionKeys("burglars-kit", [BURGLARS_KIT]);
		expect([...keys.keys()].sort()).toEqual(["regular:Grappling hook", "small:Lockpicks"]);
	});

	// The one that let a deselect delete a player's own gear: a hand-written SMALL "Grappling
	// hook" is not the Burglar's Kit's ◇ regular one, however alike they read.
	it("will not claim a write-in sitting in the other column", () => {
		const keys = grantAdoptionKeys("burglars-kit", [BURGLARS_KIT]);
		expect(keys.has(itemGrantKey(item("Grappling hook", "regular")))).toBe(true);
		expect(keys.has(itemGrantKey(item("Grappling hook", "small")))).toBe(false);
	});

	// Two possessions granting the same thing cannot both own one untagged item, and guessing
	// between them is how an item gets rendered under one and deleted by the other.
	it("lets neither possession claim a name they both grant", () => {
		const mine   = grantAdoptionKeys("distillery", [CARPENTERS, DISTILLERY]);
		const theirs = grantAdoptionKeys("carpenters-tools", [CARPENTERS, DISTILLERY]);
		expect(mine.has("regular:Firkins")).toBe(false);
		expect(theirs.has("regular:Firkins")).toBe(false);
		// Only the contested name is dropped — the rest of each possession still claims its own.
		expect(mine.has("small:Fine whisky")).toBe(true);
		expect(theirs.has("small:Nails")).toBe(true);
	});

	// A possession the character does not hold contests nothing, so the same name is claimable
	// again the moment the rival is deselected.
	it("only counts possessions that are actually held", () => {
		expect(grantAdoptionKeys("distillery", [DISTILLERY]).has("regular:Firkins")).toBe(true);
	});

	it("answers every alias of a grant with that same grant", () => {
		const keys = grantAdoptionKeys("distillery", [DISTILLERY]);
		for (const name of ["Skins of fine whisky", "Fine whisky (advantage to Persuade)", "Fine whisky"]) {
			expect(keys.get(`small:${name}`)?.sourceKey).toBe("Fine whisky (advantage to Persuade)");
		}
	});

	it("tolerates possessions with no grants at all", () => {
		expect(grantAdoptionKeys("mastiffs", [{ slug: "mastiffs" }]).size).toBe(0);
		expect(grantAdoptionKeys("mastiffs", []).size).toBe(0);
		expect(grantAdoptionKeys("mastiffs").size).toBe(0);
	});

	it("names the owner of each uncontested key, and null for a contested one", () => {
		const sources = grantSourceMap([CARPENTERS, DISTILLERY]);
		expect(sources.get("small:Nails").slug).toBe("carpenters-tools");
		expect(sources.get("regular:Firkins")).toBeNull();
	});
});

describe("itemGrantKey", () => {
	it("files anything that is not the regular column as small, matching the grant side", () => {
		expect(itemGrantKey({ name: "Nails", system: { inventoryColumn: "regular" } })).toBe("regular:Nails");
		expect(itemGrantKey({ name: "Nails", system: { inventoryColumn: "small" } })).toBe("small:Nails");
		expect(itemGrantKey({ name: "Nails", system: {} })).toBe("small:Nails");
		expect(itemGrantKey({ name: "Nails" })).toBe("small:Nails");
	});
});
