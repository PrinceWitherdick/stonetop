import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createFightTrackerClass, FIGHTER_DRAG_TYPE } from "../../module/fight/FightTracker.js";
import { FIGHT_OVER, FIGHT_WINDOW_WIDTH, noteFightWindowClosed, openFightWindow, rememberFightWindowPosition } from "../../module/fight/fight-window.js";
import { SYSTEM_ID } from "../../module/system-id.js";
import { fakeActor, fakeToken, fakeScene, fakeCombatant, fakeCombat, collection } from "../fakes/fight.js";

// The Fight tab's class, over a stand-in for core's CombatTracker.

// What the window does with a close, a move and a press of "Open in a window" is fight-window.js's
// business, tested there; here only that the class hands each one over.
vi.mock("../../module/fight/fight-window.js", async importOriginal => ({
	...(await importOriginal()),
	noteFightWindowClosed: vi.fn(),
	rememberFightWindowPosition: vi.fn(),
	openFightWindow: vi.fn(),
}));

const ROOT = path.resolve(import.meta.dirname, "../..");

class FakeCombatTracker {
	static DEFAULT_OPTIONS = { actions: { activateCombatant: () => {}, toggleHidden: () => {} } };
	static PARTS = { header: {}, tracker: {}, footer: {} };
	constructor(options = {}) {
		this.options = this._initializeApplicationOptions(options);
		this.position = { ...this.options.position };
		this.minimized = false;
		this.viewed = null; this.combats = []; this.renders = []; this.rendered = true; this.closes = [];
	}
	/** Core's merge, as far as this class reads it: the sidebar tab's own options, framed when popped out. */
	_initializeApplicationOptions(options) {
		return {
			classes: ["tab", "sidebar-tab", "combat-sidebar", ...(options.classes ?? [])],
			window: { frame: false, ...options.window },
			position: { width: "auto", height: "auto", ...options.position },
		};
	}
	get isPopout() { return !!this.options.window.frame; }
	async _getCombatantThumbnail(combatant) { return combatant.img || "icons/svg/mystery-man.svg"; }
	async _preFirstRender() { this.preFirst = true; }
	_attachFrameListeners() {}
	_onPosition() {}
	_updatePosition(position) { return position; }
	_onClose(options) { this.closes.push(options); }
	render(options) { this.renders.push(options); }
}

const FightTracker = createFightTrackerClass(FakeCombatTracker);

let saved;
let settings;
beforeEach(() => {
	saved = { game: globalThis.game, canvas: globalThis.canvas, foundry: globalThis.foundry };
	settings = new Map();
	globalThis.game = {
		...saved.game,
		user: { id: "gm", isGM: true, hasPermission: () => true },
		users: collection([]),
		combats: collection([]),
		settings: {
			get: (scope, key) => { if (!settings.has(key)) throw new Error("unregistered"); return settings.get(key); },
			set: async (scope, key, value) => { settings.set(key, value); return value; },
		},
	};
});
afterEach(() => {
	globalThis.game = saved.game;
	globalThis.canvas = saved.canvas;
	globalThis.foundry = saved.foundry;
});

function oneFight() {
	const bram = fakeToken({ id: "tBram", col: 0, row: 0, actor: fakeActor({ id: "bram", type: "character" }) });
	const crinwin = fakeToken({ id: "tCrin", col: 1, row: 0, actor: fakeActor({ id: "crinwin", type: "monster" }) });
	const scene = fakeScene({ tokens: [bram, crinwin] });
	const cBram = fakeCombatant({ id: "cBram", token: bram, scene, side: "heroes" });
	const cCrin = fakeCombatant({ id: "cCrin", token: crinwin, scene });
	const combat = fakeCombat({ scene, combatants: [cBram, cCrin] });
	combat.update = vi.fn(async () => combat);
	combat.delete = vi.fn(async () => combat);
	for (const c of [cBram, cCrin]) c.update = vi.fn(async changes => { Object.assign(c, { lastUpdate: changes }); });
	return { scene, combat, cBram, cCrin };
}

