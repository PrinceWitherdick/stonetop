import { describe, it, expect, vi } from "vitest";
import { createStonetopCharacterSheetClass } from "../../../module/actors/character/StonetopCharacterSheet.js";
import {FakeActorBuilder} from "../../fakes/FakeActorBuilder.js";

// -- Helpers ------------------------------------------------------------------

function makeCharacterMock(actor) {
	const background = {
		selectBackground: vi.fn(async slug => actor.setFlag("stonetop_pwd", "background.selected", slug)),
		addChoice: vi.fn(),
		selectedSlug: actor.getFlag("stonetop_pwd", "background.selected") ?? "",
		choices: {},
	};
	const instinct = { select: vi.fn(), selectedValue: "" };
	const appearance = {
		select: vi.fn(async (lineIdx, value) => {
			const saved = actor.getFlag("stonetop_pwd", "appearance.selected") ?? {};
			actor.setFlag("stonetop_pwd", "appearance.selected", { ...saved, [lineIdx]: value });
		}),
		saved: actor.getFlag("stonetop_pwd", "appearance.selected") ?? {},
	};
	const origin = { select: vi.fn() };
	return {
		background,
		instinct,
		appearance,
		origin,
		ensureStartingMoves: vi.fn(),
		updateName: vi.fn(async name => actor.update({ name })),
		addMove: vi.fn(),
		removeMove: vi.fn(),
		addArcanum: vi.fn(async () => {}),
		addDroppedInventoryItem: vi.fn(async () => {}),
		// _onDropItemCreate reads this to skip re-adding an already-owned arcanum; an
		// empty Set means every dropped card counts as new (matches the real getter,
		// which returns a Set of owned slugs).
		ownedArcanaSlugs: new Set(),
		onDropMove: vi.fn(async () => false),
		moveResources: { add: vi.fn() },
		buildSnapshot: vi.fn(async () => ({})),
		setInventoryResource: vi.fn(),
	};
}

function recoverSnapshot({ hpValue = 4, hpMax = 8, smallItemLimit = 5 } = {}) {
	return { vitals: { hp: { value: hpValue, max: hpMax } }, inventory: { smallItemLimit } };
}

function makeActor() {
	const actor = new FakeActorBuilder().build();
	actor.id = "actor-1";
	actor.isOwner = true;
	actor.typedActor = makeCharacterMock(actor);
	return actor;
}

function installGetDataGlobals() {
	global.foundry.utils.setProperty ??= (obj, path, value) => {
		const parts = String(path).split(".");
		let current = obj;
		for (const key of parts.slice(0, -1)) {
			current[key] ??= {};
			current = current[key];
		}
		current[parts.at(-1)] = value;
	};
	global.game.settings ??= { get: () => false };
	global.game.user ??= { isGM: true, getFlag: () => ({}) };
	// getData enriches the Notes-tab HTML; passthrough in the test env (no real editor).
	global.foundry.applications ??= {};
	global.foundry.applications.ux ??= {};
	global.foundry.applications.ux.TextEditor ??= { enrichHTML: async value => value };
}

function minimalSheetSnapshot(movelist) {
	return {
		playbook: null,
		movelist,
		vitals: { armor: 0, xp: { value: 0, max: 8 }, hp: { value: 8, max: 8 }, damage: "d4" },
		inventory: { smallItemLimit: null },
		postDeathInsert: null,
		crewBonuses: null,
		companionBonuses: null,
		arcana: {
			major: { hasOwned: false, items: [] },
			minor: { hasOwned: false, items: [] },
		},
	};
}

function makeSheet(actor) {
	const Base = class {
		constructor() { this._actor = actor; }
		get actor() { return this._actor; }
		get isEditable() { return true; }
		async getData() { return {}; }
		activateListeners() {}
		render = vi.fn();
		async _onDropItemCreate() {}
	};
	const Sheet = createStonetopCharacterSheetClass(Base);
	return new Sheet();
}

// -- Event handler tests ------------------------------------------------------

// -- Item fixtures ------------------------------------------------------------

function makeArcanum(slug = "humble-broom") {
	return { type: "move", system: { moveType: "arcanum" }, flags: { stonetop: { slug } } };
}

function makeMove() {
	return { type: "move", system: { moveType: "basic" }, flags: {} };
}

function makeInventoryItem() {
	return { type: "move", name: "Rope", system: { moveType: "inventory" }, flags: { stonetop: { inventoryColumn: "regular", weight: 1 } } };
}

function makeNonMove() {
	return { type: "equipment", system: {}, flags: {} };
}

// -- Tests --------------------------------------------------------------------

