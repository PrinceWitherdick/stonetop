import { afterEach, describe, expect, it, vi } from "vitest";
import { pressStartsBox, pressStartsDraw } from "../../module/utils/relmap-drag.js";
import { pointerBoard, wireBoard as wire } from "../fakes/pointer-board.js";

// THE GESTURES ON A NAMED GROUP ("The hunters"): drawing one with the group tool armed, moving one by
// its name or its outline, raising its bar, and the keys on its name. The window's half (the writes,
// the outline that follows its people) is relationship-map-window.test.js's.

const SPOTS = { n1: { x: 10, y: 10 }, n2: { x: 20, y: 20 }, n3: { x: 30, y: 30 } };

function setUp({ chosen = [], drawing = false, members = { g1: ["n1", "n2"] }, ...over } = {}) {
	const board = pointerBoard({ nodes: Object.keys(SPOTS), groups: Object.keys(members) });
	const selection = { ids: [...chosen] };
	const made = wire(board, {
		nodeAt: vi.fn(id => (SPOTS[id] ? { ...SPOTS[id] } : null)),
		selected: () => selection.ids,
		onSelect: vi.fn(ids => { selection.ids = [...ids]; }),
		nodesIn: vi.fn(() => ["n3"]),
		onGroupMove: vi.fn(), onGroupDragMove: vi.fn(), onGroupDragEnd: vi.fn(), onGroupNudge: vi.fn(),
		groupMembers: vi.fn(id => members[id] ?? []),
		onPickGroup: vi.fn(), onRemoveGroup: vi.fn(),
		drawing: () => drawing,
		onDrawn: vi.fn(),
		...over,
	});
	return { board, selection, ...made };
}

function drag(board, target, to, extra = {}) {
	board.view.emit("pointerdown", target, { clientX: 0, clientY: 0, ...extra });
	board.view.emit("pointermove", target, { clientX: to[0], clientY: to[1], ...extra });
	board.flush();
	board.view.emit("pointerup", target, { clientX: to[0], clientY: to[1], ...extra });
	return board.view.emit("click", target, { detail: 1, ...extra });
}

function click(board, target, extra = {}) {
	board.view.emit("pointerdown", target, { clientX: 0, clientY: 0, ...extra });
	board.view.emit("pointerup", target, { clientX: 0, clientY: 0, ...extra });
	return board.view.emit("click", target, { detail: 1, ...extra });
}

let made;
afterEach(() => { made?.teardown?.(); made?.board?.destroy(); made = null; });

describe("moving a group by its name or its outline", () => {
	it("carries everybody in it as one move", () => {
		made = setUp();
		drag(made.board, made.board.outlines.g1.name, [100, 50]);
		expect(made.handlers.onGroupMove).toHaveBeenCalledTimes(1);
		expect(made.handlers.onGroupMove).toHaveBeenCalledWith({
			n1: { x: 20, y: 15 }, n2: { x: 30, y: 25 },
		});
		expect(made.handlers.onPickGroup).not.toHaveBeenCalled();
	});

	it("does the same from the outline's click target", () => {
		made = setUp();
		drag(made.board, made.board.outlines.g1.hit, [100, 0]);
		expect(made.handlers.onGroupMove).toHaveBeenCalledWith({
			n1: { x: 20, y: 10 }, n2: { x: 30, y: 20 },
		});
	});

	it("shows the move as it goes, and says when it is over", () => {
		made = setUp();
		const { board, handlers } = made;
		board.view.emit("pointerdown", board.outlines.g1.name, { clientX: 0, clientY: 0 });
		board.view.emit("pointermove", board.outlines.g1.name, { clientX: 50, clientY: 0 });
		board.flush();
		expect(handlers.onGroupDragMove).toHaveBeenLastCalledWith({ n1: { x: 15, y: 10 }, n2: { x: 25, y: 20 } });
		board.view.emit("pointerup", board.outlines.g1.name, { clientX: 50, clientY: 0 });
		expect(handlers.onGroupDragEnd).toHaveBeenCalledWith(null);
	});

	it("moves nobody on a board the reader may not rearrange", () => {
		made = setUp({ canMove: () => false });
		drag(made.board, made.board.outlines.g1.name, [100, 50]);
		expect(made.handlers.onGroupMove).not.toHaveBeenCalled();
	});
});

describe("taking hold of a group", () => {
	it("raises its bar on a click on its name or its outline", () => {
		made = setUp();
		click(made.board, made.board.outlines.g1.name);
		expect(made.handlers.onPickGroup).toHaveBeenLastCalledWith("g1", made.board.outlines.g1.name);
		click(made.board, made.board.outlines.g1.hit);
		expect(made.handlers.onPickGroup).toHaveBeenLastCalledWith("g1", null);
		expect(made.handlers.onPickNone).not.toHaveBeenCalled();
	});

	// The quick way to carry "the hunters" off and keep them chosen, or to start another group from them.
	it("adds everybody in it to the selection on a Shift click", () => {
		made = setUp({ chosen: ["n3"] });
		click(made.board, made.board.outlines.g1.name, { shiftKey: true });
		expect(made.handlers.onSelect).toHaveBeenLastCalledWith(["n3", "n1", "n2"], { final: true });
		expect(made.handlers.onPickGroup).not.toHaveBeenCalled();
	});

	it("raises nothing for a reader who may only look", () => {
		made = setUp({ canEdit: () => false });
		click(made.board, made.board.outlines.g1.name);
		expect(made.handlers.onPickGroup).not.toHaveBeenCalled();
	});
});