describe("the Fight tab class", () => {
	it("draws only a header and a tracker, from templates that exist", () => {
		expect(Object.keys(FightTracker.PARTS)).toEqual(["header", "tracker"]);
		for (const part of Object.values(FightTracker.PARTS)) {
			const file = part.template.replace(/^systems\/stonetop-pwd\//, "");
			expect(fs.existsSync(path.join(ROOT, file)), file).toBe(true);
		}
		expect(FightTracker.PARTS.tracker.scrollable).toEqual([""]);
	});

	it("adds its own actions and leaves core's to the merge", () => {
		expect(Object.keys(FightTracker.DEFAULT_OPTIONS.actions).sort()).toEqual(
			["addToFight", "endFight", "lineUpFight", "openFightBook", "openFightWindow", "putBackFight", "startFight", "stopRounds", "toggleFightOverlay"],
		);
		expect(FightTracker.name).toBe("FightTracker");
	});

	it("waits for the partial preload before its first draw", async () => {
		let release;
		globalThis.game.stonetop = { templatesReady: new Promise(resolve => { release = resolve; }) };
		const tab = new FightTracker();
		const drawing = tab._preFirstRender({}, {});
		await Promise.resolve();
		expect(tab.preFirst).toBeUndefined();
		release();
		await drawing;
		expect(tab.preFirst).toBe(true);
	});

	it("builds a header with no initiative, rounds or turn state in it", async () => {
		const { combat } = oneFight();
		const tab = new FightTracker();
		tab.viewed = combat;
		tab.combats = [combat, fakeCombat({ id: "second" })];
		settings.set("fightOverlay", false);
		const context = {};
		await tab._prepareCombatContext(context, {});
		expect(context).toMatchObject({ hasCombat: true, isGM: true, overlayShown: false, isPopout: false, roundsStarted: false, canPutBack: false });
		expect(context.cycle).toEqual({ text: "Fight 1 of 2", previousId: "", nextId: "second" });
		for (const key of ["turns", "initiativeIcon", "control", "hasDecimals"]) expect(context).not.toHaveProperty(key);
	});

	it("builds the engagements for the tracker, and remembers what it drew", async () => {
		const { combat } = oneFight();
		const tab = new FightTracker();
		tab.viewed = combat;
		const context = {};
		await tab._prepareTrackerContext(context, {});
		expect(context.fight.clusters).toHaveLength(1);
		expect(context.fight.clusters[0].heroes[0]).toMatchObject({ id: "cBram", readout: "fighting crinwin" });
		expect(tab.fightSignature).toContain("cBram");
	});

	it("has nothing to draw with no fight", async () => {
		const tab = new FightTracker();
		const context = {};
		await tab._prepareTrackerContext(context, {});
		expect(context.fight).toBeNull();
	});

	it("offers GM tools in both context-menu spellings, and nothing about initiative", () => {
		const { combat, cCrin } = oneFight();
		const tab = new FightTracker();
		tab.viewed = combat;
		const entries = tab._getEntryContextOptions();
		expect(entries.map(e => e.label)).toEqual([
			"stonetop.fight.menu.switchSide", "stonetop.fight.menu.headcount", "stonetop.fight.menu.openSheet", "stonetop.fight.menu.remove",
		]);
		for (const entry of entries) {
			expect(entry.name).toBe(entry.label);
			expect(typeof entry.onClick).toBe("function");
			expect(typeof entry.callback).toBe("function");
			expect(entry.condition).toBe(entry.visible);
		}
		const li = { dataset: { combatantId: "cCrin" } };
		expect(entries[0].visible(li)).toBe(true);
		globalThis.game.user = { id: "player", isGM: false };
		expect(entries[0].visible(li)).toBe(false);
		expect(entries[3].visible(li)).toBe(false);
		expect(tab._getCombatContextOptions()).toEqual([]);
		expect(cCrin).toBeTruthy();
	});

	it("moves a combatant to the other side", async () => {
		const { combat, cCrin } = oneFight();
		const tab = new FightTracker();
		tab.viewed = combat;
		const [switchSide] = tab._getEntryContextOptions();
		await switchSide.onClick({}, { dataset: { combatantId: "cCrin" } });
		expect(cCrin.update).toHaveBeenCalledWith({ [`flags.${SYSTEM_ID}.side`]: "heroes" });
	});

	it("hides the headcount from a group monster, whose sheet counts its members", () => {
		const { combat, scene } = oneFight();
		const horde = fakeCombatant({
			id: "cHorde", scene,
			token: fakeToken({ id: "tH", actor: fakeActor({ id: "h", type: "monster", system: { organization: "horde", fightAsGroup: true } }) }),
		});
		combat.combatants = collection([...combat.combatants, horde]);
		const tab = new FightTracker();
		tab.viewed = combat;
		const headcount = tab._getEntryContextOptions()[1];
		expect(headcount.visible({ dataset: { combatantId: "cHorde" } })).toBe(false);
		expect(headcount.visible({ dataset: { combatantId: "cBram" } })).toBe(true);
	});

	it("ends the fight only when the GM confirms", async () => {
		const { combat } = oneFight();
		const confirm = vi.fn(async () => false);
		globalThis.foundry = { ...saved.foundry, applications: { api: { DialogV2: { confirm } } } };
		const hadDocument = "document" in globalThis;
		const previous = globalThis.document;
		globalThis.document = { createElement: tag => ({ tagName: tag.toUpperCase(), innerHTML: "" }) };
		try {
			const tab = new FightTracker();
			tab.viewed = combat;
			await FightTracker.DEFAULT_OPTIONS.actions.endFight.call(tab);
			expect(combat.delete).not.toHaveBeenCalled();
			const asked = confirm.mock.calls[0][0];
			expect(asked).toMatchObject({ yes: { label: "End the fight" }, no: { label: "Keep fighting" }, classes: expect.arrayContaining(["stonetop"]) });
			expect(asked.content.innerHTML).toContain("Tokens stay where they are.");
			confirm.mockResolvedValueOnce(true);
			await FightTracker.DEFAULT_OPTIONS.actions.endFight.call(tab);
			expect(combat.delete).toHaveBeenCalledTimes(1);
		} finally {
			if (hadDocument) globalThis.document = previous;
			else delete globalThis.document;
		}
	});

	it("never lets a player end a fight", async () => {
		const { combat } = oneFight();
		const confirm = vi.fn(async () => true);
		globalThis.foundry = { ...saved.foundry, applications: { api: { DialogV2: { confirm } } } };
		globalThis.game.user = { id: "player", isGM: false };
		const tab = new FightTracker();
		tab.viewed = combat;
		await FightTracker.DEFAULT_OPTIONS.actions.endFight.call(tab);
		expect(confirm).not.toHaveBeenCalled();
		expect(combat.delete).not.toHaveBeenCalled();
	});

	it("switches this reader's map lines and redraws the header", async () => {
		settings.set("fightOverlay", true);
		const tab = new FightTracker();
		await FightTracker.DEFAULT_OPTIONS.actions.toggleFightOverlay.call(tab);
		expect(settings.get("fightOverlay")).toBe(false);
		expect(tab.renders).toEqual([{ parts: ["header"] }]);
	});

	it("redraws the map-lines button through the sidebar tab when it is pressed in the window, so both say the same", async () => {
		settings.set("fightOverlay", true);
		const savedUi = globalThis.ui;
		const tab = new FightTracker();
		globalThis.ui = { ...savedUi, combat: tab };
		try {
			const popout = new FightTracker({ window: { frame: true } });
			await FightTracker.DEFAULT_OPTIONS.actions.toggleFightOverlay.call(popout);
			expect(tab.renders).toEqual([{ parts: ["header"] }]);
			expect(popout.renders).toEqual([]);
		} finally {
			globalThis.ui = savedUi;
		}
	});

	it("stops a combat started in core's tracker from counting rounds", async () => {
		const { combat } = oneFight();
		const tab = new FightTracker();
		tab.viewed = combat;
		await FightTracker.DEFAULT_OPTIONS.actions.stopRounds.call(tab);
		expect(combat.update).toHaveBeenCalledWith({ round: 0, turn: null });
	});

	describe("dragging a foe onto a hero", () => {
		/** A row as far as the handlers read it. */
		const fakeRow = (id, attr) => {
			const classes = new Set();
			const row = {
				dataset: { combatantId: id },
				classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) },
				contains: node => node === row,
				closest: selector => (selector === `[${attr}]` ? row : null),
			};
			return row;
		};
		const transfer = () => {
			const data = new Map();
			return { setData: (t, v) => data.set(t, v), getData: t => data.get(t) ?? "", get types() { return [...data.keys()]; } };
		};

		it("carries the foe's id, lights the hero it is over, and sends the foe on the drop", async () => {
			const { combat } = oneFight();
			const sendAgainst = vi.fn();
			globalThis.game.stonetop = { fight: { sendAgainst } };
			const tab = new FightTracker();
			tab.viewed = combat;
			const foe = fakeRow("cCrin", "data-fight-drag");
			const hero = fakeRow("cBram", "data-fight-drop");
			const dataTransfer = transfer();

			tab._onFightDragStart({ target: foe, dataTransfer });
			expect(dataTransfer.getData(FIGHTER_DRAG_TYPE)).toBe("cCrin");
			expect(foe.classList.contains("is-dragging")).toBe(true);

			const over = { target: hero, dataTransfer, preventDefault: vi.fn() };
			tab._onFightDragOver(over);
			expect(over.preventDefault).toHaveBeenCalled();
			expect(hero.classList.contains("is-drop-target")).toBe(true);

			const drop = { target: hero, dataTransfer, preventDefault: vi.fn() };
			tab._onFightDrop(drop);
			expect(sendAgainst).toHaveBeenCalledWith(combat, "cCrin", "cBram");
			expect(hero.classList.contains("is-drop-target")).toBe(false);
		});

		it("takes no drop that is not a foe's row, and nothing onto a row that is not a hero", () => {
			const tab = new FightTracker();
			const hero = fakeRow("cBram", "data-fight-drop");
			const foreign = { target: hero, dataTransfer: { types: ["text/plain"] }, preventDefault: vi.fn() };
			tab._onFightDragOver(foreign);
			expect(foreign.preventDefault).not.toHaveBeenCalled();
			const dataTransfer = transfer();
			dataTransfer.setData(FIGHTER_DRAG_TYPE, "cCrin");
			const onFoe = { target: fakeRow("cW", "data-fight-drag"), dataTransfer, preventDefault: vi.fn() };
			tab._onFightDragOver(onFoe);
			expect(onFoe.preventDefault).not.toHaveBeenCalled();
		});
	});

	it("hands Start, Add and Line up to the fight's own functions", () => {
		const { combat } = oneFight();
		const openStart = vi.fn();
		const lineUp = vi.fn();
		globalThis.game.stonetop = { fight: { openStart, lineUp } };
		const tab = new FightTracker();
		tab.viewed = combat;
		FightTracker.DEFAULT_OPTIONS.actions.startFight.call(tab);
		FightTracker.DEFAULT_OPTIONS.actions.addToFight.call(tab);
		FightTracker.DEFAULT_OPTIONS.actions.lineUpFight.call(tab);
		expect(openStart.mock.calls).toEqual([[], [{ combat }]]);
		expect(lineUp).toHaveBeenCalledWith(combat);
	});
});

