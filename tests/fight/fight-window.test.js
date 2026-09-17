import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fightWindowStep, fightWindowPlacement, FIGHT_WINDOW_WIDTH, FIGHT_OVER } from "../../module/fight/fight-window.js";
import { fakeActor, fakeToken, fakeScene, fakeCombatant, fakeCombat, collection } from "../fakes/fight.js";

// The Fight window: when this reader's pop-out of the Fight tab opens and closes, and where.

describe("fightWindowStep", () => {
	const step = (decided, p) => fightWindowStep(decided, { canSeeSomeone: true, auto: true, closedId: null, ...p });

	it("opens once for a fight on the reader's map", () => {
		expect(step(null, { fightId: "f1" })).toEqual({ decided: "f1", action: "open" });
		expect(step("f1", { fightId: "f1" })).toEqual({ decided: "f1", action: null });
	});

	it("does not reopen a window the reader closed on the same fight, however often the fight redraws", () => {
		expect(step("f1", { fightId: "f1", closedId: "f1" })).toEqual({ decided: "f1", action: null });
	});

	it("keeps a fight the reader closed the window on shut after a reload, and opens for the next fight", () => {
		expect(step(null, { fightId: "f1", closedId: "f1" })).toEqual({ decided: "f1", action: null });
		expect(step("f1", { fightId: "f2", closedId: "f1" })).toEqual({ decided: "f2", action: "open" });
	});

	it("waits for a player to see someone in the fight before opening, so an ambush stays hidden", () => {
		expect(step(null, { fightId: "f1", canSeeSomeone: false })).toEqual({ decided: null, action: null });
		expect(step(null, { fightId: "f1", canSeeSomeone: true })).toEqual({ decided: "f1", action: "open" });
	});

	it("closes when the map has no fight any more, and has nothing to close when it never opened", () => {
		expect(step("f1", { fightId: null })).toEqual({ decided: null, action: "close" });
		expect(step(null, { fightId: null })).toEqual({ decided: null, action: null });
	});

	it("closes on a new fight the player cannot see anyone in yet", () => {
		expect(step("f1", { fightId: "f2", canSeeSomeone: false })).toEqual({ decided: null, action: "close" });
	});

	it("never opens for a reader who switched it off, but still closes at the end of the fight", () => {
		expect(step(null, { fightId: "f1", auto: false })).toEqual({ decided: "f1", action: null });
		expect(step("f1", { fightId: null, auto: false })).toEqual({ decided: null, action: "close" });
	});
});

describe("fightWindowPlacement", () => {
	const viewport = { width: 1920, height: 1080 };

	it("first opens at the top of the screen against the sidebar, fitting its content", () => {
		expect(fightWindowPlacement({ viewport, sidebarLeft: 1620 })).toEqual({
			left: 1620 - FIGHT_WINDOW_WIDTH - 16, top: 16, width: FIGHT_WINDOW_WIDTH,
		});
	});

	it("stands against the screen's edge with no sidebar", () => {
		expect(fightWindowPlacement({ viewport }).left).toBe(1920 - FIGHT_WINDOW_WIDTH - 16);
	});

	it("opens where the reader left it, at the size they dragged it to", () => {
		expect(fightWindowPlacement({ viewport, sidebarLeft: 1620, saved: { left: 200, top: 90, width: 520, height: 700 } }))
			.toEqual({ left: 200, top: 90, width: 520, height: 700 });
	});

	it("keeps a place saved on a bigger screen within reach", () => {
		const small = { width: 1280, height: 720 };
		const placed = fightWindowPlacement({ viewport: small, saved: { left: 2400, top: 1300, width: 1600, height: 1400 } });
		expect(placed).toEqual({ left: 0, top: 720 - 48, width: 1280, height: 720 });
	});

	it("ignores a saved place that is not numbers", () => {
		expect(fightWindowPlacement({ viewport, sidebarLeft: 1620, saved: { left: "x", top: null, height: "auto" } }))
			.toEqual({ left: 1620 - FIGHT_WINDOW_WIDTH - 16, top: 16, width: FIGHT_WINDOW_WIDTH });
	});
});

