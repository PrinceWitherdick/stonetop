import { describe, it, expect } from "vitest";
import { describeWrite, stepPatch } from "../../module/relmap/relmap-history.js";
import {
	RELMAP_GROUP_DASHES, RELMAP_GROUP_SHAPES, addGroupPatch, dropGroupPatch, dropNodePatch, emptyGraph,
	groupMembersPatch, groupPatch, normalizeGraph, relmapPath,
} from "../../module/relmap/relmap-store.js";
import {
	RELMAP_CAPTION_PX, RELMAP_GROUP_PAD_PX, boardBounds, groupNestPx, groupOutline, groupShapes, groupsInside,
} from "../../module/utils/relmap-geometry.js";

// NAMED GROUPS ON THE RELATIONSHIP MAP: "The hunters", "The elders", an outline round some people.
//
// What is stored is the name, the colour, box or oval, and who is in it, ONE LEAF PER PERSON. The
// outline is worked out from where those people stand on every paint, so nothing about where a
// group is drawn is ever stored. Most of what is held below is that split, and the undo that has to
// reverse a membership write it reaches below a field to make.

const PREFIX = relmapPath();

/** Four people, two of them hunters. */
function graph(over = {}) {
	return normalizeGraph({
		nodes: {
			ordga: { name: "Ordga", x: 20, y: 30 },
			marrec: { name: "Marrec", x: 40, y: 30 },
			sela: { name: "Sela", x: 70, y: 60 },
			pell: { name: "Pell", x: 80, y: 20 },
		},
		edges: {},
		groups: {
			hunt: { name: "The hunters", shape: "box", ink: "green", members: { ordga: true, marrec: true } },
		},
		...over,
	});
}

/** A patch landed on a graph, the document's own merge spelled out: leaf writes, `-=` deletions,
 * and the one four-part path a membership is. */
function afterPatch(before, patch) {
	return normalizeGraph(landRaw(before, patch));
}

/** The same merge onto the RAW flag, which is what the document really holds: a key normalizing
 * would hide (a membership for somebody taken off the board) is still in it. */
function landRaw(raw, patch) {
	const next = foundry.utils.deepClone(raw);
	for (const [key, value] of Object.entries(patch ?? {})) {
		const parts = key.slice(`${PREFIX}.`.length).split(".");
		let at = next;
		for (const part of parts.slice(0, -1)) at = (at[part] ??= {});
		const leaf = parts[parts.length - 1];
		if (leaf.startsWith("-=")) delete at[leaf.slice(2)];
		else at[leaf] = value;
	}
	return next;
}

describe("reading a stored group back", () => {
	it("is on every graph, empty, so nothing migrates", () => {
		expect(emptyGraph().groups).toEqual({});
		expect(normalizeGraph({ nodes: {}, edges: {} }).groups).toEqual({});
	});

	it("keeps the name, the shape, the stroke and the ink, and every field even on a bare group", () => {
		const got = normalizeGraph({ nodes: { a: { name: "A" } }, groups: { g: { members: { a: true } } } });
		expect(got.groups.g).toEqual({ name: "", shape: "box", dash: "solid", ink: "slate", members: { a: true } });
	});

	// SOLID UNLESS SOMEBODY CHOSE DASHES. Every group stored before the stroke was a choice has no
	// `dash` at all, and the table asked for those to draw whole.
	it("reads an absent or unknown stroke as solid, and keeps a dashed one", () => {
		const got = graph({
			groups: {
				old: { members: { ordga: true } },
				dots: { dash: "dotted", members: { ordga: true } },
				broken: { dash: "dashed", members: { ordga: true } },
			},
		});
		expect(got.groups.old.dash).toBe("solid");
		expect(got.groups.dots.dash).toBe("solid");
		expect(got.groups.broken.dash).toBe("dashed");
		expect(RELMAP_GROUP_DASHES).toEqual(["solid", "dashed"]);
	});

	it("reads an unknown shape as a box and an unknown ink as slate", () => {
		const got = graph({ groups: { g: { shape: "hexagon", ink: "chartreuse", members: { ordga: true } } } });
		expect(got.groups.g.shape).toBe("box");
		expect(got.groups.g.ink).toBe("slate");
		expect(RELMAP_GROUP_SHAPES).toEqual(["box", "oval"]);
	});

	// ⚠ TAKING SOMEBODY OFF THE MAP LEAVES THEIR MEMBERSHIP KEY WHERE IT IS, on purpose: an undo puts
	// them back under the same id, and back in their groups with them. This is what keeps the stale
	// key from drawing anything in between.
	it("counts only the people who are standing on the board", () => {
		const got = graph({ groups: { g: { members: { ordga: true, gone: true, "bad.id": true, pell: false } } } });
		expect(got.groups.g.members).toEqual({ ordga: true });
	});

	it("drops a group whose id could not have been written", () => {
		const got = graph({ groups: { "Actor.x": { members: { ordga: true } } } });
		expect(got.groups).toEqual({});
	});

	// ⚠ A GROUP WITH NOBODY LEFT STANDING IS NOT ON THE BOARD. It has no outline to draw, so nothing
	// could pick it or rub it out, and its colour would go on counting as worn and as already on the map.
	it("leaves out a group whose every member has left the board", () => {
		const got = graph({
			groups: {
				ghosts: { ink: "rose", members: { gone: true } },
				bare: { ink: "plum", members: {} },
				hunt: { members: { ordga: true } },
			},
		});
		expect(Object.keys(got.groups)).toEqual(["hunt"]);
	});

	// LEFT OUT ON THE READ AND NOT RUBBED OUT: the undo that puts its last member back puts it back.
	it("brings a group back with its last member when taking them off is undone", () => {
		const before = graph({ groups: { solo: { name: "Alone", ink: "rose", members: { sela: true } } } });
		const patch = dropNodePatch(before, "sela");
		const change = describeWrite(before, patch);
		const raw = landRaw(before, patch);
		const after = normalizeGraph(raw);
		expect(after.groups.solo).toBeUndefined();
		const back = normalizeGraph(landRaw(raw, stepPatch(after, change.back)));
		expect(back.groups.solo).toMatchObject({ name: "Alone", ink: "rose", members: { sela: true } });
	});
});