describe("the Fight window, the tab popped out", () => {
	let savedWindow;
	beforeEach(() => {
		savedWindow = { document: globalThis.document, innerWidth: globalThis.innerWidth, innerHeight: globalThis.innerHeight };
		globalThis.innerWidth = 1920;
		globalThis.innerHeight = 1080;
		globalThis.document = { getElementById: id => (id === "sidebar" ? { getBoundingClientRect: () => ({ width: 300, left: 1620 }) } : null) };
		vi.mocked(noteFightWindowClosed).mockClear();
		vi.mocked(rememberFightWindowPosition).mockClear();
		vi.mocked(openFightWindow).mockClear();
	});
	afterEach(() => Object.assign(globalThis, savedWindow));

	/** What core's renderPopout builds from the tab's options, when the Fight tab was the open one. */
	const popOut = () => new FightTracker({
		id: "combat-popout", classes: ["active", "sidebar-popout"], window: { frame: true, positioned: true, minimizable: true },
	});

	it("opens beside the sidebar, resizable, with a swords icon", () => {
		const popout = popOut();
		expect(popout.isPopout).toBe(true);
		expect(popout.options.window).toMatchObject({ frame: true, resizable: true, icon: "fa-solid fa-swords" });
		expect(popout.options.position).toEqual({ width: FIGHT_WINDOW_WIDTH, height: "auto", left: 1620 - FIGHT_WINDOW_WIDTH - 16, top: 16 });
	});

	it("drops the tab's `active` class, which core's CSS gives no height, and adds no stonetop class", () => {
		const classes = popOut().options.classes;
		expect(classes).toContain("sidebar-popout");
		expect(classes).not.toContain("active");
		expect(classes.filter(name => name.startsWith("stonetop"))).toEqual([]);
	});

	it("leaves the sidebar tab's own options as core made them", () => {
		const tab = new FightTracker({ classes: ["active"] });
		expect(tab.options.window).toEqual({ frame: false });
		expect(tab.options.classes).toContain("active");
		expect(tab.options.position).toEqual({ width: "auto", height: "auto" });
	});

	it("remembers where the window is moved, but not where a minimized window or the tab reports", () => {
		const popout = popOut();
		popout.position = { left: 30, top: 40, width: 400, height: "auto" };
		popout._onPosition(popout.position);
		expect(rememberFightWindowPosition).toHaveBeenCalledWith({ left: 30, top: 40, width: 400, height: "auto" });
		popout.minimized = true;
		popout._onPosition(popout.position);
		new FightTracker()._onPosition({});
		expect(rememberFightWindowPosition).toHaveBeenCalledTimes(1);
	});

	it("keeps the window shut for this fight when the reader closes it, but not when the fight ended", () => {
		const popout = popOut();
		popout._onClose({});
		expect(noteFightWindowClosed).toHaveBeenCalledTimes(1);
		popout._onClose({ [FIGHT_OVER]: true });
		expect(noteFightWindowClosed).toHaveBeenCalledTimes(1);
		expect(popout.closes).toEqual([{}, { [FIGHT_OVER]: true }]);
	});

	it("tells the header it is the window, which has no button to open itself", async () => {
		const context = {};
		await popOut()._prepareCombatContext(context, {});
		expect(context.isPopout).toBe(true);
	});

	it("holds the window to the room below where it stands, so a long fight scrolls inside it", () => {
		const popout = popOut();
		const vars = new Map();
		popout.element = { style: { setProperty: (name, value) => vars.set(name, value) } };
		expect(popout._updatePosition({ top: 120.4, height: "auto" })).toEqual({ top: 120.4, height: "auto" });
		expect(vars.get("--stonetop-fight-top")).toBe("120px");
		const tab = new FightTracker();
		const tabVars = new Map();
		tab.element = { style: { setProperty: (name, value) => tabVars.set(name, value) } };
		tab._updatePosition({ top: 50 });
		expect(tabVars.size).toBe(0);
	});

	it("opens the book's advice on fights from the header's button", () => {
		const openBook = vi.fn();
		globalThis.game.stonetop = { fight: { openBook } };
		FightTracker.DEFAULT_OPTIONS.actions.openFightBook.call(new FightTracker());
		expect(openBook).toHaveBeenCalledTimes(1);
	});

	it("opens from the tab's button as the reader's own choice", () => {
		FightTracker.DEFAULT_OPTIONS.actions.openFightWindow.call(new FightTracker());
		expect(openFightWindow).toHaveBeenCalledWith({ byHand: true });
	});
});

describe("the Fight tab source", () => {
	it("never puts a stonetop class on the sidebar tab itself", () => {
		const src = fs.readFileSync(path.join(ROOT, "module/fight/FightTracker.js"), "utf8");
		const options = src.slice(src.indexOf("static DEFAULT_OPTIONS"), src.indexOf("static PARTS"));
		expect(options).not.toMatch(/classes/);
	});
});
