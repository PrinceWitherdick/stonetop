import { describe, it, expect, vi } from "vitest";
import { CharacterPossessions } from "../../../module/actors/character/CharacterPossessions.js";

function makeFlags(store = {}) {
	return {
		getFlag: (key) => store[key] ?? null,
		setFlag: vi.fn(async (key, val) => { store[key] = val; }),
	};
}

describe("CharacterPossessions — top-level", () => {
	it("selected returns empty Set when nothing saved", () => {
		const cp = new CharacterPossessions(makeFlags());
		expect(cp.selected.size).toBe(0);
	});

	it("select adds slug to set", async () => {
		const store = {};
		const cp = new CharacterPossessions(makeFlags(store));
		await cp.select("apiary");
		expect(store.selected).toContain("apiary");
	});

	it("deselect removes slug from set", async () => {
		const store = { selected: ["apiary", "mastiffs"] };
		const cp = new CharacterPossessions(makeFlags(store));
		await cp.deselect("apiary");
		expect(store.selected).not.toContain("apiary");
		expect(store.selected).toContain("mastiffs");
	});

	it("setUses stores count under slug key", async () => {
		const store = {};
		const cp = new CharacterPossessions(makeFlags(store));
		await cp.setUses("sacred-pouch", 2);
		expect(store.uses).toEqual({ "sacred-pouch": 2 });
	});
});

describe("CharacterPossessions — subChoices", () => {
	it("subChoices returns empty object when nothing saved", () => {
		const cp = new CharacterPossessions(makeFlags());
		expect(cp.subChoices).toEqual({});
	});

	it("addSubChoice stores the choiceSlug in the possession's array", async () => {
		const store = {};
		const cp = new CharacterPossessions(makeFlags(store));
		await cp.addSubChoice("weapons-of-war", "sword");
		expect(store.subChoices).toEqual({ "weapons-of-war": ["sword"] });
	});

	it("addSubChoice is idempotent — calling twice does not duplicate", async () => {
		const store = {};
		const cp = new CharacterPossessions(makeFlags(store));
		await cp.addSubChoice("weapons-of-war", "sword");
		await cp.addSubChoice("weapons-of-war", "sword");
		expect(store.subChoices["weapons-of-war"]).toHaveLength(1);
	});

	it("addSubChoice appends to an existing array", async () => {
		const store = { subChoices: { "weapons-of-war": ["sword"] } };
		const cp = new CharacterPossessions(makeFlags(store));
		await cp.addSubChoice("weapons-of-war", "crossbow");
		expect(store.subChoices["weapons-of-war"]).toEqual(["sword", "crossbow"]);
	});

	it("removeSubChoice removes the choiceSlug from the array", async () => {
		const store = { subChoices: { "weapons-of-war": ["sword", "crossbow"] } };
		const cp = new CharacterPossessions(makeFlags(store));
		await cp.removeSubChoice("weapons-of-war", "sword");
		expect(store.subChoices["weapons-of-war"]).toEqual(["crossbow"]);
	});

	it("removeSubChoice is safe when slug not in array", async () => {
		const store = { subChoices: { "weapons-of-war": ["sword"] } };
		const cp = new CharacterPossessions(makeFlags(store));
		await cp.removeSubChoice("weapons-of-war", "battleaxe");
		expect(store.subChoices["weapons-of-war"]).toEqual(["sword"]);
	});

	it("setSubChoices replaces the whole array, dropping deselected picks", async () => {
		const store = { subChoices: { "weapons-of-war": ["sword", "battleaxe"] } };
		const cp = new CharacterPossessions(makeFlags(store));
		await cp.setSubChoices("weapons-of-war", ["sword", "long-spear"]);
		expect(store.subChoices["weapons-of-war"]).toEqual(["sword", "long-spear"]);
	});

	it("setSubChoices leaves other possessions' picks untouched", async () => {
		const store = { subChoices: { "weapons-of-war": ["sword"], "sacred-pouch": ["heirloom"] } };
		const cp = new CharacterPossessions(makeFlags(store));
		await cp.setSubChoices("weapons-of-war", []);
		expect(store.subChoices).toEqual({ "weapons-of-war": [], "sacred-pouch": ["heirloom"] });
	});
});

describe("CharacterPossessions — custom write-ins", () => {
	it("custom returns empty array when nothing saved", () => {
		const cp = new CharacterPossessions(makeFlags());
		expect(cp.custom).toEqual([]);
	});

	it("setCustom assigns custom-N slugs and drops blank labels", async () => {
		const store = {};
		const cp = new CharacterPossessions(makeFlags(store));
		await cp.setCustom(["A locket", "   ", "Grandfather's blade"]);
		expect(store.custom).toEqual([
			{ slug: "custom-1", label: "A locket" },
			{ slug: "custom-2", label: "Grandfather's blade" },
		]);
	});

	it("setCustom trims labels", async () => {
		const store = {};
		const cp = new CharacterPossessions(makeFlags(store));
		await cp.setCustom(["  A map  "]);
		expect(store.custom).toEqual([{ slug: "custom-1", label: "A map" }]);
	});

	it("setCustom replaces the whole list (idempotent across re-applies)", async () => {
		const store = { custom: [{ slug: "custom-1", label: "Old item" }] };
		const cp = new CharacterPossessions(makeFlags(store));
		await cp.setCustom(["Old item"]);
		expect(store.custom).toEqual([{ slug: "custom-1", label: "Old item" }]);
	});

	it("setCustom with no labels clears the list", async () => {
		const store = { custom: [{ slug: "custom-1", label: "Old item" }] };
		const cp = new CharacterPossessions(makeFlags(store));
		await cp.setCustom([]);
		expect(store.custom).toEqual([]);
	});

	it("removeCustom drops the matching slug", async () => {
		const store = { custom: [{ slug: "custom-1", label: "A" }, { slug: "custom-2", label: "B" }] };
		const cp = new CharacterPossessions(makeFlags(store));
		await cp.removeCustom("custom-1");
		expect(store.custom).toEqual([{ slug: "custom-2", label: "B" }]);
	});
});

describe("CharacterPossessions — choiceUses", () => {
	it("choiceUses returns empty object when nothing saved", () => {
		const cp = new CharacterPossessions(makeFlags());
		expect(cp.choiceUses).toEqual({});
	});

	it("setChoiceUses stores count under possessionSlug:choiceSlug key", async () => {
		const store = {};
		const cp = new CharacterPossessions(makeFlags(store));
		await cp.setChoiceUses("weapons-of-war", "crossbow", 1);
		expect(store.choiceUses).toEqual({ "weapons-of-war:crossbow": 1 });
	});

	it("setChoiceUses merges with existing choiceUses", async () => {
		const store = { choiceUses: { "weapons-of-war:sword": 0 } };
		const cp = new CharacterPossessions(makeFlags(store));
		await cp.setChoiceUses("weapons-of-war", "crossbow", 2);
		expect(store.choiceUses).toEqual({ "weapons-of-war:sword": 0, "weapons-of-war:crossbow": 2 });
	});
});
