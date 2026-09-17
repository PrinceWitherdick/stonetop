import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import Handlebars from "handlebars";

vi.mock("../../module/combat/attack-flow.js", () => ({
	pcDamageDie: vi.fn(async actor => String(actor?.system?.attributes?.damage?.value ?? "")),
	rollDamageAt: vi.fn(async () => true),
}));

import {
	ringButtons, ringButtonsFor, runRingButton, ringFightFor, clickOpensRing, ringGrowth, dieIcon, ringContext,
	createFightRingClass, createFightTokenClass, openRingOnClick, onBoardPress, closeFightRing, syncFightRing,
	installFightRing, currentFightRing, RING_MOVES,
} from "../../module/fight/fight-ring.js";
import { rollDamageAt } from "../../module/combat/attack-flow.js";
import { SYSTEM_ID } from "../../module/system-id.js";
import { fakeActor, fakeToken, fakeScene, fakeCombatant, fakeCombat, collection } from "../fakes/fight.js";

// The fight ring: the buttons a click puts round a token in the fight, what each one rolls, and when
// the ring comes up and goes away.

const ROOT = path.resolve(import.meta.dirname, "../..");
const template = Handlebars.compile(fs.readFileSync(path.join(ROOT, "templates/hud/fight-ring.hbs"), "utf8"));

/** A printed blow's armor clause, as utils/damage.js#attackWeapon builds it. */
const weapon = (tags, { piercing = 0, ignoresArmor = false } = {}) => ({ name: "", range: [], piercing, ignoresArmor, tags, area: false });

const item = (id, type, name, system = {}, sort = 0) => ({ id, type, name, system, sort, roll: vi.fn(async () => {}) });

function bram({ items = null, die = "d8" } = {}) {
	const actor = fakeActor({ id: "bram", name: "Bram", type: "character", system: { attributes: { damage: { value: die } } } });
	actor.items = collection(items ?? [
		item("letfly", "move", "Let Fly", {}, 2),
		item("defy", "move", "Defy Danger", {}, 0),
		item("clash", "move", "Clash", {}, 1),
	]);
	actor.sheet = { rollMoveById: vi.fn(async () => {}) };
	return actor;
}

/** The Gwyllgi as it ships: two blows on its damage line, a third on a move, and two moves that roll nothing. */
function gwyllgi() {
	const actor = fakeActor({
		id: "gwyllgi", name: "Gwyllgi", type: "monster",
		system: { attributes: { damage: { value: "claws d8 (close) or bite d8+2 (hand, grabby, forceful)", rollFormula: "d8+2" } } },
	});
	actor.items = collection([
		item("m1", "monsterMove", "Manifest as a black wolf with blazing red eyes", { rollFormula: "" }),
		item("m2", "monsterMove", "Breathe forth a baleful cloud, d6 damage (reach, area, ignores armor)", { rollFormula: "d6" }),
	]);
	return actor;
}

let saved;
let settings;
beforeEach(() => {
	saved = { settings: globalThis.game.settings, combats: globalThis.game.combats, user: globalThis.game.user, activeTool: globalThis.game.activeTool, canvas: globalThis.canvas, ui: globalThis.ui, applications: globalThis.foundry.applications };
	settings = new Map([["fightTab", true], ["fightRing", true]]);
	globalThis.game.settings = { get: (scope, key) => settings.get(key) };
	globalThis.game.user = { id: "player", isGM: false };
	globalThis.game.activeTool = "select";
	vi.mocked(rollDamageAt).mockClear();
});
afterEach(() => {
	globalThis.game.settings = saved.settings;
	globalThis.game.combats = saved.combats;
	globalThis.game.user = saved.user;
	globalThis.game.activeTool = saved.activeTool;
	globalThis.canvas = saved.canvas;
	globalThis.ui = saved.ui;
	globalThis.foundry.applications = saved.applications;
});