describe("StonetopCharacterSheet event handlers", () => {
	it("shows the over-level moves warning until the current overage key is dismissed", async () => {
		installGetDataGlobals();
		const actor = makeActor();
		actor.typedActor.playbook = vi.fn(async () => null);
		actor.typedActor.possessionTriggerMoves = vi.fn(() => ({}));
		actor.typedActor.buildSnapshot = vi.fn(async () => minimalSheetSnapshot({
			levelMovesOverLimit: true,
			levelMovesOverageKey: "2:3:4",
		}));
		const sheet = makeSheet(actor);

		expect((await sheet.getData()).stonetop.movelist.showLevelMovesOverLimit).toBe(true);

		await actor.setFlag("stonetop_pwd", "moves.dismissedLevelOverage", "2:3:4");
		expect((await sheet.getData()).stonetop.movelist.showLevelMovesOverLimit).toBe(false);

		actor.typedActor.buildSnapshot = vi.fn(async () => minimalSheetSnapshot({
			levelMovesOverLimit: true,
			levelMovesOverageKey: "2:3:5",
		}));
		expect((await sheet.getData()).stonetop.movelist.showLevelMovesOverLimit).toBe(true);
	});

	it("_onBackgroundChange calls selectBackground with the slug", async () => {
		const actor = makeActor();
		const sheet = makeSheet(actor);
		await sheet._onBackgroundChange({ currentTarget: { value: "vessel" } });
		expect(actor.typedActor.background.selectBackground).toHaveBeenCalledWith("vessel");
	});

	it("_onBackgroundChange calls ensureStartingMoves after selecting background", async () => {
		const actor = makeActor();
		const sheet = makeSheet(actor);
		await sheet._onBackgroundChange({ currentTarget: { value: "vessel" } });
		expect(actor.typedActor.ensureStartingMoves).toHaveBeenCalled();
	});

	it("_onAppearanceChange calls appearance.select with lineIdx and value", async () => {
		const actor = makeActor();
		const sheet = makeSheet(actor);
		await sheet._onAppearanceChange({ currentTarget: { dataset: { line: "0" }, value: "gray & wizened" } });
		expect(actor.typedActor.appearance.select).toHaveBeenCalledWith(0, "gray & wizened");
	});

	it("_onOriginNameClick updates the actor name", async () => {
		const actor = makeActor();
		const sheet = makeSheet(actor);
		await sheet._onOriginNameClick({ currentTarget: { value: "Arwel" } });
		expect(actor.typedActor.updateName).toHaveBeenCalledWith("Arwel");
	});
});

describe("StonetopCharacterSheet Details tab section visibility", () => {
	const DETAILS_SECTIONS = ["lore", "background", "instinct", "appearance", "origin"];

	function detailsPlaybook({ filled }) {
		return {
			lore:       { hasReadonlyContent: filled },
			background: { selected: filled ? "vessel" : "", options: [{ slug: "vessel", selected: filled }] },
			instinct:   { hasSelection: filled },
			appearance: { summary: filled ? "Gray & wizened" : "" },
			origin:     { selected: filled ? "Stonetop" : "", selectedOption: filled ? { region: "Stonetop" } : null },
		};
	}

	async function detailsShowFor(playbook, { editMode = false } = {}) {
		installGetDataGlobals();
		const actor = makeActor();
		actor.typedActor.playbook = vi.fn(async () => null);
		actor.typedActor.possessionTriggerMoves = vi.fn(() => ({}));
		actor.typedActor.buildSnapshot = vi.fn(async () => ({ ...minimalSheetSnapshot({}), playbook }));
		const sheet = makeSheet(actor);
		sheet._editMode = editMode;
		return (await sheet.getData()).stonetop.detailsShow;
	}

	it("hides every unfilled section in play mode", async () => {
		const show = await detailsShowFor(detailsPlaybook({ filled: false }));
		for (const section of DETAILS_SECTIONS) expect(show[section], section).toBe(false);
	});

	it("shows every section in play mode once it has been filled in", async () => {
		const show = await detailsShowFor(detailsPlaybook({ filled: true }));
		for (const section of DETAILS_SECTIONS) expect(show[section], section).toBe(true);
	});

	it("brings the unfilled sections back when the global edit wrench is on", async () => {
		const show = await detailsShowFor(detailsPlaybook({ filled: false }), { editMode: true });
		for (const section of DETAILS_SECTIONS) expect(show[section], section).toBe(true);
	});

	it("hides only the sections that are still empty", async () => {
		const playbook = detailsPlaybook({ filled: false });
		playbook.instinct.hasSelection = true;
		const show = await detailsShowFor(playbook);
		expect(show.instinct).toBe(true);
		expect(show.background).toBe(false);
		expect(show.appearance).toBe(false);
	});

	it("keeps a section hidden when a saved value matches none of the playbook's options", async () => {
		const playbook = detailsPlaybook({ filled: false });
		playbook.background.selected = "gone-from-the-playbook";
		playbook.origin.selected = "Nowhere";
		const show = await detailsShowFor(playbook);
		expect(show.background).toBe(false);
		expect(show.origin).toBe(false);
	});
});

