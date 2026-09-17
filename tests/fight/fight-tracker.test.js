import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createFightTrackerClass } from "../../module/fight/FightTracker.js";
import { SYSTEM_ID } from "../../module/system-id.js";
import { fakeActor, fakeToken, fakeScene, fakeCombatant, fakeCombat, collection } from "../fakes/fight.js";

// The Fight tab's class, over a stand-in for core's CombatTracker.

const ROOT = path.resolve(import.meta.dirname, "../..");

class FakeCombatTracker {
	static DEFAULT_OPTIONS = { actions: { activateCombatant: () => {}, toggleHidden: () => {} } };
	static PARTS = { header: {}, tracker: {}, footer: {} };
	constructor() { this.viewed = null; this.combats = []; this.renders = []; this.rendered = true; }
	async _getCombatantThumbnail(combatant) { return combatant.img || "icons/svg/mystery-man.svg"; }
	async _preFirstRender() { this.preFirst = true; }
	_attachFrameListeners() {}
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
			["addToFight", "endFight", "lineUpFight", "putBackFight", "startFight", "stopRounds", "toggleFightOverlay"],
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
		expect(context).toMatchObject({ hasCombat: true, isGM: true, overlayShown: false, roundsStarted: false, canPutBack: false });
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

	it("stops a combat started in core's tracker from counting rounds", async () => {
		const { combat } = oneFight();
		const tab = new FightTracker();
		tab.viewed = combat;
		await FightTracker.DEFAULT_OPTIONS.actions.stopRounds.call(tab);
		expect(combat.update).toHaveBeenCalledWith({ round: 0, turn: null });
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

describe("the Fight tab source", () => {
	it("never puts a stonetop class on the sidebar tab itself", () => {
		const src = fs.readFileSync(path.join(ROOT, "module/fight/FightTracker.js"), "utf8");
		const options = src.slice(src.indexOf("static DEFAULT_OPTIONS"), src.indexOf("static PARTS"));
		expect(options).not.toMatch(/classes/);
	});
});
