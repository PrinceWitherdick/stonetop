import { describe, expect, it } from "vitest";
import { remindersForActor } from "../../module/seasons/seasons-change-reminders.js";

// A minimal stand-in for a character actor: `move` names become embedded move
// Items, and `possessions` become the selected special-possession slugs (the
// flags.stonetop_pwd.possessions.selected array the production flag reads).
function fakeCharacter({ moves = [], possessions = [], type = "character" } = {}) {
	return {
		type,
		items: moves.map(name => ({ type: "move", name })),
		getFlag: (scope, key) =>
			scope === "stonetop_pwd" && key === "possessions.selected" ? possessions : undefined,
	};
}

const names = list => list.map(r => r.label ?? r.name);

describe("remindersForActor", () => {
	it("matches a seasonal playbook move by name", () => {
		const actor = fakeCharacter({ moves: ["Rites of the Land", "Consecrated Ground"] });
		expect(names(remindersForActor(actor))).toEqual(["Rites of the Land"]);
	});

	it("matches seasonal possessions by selected slug", () => {
		const actor = fakeCharacter({ possessions: ["collected-offerings", "goat-herd", "apiary"] });
		expect(names(remindersForActor(actor)).sort()).toEqual(["Collected offerings", "Goat herd"]);
	});

	it("matches The Lightbearer's Holy relics possession", () => {
		const actor = fakeCharacter({ possessions: ["holy-relics"] });
		expect(names(remindersForActor(actor))).toEqual(["Holy relics"]);
	});

	it("combines a move and a possession on the same character", () => {
		const actor = fakeCharacter({ moves: ["Rites of the Land"], possessions: ["goat-herd"] });
		expect(names(remindersForActor(actor)).sort()).toEqual(["Goat herd", "Rites of the Land"]);
	});

	it("returns nothing for a character with no seasonal upkeep", () => {
		const actor = fakeCharacter({ moves: ["Consecrated Ground"], possessions: ["apiary"] });
		expect(remindersForActor(actor)).toEqual([]);
	});

	it("ignores non-character actors", () => {
		const actor = fakeCharacter({ moves: ["Rites of the Land"], type: "stonetop" });
		expect(remindersForActor(actor)).toEqual([]);
	});

	it("tolerates a character with no selected-possessions flag", () => {
		const actor = { type: "character", items: [], getFlag: () => undefined };
		expect(remindersForActor(actor)).toEqual([]);
	});
});
