import { describe, it, expect } from "vitest";
import { THINGS_BELOW, thingBelowPreset, presetFullName } from "../../module/data/things-below-presets.js";
import { THEMES } from "../../module/data/things-below-tables.js";

describe("THINGS_BELOW presets", () => {
	it("ships the six established Things Below with unique slugs", () => {
		expect(THINGS_BELOW).toHaveLength(6);
		const slugs = THINGS_BELOW.map(t => t.slug);
		expect(new Set(slugs).size).toBe(6);
		expect(slugs).toEqual(expect.arrayContaining(["daagon", "elrash-orra", "hectumel", "hlad", "lbinbozia", "yaawkara"]));
	});

	it("each preset carries a name, titles, an instinct, and moves", () => {
		for (const t of THINGS_BELOW) {
			expect(t.name).toBeTruthy();
			expect(Array.isArray(t.titles) && t.titles.length).toBeTruthy();
			expect(t.instinct).toBeTruthy();
			expect(Array.isArray(t.moves) && t.moves.length).toBeTruthy();
		}
	});

	it("every themeId resolves to a real THEMES row", () => {
		const ids = new Set(THEMES.map(t => t.id));
		for (const t of THINGS_BELOW) {
			expect(Array.isArray(t.themeIds)).toBe(true);
			expect(t.themeIds.length).toBeGreaterThanOrEqual(2);
			for (const id of t.themeIds) expect(ids.has(id), `${t.slug} theme ${id}`).toBe(true);
		}
	});

	it("thingBelowPreset resolves by slug and returns null otherwise", () => {
		expect(thingBelowPreset("hectumel").name).toBe("Hec'tumel");
		expect(thingBelowPreset("nope")).toBeNull();
		expect(thingBelowPreset()).toBeNull();
	});

	it("presetFullName joins name + titles", () => {
		expect(presetFullName(thingBelowPreset("daagon"))).toBe("Daagon, Who Waits in Deep Waters");
		expect(presetFullName(thingBelowPreset("hectumel"))).toBe("Hec'tumel, Pale Serpent, Slitherer in Darkness, Death Is Its Eyes");
		expect(presetFullName(null)).toBe("");
	});
});
