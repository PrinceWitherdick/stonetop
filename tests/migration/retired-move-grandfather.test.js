import { describe, it, expect, vi } from "vitest";
import { unstampedReplacers, grandfatherRetiredMoves } from "../../module/migration/retired-move-grandfather.js";

// A replacing move reads its original as met only when the held copy RETIRED it (the `retiredMove`
// stamp). Copies taken before anything wrote that stamp are stamped once, so a Heavy who gave up
// Bulwark for A Mighty Rampart by hand does not wake up to "requirement not met".

const SCOPE = "stonetop-pwd";
const move = (id, name, { replaces = null, version = "1.6.5", flags = {} } = {}) => ({
	id, type: "move", name,
	system: replaces ? { replaces } : {},
	flags: { [SCOPE]: flags },
	_stats: version ? { systemVersion: version } : {},
});

describe("which replacing moves predate the stamp", () => {
	it("is a copy made under a release that never stamped, whose original is gone", () => {
		const rampart = move("r", "A Mighty Rampart", { replaces: "Bulwark" });
		expect(unstampedReplacers([rampart])).toEqual([rampart]);
	});

	it("counts a copy with no recorded version as old", () => {
		const rampart = move("r", "A Mighty Rampart", { replaces: "Bulwark", version: null });
		expect(unstampedReplacers([rampart])).toEqual([rampart]);
	});

	// The held-move refresh writes the copy, and the server restamps `_stats.systemVersion` on that
	// write; the refresh keeps the version it found in `madeUnder` first (made-under.js).
	it("reads a copy the refresh restamped by the release it kept aside", () => {
		const refreshed = move("r", "A Mighty Rampart", { replaces: "Bulwark", version: "1.7.2", flags: { madeUnder: "1.6.0" } });
		expect(unstampedReplacers([refreshed])).toEqual([refreshed]);
		const blank = move("r", "A Mighty Rampart", { replaces: "Bulwark", version: "1.7.2", flags: { madeUnder: "" } });
		expect(unstampedReplacers([blank])).toEqual([blank]);
		expect(unstampedReplacers([move("r", "A Mighty Rampart", { replaces: "Bulwark", version: "1.7.2", flags: { madeUnder: "1.7.0" } })])).toEqual([]);
	});

	it("leaves a copy made since: the rule is live for it", () => {
		expect(unstampedReplacers([move("r", "A Mighty Rampart", { replaces: "Bulwark", version: "1.6.6" })])).toEqual([]);
		expect(unstampedReplacers([move("r", "A Mighty Rampart", { replaces: "Bulwark", version: "1.6.10" })])).toEqual([]);
	});

	it("leaves one already stamped, and one whose original is still held, even switched off", () => {
		expect(unstampedReplacers([move("r", "A Mighty Rampart", { replaces: "Bulwark", flags: { retiredMove: "Bulwark" } })])).toEqual([]);
		expect(unstampedReplacers([
			move("r", "A Mighty Rampart", { replaces: "Bulwark" }),
			move("b", "Bulwark", { flags: { learned: false } }),
		])).toEqual([]);
	});

	it("ignores moves that replace nothing, and items that are not moves", () => {
		expect(unstampedReplacers([move("x", "Armored"), { id: "g", type: "gear", system: { replaces: "Bulwark" } }])).toEqual([]);
	});
});

describe("the sweep", () => {
	it("stamps each old replacer with the move it replaced, one write per character, and nothing twice", async () => {
		const items = [move("r", "A Mighty Rampart", { replaces: "Bulwark" })];
		const hero = {
			type: "character", items,
			updateEmbeddedDocuments: vi.fn(async (_type, updates) => {
				for (const u of updates) items.find(i => i.id === u._id).flags[SCOPE].retiredMove = u[`flags.${SCOPE}.retiredMove`];
			}),
		};
		const monster = { type: "monster", items: [move("m", "A Mighty Rampart", { replaces: "Bulwark" })], updateEmbeddedDocuments: vi.fn() };

		expect(await grandfatherRetiredMoves({ actors: [hero, monster] })).toBe(1);
		expect(hero.updateEmbeddedDocuments).toHaveBeenCalledWith("Item", [{ _id: "r", [`flags.${SCOPE}.retiredMove`]: "Bulwark" }]);
		expect(monster.updateEmbeddedDocuments).not.toHaveBeenCalled();

		expect(await grandfatherRetiredMoves({ actors: [hero] })).toBe(0);
	});
});
