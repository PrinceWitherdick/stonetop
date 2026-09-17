import { describe, it, expect, vi } from "vitest";
import { StartFightDialog } from "../../module/fight/StartFightDialog.js";

// The start window's own two jobs over the people picker: counting sides on its button, and answering
// with sides and the line-up option.

const GROUPS = [
	{ key: "heroesHere", label: "Heroes on this map", people: [{ id: "token:a", name: "Aeliana" }, { id: "token:b", name: "Bram" }] },
	{ key: "foesHere", label: "Foes on this map", people: [{ id: "token:c", name: "Crinwin" }, { id: "actor:Actor.w", name: "Wolf" }] },
];
const SIDES = new Map([["token:a", "heroes"], ["token:b", "heroes"], ["token:c", "foes"], ["actor:Actor.w", "foes"]]);

const make = (mode = "start") => {
	const dialog = new StartFightDialog({ groups: GROUPS, sides: SIDES, mode, buttonLabel: mode === "add" ? "Add to the fight" : "Start the fight" });
	dialog._resolveWith = vi.fn();
	return dialog;
};

describe("StartFightDialog", () => {
	it("always takes several answers", () => {
		expect(make().getData().multiple).toBe(true);
	});

	it("says who is about to fight on its button", () => {
		const dialog = make();
		expect(dialog._chooseLabel([])).toBe("Start the fight");
		expect(dialog._chooseLabel(["token:a", "token:b", "token:c", "actor:Actor.w"])).toBe("Start the fight: 2 heroes, 2 foes");
		expect(dialog._chooseLabel(["token:a", "token:c"])).toBe("Start the fight: 1 hero, 1 foe");
		expect(dialog._chooseLabel(["token:c"])).toBe("Start the fight: 1 foe");
		expect(make("add")._chooseLabel(["token:b"])).toBe("Add to the fight: 1 hero");
	});

	it("answers with each pick's side and name, and the line-up option", () => {
		const dialog = make();
		const root = {
			querySelectorAll: sel => (sel === "input[name='person']:checked" ? [{ value: "token:b" }, { value: "actor:Actor.w" }] : []),
			querySelector: sel => (sel === '[data-toggle="lineUp"]' ? { checked: true } : null),
		};
		dialog._toggles = [{ key: "lineUp" }];
		dialog._choose(root);
		expect(dialog._resolveWith).toHaveBeenCalledWith({
			picks: [{ id: "token:b", side: "heroes", name: "Bram" }, { id: "actor:Actor.w", side: "foes", name: "Wolf" }],
			lineUp: true,
		});
	});

	it("gives no answer with nobody ticked", () => {
		const dialog = make();
		dialog._choose({ querySelectorAll: () => [], querySelector: () => null });
		expect(dialog._resolveWith).not.toHaveBeenCalled();
	});
});