describe("the keys on a group's name", () => {
	it("raises the bar on Enter, from the keyboard, and keeps the key from the scene", () => {
		made = setUp();
		const ev = made.board.view.emit("keydown", made.board.outlines.g1.name, { key: "Enter" });
		expect(made.handlers.onPickGroup).toHaveBeenCalledWith("g1", made.board.outlines.g1.name, { keyboard: true });
		expect(ev.propagationStopped).toBe(true);
	});

	// ⚠ DELETE IS THE SCENE'S "DELETE THE SELECTED TOKENS" if it gets past this board.
	it("rubs the group out on Delete, and never hands the key to the scene", () => {
		made = setUp();
		const ev = made.board.view.emit("keydown", made.board.outlines.g1.name, { key: "Delete" });
		expect(made.handlers.onRemoveGroup).toHaveBeenCalledWith("g1");
		expect(ev.propagationStopped).toBe(true);
	});

	it("swallows Delete even where the reader may not edit", () => {
		made = setUp({ canEdit: () => false });
		const ev = made.board.view.emit("keydown", made.board.outlines.g1.name, { key: "Delete" });
		expect(made.handlers.onRemoveGroup).not.toHaveBeenCalled();
		expect(ev.propagationStopped).toBe(true);
	});

	it("moves everybody in it with the arrow keys, as one nudge", () => {
		made = setUp();
		made.board.view.emit("keydown", made.board.outlines.g1.name, { key: "ArrowRight" });
		expect(made.handlers.onGroupNudge).toHaveBeenCalledWith({ n1: { x: 11, y: 10 }, n2: { x: 21, y: 20 } });
	});
});

describe("drawing a group with the tool armed", () => {
	it("draws the box on a plain press on open paper, and hands over who was inside", () => {
		made = setUp({ drawing: true, chosen: [] });
		const { board, handlers } = made;
		const down = board.view.emit("pointerdown", board.board, { clientX: 0, clientY: 0 });
		expect(down.defaultPrevented).toBe(true);
		board.view.emit("pointermove", board.board, { clientX: 400, clientY: 400 });
		board.flush();
		// Lit as it grows, borrowing the selection's marks.
		expect(handlers.onSelect).toHaveBeenLastCalledWith(["n3"], { final: false });
		board.view.emit("pointerup", board.board, { clientX: 400, clientY: 400 });
		expect(handlers.onDrawn).toHaveBeenCalledWith(["n3"]);
		// And the marks go back to what they were: nobody.
		expect(handlers.onSelect).toHaveBeenLastCalledWith([], { final: false });
	});

	it("says the draw was abandoned when it is cancelled", () => {
		made = setUp({ drawing: true });
		const { board, handlers } = made;
		board.view.emit("pointerdown", board.board, { clientX: 0, clientY: 0 });
		board.view.emit("pointermove", board.board, { clientX: 400, clientY: 400 });
		board.flush();
		board.view.emit("pointercancel", board.board, {});
		expect(handlers.onDrawn).toHaveBeenCalledWith(null);
	});

	it("stands the tool down on Escape from the board", () => {
		made = setUp({ drawing: true });
		const ev = made.board.view.emit("keydown", made.board.board, { key: "Escape" });
		expect(made.handlers.onDrawn).toHaveBeenCalledWith(null);
		expect(ev.propagationStopped).toBe(true);
	});

	it("pans as ever on a plain press when the tool is not armed", () => {
		made = setUp({ drawing: false });
		made.board.view.emit("pointerdown", made.board.board, { clientX: 0, clientY: 0 });
		made.board.view.emit("pointermove", made.board.board, { clientX: 400, clientY: 400 });
		made.board.flush();
		expect(made.handlers.onSelect).not.toHaveBeenCalled();
	});

	// The pan surface asks the same question, so the two cannot both take one press.
	it("claims a plain press on open paper and nothing on a face, a group or a line", () => {
		const board = pointerBoard({ groups: ["g1"] });
		try {
			const at = target => ({ button: 0, target });
			const where = { view: board.view, board: board.board };
			expect(pressStartsDraw(at(board.board), where)).toBe(true);
			expect(pressStartsDraw(at(board.portraits.n1.face), where)).toBe(false);
			expect(pressStartsDraw(at(board.outlines.g1.name), where)).toBe(false);
			expect(pressStartsDraw(at(board.outlines.g1.hit), where)).toBe(false);
			expect(pressStartsDraw(at(board.strokes.e1.hit), where)).toBe(false);
			// And the Shift box does not start from a group either.
			expect(pressStartsBox({ ...at(board.outlines.g1.name), shiftKey: true }, where)).toBe(false);
		} finally {
			board.destroy();
		}
	});
});
