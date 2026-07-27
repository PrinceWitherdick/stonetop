import { describe, expect, it } from "vitest";
import { actorOptionsFor, ownerOptions } from "../../module/dialogs/create-actor-dialog.js";

describe("actorOptionsFor", () => {
	it("offers the GM every kind of actor", () => {
		expect(actorOptionsFor(true).map(o => o.id)).toEqual(["character", "npc", "monster"]);
	});

	it("offers a player only their own character", () => {
		// People and monsters are GM prep; preCreateActor vetoes a player-made monster anyway.
		expect(actorOptionsFor(false).map(o => o.id)).toEqual(["character"]);
	});

	it("gives every row an icon and a hint", () => {
		for (const option of actorOptionsFor(true)) {
			expect(option.icon).toMatch(/^fa-/);
			expect(option.hint.length).toBeGreaterThan(0);
		}
	});
});

describe("ownerOptions", () => {
	const players = [
		{ id: "u1", name: "Aderyn", isGM: false, active: true },
		{ id: "u2", name: "Bryn", isGM: false, active: false },
	];

	it("lists one row per player, in order, with an unassigned row last", () => {
		const rows = ownerOptions(players);
		expect(rows.map(r => r.id)).toEqual(["u1", "u2", "__unassigned__"]);
		expect(rows.map(r => r.label)).toEqual(["Aderyn", "Bryn", "No one yet"]);
	});

	it("leaves GMs out: they run the world rather than play a PC", () => {
		const rows = ownerOptions([...players, { id: "gm", name: "The GM", isGM: true, active: true }]);
		expect(rows.map(r => r.id)).not.toContain("gm");
	});

	it("warns that a player with a character would have it replaced", () => {
		const rows = ownerOptions(players, id => (id === "u1" ? [{ name: "Wren" }] : []));
		expect(rows[0].hint).toContain("Wren");
		expect(rows[0].hint).toContain("replaces it");
	});

	it("agrees in number when the player somehow has several characters", () => {
		const rows = ownerOptions(players, id => (id === "u1" ? [{ name: "Wren" }, { name: "Gethin" }] : []));
		expect(rows[0].hint).toContain("Wren, Gethin");
		expect(rows[0].hint).toContain("replaces them");
	});

	it("says where creation will open for a player with no character yet", () => {
		const rows = ownerOptions(players);
		expect(rows[0].hint).toContain("Online");   // u1 is connected
		expect(rows[1].hint).toContain("Offline");  // u2 is not
	});

	it("still offers the unassigned row in a world with no players", () => {
		expect(ownerOptions([]).map(r => r.id)).toEqual(["__unassigned__"]);
	});
});