describe("StonetopCharacterSheet._buildRecoverData", () => {
	it("can recover when supplies remain, HP is below max, and not locked", () => {
		const actor = new FakeActorBuilder().withFlag("inventory.resources", { supplies: 3 }).build();
		actor.typedActor = makeCharacterMock(actor);
		const sheet = makeSheet(actor);
		const data = sheet._buildRecoverData(recoverSnapshot({ hpValue: 4, hpMax: 8, smallItemLimit: 5 }));
		expect(data.canRecover).toBe(true);
		expect(data.healAmount).toBe(5);
		expect(data.suppliesLeft).toBe(3);
		expect(data.hint).toBeNull();
	});

	it("sums uses across all three supply tiers", () => {
		const actor = new FakeActorBuilder()
			.withFlag("inventory.resources", { supplies: 1, "more-supplies": 2, "even-more-supplies": 4 })
			.build();
		actor.typedActor = makeCharacterMock(actor);
		const sheet = makeSheet(actor);
		const data = sheet._buildRecoverData(recoverSnapshot());
		expect(data.suppliesLeft).toBe(7);
	});

	it("locks (with hint) once recover.spent is set, until damage is taken", () => {
		const actor = new FakeActorBuilder()
			.withFlag("inventory.resources", { supplies: 3 })
			.withFlag("recover.spent", true)
			.build();
		actor.typedActor = makeCharacterMock(actor);
		const sheet = makeSheet(actor);
		const data = sheet._buildRecoverData(recoverSnapshot({ hpValue: 4 }));
		expect(data.locked).toBe(true);
		expect(data.canRecover).toBe(false);
		expect(data.hint.icon).toBe("fa-lock");
	});

	it("cannot recover with no supplies", () => {
		const actor = new FakeActorBuilder().withFlag("inventory.resources", {}).build();
		actor.typedActor = makeCharacterMock(actor);
		const sheet = makeSheet(actor);
		const data = sheet._buildRecoverData(recoverSnapshot({ hpValue: 4 }));
		expect(data.canRecover).toBe(false);
		expect(data.hint.icon).toBe("fa-triangle-exclamation");
	});

	it("cannot recover at full HP", () => {
		const actor = new FakeActorBuilder().withFlag("inventory.resources", { supplies: 3 }).build();
		actor.typedActor = makeCharacterMock(actor);
		const sheet = makeSheet(actor);
		const data = sheet._buildRecoverData(recoverSnapshot({ hpValue: 8, hpMax: 8 }));
		expect(data.canRecover).toBe(false);
		expect(data.hint.icon).toBe("fa-heart");
	});
});

describe("StonetopCharacterSheet._applyRecover", () => {
	it("decrements one use of the chosen supply slug", async () => {
		const actor = makeActor();
		const sheet = makeSheet(actor);
		await sheet._applyRecover({ supplySlug: "supplies", currentUses: 3, oldHp: 4, newHp: 8 });
		expect(actor.typedActor.setInventoryResource).toHaveBeenCalledWith("supplies", 2);
	});

	it("heals to the new HP and locks the move", async () => {
		const actor = makeActor();
		const sheet = makeSheet(actor);
		await sheet._applyRecover({ supplySlug: "supplies", currentUses: 1, oldHp: 4, newHp: 9 });
		expect(actor.update).toHaveBeenCalledWith({
			"system.attributes.hp.value": 9,
			"flags.stonetop_pwd.recover.spent": true,
		});
	});

	it("re-renders after applying", async () => {
		const actor = makeActor();
		const sheet = makeSheet(actor);
		await sheet._applyRecover({ supplySlug: "supplies", currentUses: 2, oldHp: 4, newHp: 8 });
		expect(sheet.render).toHaveBeenCalledWith(false);
	});
});

function convalesceSnapshot({ hpValue = 4, hpMax = 8, debilities = [] } = {}) {
	return { vitals: { hp: { value: hpValue, max: hpMax } }, debilities };
}

