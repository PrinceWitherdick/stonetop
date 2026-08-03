import { afterEach, describe, expect, it } from "vitest";
import { usedPersonPortraits } from "../../../module/actors/steading/steading-people.js";

const ART = "worlds/mine/stonetop-art/people";

/** A steading stub shaped like the flag read the helper does. */
function steadingWith(flags) {
	return { getFlag: (scope, key) => (scope === "stonetop_pwd" && key === "steading" ? flags : undefined) };
}

/** Stand in for game.actors, which actor-backed rows are resolved through. */
function withActors(actors) {
	global.game.actors = {
		get: id => actors.find(a => a.id === id) ?? null,
		find: fn => actors.find(fn) ?? null,
	};
}

afterEach(() => { delete global.game.actors; });

describe("usedPersonPortraits", () => {
	it("reports a legacy text row's own portrait, named by the row", () => {
		const steading = steadingWith({ residents: [{ name: "Aderyn", img: `${ART}/a.webp` }] });
		expect(usedPersonPortraits(steading)).toEqual({ [`${ART}/a.webp`]: "Aderyn" });
	});

	it("reads an actor-backed row's portrait off the NPC, not the row", () => {
		withActors([{ id: "npc1", uuid: "Actor.npc1", name: "Bryn", img: `${ART}/b.webp` }]);
		const steading = steadingWith({ residents: [{ id: "npc1", name: "stale cached name", img: `${ART}/stale.webp` }] });
		expect(usedPersonPortraits(steading)).toEqual({ [`${ART}/b.webp`]: "Bryn" });
	});

	it("resolves an actor row that only carries a uuid", () => {
		withActors([{ id: "npc2", uuid: "Actor.npc2", name: "Maren", img: `${ART}/m.webp` }]);
		const steading = steadingWith({ neighbors: [{ uuid: "Actor.npc2" }] });
		expect(usedPersonPortraits(steading)).toEqual({ [`${ART}/m.webp`]: "Maren" });
	});

	it("covers residents and neighbors together", () => {
		const steading = steadingWith({
			residents: [{ name: "Aderyn", img: `${ART}/a.webp` }],
			neighbors: [{ name: "Tarn", img: `${ART}/t.webp` }],
		});
		expect(usedPersonPortraits(steading)).toEqual({
			[`${ART}/a.webp`]: "Aderyn",
			[`${ART}/t.webp`]: "Tarn",
		});
	});

	it("leaves out the row being edited, so a member's own portrait is not 'taken'", () => {
		const steading = steadingWith({
			residents: [{ name: "Aderyn", img: `${ART}/a.webp` }, { name: "Gethin", img: `${ART}/g.webp` }],
		});
		const used = usedPersonPortraits(steading, { list: "residents", index: 0 });
		expect(used).toEqual({ [`${ART}/g.webp`]: "Gethin" });
	});

	it("does not count the placeholder every unportraited member shares", () => {
		const steading = steadingWith({
			residents: [
				{ name: "Nobody", img: "" },
				{ name: "Also nobody", img: "icons/svg/mystery-man.svg" },
				{ name: "Still nobody", img: "systems/stonetop_pwd/assets/icons/people/default_profile.svg" },
			],
		});
		expect(usedPersonPortraits(steading)).toEqual({});
	});

	it("names the first holder when two people share one portrait", () => {
		const steading = steadingWith({
			residents: [{ name: "Aderyn", img: `${ART}/a.webp` }, { name: "Gethin", img: `${ART}/a.webp` }],
		});
		expect(usedPersonPortraits(steading)).toEqual({ [`${ART}/a.webp`]: "Aderyn" });
	});

	it("still marks a portrait taken when the row has no name to blame it on", () => {
		const steading = steadingWith({ residents: [{ img: `${ART}/a.webp` }] });
		expect(usedPersonPortraits(steading)).toEqual({ [`${ART}/a.webp`]: "another member" });
	});

	it("yields nothing for a steading with no people, no flags, or none at all", () => {
		expect(usedPersonPortraits(steadingWith({}))).toEqual({});
		expect(usedPersonPortraits(steadingWith({ residents: "not an array" }))).toEqual({});
		expect(usedPersonPortraits(null)).toEqual({});
	});

	it("skips an actor row whose actor was deleted rather than throwing", () => {
		withActors([]);
		const steading = steadingWith({ residents: [{ id: "gone", name: "Ghost" }] });
		expect(usedPersonPortraits(steading)).toEqual({});
	});
});
