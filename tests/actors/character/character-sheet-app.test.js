import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { createStonetopCharacterSheetClass } from "../../../module/actors/character/StonetopCharacterSheet.js";
import {FakeActorBuilder} from "../../fakes/FakeActorBuilder.js";
import { DEATHS_DOOR_STATE, zeroHpMove, zeroHpResolution } from "../../../module/actors/character/deaths-door.js";

// -- Helpers ------------------------------------------------------------------

function makeCharacterMock(actor) {
	const background = {
		selectBackground: vi.fn(async slug => actor.setFlag("stonetop-pwd", "background.selected", slug)),
		addChoice: vi.fn(),
		selectedSlug: actor.getFlag("stonetop-pwd", "background.selected") ?? "",
		choices: {},
	};
	const instinct = { select: vi.fn(), selectedValue: "" };
	const appearance = {
		select: vi.fn(async (lineIdx, value) => {
			const saved = actor.getFlag("stonetop-pwd", "appearance.selected") ?? {};
			actor.setFlag("stonetop-pwd", "appearance.selected", { ...saved, [lineIdx]: value });
		}),
		saved: actor.getFlag("stonetop-pwd", "appearance.selected") ?? {},
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
		setPostDeathInsert: vi.fn(async () => {}),
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

		await actor.setFlag("stonetop-pwd", "moves.dismissedLevelOverage", "2:3:4");
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

describe("StonetopCharacterSheet damage die editing", () => {
	function damageInput(value, base = "d6") {
		return { currentTarget: { value, dataset: { damageBase: base } } };
	}

	function makeDamageSheet() {
		const actor = makeActor();
		actor.typedActor.setDamageDieOverride = vi.fn(async () => null);
		return { actor, sheet: makeSheet(actor) };
	}

	it("saves a typed die as an override", async () => {
		const { actor, sheet } = makeDamageSheet();
		await sheet._onDamageDieEdit(damageInput("d8"));
		// The derived die rides along, so the model never rebuilds the snapshot to find it.
		expect(actor.typedActor.setDamageDieOverride).toHaveBeenCalledWith("d8", { base: "d6" });
	});

	it("normalizes loose spellings before saving", async () => {
		const { actor, sheet } = makeDamageSheet();
		await sheet._onDamageDieEdit(damageInput("1D8 "));
		expect(actor.typedActor.setDamageDieOverride).toHaveBeenCalledWith("d8", { base: "d6" });
	});

	it("clears the override when the field is emptied", async () => {
		const { actor, sheet } = makeDamageSheet();
		await sheet._onDamageDieEdit(damageInput(""));
		expect(actor.typedActor.setDamageDieOverride).toHaveBeenCalledWith("", { base: "d6" });
	});

	it("clears the override when the typed die is the playbook's own", async () => {
		const { actor, sheet } = makeDamageSheet();
		await sheet._onDamageDieEdit(damageInput("d6", "d6"));
		expect(actor.typedActor.setDamageDieOverride).toHaveBeenCalledWith("", { base: "d6" });
	});

	it("refuses a value that isn't a single die and puts the old one back", async () => {
		global.ui = { notifications: { warn: vi.fn() } };
		const { actor, sheet } = makeDamageSheet();
		actor.system.attributes.damage.value = "d6";
		const ev = damageInput("2d6");

		await sheet._onDamageDieEdit(ev);

		expect(actor.typedActor.setDamageDieOverride).not.toHaveBeenCalled();
		expect(ev.currentTarget.value).toBe("d6");
		expect(global.ui.notifications.warn).toHaveBeenCalled();
	});

	it("getData mirrors the die in play onto the input, playbook or not", async () => {
		installGetDataGlobals();
		const actor = makeActor();
		actor.typedActor.playbook = vi.fn(async () => null);
		actor.typedActor.possessionTriggerMoves = vi.fn(() => ({}));
		actor.typedActor.buildSnapshot = vi.fn(async () => {
			const snap = minimalSheetSnapshot({});
			snap.vitals.damage = "d8";
			return snap;
		});
		const sheet = makeSheet(actor);

		const context = await sheet.getData();
		expect(context.system.attributes.damage.value).toBe("d8");
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
			"flags.stonetop-pwd.recover.spent": true,
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

describe("StonetopCharacterSheet._onDropPlaybook", () => {
	// The three post-death inserts are `type: "playbook"` Items too, so one handler receives both
	// and has to tell them apart. It used to ask "does it carry lore?" — which every shipped
	// playbook does — so a playbook drop set the character's INSERT instead of their playbook,
	// and the prune that runs with it measured their post-death answers against the wrong lore
	// and deleted them.
	function makePlaybookDoc(slug, extra = {}) {
		return {
			uuid: `Compendium.stonetop-pwd.stonetop-items.${slug}`,
			name: slug,
			type: "playbook",
			system: { slug },
			flags: { stonetop: { lore: [{ slug: "violence-reputation", options: [] }], hp: 20, ...extra } },
		};
	}

	it("assigns a playbook that carries lore of its own, instead of taking it for an insert", async () => {
		const actor = makeActor();
		const sheet = makeSheet(actor);
		actor.update = vi.fn(async () => {});

		await sheet._onDropPlaybook(makePlaybookDoc("the-heavy"));

		expect(actor.typedActor.setPostDeathInsert).not.toHaveBeenCalled();
		expect(actor.update).toHaveBeenCalled();
		expect(actor.update.mock.calls[0][0]["system.playbook"].slug).toBe("the-heavy");
		expect(actor.typedActor.ensureStartingMoves).toHaveBeenCalled();
	});

	it("still takes the three real inserts as inserts", async () => {
		for (const slug of ["revenant", "ghost", "thrall"]) {
			const actor = makeActor();
			const sheet = makeSheet(actor);
			actor.update = vi.fn(async () => {});

			await sheet._onDropPlaybook(makePlaybookDoc(slug));

			expect(actor.typedActor.setPostDeathInsert).toHaveBeenCalledWith(slug);
			expect(actor.update).not.toHaveBeenCalled();
		}
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

	// Gear lands on a tab the GM usually isn't looking at, so a silent add reads as "nothing
	// happened" — and, worse, gives no clue when the drop went somewhere the player can't see.
	describe("tells the GM where the gear went", () => {
		let savedUi;
		beforeEach(() => {
			savedUi = global.ui;
			global.ui = { notifications: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } };
		});
		afterEach(() => { global.ui = savedUi; });

		it("names the character an item was added to", async () => {
			const actor = makeActor();
			actor.name = "Ordep";
			await makeSheet(actor)._onDropItemCreate(makeInventoryItem());
			expect(global.ui.notifications.info)
				.toHaveBeenCalledWith('Added "Rope" to Ordep\'s Inventory tab.');
		});

		it("joins several items into one toast rather than one apiece", async () => {
			const actor = makeActor();
			actor.name = "Ordep";
			const second = { ...makeInventoryItem(), name: "Brass sphere" };
			await makeSheet(actor)._onDropItemCreate([makeInventoryItem(), second]);
			expect(global.ui.notifications.info).toHaveBeenCalledTimes(1);
			expect(global.ui.notifications.info)
				.toHaveBeenCalledWith('Added "Rope" & "Brass sphere" to Ordep\'s Inventory tab.');
		});

		it("says nothing when the drop carried no inventory", async () => {
			await makeSheet(makeActor())._onDropItemCreate(makeNonMove());
			expect(global.ui.notifications.info).not.toHaveBeenCalled();
		});
	});

	// A sheet opened by double-clicking an UNLINKED token is backed by the token's own copy of
	// the character (its ActorDelta). Everything written there saves fine and reaches nobody:
	// the player opens their character from the sidebar and finds nothing. This is the whole
	// reason a GM reports "I gave them a treasure and they can't see it".
	describe("on an unlinked token's sheet", () => {
		let savedUi;
		beforeEach(() => {
			savedUi = global.ui;
			global.ui = { notifications: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } };
		});
		afterEach(() => { global.ui = savedUi; });

		/** The synthetic actor behind an unlinked token, and the world actor it was stamped from. */
		function makeTokenActor() {
			const world = makeActor();
			world.name = "Ordep";
			const synthetic = makeActor();
			synthetic.name = "Ordep";
			synthetic.isToken = true;
			synthetic.token = { baseActor: world };
			return { synthetic, world };
		}

		it("writes gear to the character, not to the token's private copy", async () => {
			const { synthetic, world } = makeTokenActor();
			const item = makeInventoryItem();
			await makeSheet(synthetic)._onDropItemCreate(item);
			expect(world.typedActor.addDroppedInventoryItem).toHaveBeenCalledWith(item);
			expect(synthetic.typedActor.addDroppedInventoryItem).not.toHaveBeenCalled();
		});

		it("redirects arcana and moves the same way", async () => {
			const { synthetic, world } = makeTokenActor();
			await makeSheet(synthetic)._onDropItemCreate([makeArcanum("humble-broom"), makeMove()]);
			expect(world.typedActor.addArcanum).toHaveBeenCalledWith("humble-broom");
			expect(world.typedActor.onDropMove).toHaveBeenCalled();
			expect(synthetic.typedActor.addArcanum).not.toHaveBeenCalled();
			expect(synthetic.typedActor.onDropMove).not.toHaveBeenCalled();
		});

		it("says so, so the redirect is never silent", async () => {
			const { synthetic } = makeTokenActor();
			await makeSheet(synthetic)._onDropItemCreate(makeInventoryItem());
			expect(global.ui.notifications.info)
				.toHaveBeenCalledWith(expect.stringContaining("isn't linked to Ordep"));
		});

		// A linked token hands back the world actor itself, so isToken is false and there is
		// nothing to resolve — the common case must not pay for the rare one.
		it("leaves an ordinary sheet writing to its own character", async () => {
			const actor = makeActor();
			const item = makeInventoryItem();
			await makeSheet(actor)._onDropItemCreate(item);
			expect(actor.typedActor.addDroppedInventoryItem).toHaveBeenCalledWith(item);
		});

		// A token whose baseActor has gone (a deleted actor, a torn-down scene) must still take
		// the drop rather than throwing on the way to resolving a target.
		it("falls back to its own character when the base actor is gone", async () => {
			const { synthetic } = makeTokenActor();
			synthetic.token = { baseActor: null };
			const item = makeInventoryItem();
			await makeSheet(synthetic)._onDropItemCreate(item);
			expect(synthetic.typedActor.addDroppedInventoryItem).toHaveBeenCalledWith(item);
		});
	});
});

// _onDeathsDoorOpen is the ONE way into a character's 0-HP move: the sheet's own button and the
// dying chat card both come through it (hooks/DeathsDoorPrompt.js). The card outlives the moment
// it was posted for, so the gate has to live here rather than only on the button the sheet draws.
describe("StonetopCharacterSheet 0-HP move gate", () => {
	function makeInsertSheet({ hp, state = null }) {
		const actor = makeActor();
		const sheet = makeSheet(actor);
		sheet._stonetopCharacter = {
			hp,
			deathsDoorState: state,
			zeroHpMove: zeroHpMove("revenant"),   // Undying — its own walkthrough, not Death's Door
			zeroHpResolution: zeroHpResolution("revenant"),
		};
		sheet._onUndeathOpen = vi.fn(async () => {});
		return sheet;
	}

	it("opens the insert's walkthrough for a character who is actually down", async () => {
		const sheet = makeInsertSheet({ hp: 0, state: DEATHS_DOOR_STATE.DYING });
		await sheet._onDeathsDoorOpen();
		expect(sheet._onUndeathOpen).toHaveBeenCalled();
	});

	it("refuses an old dying card once the character is back on their feet", async () => {
		// Without this, clicking a spent card's button re-rolls Undying and hands out half their
		// max HP again — for a Revenant standing there at full health.
		const sheet = makeInsertSheet({ hp: 6 });
		await sheet._onDeathsDoorOpen();
		expect(sheet._onUndeathOpen).not.toHaveBeenCalled();
	});

	it("refuses it again while they're out of the action — the move is spent, not pending", async () => {
		const sheet = makeInsertSheet({ hp: 0, state: DEATHS_DOOR_STATE.OUT_OF_ACTION });
		await sheet._onDeathsDoorOpen();
		expect(sheet._onUndeathOpen).not.toHaveBeenCalled();
	});

	it("refuses it for one who stepped through the Last Door", async () => {
		const sheet = makeInsertSheet({ hp: 0, state: DEATHS_DOOR_STATE.DEAD });
		await sheet._onDeathsDoorOpen();
		expect(sheet._onUndeathOpen).not.toHaveBeenCalled();
	});
});