describe("the Fight window at the table", () => {
	let saved;
	let store;
	let win;

	beforeEach(async () => {
		saved = {
			game: globalThis.game, ui: globalThis.ui, canvas: globalThis.canvas, document: globalThis.document,
			innerWidth: globalThis.innerWidth, innerHeight: globalThis.innerHeight,
		};
		store = new Map();
		// Module state (which fight this client decided about) starts fresh, as it does on a reload.
		vi.resetModules();
		win = await import("../../module/fight/fight-window.js");
	});
	afterEach(() => {
		vi.useRealTimers();
		Object.assign(globalThis, saved);
	});

	/** Core's sidebar tab, as far as the window reads it: what it is viewing, its pop-out, and the two renders. */
	function fakeTab() {
		const tab = {
			viewed: null,
			popout: undefined,
			render: vi.fn(),
			renderPopout: vi.fn(async () => {
				tab.popout ??= {
					rendered: false,
					minimized: false,
					close: vi.fn(async () => { tab.popout.rendered = false; }),
				};
				tab.popout.rendered = true;
				return tab.popout;
			}),
		};
		return tab;
	}

	/** Bram and a crinwin in a fight on the map the reader is looking at. */
	function table({ user = { id: "gm", isGM: true }, crinwinHidden = false, bramHidden = false, settings = {} } = {}) {
		const bram = fakeToken({ id: "tBram", col: 0, row: 0, hidden: bramHidden, actor: fakeActor({ id: "bram" }) });
		const crinwin = fakeToken({ id: "tCrin", col: 1, row: 0, hidden: crinwinHidden, actor: fakeActor({ id: "crinwin", type: "monster" }) });
		const scene = fakeScene({ tokens: [bram, crinwin] });
		const combat = fakeCombat({
			scene,
			combatants: [
				fakeCombatant({ id: "cBram", token: bram, scene, side: "heroes", hidden: bramHidden, visible: !bramHidden }),
				fakeCombatant({ id: "cCrin", token: crinwin, scene, side: "foes", hidden: crinwinHidden, visible: !crinwinHidden }),
			],
		});
		for (const [key, value] of Object.entries(settings)) store.set(key, value);
		const tab = fakeTab();
		globalThis.game = {
			...saved.game,
			ready: true,
			user,
			users: collection([]),
			combats: collection([combat]),
			settings: {
				get: (scope, key) => { if (!store.has(key)) throw new Error(`unregistered ${key}`); return store.get(key); },
				set: vi.fn(async (scope, key, value) => { store.set(key, value); return value; }),
			},
		};
		globalThis.ui = { ...saved.ui, combat: tab };
		globalThis.canvas = { scene };
		return { scene, combat, tab };
	}

	it("does nothing before the game is ready: a reload's first canvasReady comes too early", () => {
		const { tab } = table();
		globalThis.game.ready = false;
		win.syncFightWindow();
		expect(tab.renderPopout).not.toHaveBeenCalled();
	});

	it("pops the tab out for the fight on the reader's map, showing that fight", async () => {
		const { combat, tab } = table();
		await win.syncFightWindow();
		expect(tab.viewed).toBe(combat);
		expect(tab.render).toHaveBeenCalled();
		expect(tab.renderPopout).toHaveBeenCalledTimes(1);
		await win.syncFightWindow();
		expect(tab.renderPopout).toHaveBeenCalledTimes(1);
	});

	it("leaves a tab already showing the fight alone, and only pops it out", async () => {
		const { combat, tab } = table();
		tab.viewed = combat;
		await win.syncFightWindow();
		expect(tab.render).not.toHaveBeenCalled();
		expect(tab.renderPopout).toHaveBeenCalledTimes(1);
	});

	it("opens nothing for a player while every foe is hidden and their own token is too", async () => {
		const player = { id: "player", isGM: false };
		const { combat, tab } = table({ user: player, crinwinHidden: true, bramHidden: true });
		await win.syncFightWindow();
		expect(tab.renderPopout).not.toHaveBeenCalled();
		// The GM reveals the crinwin.
		const crin = combat.combatants.get("cCrin");
		Object.assign(crin, { hidden: false, visible: true });
		Object.assign(crin.token, { hidden: false });
		await win.syncFightWindow();
		expect(tab.renderPopout).toHaveBeenCalledTimes(1);
	});

	it("opens at once for a GM, hidden foes and all", async () => {
		const { tab } = table({ crinwinHidden: true, bramHidden: true });
		await win.syncFightWindow();
		expect(tab.renderPopout).toHaveBeenCalledTimes(1);
	});

	it("closes when the fight ends, even while the tab has not let go of it yet", async () => {
		const { combat, tab } = table();
		await win.syncFightWindow();
		// Core has taken the combat out of the world; the tab's redraw has not landed.
		tab.viewed = combat;
		globalThis.game.combats = collection([]);
		await win.syncFightWindow();
		expect(tab.popout.close).toHaveBeenCalledWith({ [FIGHT_OVER]: true });
		expect(tab.popout.rendered).toBe(false);
	});

	it("closes when the reader goes to a map with no fight, and opens again when they come back", async () => {
		const { scene, tab } = table();
		await win.syncFightWindow();
		globalThis.canvas = { scene: fakeScene({ id: "elsewhere" }) };
		await win.syncFightWindow();
		expect(tab.popout.close).toHaveBeenCalledTimes(1);
		globalThis.canvas = { scene };
		await win.syncFightWindow();
		expect(tab.renderPopout).toHaveBeenCalledTimes(2);
	});

	it("stays shut for a fight the reader closed it on, across a reload, and opens by hand", async () => {
		const { tab } = table();
		await win.syncFightWindow();
		win.noteFightWindowClosed();
		expect(store.get("fightWindow")).toEqual({ closed: "combat1" });

		vi.resetModules();
		const reloaded = await import("../../module/fight/fight-window.js");
		await reloaded.syncFightWindow();
		expect(tab.renderPopout).toHaveBeenCalledTimes(1);

		await reloaded.openFightWindow({ byHand: true });
		expect(tab.renderPopout).toHaveBeenCalledTimes(2);
		expect(store.get("fightWindow")).toEqual({ closed: null });
	});

	it("records no closing before it has decided about a fight", () => {
		table();
		win.noteFightWindowClosed();
		expect(store.has("fightWindow")).toBe(false);
	});

	it("never opens for a reader who switched it off", async () => {
		const { tab } = table({ settings: { fightWindowAuto: false } });
		await win.syncFightWindow();
		expect(tab.renderPopout).not.toHaveBeenCalled();
	});

	it("writes down where the window was left once the reader stops moving it, numbers only", () => {
		vi.useFakeTimers();
		table();
		win.rememberFightWindowPosition({ left: 10, top: 20, width: 380, height: "auto" });
		win.rememberFightWindowPosition({ left: 12.4, top: 22.6, width: 400.2, height: "auto" });
		expect(globalThis.game.settings.set).not.toHaveBeenCalled();
		vi.advanceTimersByTime(500);
		expect(globalThis.game.settings.set).toHaveBeenCalledTimes(1);
		expect(store.get("fightWindow")).toEqual({ position: { left: 12, top: 23, width: 400 } });
		// The same place again is not a write.
		win.rememberFightWindowPosition({ left: 12, top: 23, width: 400, height: "auto" });
		vi.advanceTimersByTime(500);
		expect(globalThis.game.settings.set).toHaveBeenCalledTimes(1);
	});

	it("opens where the reader left it, beside the sidebar the first time", () => {
		table();
		globalThis.innerWidth = 1920;
		globalThis.innerHeight = 1080;
		globalThis.document = { getElementById: id => (id === "sidebar" ? { getBoundingClientRect: () => ({ width: 300, left: 1620 }) } : null) };
		expect(win.fightWindowPosition()).toEqual({ left: 1620 - FIGHT_WINDOW_WIDTH - 16, top: 16, width: FIGHT_WINDOW_WIDTH });
		store.set("fightWindow", { position: { left: 40, top: 50, width: 500, height: 600 } });
		expect(win.fightWindowPosition()).toEqual({ left: 40, top: 50, width: 500, height: 600 });
	});

	it("tells Start a fight whether the window will show the fight", async () => {
		const { tab } = table();
		expect(win.fightWindowWillShow({ started: true })).toBe(true);
		expect(win.fightWindowWillShow({ started: false })).toBe(false);
		store.set("fightWindowAuto", false);
		expect(win.fightWindowWillShow({ started: true })).toBe(false);
		await tab.renderPopout();
		expect(win.fightWindowWillShow({ started: false })).toBe(true);
	});

	it("checks for a fight already on the map at ready", async () => {
		const handlers = new Map();
		win.installFightWindow({ hooks: { on: (name, fn) => handlers.set(name, fn) } });
		const { tab } = table();
		await handlers.get("ready")();
		expect(tab.renderPopout).toHaveBeenCalledTimes(1);
	});

	it("reports a window that fails to draw, rather than leaving an unhandled rejection", async () => {
		const { tab } = table();
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		tab.renderPopout.mockRejectedValueOnce(new Error("boom"));
		await win.syncFightWindow();
		expect(error).toHaveBeenCalledWith("Stonetop | Fight window:", expect.any(Error));
		error.mockRestore();
	});
});