describe("the shape of a group write", () => {
	it("draws a new group whole, with each member its own leaf", () => {
		const patch = addGroupPatch("g1", { name: "Elders", members: ["ordga", "pell"], ink: "plum" });
		expect(patch).toEqual({
			[`${PREFIX}.groups.g1.name`]: "Elders",
			[`${PREFIX}.groups.g1.shape`]: "box",
			[`${PREFIX}.groups.g1.dash`]: "solid",
			[`${PREFIX}.groups.g1.ink`]: "plum",
			[`${PREFIX}.groups.g1.members.ordga`]: true,
			[`${PREFIX}.groups.g1.members.pell`]: true,
		});
	});

	it("refuses a group with nobody in it, and an id with a dot in it", () => {
		expect(addGroupPatch("g1", { members: [] })).toBeNull();
		expect(addGroupPatch("g.1", { members: ["ordga"] })).toBeNull();
		expect(groupMembersPatch("g1", ["bad.id"])).toBeNull();
	});

	// A whole `members` object would be one player's list replacing another's; one leaf per person
	// is what lets two people fill the same group at once.
	it("never writes members as a whole object", () => {
		const patch = groupPatch("g1", { name: "Hunters", members: { ordga: true } });
		expect(Object.keys(patch)).toEqual([`${PREFIX}.groups.g1.name`]);
	});

	it("writes a stroke it knows and refuses one it does not", () => {
		expect(groupPatch("g1", { dash: "dashed" })).toEqual({ [`${PREFIX}.groups.g1.dash`]: "dashed" });
		expect(groupPatch("g1", { dash: "wavy" })).toEqual({ [`${PREFIX}.groups.g1.dash`]: "solid" });
	});

	it("puts people in and takes people out, one leaf each", () => {
		const patch = groupMembersPatch("hunt", ["sela"], ["ordga"]);
		expect(patch[`${PREFIX}.groups.hunt.members.sela`]).toBe(true);
		expect(patch[`${PREFIX}.groups.hunt.members.-=ordga`]).toBeNull();
		const after = afterPatch(graph(), patch);
		expect(after.groups.hunt.members).toEqual({ marrec: true, sela: true });
	});

	it("rubs a group out and leaves everybody in it on the board", () => {
		const after = afterPatch(graph(), dropGroupPatch("hunt"));
		expect(after.groups).toEqual({});
		expect(Object.keys(after.nodes)).toHaveLength(4);
	});
});

