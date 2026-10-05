import { describe, it, expect } from "vitest";
import { RosterDialog } from "../../../module/actors/character/dialogs/RosterDialog.js";

// One row of a standing list (a brand, an oath, a mark) as the roster window draws it.
const row = (entry, actor = null) =>
	RosterDialog.prototype._portraitRow.call({ _resolveActor: () => actor }, entry);

describe("a roster row's name", () => {
	it("shows a linked actor's name as it is now, not as it was when the row was laid", () => {
		const renamed = { documentName: "Actor", name: "Brennan the Claw", img: "", uuid: "Actor.b" };
		expect(row({ id: "1", name: "Brennan", uuid: "Actor.b" }, renamed)).toMatchObject({ name: "Brennan the Claw", linked: true });
	});

	it("keeps the stored name for a name-only row and for a row whose actor is gone", () => {
		expect(row({ id: "1", name: "The Claws", uuid: "" })).toMatchObject({ name: "The Claws", linked: false });
		expect(row({ id: "2", name: "Brennan", uuid: "Actor.deleted" })).toMatchObject({ name: "Brennan", linked: false });
	});

	it("falls back to the stored name when the actor has none", () => {
		expect(row({ id: "1", name: "Brennan", uuid: "Actor.b" }, { documentName: "Actor", name: "  ", img: "" }).name).toBe("Brennan");
	});
});
