import { describe, it, expect, vi } from "vitest";
import { heroByOwnership, grandfatherWouldBeHeroes } from "../../module/migration/would-be-hero-grandfather.js";
import { WBH_HERO_FLAG } from "../../module/actors/character/WouldBeHeroAsterisk.js";

// Crossing off "Would-be" now waits for the first USE of a starred move. A hero who was The Hero by
// OWNING one under an older release, and never flagged (a compendium drop, an import), stays The Hero.

const SCOPE = "stonetop-pwd";
const move = (name, { version = "1.6.5", asterisk = false } = {}) => ({
	type: "move", name, system: asterisk ? { asterisk: true } : {}, _stats: version ? { systemVersion: version } : {},
});
const hero = ({ slug = "the-would-be-hero", items = [], flagged = false } = {}) => {
	const flags = flagged ? { [WBH_HERO_FLAG]: true } : {};
	return {
		type: "character",
		system: { playbook: { slug } },
		items,
		getFlag: (scope, key) => (scope === SCOPE ? flags[key] : undefined),
		setFlag: vi.fn(async (_scope, key, value) => { flags[key] = value; }),
	};
};

describe("who was The Hero by ownership", () => {
	it("is a Would-Be Hero holding a starred move made under 1.6.5 or earlier", () => {
		expect(heroByOwnership(hero({ items: [move("Big Damn Hero")] }))).toBe(true);
		expect(heroByOwnership(hero({ items: [move("A Renamed Star", { asterisk: true })] }))).toBe(true);
		expect(heroByOwnership(hero({ items: [move("Undaunted", { version: null })] }))).toBe(true);
	});

	it("is not one whose starred move came since: that waits for its first use", () => {
		expect(heroByOwnership(hero({ items: [move("Big Damn Hero", { version: "1.6.6" })] }))).toBe(false);
	});

	it("is not one already flagged, another playbook, or a hero with no starred move", () => {
		expect(heroByOwnership(hero({ items: [move("Big Damn Hero")], flagged: true }))).toBe(false);
		expect(heroByOwnership(hero({ slug: "the-heavy", items: [move("Big Damn Hero")] }))).toBe(false);
		expect(heroByOwnership(hero({ items: [move("Potential for Greatness")] }))).toBe(false);
	});
});

describe("the sweep", () => {
	it("flags each one silently, and nothing twice", async () => {
		const old = hero({ items: [move("Voice of Experience")] });
		const fresh = hero({ items: [move("Voice of Experience", { version: "1.7.0" })] });
		expect(await grandfatherWouldBeHeroes({ actors: [old, fresh] })).toBe(1);
		expect(old.setFlag).toHaveBeenCalledWith(SCOPE, WBH_HERO_FLAG, true);
		expect(fresh.setFlag).not.toHaveBeenCalled();
		expect(await grandfatherWouldBeHeroes({ actors: [old] })).toBe(0);
	});
});
