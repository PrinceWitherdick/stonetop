import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
	refreshFightOverlay, paintFight, teardownFightOverlay, clearFightOverlay, fightInk, FIGHT_INK_FALLBACK, FIGHT_OVERLAY_Z,
} from "../../module/fight/fight-overlay.js";
import { snapshotFight } from "../../module/fight/fight-state.js";
import { fakeActor, fakeToken, fakeScene, fakeCombatant, fakeCombat, collection, GRID } from "../fakes/fight.js";

// The fight drawn on the map, against a stand-in PIXI that records what it was asked to draw.

class FakeDisplayObject {
	constructor() { this.children = []; this.parent = null; this.destroyed = false; this.position = { x: 0, y: 0, set: (x, y) => { this.position.x = x; this.position.y = y; } }; }
	addChild(child) { child.parent = this; this.children.push(child); return child; }
	destroy() { this.destroyed = true; if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); }
}
class FakeGraphics extends FakeDisplayObject {
	constructor() { super(); this.calls = []; }
	clear() { this.calls = []; return this; }
	lineStyle(style) { this.calls.push(["lineStyle", style]); return this; }
	moveTo(x, y) { this.calls.push(["moveTo", x, y]); return this; }
	lineTo(x, y) { this.calls.push(["lineTo", x, y]); return this; }
	beginFill(color, alpha) { this.calls.push(["beginFill", color, alpha]); return this; }
	drawPolygon(points) { this.calls.push(["drawPolygon", points]); return this; }
	drawCircle(x, y, r) { this.calls.push(["drawCircle", x, y, r]); return this; }
	endFill() { this.calls.push(["endFill"]); return this; }
}
class FakeText extends FakeDisplayObject {
	constructor(text, style) { super(); this.text = text; this.style = style; this.anchor = { set: () => {} }; FakeText.made++; }
}
FakeText.made = 0;

let saved;
let settings;
beforeEach(() => {
	saved = { PIXI: globalThis.PIXI, canvas: globalThis.canvas, game: globalThis.game, ui: globalThis.ui, foundry: globalThis.foundry };
	globalThis.PIXI = { Container: FakeDisplayObject, Graphics: FakeGraphics, Text: FakeText, LINE_CAP: { ROUND: "round" }, LINE_JOIN: { ROUND: "round" } };
	settings = new Map([["fightOverlay", true]]);
	FakeText.made = 0;
});
afterEach(() => {
	teardownFightOverlay();
	Object.assign(globalThis, saved);
});

/**
 * Bram and Aeliana on one crinwin; Cadi shooting at a wolf far off; an ambusher whose token this
 * client cannot see, next to Cadi.
 */
function scene({ ambusherVisible = false } = {}) {
	const actor = (id, type) => fakeActor({ id, type, name: id });
	const tokens = [
		fakeToken({ id: "tBram", col: 0, row: 1, actor: actor("bram", "character") }),
		fakeToken({ id: "tAel", col: 0, row: 3, actor: actor("aeliana", "character") }),
		fakeToken({ id: "tCrin", col: 0, row: 2, actor: actor("crinwin", "monster") }),
		fakeToken({ id: "tCadi", col: 6, row: 6, actor: actor("cadi", "character") }),
		fakeToken({ id: "tWolf", col: 12, row: 6, actor: actor("wolf", "monster") }),
		fakeToken({ id: "tAmb", col: 7, row: 6, actor: actor("ambusher", "monster") }),
	];
	const s = fakeScene({ tokens });
	const byId = Object.fromEntries(tokens.map(t => [t.id, t]));
	const combatants = [
		fakeCombatant({ id: "cBram", token: byId.tBram, scene: s }),
		fakeCombatant({ id: "cAel", token: byId.tAel, scene: s }),
		fakeCombatant({ id: "cCrin", token: byId.tCrin, scene: s }),
		fakeCombatant({ id: "cCadi", token: byId.tCadi, scene: s }),
		fakeCombatant({ id: "cWolf", token: byId.tWolf, scene: s }),
		fakeCombatant({ id: "cAmb", token: byId.tAmb, scene: s }),
	];
	const combat = fakeCombat({ scene: s, combatants });
	const placeables = new Map(tokens.map(t => [t.id, {
		visible: t.id !== "tAmb" || ambusherVisible,
		document: t,
		w: GRID, h: GRID,
	}]));
	const cadi = combatants[3];
	globalThis.game = {
		...saved.game,
		user: { id: "gm", isGM: true },
		users: collection([{ id: "p", isGM: false, active: true, character: cadi.actor, targets: new Set([{ document: { id: "tWolf" } }]) }]),
		combats: collection([combat]),
		settings: { get: (scope, key) => settings.get(key), set: async (scope, key, value) => settings.set(key, value) },
	};
	globalThis.ui = { combat: { viewed: combat } };
	const canvas = {
		ready: true,
		scene: s,
		interface: new FakeDisplayObject(),
		stage: { scale: { x: 1 } },
		dimensions: { size: GRID },
		tokens: { get: id => placeables.get(id) },
	};
	globalThis.canvas = canvas;
	return { canvas, combat, s, placeables };
}

const layerOf = canvas => canvas.interface.children[0];
const linesOf = canvas => layerOf(canvas).children[0];
const strokes = (g, color) => g.calls.filter(([name, style]) => name === "lineStyle" && style.color === color);