describe("StonetopCharacterSheet._buildConvalesceData", () => {
	it("can convalesce when HP is below max", () => {
		const sheet = makeSheet(makeActor());
		const data = sheet._buildConvalesceData(convalesceSnapshot({ hpValue: 4, hpMax: 8 }));
		expect(data.canConvalesce).toBe(true);
		expect(data.hint).toBeNull();
	});

	it("can convalesce at full HP when a debility is marked", () => {
		const sheet = makeSheet(makeActor());
		const data = sheet._buildConvalesceData(convalesceSnapshot({
			hpValue: 8, hpMax: 8,
			debilities: [{ key: "dazed", name: "Dazed", active: true }],
		}));
		expect(data.canConvalesce).toBe(true);
		expect(data.activeDebilities).toHaveLength(1);
	});

	it("cannot convalesce at full HP with no marked debilities (shows hint)", () => {
		const sheet = makeSheet(makeActor());
		const data = sheet._buildConvalesceData(convalesceSnapshot({
			hpValue: 8, hpMax: 8,
			debilities: [{ key: "dazed", name: "Dazed", active: false }],
		}));
		expect(data.canConvalesce).toBe(false);
		expect(data.hint.icon).toBe("fa-heart");
	});
});

describe("StonetopCharacterSheet._applyConvalesce", () => {
	it("heals to max and clears every marked debility, attributed to the move", async () => {
		const actor = makeActor();
		const sheet = makeSheet(actor);
		await sheet._applyConvalesce({
			oldHp: 3, newHp: 8,
			debilities: [
				{ key: "weakened",  name: "Weakened",  active: true },
				{ key: "miserable", name: "Miserable", active: true },
			],
		});
		expect(actor.update).toHaveBeenCalledWith({
			"system.attributes.hp.value": 8,
			"system.attributes.debilities.options.weakened.value": false,
			"system.attributes.debilities.options.miserable.value": false,
		}, { stonetopMove: "Convalesce" });
	});

	it("re-renders after applying", async () => {
		const actor = makeActor();
		const sheet = makeSheet(actor);
		await sheet._applyConvalesce({ oldHp: 4, newHp: 8, debilities: [] });
		expect(sheet.render).toHaveBeenCalledWith(false);
	});
});

describe("StonetopCharacterSheet._onDropItemCreate", () => {
	it("calls addArcanum with the slug from flags when an arcanum is dropped", async () => {
		const actor = makeActor();
		const sheet = makeSheet(actor);
		await sheet._onDropItemCreate(makeArcanum("humble-broom"));
		expect(actor.typedActor.addArcanum).toHaveBeenCalledWith("humble-broom");
	});

	it("accepts an array of items", async () => {
		const actor = makeActor();
		const sheet = makeSheet(actor);
		await sheet._onDropItemCreate([makeArcanum("humble-broom"), makeArcanum("stone-idol")]);
		expect(actor.typedActor.addArcanum).toHaveBeenCalledWith("humble-broom");
		expect(actor.typedActor.addArcanum).toHaveBeenCalledWith("stone-idol");
	});

	it("skips arcanum with no slug in flags", async () => {
		const actor = makeActor();
		const sheet = makeSheet(actor);
		const noSlug = { type: "move", system: { moveType: "arcanum" }, flags: {} };
		await sheet._onDropItemCreate(noSlug);
		expect(actor.typedActor.addArcanum).not.toHaveBeenCalled();
	});

	it("routes regular moves to onDropMove", async () => {
		const actor = makeActor();
		const sheet = makeSheet(actor);
		const move = makeMove();
		await sheet._onDropItemCreate(move);
		expect(actor.typedActor.onDropMove).toHaveBeenCalledWith(move);
		expect(actor.typedActor.addArcanum).not.toHaveBeenCalled();
	});

	it("routes inventory moves to addDroppedInventoryItem", async () => {
		const actor = makeActor();
		const sheet = makeSheet(actor);
		const item = makeInventoryItem();
		await sheet._onDropItemCreate(item);
		expect(actor.typedActor.addDroppedInventoryItem).toHaveBeenCalledWith(item);
		expect(actor.typedActor.onDropMove).not.toHaveBeenCalled();
	});

	it("does not route non-move items to addArcanum or onDropMove", async () => {
		const actor = makeActor();
		const sheet = makeSheet(actor);
		await sheet._onDropItemCreate(makeNonMove());
		expect(actor.typedActor.addArcanum).not.toHaveBeenCalled();
		expect(actor.typedActor.onDropMove).not.toHaveBeenCalled();
	});

	it("calls render after dropping an arcanum", async () => {
		const actor = makeActor();
		const sheet = makeSheet(actor);
		await sheet._onDropItemCreate(makeArcanum("humble-broom"));
		expect(sheet.render).toHaveBeenCalledWith(false);
	});

	it("calls render after dropping an inventory item", async () => {
		const actor = makeActor();
		const sheet = makeSheet(actor);
		await sheet._onDropItemCreate(makeInventoryItem());
		expect(sheet.render).toHaveBeenCalledWith(false);
	});

	it("does not call render when nothing was added", async () => {
		const actor = makeActor();
		const sheet = makeSheet(actor);
		await sheet._onDropItemCreate(makeNonMove());
		expect(sheet.render).not.toHaveBeenCalled();
	});
});
