import { describe, it, expect, vi } from "vitest";
import { orphanedWeaponsOfWar, droppedWeaponsOfWar, grandfatherWeaponsOfWar } from "../../module/migration/weapons-of-war-grandfather.js";

// Weapons of War now grants only the five weapons the improvement names. A character already
// carrying a crossbow was held up by the old, wider grant and by nothing else, so the narrowing
// would have taken it off their sheet without a word. This keeps what is already carried.

const CATALOG = [
	{ slug: "sword", special: true, specialCategory: "Weapons of War" },
	{ slug: "battleaxe", special: true, specialCategory: "Weapons of War" },
	{ slug: "crossbow", special: true, specialCategory: "Weapons of War" },
	{ slug: "composite-bow", special: true, specialCategory: "Weapons of War" },
	// Not in that section, and not special at all: neither is any business of this sweep.
	{ slug: "rune-laden-scales", special: true, specialCategory: "Armor" },
	{ slug: "spear", special: false, specialCategory: null },
];

const character = (id, inventory) => ({
	id,
	type: "character",
	flags: { "stonetop_pwd": { inventory } },
	update: vi.fn(async () => {}),
});

describe("which weapons the improvement stopped naming", () => {
	it("is the handout's section minus the grant, read off the catalog", () => {
		expect([...droppedWeaponsOfWar(CATALOG)]).toEqual(["crossbow", "composite-bow"]);
	});

	it("is empty for a catalog holding nothing outside the grant", () => {
		expect(droppedWeaponsOfWar(CATALOG.filter(i => i.slug !== "crossbow" && i.slug !== "composite-bow")).size).toBe(0);
		expect(droppedWeaponsOfWar(null).size).toBe(0);
	});
});

describe("which slugs a character is holding on the old grant alone", () => {
	const dropped = new Set(["crossbow", "composite-bow"]);

	it("is the ones they have CHECKED and nothing else vouches for", () => {
		expect(orphanedWeaponsOfWar({ checked: { crossbow: true, sword: true } }, dropped)).toEqual(["crossbow"]);
	});

	// An unchecked row is the offer, not a possession, and the offer is what the rules fix withdraws.
	it("leaves an unchecked row to go", () => {
		expect(orphanedWeaponsOfWar({ checked: { crossbow: false } }, dropped)).toEqual([]);
		expect(orphanedWeaponsOfWar({}, dropped)).toEqual([]);
	});

	it("passes over one the picker already vouches for, so a second run writes nothing", () => {
		const flags = { checked: { crossbow: true }, addedSpecial: ["crossbow"] };
		expect(orphanedWeaponsOfWar(flags, dropped)).toEqual([]);
	});
});

describe("the sweep", () => {
	const repo = catalog => ({ getAll: async () => catalog });

	it("writes the orphan into addedSpecial, keeping what was already there", async () => {
		const pim = character("pim", { checked: { crossbow: true, sword: true }, addedSpecial: ["rune-laden-scales"] });

		expect(await grandfatherWeaponsOfWar({ actors: [pim], repo: repo(CATALOG) })).toBe(1);
		expect(pim.update).toHaveBeenCalledWith({
			"flags.stonetop_pwd.inventory.addedSpecial": ["rune-laden-scales", "crossbow"],
		});
	});

	it("leaves alone a character with nothing orphaned, and anyone who is not a character", async () => {
		const pim = character("pim", { checked: { sword: true } });
		const crinwin = { id: "crin", type: "monster", flags: {}, update: vi.fn() };

		expect(await grandfatherWeaponsOfWar({ actors: [pim, crinwin], repo: repo(CATALOG) })).toBe(0);
		expect(pim.update).not.toHaveBeenCalled();
		expect(crinwin.update).not.toHaveBeenCalled();
	});

	// The narrowed grant is what ships, so the world this is run in second has nothing to find.
	it("reads no actor at all when the catalog holds nothing outside the grant", async () => {
		const pim = character("pim", { checked: { crossbow: true } });

		expect(await grandfatherWeaponsOfWar({ actors: [pim], repo: repo([]) })).toBe(0);
		expect(pim.update).not.toHaveBeenCalled();
	});
});