describe("taking a group change back", () => {
	it("takes a person back out of a group they were put into", () => {
		const before = graph();
		const patch = groupMembersPatch("hunt", ["sela"]);
		const change = describeWrite(before, patch);
		expect(change).not.toBeNull();
		const after = afterPatch(before, patch);
		expect(after.groups.hunt.members.sela).toBe(true);
		const back = afterPatch(after, stepPatch(after, change.back));
		expect(back.groups.hunt.members).toEqual(before.groups.hunt.members);
		const again = afterPatch(back, stepPatch(back, change.forward));
		expect(again.groups.hunt.members.sela).toBe(true);
	});

	it("puts a person back into a group they were taken out of", () => {
		const before = graph();
		const patch = groupMembersPatch("hunt", [], ["ordga"]);
		const change = describeWrite(before, patch);
		const after = afterPatch(before, patch);
		expect(after.groups.hunt.members).toEqual({ marrec: true });
		const back = afterPatch(after, stepPatch(after, change.back));
		expect(back.groups.hunt.members).toEqual({ marrec: true, ordga: true });
	});

	it("rubs a drawn group out again, and redraws it", () => {
		const before = graph();
		const patch = addGroupPatch("eld", { name: "The elders", members: ["pell", "sela"], ink: "plum" });
		const change = describeWrite(before, patch);
		const after = afterPatch(before, patch);
		expect(after.groups.eld.members).toEqual({ pell: true, sela: true });
		const back = afterPatch(after, stepPatch(after, change.back));
		expect(back.groups.eld).toBeUndefined();
		const again = afterPatch(back, stepPatch(back, change.forward));
		expect(again.groups.eld).toEqual(after.groups.eld);
	});

	it("puts a rubbed-out group back whole, members and all", () => {
		const before = graph();
		const change = describeWrite(before, dropGroupPatch("hunt"));
		const after = afterPatch(before, dropGroupPatch("hunt"));
		const back = afterPatch(after, stepPatch(after, change.back));
		expect(back.groups.hunt).toEqual(before.groups.hunt);
	});

	it("takes a rename or a recolour back", () => {
		const before = graph();
		const patch = groupPatch("hunt", { name: "Trappers", ink: "rust", shape: "oval", dash: "dashed" });
		const change = describeWrite(before, patch);
		const after = afterPatch(before, patch);
		const back = afterPatch(after, stepPatch(after, change.back));
		expect(back.groups.hunt).toEqual(before.groups.hunt);
	});

	// THE FREE RIDE THE STORAGE WAS CHOSEN FOR: membership keys are not touched when a person is taken
	// off, so the undo that puts them back puts them back in their groups too.
	it("puts a person taken off the board back into their groups when that is undone", () => {
		const before = graph();
		const patch = dropNodePatch(before, "ordga");
		const change = describeWrite(before, patch);
		const raw = landRaw(before, patch);
		// The key is still in the document, and the board read off it does not show it.
		expect(raw.groups.hunt.members.ordga).toBe(true);
		const after = normalizeGraph(raw);
		expect(after.groups.hunt.members).toEqual({ marrec: true });
		const back = normalizeGraph(landRaw(raw, stepPatch(after, change.back)));
		expect(back.groups.hunt.members).toEqual({ marrec: true, ordga: true });
	});

	it("does not put somebody who has since left the board back into a group", () => {
		const before = graph();
		const change = describeWrite(before, groupMembersPatch("hunt", [], ["ordga"]));
		let live = afterPatch(before, groupMembersPatch("hunt", [], ["ordga"]));
		live = afterPatch(live, dropNodePatch(live, "ordga"));
		const patch = stepPatch(live, change.back);
		expect(patch).toBeNull();
	});

	it("re-makes a group only with the people still standing", () => {
		const before = graph();
		const change = describeWrite(before, dropGroupPatch("hunt"));
		let live = afterPatch(before, dropGroupPatch("hunt"));
		live = afterPatch(live, dropNodePatch(live, "marrec"));
		const back = afterPatch(live, stepPatch(live, change.back));
		expect(back.groups.hunt.members).toEqual({ ordga: true });
	});

	it("still refuses a four-part path that is not a membership", () => {
		expect(describeWrite(graph(), { [`${PREFIX}.groups.hunt.name.x`]: "y" })).toBeNull();
		expect(describeWrite(graph(), { [`${PREFIX}.nodes.ordga.x.y`]: 1 })).toBeNull();
	});
});