describe("ringButtons", () => {
	it("gives a character Clash then Let Fly, and their damage die", () => {
		const { moves, damage } = ringButtons(bram(), { die: "d8" });
		expect(moves).toEqual([
			{ run: "move", itemId: "clash", label: "Clash", icon: "fa-solid fa-swords" },
			{ run: "move", itemId: "letfly", label: "Let Fly", icon: "fa-solid fa-bow-arrow" },
		]);
		expect(damage).toEqual([{ run: "damage", label: "Damage", formula: "d8", weapon: null, icon: "fa-solid fa-dice-d8" }]);
	});

	it("leaves off a move the character does not have, and a namesake that is not a move", () => {
		const actor = bram({ items: [item("clash", "move", "Clash"), item("book", "inventory", "Let Fly")] });
		expect(ringButtons(actor, { die: "d6" }).moves.map(m => m.label)).toEqual(["Clash"]);
	});

	it("has no damage button for a character with no die", () => {
		expect(ringButtons(bram(), { die: " " }).damage).toEqual([]);
	});

	it("gives a monster a button for every blow on its damage line and every move that rolls, in the stat block's words", () => {
		const { moves, damage } = ringButtons(gwyllgi());
		expect(moves).toEqual([]);
		expect(damage).toEqual([
			{ run: "damage", label: "Claws", formula: "d8", keywords: "close", rollMode: "normal", weapon: weapon(["close"]), icon: "fa-solid fa-dice-d8" },
			{ run: "damage", label: "Bite", formula: "d8+2", keywords: "hand, grabby, forceful", rollMode: "normal", weapon: weapon(["hand", "grabby", "forceful"]), icon: "fa-solid fa-dice-d8" },
			{ run: "item", itemId: "m2", label: "Breathe forth a baleful cloud", formula: "d6", icon: "fa-solid fa-dice-d6" },
		]);
	});

	it("carries each blow's armor clause, for the Apply that takes armor off it", () => {
		const actor = fakeActor({ id: "m", type: "monster", system: { attributes: { damage: { value: "dagger d10 (hand, 1 piercing) or garrote d8 (hand, grabby, ignores armor)" } } } });
		const [dagger, garrote] = ringButtons(actor).damage;
		expect(dagger.weapon).toMatchObject({ piercing: 1, ignoresArmor: false });
		expect(garrote.weapon).toMatchObject({ piercing: 0, ignoresArmor: true, tags: ["hand", "grabby", "ignores armor"] });
	});

	it("rolls a monster's noted disadvantage the way its stat block does", () => {
		const actor = fakeActor({ id: "m", type: "monster", system: { attributes: { damage: { value: "icy touch d6 w/disadvantage (hand)" } } } });
		expect(ringButtons(actor).damage[0]).toMatchObject({ formula: "d6", rollMode: "dis" });
	});

	it("falls back to a hand-written monster's formula when its damage line prints no die", () => {
		const actor = fakeActor({ id: "m", type: "monster", system: { attributes: { damage: { value: "", rollFormula: "2d4 + 1" } } } });
		expect(ringButtons(actor).damage).toEqual([
			{ run: "damage", label: "Damage", formula: "2d4+1", keywords: "", rollMode: "normal", weapon: null, icon: "fa-solid fa-dice-d4" },
		]);
	});

	it("gives an NPC its one damage button, titled with the blow that prints its die, and none of its moves", () => {
		const actor = fakeActor({ id: "n", type: "npc", system: { attributes: { damage: { value: "spear d8 (close, reach)", rollFormula: "d8" } } } });
		actor.items = collection([item("x", "npcMove", "Shout for help", { rollFormula: "d6" })]);
		expect(ringButtons(actor)).toEqual({
			moves: [],
			damage: [{ run: "damage", label: "Spear", formula: "d8", keywords: "close, reach", weapon: weapon(["close", "reach"]), icon: "fa-solid fa-dice-d8" }],
		});
	});

	it("has nothing for an NPC with no formula, or anything that is not a fighter", () => {
		expect(ringButtons(fakeActor({ id: "n", type: "npc", system: { attributes: { damage: { value: "fists" } } } }))).toEqual({ moves: [], damage: [] });
		expect(ringButtons(fakeActor({ id: "s", type: "stonetop" }))).toEqual({ moves: [], damage: [] });
		expect(ringButtons(null)).toEqual({ moves: [], damage: [] });
	});

	it("looks the character's die up the way the attack flow does", async () => {
		expect((await ringButtonsFor(bram({ die: "d10" }))).damage[0].formula).toBe("d10");
	});

	it("offers exactly the two basic attacks", () => {
		expect(RING_MOVES.map(m => m.name)).toEqual(["Clash", "Let Fly"]);
	});
});

