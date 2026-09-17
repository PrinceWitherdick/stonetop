import { describe, it, expect } from "vitest";
import { lineUpPositions } from "../../module/fight/line-up.js";
import { touching } from "../../module/fight/engagements.js";

// "Line everyone up": heroes left of the view's middle, foes right, a few squares apart.

const SIZE = 100;
const scene = { x: 0, y: 0, w: 4000, h: 3000 };
// A view 16 squares wide and 10 tall, its middle at square (20, 15).
const view = { x: 1200, y: 1000, w: 1600, h: 1000 };
const tokens = (prefix, n, extra = {}) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, w: 1, h: 1, ...extra }));
const square = pos => ({ col: pos.x / SIZE, row: pos.y / SIZE });

describe("lineUpPositions", () => {
	it("puts the heroes in a column left of the middle and the foes right, three squares apart", () => {
		const positions = lineUpPositions({ view, size: SIZE, sceneRect: scene, heroes: tokens("h", 3), foes: tokens("f", 2) });
		const heroCols = new Set(["h0", "h1", "h2"].map(id => square(positions.get(id)).col));
		const foeCols = new Set(["f0", "f1"].map(id => square(positions.get(id)).col));
		expect([...heroCols]).toEqual([17]);
		expect([...foeCols]).toEqual([21]);
		// Squares 18, 19 and 20 stand empty between them.
		expect(21 - (17 + 1)).toBe(3);
	});

	it("stacks each side in its given order, centred on the middle row", () => {
		const positions = lineUpPositions({ view, size: SIZE, sceneRect: scene, heroes: tokens("h", 3), foes: tokens("f", 2) });
		expect(["h0", "h1", "h2"].map(id => square(positions.get(id)).row)).toEqual([14, 15, 16]);
		expect(["f0", "f1"].map(id => square(positions.get(id)).row)).toEqual([14, 15]);
	});

	it("lands every token on the grid", () => {
		const positions = lineUpPositions({ view: { x: 1234, y: 987, w: 1600, h: 1000 }, size: SIZE, sceneRect: scene, heroes: tokens("h", 2), foes: tokens("f", 2) });
		for (const pos of positions.values()) {
			expect(pos.x % SIZE).toBe(0);
			expect(pos.y % SIZE).toBe(0);
		}
	});

	it("starts nobody in contact with the other side", () => {
		const heroes = tokens("h", 6);
		const foes = [...tokens("f", 5), { id: "giant", w: 3, h: 3 }];
		const positions = lineUpPositions({ view, size: SIZE, sceneRect: scene, heroes, foes });
		const rect = (t, side) => ({ id: t.id, side, rect: { ...positions.get(t.id), w: t.w * SIZE, h: t.h * SIZE } });
		for (const h of heroes) {
			for (const f of foes) expect(touching(rect(h, "heroes"), rect(f, "foes"), { size: SIZE })).toBe(false);
		}
	});

	it("opens another column outward when a side is taller than the view", () => {
		// The view holds 10 rows, less a square of margin top and bottom: 8 to a column.
		const positions = lineUpPositions({ view, size: SIZE, sceneRect: scene, heroes: tokens("h", 10), foes: tokens("f", 9) });
		expect(square(positions.get("h7")).col).toBe(17);
		expect(square(positions.get("h8")).col).toBe(16);
		expect(square(positions.get("f7")).col).toBe(21);
		expect(square(positions.get("f8")).col).toBe(22);
	});

	it("makes room for a big token's width", () => {
		const positions = lineUpPositions({ view, size: SIZE, sceneRect: scene, heroes: [{ id: "h", w: 1, h: 1 }], foes: [{ id: "giant", w: 2, h: 2 }, { id: "f", w: 1, h: 1 }] });
		expect(square(positions.get("giant"))).toEqual({ col: 21, row: 14 });
		expect(square(positions.get("f"))).toEqual({ col: 21, row: 16 });
	});

	it("slides the whole formation back onto the scene near an edge, keeping its shape", () => {
		const nearLeft = { x: -600, y: 1000, w: 1600, h: 1000 };
		const positions = lineUpPositions({ view: nearLeft, size: SIZE, sceneRect: scene, heroes: tokens("h", 2), foes: tokens("f", 2) });
		const heroCol = square(positions.get("h0")).col;
		const foeCol = square(positions.get("f0")).col;
		expect(heroCol).toBe(0);
		expect(foeCol - heroCol).toBe(4);
	});

	it("measures from the scene rectangle's own corner, past any padding", () => {
		const padded = { x: 250, y: 150, w: 4000, h: 3000 };
		const positions = lineUpPositions({ view: { x: 1450, y: 1150, w: 1600, h: 1000 }, size: SIZE, sceneRect: padded, heroes: tokens("h", 1), foes: tokens("f", 1) });
		for (const pos of positions.values()) {
			expect((pos.x - 250) % SIZE).toBe(0);
			expect((pos.y - 150) % SIZE).toBe(0);
		}
	});

	it("still lines up one side alone, and nothing for nobody", () => {
		const onlyFoes = lineUpPositions({ view, size: SIZE, sceneRect: scene, foes: tokens("f", 2) });
		expect(square(onlyFoes.get("f0")).col).toBe(21);
		expect(lineUpPositions({ view, size: SIZE, sceneRect: scene }).size).toBe(0);
	});
});

// A line-up must not break up the fights already going on: engagements are read off the map, so
// everyone already standing against somebody moves as one piece (module/fight/line-up.js).