describe("the outline round a group", () => {
	const board = { width: 1200, height: 960 };
	const at = (x, y) => ({ x, y });

	it("boxes every member's face and name with room to spare", () => {
		const members = [at(20, 30), at(40, 50)];
		const box = groupOutline(members, { board });
		for (const m of members) {
			const px = (m.x / 100) * board.width;
			const py = (m.y / 100) * board.height;
			// The face (36 each way) and the name under it (to 56 below).
			expect(box.left).toBeLessThanOrEqual(px - 54);
			expect(box.right).toBeGreaterThanOrEqual(px + 54);
			expect(box.top).toBeLessThanOrEqual(py - 36);
			expect(box.bottom).toBeGreaterThanOrEqual(py + 56);
		}
		expect(box.shape).toBe("box");
		expect(box.d).toMatch(/^M /);
	});

	it("draws an oval through the box's corners, so nobody pokes out", () => {
		const members = [at(20, 30), at(40, 50)];
		const box = groupOutline(members, { board });
		const oval = groupOutline(members, { board, shape: "oval" });
		for (const [x, y] of [[box.left, box.top], [box.right, box.bottom], [box.left, box.bottom]]) {
			const inside = ((x - oval.cx) / oval.rx) ** 2 + ((y - oval.cy) / oval.ry) ** 2;
			expect(inside).toBeLessThanOrEqual(1.0001);
		}
		expect(oval.name.align).toBe("centre");
		expect(oval.d).toContain(" A ");
	});

	it("still draws round one person alone, and round nobody returns nothing", () => {
		expect(groupOutline([at(50, 50)], { board })).not.toBeNull();
		expect(groupOutline([], { board })).toBeNull();
	});

	it("stands a group a step clear of an outline it contains", () => {
		const members = [at(20, 30), at(40, 50)];
		const flat = groupOutline(members, { board });
		const outer = groupOutline(members, { board, contain: [flat] });
		expect(flat.left - outer.left).toBeCloseTo(groupNestPx());
		expect(RELMAP_GROUP_PAD_PX).toBeGreaterThan(0);
	});

	// ⚠ THE NAMES ARE SET AT THE READER'S TEXT WEIGHT, and the inner name sits ON its line, half its
	// chip above it. A fixed step measured for one size of chip let a doubled name lie across the
	// outer stroke.
	it("stands further clear as the reader turns the words up, by half the bigger name chip", () => {
		expect(groupNestPx(2) - groupNestPx(1)).toBeCloseTo((RELMAP_CAPTION_PX * 1.56) / 2);
		expect(groupNestPx(0.5)).toBeLessThan(groupNestPx(1));
		// No weight, or a nonsense one, is the ordinary size.
		expect(groupNestPx(undefined)).toBe(groupNestPx(1));
		expect(groupNestPx(0)).toBe(groupNestPx(1));
		const got = graph({
			groups: {
				council: { members: { ordga: true, marrec: true, sela: true } },
				elders: { members: { ordga: true, marrec: true } },
			},
		});
		const gap = wordScale => {
			const shapes = groupShapes(got, board, { wordScale });
			const of = id => shapes.find(shape => shape.id === id).outline;
			return of("elders").top - of("council").top;
		};
		expect(gap(2)).toBeCloseTo(gap(1) + (RELMAP_CAPTION_PX * 1.56) / 2);
	});

	it("finds which groups lie wholly inside each one, and breaks a tie of the same people by id", () => {
		const inside = groupsInside({
			council: { members: { a: true, b: true, c: true } },
			elders: { members: { a: true, b: true } },
			twin: { members: { a: true, b: true } },
			other: { members: { c: true, d: true } },
		});
		expect([...inside.get("council")].sort()).toEqual(["elders", "twin"]);
		// "elders" and "twin" hold the same two people; the later id is the outer one.
		expect(inside.get("twin")).toEqual(["elders"]);
		expect(inside.get("elders")).toEqual([]);
		expect(inside.get("other")).toEqual([]);
	});

	// ⚠ FOUND IN A REAL BROWSER: an oval reaches past its own box, so a fixed step of padding left an
	// oval "elders" poking out through the top of a box "council" drawn round the same people.
	it("draws a group round the OUTLINE of every group inside it, whatever its shape", () => {
		const got = graph({
			groups: {
				council: { shape: "box", members: { ordga: true, marrec: true, sela: true } },
				elders: { shape: "oval", members: { ordga: true, marrec: true } },
			},
		});
		const shapes = Object.fromEntries(groupShapes(got, board).map(shape => [shape.id, shape.outline]));
		const { council, elders } = shapes;
		for (const side of ["left", "top"]) {
			expect(council[side]).toBeLessThanOrEqual(elders[side] - groupNestPx() + 0.01);
		}
		for (const side of ["right", "bottom"]) {
			expect(council[side]).toBeGreaterThanOrEqual(elders[side] + groupNestPx() - 0.01);
		}
	});

	it("lays every group out outermost first, leaving out a group with nobody standing", () => {
		const got = graph({
			groups: {
				hunt: { members: { ordga: true, marrec: true } },
				all: { members: { ordga: true, marrec: true, sela: true } },
				ghosts: { members: { gone: true } },
			},
		});
		const shapes = groupShapes(got, board);
		expect(shapes.map(shape => shape.id)).toEqual(["all", "hunt"]);
		expect(shapes[1].members).toEqual(["marrec", "ordga"]);
	});

	it("frames an outline that reaches past everybody's own room", () => {
		const outline = groupOutline([at(0, 0)], { board, contain: [{ left: -200, top: -200, right: 200, bottom: 200 }] });
		const bounds = boardBounds([at(0, 0)], board, [outline]);
		expect(bounds.left).toBeLessThanOrEqual(outline.left);
		expect(bounds.top).toBeLessThanOrEqual(outline.top);
	});
});