describe("dieIcon", () => {
	it("draws the die a formula opens with, and a pair of dice for one Font Awesome has no face for", () => {
		expect(dieIcon("d12+2")).toBe("fa-solid fa-dice-d12");
		expect(dieIcon("2d4")).toBe("fa-solid fa-dice-d4");
		expect(dieIcon("d20")).toBe("fa-solid fa-dice-d20");
		expect(dieIcon("d3")).toBe("fa-solid fa-dice");
		expect(dieIcon("")).toBe("fa-solid fa-dice");
	});
});

describe("runRingButton", () => {
	it("rolls a character's move through their sheet, the way the hotbar does, passing Shift along", async () => {
		const actor = bram();
		await runRingButton({ run: "move", itemId: "clash" }, actor, { shiftKey: true });
		expect(actor.sheet.rollMoveById).toHaveBeenCalledWith("clash", { shiftKey: true });
	});

	it("rolls the move itself when the sheet cannot", async () => {
		const actor = bram();
		actor.sheet = {};
		await runRingButton({ run: "move", itemId: "clash" }, actor);
		expect(actor.items.get("clash").roll).toHaveBeenCalled();
	});

	it("rolls a monster's move item as its sheet's roll button does", async () => {
		const actor = gwyllgi();
		await runRingButton({ run: "item", itemId: "m2" }, actor, { shiftKey: false });
		expect(actor.items.get("m2").roll).toHaveBeenCalledWith({ shiftKey: false });
	});

	it("rolls a blow at whoever the monster is fighting, with its title, tags, advantage and armor clause", async () => {
		const actor = gwyllgi();
		const [, bite] = ringButtons(actor).damage;
		await runRingButton(bite, actor);
		expect(rollDamageAt).toHaveBeenCalledWith(actor, {
			formula: "d8+2", label: "Bite", keywords: "hand, grabby, forceful", rollMode: "normal",
			weapon: weapon(["hand", "grabby", "forceful"]), shiftKey: false,
		});
	});

	it("rolls a character's damage as the sheet's Damage button does, Shift and all", async () => {
		const actor = bram();
		await runRingButton(ringButtons(actor, { die: "d8" }).damage[0], actor, { shiftKey: true });
		expect(rollDamageAt).toHaveBeenCalledWith(actor, { formula: "d8", label: "Damage", weapon: null, shiftKey: true });
	});

	it("does nothing without a button or an actor", async () => {
		await runRingButton(null, bram());
		await runRingButton({ run: "damage", formula: "d6" }, null);
		expect(rollDamageAt).not.toHaveBeenCalled();
	});
});

/** Bram and a gwyllgi in a fight on the canvas scene, and a bystander who is not in it. */
function table() {
	const bramToken = fakeToken({ id: "tBram", col: 0, row: 0, actor: bram() });
	const foeToken = fakeToken({ id: "tFoe", col: 1, row: 0, actor: gwyllgi() });
	const bystander = fakeToken({ id: "tBy", col: 5, row: 5, actor: bram() });
	const scene = fakeScene({ tokens: [bramToken, foeToken, bystander] });
	const combat = fakeCombat({
		scene,
		combatants: [
			fakeCombatant({ id: "cBram", token: bramToken, scene, side: "heroes" }),
			fakeCombatant({ id: "cFoe", token: foeToken, scene, side: "foes" }),
		],
	});
	globalThis.game.combats = collection([combat]);
	globalThis.canvas = { scene, stage: { scale: { x: 1 } } };
	globalThis.ui = { ...saved.ui, combat: { viewed: combat } };
	const placeable = doc => ({ document: doc, actor: doc.actor, controlled: true, destroyed: false });
	return { scene, combat, bram: placeable(bramToken), foe: placeable(foeToken), bystander: placeable(bystander) };
}