describe("the fight on the map", () => {
	it("draws into its own container in the interface group, above the tokens and inert to the pointer", () => {
		const { canvas } = scene();
		refreshFightOverlay();
		const layer = layerOf(canvas);
		expect(layer).toBeInstanceOf(FakeDisplayObject);
		expect(layer.zIndex).toBe(FIGHT_OVERLAY_Z);
		expect(FIGHT_OVERLAY_Z).toBeGreaterThan(200);
		expect(FIGHT_OVERLAY_Z).toBeLessThan(400);
		expect(layer.eventMode).toBe("none");
		expect(layer.interactiveChildren).toBe(false);
	});

	it("ties each melee pair with ink over a halo, halos first", () => {
		const { canvas } = scene();
		refreshFightOverlay();
		const g = linesOf(canvas);
		expect(strokes(g, FIGHT_INK_FALLBACK.melee)).toHaveLength(2);
		// The colour of every STROKE (a style followed by a line), in the order drawn. The arrowhead's
		// outline is halo-coloured too, but it is a fill, drawn last, and not what this is about.
		const strokeColours = g.calls
			.map((call, i) => [call, g.calls[i + 1]])
			.filter(([call, next]) => call[0] === "lineStyle" && next?.[0] === "moveTo")
			.map(([call]) => call[1].color);
		const firstInk = strokeColours.findIndex(colour => colour !== FIGHT_INK_FALLBACK.halo);
		expect(firstInk).toBeGreaterThan(0);
		expect(strokeColours.slice(firstInk)).not.toContain(FIGHT_INK_FALLBACK.halo);
	});

	it("draws a player's target as a dashed arrow from their character", () => {
		const { canvas } = scene();
		refreshFightOverlay();
		const g = linesOf(canvas);
		expect(strokes(g, FIGHT_INK_FALLBACK.ranged).length).toBeGreaterThan(1);
		const arrow = g.calls.find(([n]) => n === "drawPolygon");
		expect(arrow).toBeTruthy();
		// The arrow points at the wolf's near edge.
		expect(arrow[1][0]).toBe(12 * GRID);
	});

	it("draws nothing to or from a token this client cannot see", () => {
		const hidden = scene();
		refreshFightOverlay();
		const unseen = linesOf(hidden.canvas).calls.filter(([n]) => n === "moveTo").length;
		teardownFightOverlay();
		const seen = scene({ ambusherVisible: true });
		refreshFightOverlay();
		const all = linesOf(seen.canvas).calls.filter(([n]) => n === "moveTo").length;
		expect(all).toBeGreaterThan(unseen);
	});

	it("puts a count badge on the foe fought by two, and keeps it between paints", () => {
		const { canvas } = scene();
		refreshFightOverlay();
		const badges = () => layerOf(canvas).children.slice(1);
		expect(badges()).toHaveLength(1);
		const [badge] = badges();
		const text = badge.children.find(c => c instanceof FakeText);
		expect(text.text).toBe("×2");
		expect(text.style.fill).toBe(FIGHT_INK_FALLBACK.badgeGlyph);
		refreshFightOverlay();
		expect(badges()[0]).toBe(badge);
		expect(FakeText.made).toBe(1);
	});

	it("takes a badge down once nobody is ganging up any more", () => {
		const { canvas, combat, s } = scene();
		refreshFightOverlay();
		expect(layerOf(canvas).children.slice(1)).toHaveLength(1);
		combat.combatants = collection([...combat.combatants].filter(c => c.id !== "cAel"));
		paintFight(snapshotFight(combat, { scene: s }), canvas);
		expect(layerOf(canvas).children.slice(1)).toHaveLength(0);
	});

	it("follows a token mid-animation, drawing from where its document is now", () => {
		const { canvas, placeables } = scene();
		refreshFightOverlay();
		const before = linesOf(canvas).calls.find(([n]) => n === "moveTo");
		placeables.get("tBram").document = { ...placeables.get("tBram").document, x: 40, y: 140 };
		refreshFightOverlay();
		const after = linesOf(canvas).calls.find(([n]) => n === "moveTo");
		expect(after).not.toEqual(before);
	});

	it("keeps lines at least three screen pixels wide when zoomed far out", () => {
		const { canvas } = scene();
		canvas.stage.scale.x = 0.1;
		refreshFightOverlay();
		const ink = strokes(linesOf(canvas), FIGHT_INK_FALLBACK.melee)[0][1];
		expect(ink.width * 0.1).toBeGreaterThanOrEqual(3);
	});

	it("draws nothing for a reader who switched the lines off, or with no fight on the scene", () => {
		const { canvas } = scene();
		refreshFightOverlay();
		settings.set("fightOverlay", false);
		refreshFightOverlay();
		expect(linesOf(canvas).calls).toEqual([]);
		expect(layerOf(canvas).children.slice(1)).toHaveLength(0);
		settings.set("fightOverlay", true);
		globalThis.game.combats = collection([]);
		globalThis.ui.combat.viewed = null;
		refreshFightOverlay();
		expect(linesOf(canvas).calls).toEqual([]);
	});

	it("waits for a canvas that is ready", () => {
		const { canvas } = scene();
		canvas.ready = false;
		refreshFightOverlay();
		expect(canvas.interface.children).toHaveLength(0);
	});

	it("builds a fresh container after the canvas tore the old one down", () => {
		const { canvas } = scene();
		refreshFightOverlay();
		const first = layerOf(canvas);
		first.destroy();
		teardownFightOverlay();
		refreshFightOverlay();
		expect(layerOf(canvas)).not.toBe(first);
		clearFightOverlay();
	});

	it("paints in the shipped ink when there is no stylesheet to read", () => {
		expect(fightInk()).toEqual(FIGHT_INK_FALLBACK);
	});
});
