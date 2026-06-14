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

	it("preserves the book's move order (does not sort)", async () => {
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
			"Claw",
			"Zap",
			"Ambush",
			"Bite",
		]);
	});

	it("filters organization and size out of readonly display tags", async () => {
		const actor = {
			system: {
				organization: "Horde",
				size: "small",
				tags: "horde, small, cautious, stealthy",
			},
			items: makeItems([]),
		};

		const data = await makeSheet(actor).getData();

		expect(data.stonetop.displayTags).toBe("cautious, stealthy");
	});

	it("derives the organization label for the header chip", async () => {
		const actor = {
			system: { organization: "horde" },
			items: makeItems([]),
		};

		const data = await makeSheet(actor).getData();

		expect(data.stonetop.organizationLabel).toBe("stonetop.monster.organizationHorde");
	});

	it("wraps recognised display tags with tooltips and resolves org/size tips", async () => {
		const actor = {
			system: { organization: "horde", size: "small", tags: "horde, small, cautious, grumpy" },
			items: makeItems([]),
		};

		const data = await makeSheet(actor).getData();
		const st = data.stonetop;

		// Known tag gets a tooltip span; the one-off flavor tag stays plain text.
		expect(st.displayTagsHtml).toContain('<span class="stonetop-monster-tag" data-tooltip=');
		expect(st.displayTagsHtml).toMatch(/>cautious<\/span>/);
		expect(st.displayTagsHtml).not.toMatch(/<span[^>]*>grumpy/);
		expect(st.displayTagsHtml).toContain("grumpy");
		// Organization and size resolve their own tooltips.
		expect(st.organizationTooltip).toMatch(/large groups of 6/);
		expect(st.sizeTooltip).toMatch(/human child/);
	});

	it("renders plain escaped tags and no tooltips when hover info is off", async () => {
		const originalGame = globalThis.game;
		globalThis.game = { ...originalGame, settings: { get: () => false } };
		try {
			const actor = {
				system: { organization: "horde", size: "small", tags: "cautious" },
				items: makeItems([]),
			};

			const data = await makeSheet(actor).getData();

			expect(data.stonetop.displayTagsHtml).toBe("cautious");
			expect(data.stonetop.organizationTooltip).toBeNull();
			expect(data.stonetop.sizeTooltip).toBeNull();
		} finally {
			globalThis.game = originalGame;
		}
	});

	it("keeps a single damage mode whose descriptor has commas as one mode", async () => {
		const actor = {
			system: {
				attributes: { damage: { value: "claws, bite, hug d10+4 (hand, close, messy, 1 piercing)" } },
			},
			items: makeItems([]),
		};

		const data = await makeSheet(actor).getData();

		expect(data.stonetop.damageModes).toEqual([
			{ text: "claws, bite, hug d10+4 (hand, close, messy, 1 piercing)", formula: "d10+4", rollMode: "" },
		]);
		expect(data.stonetop.multiDamage).toBe(false);
	});

	it("splits multiple damage modes, each carrying its own die", async () => {
		const actor = {
			system: {
				attributes: { damage: { value: "fingers d8 (close), maw d10+2 (hand, messy)" } },
			},
			items: makeItems([]),
		};

		const data = await makeSheet(actor).getData();

		expect(data.stonetop.damageModes).toEqual([
			{ text: "fingers d8 (close)", formula: "d8", rollMode: "" },
			{ text: "maw d10+2 (hand, messy)", formula: "d10+2", rollMode: "" },
		]);
		expect(data.stonetop.multiDamage).toBe(true);
	});

	it("flags a damage mode that notes disadvantage on its die", async () => {
		const actor = {
			system: {
				attributes: { damage: { value: "icy touch d6 w/disadvantage (hand, ignores armor)" } },
			},
			items: makeItems([]),
		};

		const data = await makeSheet(actor).getData();

		expect(data.stonetop.damageModes).toEqual([
			{ text: "icy touch d6 w/disadvantage (hand, ignores armor)", formula: "d6", rollMode: "dis" },
		]);
	});

	it("enriches the qualities rich-text field for display", async () => {
		const originalFoundry = globalThis.foundry;
		globalThis.foundry = {
			utils: originalFoundry.utils,   // getData also escapes codex text
			applications: {
				ux: {
					TextEditor: {
						enrichHTML: vi.fn(async value => `<p>${value}</p>`),
					},
				},
			},
		};
		const actor = {
			system: { qualities: "Climbs like a squirrel" },
			items: makeItems([]),
		};

		try {
			const data = await makeSheet(actor).getData();
			expect(data.stonetop.enrichedQualities).toBe("<p>Climbs like a squirrel</p>");
		} finally {
			globalThis.foundry = originalFoundry;
		}
	});

	it("flags hasQualities only when the field holds real content", async () => {
		const withText = await makeSheet({
			system: { qualities: "<p>Climbs like a squirrel</p>" },
			items: makeItems([]),
		}).getData();
		expect(withText.stonetop.hasQualities).toBe(true);

		for (const empty of ["", "<p></p>", "<p><br></p>", "<p>&nbsp;</p>"]) {
			const data = await makeSheet({
				system: { qualities: empty },
				items: makeItems([]),
			}).getData();
			expect(data.stonetop.hasQualities, `qualities=${JSON.stringify(empty)}`).toBe(false);
		}
	});

	it("falls back to the creature-type icon as the portrait when there is no custom art", async () => {
		const actor = {
			img: "icons/svg/mystery-man.svg",   // default placeholder, not real art
			system: { creatureType: "natural-beast" },
			items: makeItems([]),
		};

		const data = await makeSheet(actor).getData();

		expect(data.stonetop.creatureTypeLabel).toBe("Natural / Beast");
		expect(data.stonetop.hasPortrait).toBe(true);
		expect(data.stonetop.displayImg).toBe(
			"systems/stonetop_pwd/assets/icons/bestiary/natural-beast.webp");
	});

	it("prefers real portrait art over the creature-type icon", async () => {
		const actor = {
			img: "worlds/test/crinwin-art.webp",
			system: { creatureType: "natural-beast" },
			items: makeItems([]),
		};

		const data = await makeSheet(actor).getData();

		expect(data.stonetop.displayImg).toBe("worlds/test/crinwin-art.webp");
	});

	it("has no portrait when there is neither art nor a creature type", async () => {
		const actor = {
			img: "icons/svg/mystery-man.svg",
			system: {},
			items: makeItems([]),
		};

		const data = await makeSheet(actor).getData();

		expect(data.stonetop.hasPortrait).toBe(false);
		expect(data.stonetop.displayImg).toBeNull();
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
			querySelector: () => null,
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
			querySelector: () => null,
		};
		const target = {
			closest: selector => selector === ".stonetop-monster-add-move" ? target : null,
		};

		sheet.activateListeners([root]);
		await clickHandler({ target });

		expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
	});

	it("resets HP and damage die to the organization defaults", async () => {
		const actor = {
			system: { organization: "solitary", attributes: {} },
			items: makeItems([]),
			update: vi.fn(),
		};
		const sheet = makeSheet(actor);

		await sheet._resetOrganizationDefaults();

		expect(actor.update).toHaveBeenCalledWith({
			"system.attributes.hp.value":           12,
			"system.attributes.hp.max":             12,
			"system.attributes.damage.rollFormula": "d10",
		});
	});

	it("ignores reset when the organization is unset", async () => {
		const actor = {
			system: { organization: "" },
			items: makeItems([]),
			update: vi.fn(),
		};
		const sheet = makeSheet(actor);

		await sheet._resetOrganizationDefaults();

		expect(actor.update).not.toHaveBeenCalled();
	});

	it("updates the qualities rich-text field", async () => {
		const actor = {
			system: {},
			items: makeItems([]),
			update: vi.fn(),
		};
		const sheet = makeSheet(actor);

		await sheet._updateRichTextField("qualities", "<p>Formatted</p>");

		expect(actor.update).toHaveBeenCalledWith({
			"system.qualities": "<p>Formatted</p>",
		});
	});

	it("refuses to update fields that are not rich-text fields", async () => {
		const actor = {
			system: {},
			items: makeItems([]),
			update: vi.fn(),
		};
		const sheet = makeSheet(actor);

		await sheet._updateRichTextField("concept", "<p>nope</p>");

		expect(actor.update).not.toHaveBeenCalled();
	});

	it("updates notes as a rich-text field (editable outside edit mode)", async () => {
		const actor = {
			system: {},
			items: makeItems([]),
			update: vi.fn(),
		};
		const sheet = makeSheet(actor);

		await sheet._updateRichTextField("notes", "<p>Spotted near the river.</p>");

		expect(actor.update).toHaveBeenCalledWith({
			"system.notes": "<p>Spotted near the river.</p>",
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