describe("ringFightFor", () => {
	it("finds the fight a token on the canvas scene is in", () => {
		const { bram: token, combat } = table();
		expect(ringFightFor(token)).toMatchObject({ combat, combatant: { id: "cBram" } });
	});

	it("has nothing for a token that is not in the fight", () => {
		expect(ringFightFor(table().bystander)).toBeNull();
	});

	it("has nothing for a token on a scene nobody is looking at", () => {
		const { bram: token } = table();
		expect(ringFightFor(token, { canvasScene: { id: "elsewhere" } })).toBeNull();
	});

	it("has nothing for a reader who turned the ring off, or with the Fight tab off", () => {
		const { bram: token } = table();
		settings.set("fightRing", false);
		expect(ringFightFor(token)).toBeNull();
		settings.set("fightRing", true);
		settings.set("fightTab", false);
		expect(ringFightFor(token)).toBeNull();
	});
});

describe("clickOpensRing", () => {
	const click = p => clickOpensRing({ tokenId: "t", tool: "select", modifiers: false, controlled: true, ...p });

	it("opens on a plain click that selected the token", () => {
		expect(click({})).toBe(true);
		expect(click({ pressedOn: "other" })).toBe(true);
	});

	it("puts it away instead when this press closed the same token's ring", () => {
		expect(click({ pressedOn: "t" })).toBe(false);
	});

	it("stays down while aiming or measuring, for a modified click, and for a token the click did not leave selected", () => {
		expect(click({ tool: "target" })).toBe(false);
		expect(click({ tool: "ruler" })).toBe(false);
		expect(click({ modifiers: true })).toBe(false);
		expect(click({ controlled: false })).toBe(false);
	});
});

describe("ringGrowth", () => {
	it("leaves the ring alone where the map already draws it at least its natural size", () => {
		expect(ringGrowth(1, 1)).toBe(1);
		expect(ringGrowth(2.5, 1)).toBe(1);
		expect(ringGrowth(2, 0.5)).toBe(1);
	});

	it("grows it back to its natural size on screen when zoomed out, or on a small grid", () => {
		expect(ringGrowth(0.5, 1)).toBe(2);
		expect(ringGrowth(1, 0.5)).toBe(2);
		expect(ringGrowth(0.25, 2)).toBe(2);
	});

	it("does nothing with a scale it cannot read", () => {
		expect(ringGrowth(0, 1)).toBe(1);
		expect(ringGrowth(undefined, 1)).toBe(1);
	});
});

describe("the ring's template", () => {
	it("puts moves on the left and damage on the right, numbered straight through, each saying what it rolls", () => {
		const context = ringContext(ringButtons(bram(), { die: "d8" }), { name: "Bram" });
		expect([...context.moves, ...context.damage].map(b => b.label)).toEqual(["Clash", "Let Fly", "Damage"]);
		const html = template(context);
		const left = html.slice(html.indexOf("col left"), html.indexOf("col right"));
		const right = html.slice(html.indexOf("col right"));
		expect(left).toContain('data-index="0"');
		expect(left).toContain('aria-label="Roll Clash"');
		expect(left).toContain('data-index="1"');
		expect(left).not.toContain("stonetop-fight-ring-formula");
		expect(right).toContain('data-index="2"');
		expect(right).toContain('aria-label="Roll damage: Damage, d8"');
		expect(right).toContain('<span class="stonetop-fight-ring-formula">d8</span>');
		expect(html).toContain('aria-label="Bram in the fight: Moves"');
		for (const button of html.match(/<button[^>]*>/g)) expect(button).toContain('type="button"');
	});

	it("always renders both columns, so core does not unwrap a lone one", () => {
		const html = template(ringContext(ringButtons(gwyllgi()), { name: "Gwyllgi" }));
		expect(html).toContain("col left");
		expect(html).toContain("col right");
		const holder = html.match(/<div class="col [^"]*"/g);
		expect(holder).toHaveLength(2);
	});

	it("escapes a name a GM typed", () => {
		const actor = fakeActor({ id: "n", type: "npc", system: { attributes: { damage: { value: "<b>claw</b> d4", rollFormula: "d4" } } } });
		expect(template(ringContext(ringButtons(actor)))).not.toContain("<b>");
	});
});