describe("lineUpPositions with fights already going on", () => {
	// Two scrums and two fighters standing on their own, spread over a 4000x3000 map.
	const hA = { id: "hA", w: 1, h: 1, x: 500, y: 500 };
	const fA = { id: "fA", w: 1, h: 1, x: 600, y: 500 };
	const hB = { id: "hB", w: 1, h: 1, x: 2000, y: 2000 };
	const fB = { id: "fB", w: 1, h: 1, x: 2100, y: 2000 };
	const fB2 = { id: "fB2", w: 1, h: 1, x: 2100, y: 2100 };
	const hC = { id: "hC", w: 1, h: 1, x: 100, y: 2500 };
	const fC = { id: "fC", w: 1, h: 1, x: 3500, y: 100 };
	const heroes = [hA, hB, hC];
	const foes = [fA, fB, fB2, fC];
	const lineUp = (extra = {}) => lineUpPositions({ view, size: SIZE, sceneRect: scene, heroes, foes, ...extra });
	const asFighter = (t, side, at) => ({ id: t.id, side, rect: { x: at.x, y: at.y, w: t.w * SIZE, h: t.h * SIZE } });

	it("moves each scrum as one piece, so everyone in it still stands exactly where they stood", () => {
		const positions = lineUp();
		const step = id => ({ x: positions.get(id).x, y: positions.get(id).y });
		const apart = (a, b) => ({ x: step(a.id).x - step(b.id).x, y: step(a.id).y - step(b.id).y });
		expect(apart(fA, hA)).toEqual({ x: fA.x - hA.x, y: fA.y - hA.y });
		expect(apart(fB, hB)).toEqual({ x: fB.x - hB.x, y: fB.y - hB.y });
		expect(apart(fB2, hB)).toEqual({ x: fB2.x - hB.x, y: fB2.y - hB.y });
	});

	it("says which scrum each token moved with, and nothing for the ones who moved alone", () => {
		const positions = lineUp();
		expect(positions.get("fA").group).toBe(positions.get("hA").group);
		expect(positions.get("fB2").group).toBe(positions.get("hB").group);
		expect(positions.get("hA").group).not.toBe(positions.get("hB").group);
		expect(positions.get("hC").group).toBeNull();
		expect(positions.get("fC").group).toBeNull();
	});

	it("stands the scrums side by side in the middle of the view, a few squares apart", () => {
		const positions = lineUp();
		expect(square(positions.get("hA"))).toEqual({ col: 17, row: 14 });
		expect(square(positions.get("fA"))).toEqual({ col: 18, row: 14 });
		expect(square(positions.get("hB"))).toEqual({ col: 22, row: 14 });
		expect(square(positions.get("fB2"))).toEqual({ col: 23, row: 15 });
		// Squares 19, 20 and 21 stand empty between the two of them.
		expect(22 - (18 + 1)).toBe(3);
	});

	it("lines up only the fighters nobody is up against, clear of the scrums", () => {
		const positions = lineUp();
		expect(square(positions.get("hC"))).toEqual({ col: 13, row: 15 });
		expect(square(positions.get("fC"))).toEqual({ col: 27, row: 15 });
	});

	it("brings nobody new into contact, and takes nobody out of it", () => {
		const positions = lineUp();
		const before = new Map([...heroes, ...foes].map(t => [t.id, { x: t.x, y: t.y }]));
		for (const hero of heroes) {
			for (const foe of foes) {
				const was = touching(asFighter(hero, "heroes", before.get(hero.id)), asFighter(foe, "foes", before.get(foe.id)), { size: SIZE });
				const now = touching(asFighter(hero, "heroes", positions.get(hero.id)), asFighter(foe, "foes", positions.get(foe.id)), { size: SIZE });
				expect(now).toBe(was);
			}
		}
	});

	it("lands every token on the grid", () => {
		for (const pos of lineUp().values()) {
			expect(pos.x % SIZE).toBe(0);
			expect(pos.y % SIZE).toBe(0);
		}
	});

	it("leaves a fighter who is out of the fight out of the scrum they were standing in", () => {
		const positions = lineUpPositions({
			view, size: SIZE, sceneRect: scene,
			heroes: [hA], foes: [{ ...fA, out: true }],
		});
		expect(positions.get("hA").group).toBeNull();
		expect(positions.get("fA").group).toBeNull();
		expect(square(positions.get("hA"))).toEqual({ col: 17, row: 15 });
		expect(square(positions.get("fA"))).toEqual({ col: 21, row: 15 });
	});

	it("opens another row of scrums when they do not fit across the view", () => {
		// A view 8 squares wide holds one of these two scrums in a row, not both.
		const narrow = { x: 1200, y: 1000, w: 800, h: 1000 };
		const positions = lineUpPositions({ view: narrow, size: SIZE, sceneRect: scene, heroes: [hA, hB], foes: [fA, fB, fB2] });
		expect(square(positions.get("hA"))).toEqual({ col: 15, row: 12 });
		expect(square(positions.get("hB"))).toEqual({ col: 15, row: 16 });
		const a = asFighter(fA, "foes", positions.get("fA"));
		expect(touching(asFighter(hB, "heroes", positions.get("hB")), a, { size: SIZE })).toBe(false);
	});

	it("keeps a scrum whole when the formation is slid back onto the scene", () => {
		const nearLeft = { x: -600, y: 1000, w: 1600, h: 1000 };
		const positions = lineUpPositions({ view: nearLeft, size: SIZE, sceneRect: scene, heroes: [hA], foes: [fA] });
		expect(positions.get("fA").x - positions.get("hA").x).toBe(fA.x - hA.x);
		expect(positions.get("hA").x).toBeGreaterThanOrEqual(0);
	});
});
