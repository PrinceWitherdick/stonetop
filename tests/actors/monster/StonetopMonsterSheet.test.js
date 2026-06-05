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

	it("sorts rollable monster moves first, alphabetically within each group", async () => {
		const actor = {
			system: {},
			items: makeItems([
				{ id: "c", type: "monsterMove", name: "Claw", system: {} },
				{ id: "z", type: "monsterMove", name: "Zap", system: { rollFormula: "1d8" } },
				{ id: "a", type: "monsterMove", name: "Ambush", system: {} },
				{ id: "b", type: "monsterMove", name: "Bite", system: { rollFormula: "1d6" } },
			]),
		};

		const data = await makeSheet(actor).getData();

		expect(data.monsterMoves.map(move => move.name)).toEqual([
			"Bite",
			"Zap",
			"Ambush",
			"Claw",
		]);
	});

	it("builds lore sections from newline-separated system fields", async () => {
		const actor = {
			system: {
				questions: "Where does it nest?\n\nWhat does it fear?",
				lore: "",
				origins: "Old forest story",
				discoveries: "Fresh tracks",
			},
			items: makeItems([]),
		};

		const data = await makeSheet(actor).getData();

		expect(data.stonetop.loreSections.map(section => ({
			key: section.key,
			lines: section.lines,
		}))).toEqual([
			{ key: "questions", lines: ["Where does it nest?", "What does it fear?"] },
			{ key: "lore", lines: [] },
			{ key: "origins", lines: ["Old forest story"] },
			{ key: "discoveries", lines: ["Fresh tracks"] },
		]);
	});

	it("builds prep hook sections from newline-separated system fields", async () => {
		const actor = {
			system: {
				hooks: "Tracks near the old road\nA missing shepherd",
			},
			items: makeItems([]),
		};

		const data = await makeSheet(actor).getData();

		expect(data.stonetop.prepLineSections).toEqual([{
			key: "hooks",
			label: "stonetop.monster.hooks",
			lines: ["Tracks near the old road", "A missing shepherd"],
		}]);
	});

	it("filters grouping and size out of readonly display tags", async () => {
		const actor = {
			system: {
				grouping: "Horde",
				size: "small",
				tags: "horde, small, cautious, stealthy",
			},
			items: makeItems([]),
		};

		const data = await makeSheet(actor).getData();

		expect(data.stonetop.displayTags).toBe("cautious, stealthy");
	});

	it("enriches overview rich-text fields for display", async () => {
		const originalFoundry = globalThis.foundry;
		globalThis.foundry = {
			applications: {
				ux: {
					TextEditor: {
						enrichHTML: vi.fn(async value => `<p>${value}</p>`),
					},
				},
			},
		};
		const actor = {
			system: {
				description: "Needle teeth",
				qualities: "Silent",
				dangers: "Ambush",
			},
			items: makeItems([]),
		};

		try {
			const data = await makeSheet(actor).getData();

			expect(data.stonetop.enrichedDescription).toBe("<p>Needle teeth</p>");
			expect(data.stonetop.enrichedQualities).toBe("<p>Silent</p>");
			expect(data.stonetop.enrichedDangers).toBe("<p>Ambush</p>");
		} finally {
			globalThis.foundry = originalFoundry;
		}
	});

	it("preserves blank lore lines while in edit mode", async () => {
		const actor = {
			system: {
				questions: "Where does it nest?\n\nWhat does it fear?",
			},
			items: makeItems([]),
		};
		const sheet = makeSheet(actor);
		sheet._editMode = true;

		const data = await sheet.getData();

		expect(data.stonetop.loreSections[0].lines).toEqual([
			"Where does it nest?",
			"",
			"What does it fear?",
		]);
	});

	it("creates monsterMove items from the add move control", async () => {
		const actor = {
			system: {},
			items: makeItems([]),
			createEmbeddedDocuments: vi.fn(),
		};
		const sheet = makeSheet(actor);
		sheet._editMode = true;
		let clickHandler;
		const root = {
			addEventListener: (eventName, handler) => {
				if (eventName === "click") clickHandler = handler;
			},
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

	it("does not create monsterMove items when edit mode is off", async () => {
		const actor = {
			system: {},
			items: makeItems([]),
			createEmbeddedDocuments: vi.fn(),
		};
		const sheet = makeSheet(actor);
		let clickHandler;
		const root = {
			addEventListener: (eventName, handler) => {
				if (eventName === "click") clickHandler = handler;
			},
		};
		const target = {
			closest: selector => selector === ".stonetop-monster-add-move" ? target : null,
		};

		sheet.activateListeners([root]);
		await clickHandler({ target });

		expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
	});

	it("adds a blank lore line by appending a newline to the field", async () => {
		const actor = {
			system: { questions: "Where does it nest?" },
			items: makeItems([]),
			update: vi.fn(),
		};
		const sheet = makeSheet(actor);

		await sheet._addLineField("questions");

		expect(actor.update).toHaveBeenCalledWith({
			"system.questions": "Where does it nest?\n",
		});
	});

	it("updates a lore section from its line inputs", async () => {
		const actor = {
			system: {},
			items: makeItems([]),
			update: vi.fn(),
		};
		const inputs = [{ value: "First" }, { value: "Second" }];
		const section = {
			querySelectorAll: selector => selector === ".stonetop-monster-line-input" ? inputs : [],
		};
		const root = {
			querySelector: selector => selector === '[data-monster-line-field="questions"]' ? section : null,
		};
		const sheet = makeSheet(actor);

		await sheet._updateLineField(root, "questions");

		expect(actor.update).toHaveBeenCalledWith({
			"system.questions": "First\nSecond",
		});
	});

	it("updates overview rich-text fields", async () => {
		const actor = {
			system: {},
			items: makeItems([]),
			update: vi.fn(),
		};
		const sheet = makeSheet(actor);

		await sheet._updateRichTextField("description", "<p>Formatted</p>");

		expect(actor.update).toHaveBeenCalledWith({
			"system.description": "<p>Formatted</p>",
		});
	});

	it("keeps the window title element as a header spacer", () => {
		const title = { removed: false, remove() { this.removed = true; } };
		const idLink = { removed: false, remove() { this.removed = true; } };
		const header = {
			querySelector: selector => selector === ".window-title" ? title : null,
			querySelectorAll: selector => selector === ".document-id-link" ? [idLink] : [],
		};
		const sheet = makeSheet({
			system: {},
			items: makeItems([]),
		});
		sheet.element = [{
			querySelector: selector => selector === ".window-header" ? header : null,
		}];

		sheet._stripHeaderChrome();

		expect(idLink.removed).toBe(true);
		expect(title.removed).toBe(false);
	});

});