// Core's HUD base, as much of it as the ring leans on: rendering, closing, placement.
class FakeHUD {
	static DEFAULT_OPTIONS = {};
	rendered = false;
	object = undefined;
	renders = [];
	closes = 0;
	positions = 0;
	get document() { return this.object?.document; }
	async render(options) {
		this.renders.push(options);
		this.object = options.object;
		this.context = await this._prepareContext(options);
		this.rendered = true;
		return this;
	}
	async close() { this.closes++; this.rendered = false; this.object = undefined; }
	setPosition() { this.positions++; }
	_updatePosition(position) { return Object.assign(position, { left: 10, top: 20, width: 100, height: 100, scale: 1 }); }
}
const fakeFoundry = { hud: { BasePlaceableHUD: FakeHUD }, api: { HandlebarsApplicationMixin: Base => class extends Base {} } };

describe("the ring window", () => {
	const Ring = createFightRingClass({ applications: fakeFoundry });

	it("is core's placeable HUD, marked as ours, with the one action its buttons use", () => {
		expect(Ring.prototype).toBeInstanceOf(FakeHUD);
		expect(Ring.DEFAULT_OPTIONS).toMatchObject({ id: "stonetop-fight-ring", classes: ["stonetop-fight-ring"] });
		expect(Ring.PARTS.ring).toEqual({ root: true, template: "systems/stonetop-pwd/templates/hud/fight-ring.hbs" });
		expect(typeof Ring.DEFAULT_OPTIONS.actions.ringRoll).toBe("function");
	});

	it("grows round the token when zoomed out, keeping its box on the token", () => {
		const ring = new Ring();
		globalThis.canvas = { stage: { scale: { x: 0.5 } } };
		expect(ring._updatePosition({})).toEqual({ left: 10, top: 20, width: 50, height: 50, scale: 2 });
		globalThis.canvas = { stage: { scale: { x: 1.5 } } };
		expect(ring._updatePosition({})).toEqual({ left: 10, top: 20, width: 100, height: 100, scale: 1 });
	});

	it("rolls the pressed button for the token's actor, after putting itself away", async () => {
		const { bram: token } = table();
		const ring = new Ring();
		await ring.render({ object: token, ringButtons: ringButtons(token.actor, { die: "d8" }) });
		const actor = token.actor;
		await Ring.DEFAULT_OPTIONS.actions.ringRoll.call(ring, { shiftKey: false }, { dataset: { index: "1" } });
		expect(ring.closes).toBe(1);
		expect(actor.sheet.rollMoveById).toHaveBeenCalledWith("letfly", { shiftKey: false });
		await ring.render({ object: token });
		await Ring.DEFAULT_OPTIONS.actions.ringRoll.call(ring, { shiftKey: true }, { dataset: { index: "2" } });
		expect(rollDamageAt).toHaveBeenCalledWith(actor, { formula: "d8", label: "Damage", weapon: null, shiftKey: true });
	});
});

