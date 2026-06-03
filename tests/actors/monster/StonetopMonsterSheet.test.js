import { describe, it, expect, vi } from "vitest";
import { createStonetopMonsterSheetClass } from "../../../module/actors/monster/StonetopMonsterSheet.js";

function makeItems(items) {
	return {
		filter: callback => items.filter(callback),
		get: id => items.find(item => item.id === id),
	};
}

function makeSheet(actor) {
	const Base = class {
		constructor() { this._actor = actor; }
		get actor() { return this._actor; }
		get isEditable() { return true; }
		async getData() { return {}; }
		activateListeners() {}
	};
	const Sheet = createStonetopMonsterSheetClass(Base);
	return new Sheet();
}

describe("StonetopMonsterSheet", () => {
	it("returns only monster moves in sheet data", async () => {
		const actor = {
			system: { concept: "tree-dwelling menace" },
			items: makeItems([
				{ id: "move1", type: "monsterMove", name: "Snatch", system: { rollFormula: "1d6" } },
				{ id: "npc1", type: "npcMove", name: "Ignore me", system: {} },
			]),
		};

		const data = await makeSheet(actor).getData();

		expect(data.system).toBe(actor.system);
		expect(data.monsterMoves).toEqual([
			{ id: "move1", name: "Snatch", system: { rollFormula: "1d6" } },
		]);
	});

	it("creates monsterMove items from the add move control", async () => {
		const actor = {
			system: {},
			items: makeItems([]),
			createEmbeddedDocuments: vi.fn(),
		};
		const sheet = makeSheet(actor);
		let clickHandler;
		const root = {
			addEventListener: (_eventName, handler) => { clickHandler = handler; },
		};
		const target = {
			closest: selector => selector === ".stonetop-monster-add-move" ? target : null,
		};

		sheet.activateListeners([root]);
		await clickHandler({ target });

		expect(actor.createEmbeddedDocuments).toHaveBeenCalledWith("Item", [{
			name: "New Move",
			type: "monsterMove",
		}]);
	});
});