describe("clicking tokens", () => {
	beforeEach(async () => {
		globalThis.foundry.applications = fakeFoundry;
		await closeFightRing();
		// A press the previous test left remembered is spent by the next click.
		await openRingOnClick(null, {});
	});

	const renders = () => currentFightRing()?.renders.length ?? 0;

	it("puts the ring up on a plain click, with the token's buttons", async () => {
		const { bram: token } = table();
		await openRingOnClick(token, {});
		const ring = currentFightRing();
		expect(ring.rendered).toBe(true);
		expect(ring.object).toBe(token);
		expect(ring.renders.at(-1)).toMatchObject({ force: true, position: true, object: token });
		expect(ring.context.moves.map(m => m.label)).toEqual(["Clash", "Let Fly"]);
	});

	it("puts it away on the next press, and keeps it away when that press was on the same token", async () => {
		const { bram: token } = table();
		await openRingOnClick(token, {});
		const ring = currentFightRing();
		await onBoardPress();
		expect(ring.rendered).toBe(false);
		await openRingOnClick(token, {});
		expect(ring.rendered).toBe(false);
		// The click after that is a fresh one.
		await openRingOnClick(token, {});
		expect(ring.rendered).toBe(true);
	});

	it("moves to another token clicked while it is up", async () => {
		const { bram: token, foe } = table();
		await openRingOnClick(token, {});
		await onBoardPress();
		await openRingOnClick(foe, {});
		const ring = currentFightRing();
		expect(ring.rendered).toBe(true);
		expect(ring.object).toBe(foe);
		expect(ring.context.damage.map(d => d.label)).toEqual(["Claws", "Bite", "Breathe forth a baleful cloud"]);
	});

	it("does not come up for a token outside the fight, a Shift-click, the target tool, or a token let go of meanwhile", async () => {
		const { bram: token, bystander } = table();
		const before = renders();
		await openRingOnClick(bystander, {});
		await openRingOnClick(token, { shiftKey: true });
		await openRingOnClick({ ...token, controlled: false }, {});
		globalThis.game.activeTool = "target";
		await openRingOnClick(token, {});
		expect(renders()).toBe(before);
	});

	it("does not come up for a token with nothing to roll", async () => {
		const { bram: token } = table();
		token.document.actor = fakeActor({ id: "empty", type: "character" });
		token.document.actor.items = collection([]);
		const before = renders();
		await openRingOnClick(token, {});
		expect(renders()).toBe(before);
	});

	it("goes away when its token leaves the fight", async () => {
		const { bram: token, combat } = table();
		await openRingOnClick(token, {});
		combat.combatants = collection([]);
		syncFightRing();
		expect(currentFightRing().rendered).toBe(false);
	});

	it("follows its token and the zoom, and goes away when the token is let go of", async () => {
		const hooks = fakeHooks();
		installFightRing({ hooks });
		const { bram: token, foe } = table();
		await openRingOnClick(token, {});
		const ring = currentFightRing();
		const moved = ring.positions;
		hooks.fire("refreshToken", foe, {});
		expect(ring.positions).toBe(moved);
		hooks.fire("refreshToken", token, {});
		hooks.fire("canvasPan", {}, { scale: 0.5 });
		expect(ring.positions).toBe(moved + 2);
		hooks.fire("controlToken", foe, false);
		expect(ring.rendered).toBe(true);
		hooks.fire("controlToken", token, false);
		expect(ring.rendered).toBe(false);
	});

	it("goes away when its token is deleted, the map closes, or the reader switches it off", async () => {
		const hooks = fakeHooks();
		installFightRing({ hooks });
		const { bram: token } = table();
		const ring = async () => { await openRingOnClick(token, {}); return currentFightRing(); };
		hooks.fire("deleteToken", { id: "tBram" });
		expect((await ring()).rendered).toBe(true);
		hooks.fire("deleteToken", { id: "tBram" });
		expect(currentFightRing().rendered).toBe(false);
		await ring();
		hooks.fire("canvasTearDown");
		expect(currentFightRing().rendered).toBe(false);
		await ring();
		hooks.fire("clientSettingChanged", "core.something");
		expect(currentFightRing().rendered).toBe(true);
		hooks.fire("clientSettingChanged", `${SYSTEM_ID}.fightRing`);
		expect(currentFightRing().rendered).toBe(false);
	});

	it("listens for presses on the board once, before core sees them", () => {
		const hooks = fakeHooks();
		installFightRing({ hooks });
		const view = { addEventListener: vi.fn() };
		hooks.fire("canvasReady", { app: { view } });
		hooks.fire("canvasReady", { app: { view } });
		expect(view.addEventListener).toHaveBeenCalledTimes(1);
		expect(view.addEventListener).toHaveBeenCalledWith("pointerdown", onBoardPress, { capture: true });
	});
});

describe("the token class", () => {
	it("lets core handle the click first, then offers the ring", () => {
		const calls = [];
		class CoreToken { _onUnclickLeft(event) { calls.push(["core", event]); } }
		const Token = createFightTokenClass(CoreToken);
		const token = new Token();
		token.document = null;
		const event = { shiftKey: true };
		token._onUnclickLeft(event);
		expect(Token.prototype).toBeInstanceOf(CoreToken);
		expect(Token.name).toBe("StonetopToken");
		expect(calls).toEqual([["core", event]]);
	});
});

function fakeHooks() {
	const on = new Map();
	return {
		on: (name, fn) => { on.set(name, [...(on.get(name) ?? []), fn]); return on.get(name).length; },
		off: () => {},
		fire: (name, ...args) => { for (const fn of on.get(name) ?? []) fn(...args); },
	};
}
