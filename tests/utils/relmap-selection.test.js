import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RELMAP_REACH_MAX } from "../../module/utils/relmap-geometry.js";
import { pressStartsBox } from "../../module/utils/relmap-drag.js";
import { pointerBoard, wireBoard as wire } from "../fakes/pointer-board.js";

// SEVERAL PEOPLE AT ONCE on a relationship map (user, 2026-09-27: "It would be nice to be able to
// select multiple people at once to move them around"), and the wall that used to stand round the
// sheet ("trying to move characters around is frustrating when I run out of space for no reason").
//
// The gestures only: who ends up selected, who a drag carries, what is handed to the window. The
// window's half (one write, the marks, the preview) is relationship-map-window.test.js's.

/** Three people at three different spots, so a group's travel can be told from a lone one's. */
const SPOTS = { n1: { x: 10, y: 10 }, n2: { x: 20, y: 20 }, n3: { x: 30, y: 30 } };

/** A board with three people on it, wired with `selected` answering whatever the test says. */
function setUp({ chosen = [], spots = SPOTS, ...over } = {}) {
	const board = pointerBoard({ nodes: Object.keys(spots) });
	const selection = { ids: [...chosen] };
	const made = wire(board, {
		nodeAt: vi.fn(id => (spots[id] ? { ...spots[id] } : null)),
		selected: () => selection.ids,
		onSelect: vi.fn(ids => { selection.ids = [...ids]; }),
		nodesIn: vi.fn(() => []),
		onGroupMove: vi.fn(), onGroupDragMove: vi.fn(), onGroupDragEnd: vi.fn(), onGroupNudge: vi.fn(),
		...over,
	});
	return { board, selection, ...made };
}

/** A left press, a travel and a release, with the click a browser derives from it. */
function drag(board, target, to, extra = {}) {
	board.view.emit("pointerdown", target, { clientX: 0, clientY: 0, ...extra });
	board.view.emit("pointermove", target, { clientX: to[0], clientY: to[1], ...extra });
	board.flush();
	board.view.emit("pointerup", target, { clientX: to[0], clientY: to[1], ...extra });
	return board.view.emit("click", target, { detail: 1, ...extra });
}

/** A click that never travelled, as a browser derives it from a press and a release on one spot. */
function click(board, target, extra = {}) {
	board.view.emit("pointerdown", target, { clientX: 0, clientY: 0, ...extra });
	board.view.emit("pointerup", target, { clientX: 0, clientY: 0, ...extra });
	return board.view.emit("click", target, { detail: 1, ...extra });
}

let made;
afterEach(() => { made?.teardown?.(); made?.board?.destroy(); made = null; });

describe("choosing people with a modifier on the click", () => {
	it("adds somebody with Shift held", () => {
		made = setUp({ chosen: ["n1"] });
		click(made.board, made.board.portraits.n2.face, { shiftKey: true });
		expect(made.handlers.onSelect).toHaveBeenLastCalledWith(["n1", "n2"], { final: true });
	});

	it("takes somebody already chosen back out", () => {
		made = setUp({ chosen: ["n1", "n2"] });
		click(made.board, made.board.portraits.n1.face, { shiftKey: true });
		expect(made.handlers.onSelect).toHaveBeenLastCalledWith(["n2"], { final: true });
	});

	// Ctrl on Windows, Cmd on a Mac: the modifier every file manager on either uses for the same thing.
	for (const key of ["ctrlKey", "metaKey"]) {
		it(`answers to ${key} as well as Shift`, () => {
			made = setUp();
			click(made.board, made.board.portraits.n3.face, { [key]: true });
			expect(made.handlers.onSelect).toHaveBeenLastCalledWith(["n3"], { final: true });
		});
	}

	// The NAME hung under a face is part of the person, and a reader aiming at somebody hits it.
	it("answers on the name under a face as it does on the face", () => {
		made = setUp();
		click(made.board, made.board.portraits.n2.name, { shiftKey: true });
		expect(made.handlers.onSelect).toHaveBeenLastCalledWith(["n2"], { final: true });
	});

	// THE KEYBOARD'S ROUTE: Shift+Enter on a face is a click with Shift held and no pointer behind it.
	// It must choose, not open the sheet a plain Enter opens.
	it("chooses from the keyboard and opens no sheet", () => {
		made = setUp();
		made.board.view.emit("click", made.board.portraits.n2.face, { detail: 0, shiftKey: true });
		expect(made.handlers.onSelect).toHaveBeenLastCalledWith(["n2"], { final: true });
		expect(made.handlers.onOpen).not.toHaveBeenCalled();
	});

	it("still opens the sheet on a plain Enter", () => {
		made = setUp();
		made.board.view.emit("click", made.board.portraits.n2.face, { detail: 0 });
		expect(made.handlers.onOpen).toHaveBeenCalledWith("n2");
		expect(made.handlers.onSelect).not.toHaveBeenCalled();
	});

	// A double click made with Shift held is a person chosen and then un-chosen, not a request for
	// their sheet.
	it("opens no sheet on a double click made with Shift held", () => {
		made = setUp();
		click(made.board, made.board.portraits.n2.face, { shiftKey: true });
		click(made.board, made.board.portraits.n2.face, { shiftKey: true });
		made.board.view.emit("dblclick", made.board.portraits.n2.face, { detail: 2, shiftKey: true });
		expect(made.handlers.onOpen).not.toHaveBeenCalled();
	});

	// A selection is only for moving people, so a board this reader may not rearrange offers none.
	it("chooses nobody on a board the reader may not move people on", () => {
		made = setUp({ canMove: () => false });
		click(made.board, made.board.portraits.n2.face, { shiftKey: true });
		expect(made.handlers.onSelect).not.toHaveBeenCalled();
	});
});

describe("letting a selection go", () => {
	it("lets go on a plain click on open paper", () => {
		made = setUp({ chosen: ["n1", "n2"] });
		click(made.board, made.board.board);
		expect(made.handlers.onSelect).toHaveBeenLastCalledWith([], { final: true });
		expect(made.handlers.onPickNone).toHaveBeenCalled();
	});

	// Holding Shift says "adding", so a Shift click that misses everybody takes nobody away.
	it("keeps it on a Shift click on open paper", () => {
		made = setUp({ chosen: ["n1", "n2"] });
		click(made.board, made.board.board, { shiftKey: true });
		expect(made.handlers.onSelect).not.toHaveBeenCalled();
	});

	it("says nothing at all when nobody was chosen", () => {
		made = setUp();
		click(made.board, made.board.board);
		expect(made.handlers.onSelect).not.toHaveBeenCalled();
	});

	// ⚠ ESCAPE IS CLAIMED, or core's own Escape closes every window on the screen as well.
	it("lets go on Escape, and keeps the key from the scene", () => {
		made = setUp({ chosen: ["n1"] });
		const ev = made.board.view.emit("keydown", made.board.portraits.n1.face, { key: "Escape" });
		expect(made.handlers.onSelect).toHaveBeenLastCalledWith([], { final: true });
		expect(ev.propagationStopped).toBe(true);
	});

	it("leaves Escape alone when nobody is chosen", () => {
		made = setUp();
		const ev = made.board.view.emit("keydown", made.board.portraits.n1.face, { key: "Escape" });
		expect(ev.propagationStopped).toBe(false);
	});

	// The tie bar floats in the same viewport, and its Escape is its own.
	it("leaves an Escape pressed on the tie bar to the tie bar", () => {
		made = setUp({ chosen: ["n1"] });
		const ev = made.board.view.emit("keydown", made.board.tiebar, { key: "Escape" });
		expect(made.handlers.onSelect).not.toHaveBeenCalled();
		expect(ev.propagationStopped).toBe(false);
	});
});

describe("carrying a selection", () => {
	// With the fake surface a pixel is a tenth of a percent, so (50, 30) is a travel of (5, 3).
	it("moves everybody chosen, in one call, by the same travel", () => {
		made = setUp({ chosen: ["n1", "n2"] });
		drag(made.board, made.board.portraits.n1.face, [50, 30]);
		expect(made.handlers.onGroupMove).toHaveBeenCalledWith({
			n1: { x: 15, y: 13 },
			n2: { x: 25, y: 23 },
		});
		expect(made.handlers.onMove).not.toHaveBeenCalled();
	});

	it("shows them all travelling, and nobody else", () => {
		made = setUp({ chosen: ["n1", "n2"] });
		const { board } = made;
		board.view.emit("pointerdown", board.portraits.n2.face, { clientX: 0, clientY: 0 });
		board.view.emit("pointermove", board.portraits.n2.face, { clientX: 50, clientY: 30 });
		board.flush();
		expect(board.portraits.n1.style["--relmap-drag-x"]).toBeDefined();
		expect(board.portraits.n2.style["--relmap-drag-x"]).toBeDefined();
		expect(board.portraits.n3.style["--relmap-drag-x"]).toBeUndefined();
		expect(board.portraits.n1.classList.contains("is-dragging")).toBe(true);
		expect(made.handlers.onGroupDragMove).toHaveBeenCalledWith({
			n1: { x: 15, y: 13 },
			n2: { x: 25, y: 23 },
		});
		expect(made.handlers.onDragMove).not.toHaveBeenCalled();
	});

	it("puts them all down, marks and travel both, when the drag ends", () => {
		made = setUp({ chosen: ["n1", "n2"] });
		drag(made.board, made.board.portraits.n1.face, [50, 30]);
		for (const id of ["n1", "n2"]) {
			expect(made.board.portraits[id].style["--relmap-drag-x"]).toBeUndefined();
			expect(made.board.portraits[id].classList.contains("is-dragging")).toBe(false);
		}
		// A real drop: the lines stay where they were previewed, and the write repaints them.
		expect(made.handlers.onGroupDragEnd).toHaveBeenCalledWith(null);
	});

	// An abandoned drag puts everybody's lines back where they started, all at once.
	it("hands back where they all started when the drag is abandoned", () => {
		made = setUp({ chosen: ["n1", "n2"] });
		const { board } = made;
		board.view.emit("pointerdown", board.portraits.n1.face, { clientX: 0, clientY: 0 });
		board.view.emit("pointermove", board.portraits.n1.face, { clientX: 50, clientY: 30 });
		board.flush();
		board.view.emit("pointercancel", board.portraits.n1.face, {});
		expect(made.handlers.onGroupDragEnd).toHaveBeenCalledWith({
			n1: { x: 10, y: 10 },
			n2: { x: 20, y: 20 },
		});
		expect(made.handlers.onGroupMove).not.toHaveBeenCalled();
	});

	// Somebody OUTSIDE the selection straightened up on their own leaves the selection as it was.
	it("moves a face outside the selection on its own", () => {
		made = setUp({ chosen: ["n1", "n2"] });
		drag(made.board, made.board.portraits.n3.face, [50, 30]);
		expect(made.handlers.onMove).toHaveBeenCalledWith("n3", { x: 35, y: 33 });
		expect(made.handlers.onGroupMove).not.toHaveBeenCalled();
		expect(made.handlers.onSelect).not.toHaveBeenCalled();
	});

	// One chosen is not a group: the lone paths still answer, so nothing about an ordinary drag moves.
	it("carries one chosen person the way it carries anybody", () => {
		made = setUp({ chosen: ["n1"] });
		drag(made.board, made.board.portraits.n1.face, [50, 30]);
		expect(made.handlers.onMove).toHaveBeenCalledWith("n1", { x: 15, y: 13 });
		expect(made.handlers.onGroupMove).not.toHaveBeenCalled();
	});

	// THE TAIL OF A GROUP DRAG IS NOT A CLICK ON PAPER, or dropping the group would also let it go.
	// The derived click is sent to the VIEWPORT, which is where the drag's pointer capture retargets
	// it in a real browser -- and the viewport is open paper, which is exactly the trap.
	it("keeps the selection through the click a drop derives", () => {
		made = setUp({ chosen: ["n1", "n2"] });
		const { board } = made;
		board.view.emit("pointerdown", board.portraits.n1.face, { clientX: 0, clientY: 0 });
		board.view.emit("pointermove", board.portraits.n1.face, { clientX: 50, clientY: 30 });
		board.flush();
		board.view.emit("pointerup", board.portraits.n1.face, { clientX: 50, clientY: 30 });
		board.view.emit("click", board.view, { detail: 1, clientX: 50, clientY: 30 });
		expect(made.handlers.onSelect).not.toHaveBeenCalled();
	});
});

describe("the arrow keys on a selection", () => {
	it("nudge everybody chosen, in one call", () => {
		made = setUp({ chosen: ["n1", "n2"] });
		made.board.view.emit("keydown", made.board.portraits.n1.face, { key: "ArrowRight" });
		expect(made.handlers.onGroupNudge).toHaveBeenCalledWith({
			n1: { x: 11, y: 10 },
			n2: { x: 21, y: 20 },
		});
		expect(made.handlers.onNudge).not.toHaveBeenCalled();
	});

	it("nudge a face outside the selection on its own", () => {
		made = setUp({ chosen: ["n1", "n2"] });
		made.board.view.emit("keydown", made.board.portraits.n3.face, { key: "ArrowRight" });
		expect(made.handlers.onNudge).toHaveBeenCalledWith("n3", { x: 31, y: 30 });
		expect(made.handlers.onGroupNudge).not.toHaveBeenCalled();
	});
});

describe("the far rail", () => {
	// Past reach the face stops under nothing, rather than following the pointer and jumping back.
	it("holds a lone drag at reach", () => {
		made = setUp({ spots: { n1: { x: RELMAP_REACH_MAX - 10, y: 10 } } });
		drag(made.board, made.board.portraits.n1.face, [500, 0]);
		expect(made.handlers.onMove).toHaveBeenCalledWith("n1", { x: RELMAP_REACH_MAX, y: 10 });
	});

	// ⚠ AS A UNIT: held one by one, a group pushed against the rail would squash into a line along it.
	it("holds a group at reach without changing its shape", () => {
		made = setUp({
			chosen: ["n1", "n2"],
			spots: { n1: { x: RELMAP_REACH_MAX - 10, y: 10 }, n2: { x: RELMAP_REACH_MAX - 40, y: 20 } },
		});
		drag(made.board, made.board.portraits.n1.face, [500, 0]);
		expect(made.handlers.onGroupMove).toHaveBeenCalledWith({
			n1: { x: RELMAP_REACH_MAX, y: 10 },
			n2: { x: RELMAP_REACH_MAX - 30, y: 20 },
		});
	});

	// THE SHEET ITSELF IS NOT A WALL ANY MORE, which was the complaint.
	it("lets a face go well past the edge of the sheet", () => {
		made = setUp({ spots: { n1: { x: 90, y: 90 } } });
		drag(made.board, made.board.portraits.n1.face, [500, 500]);
		expect(made.handlers.onMove).toHaveBeenCalledWith("n1", { x: 140, y: 140 });
	});
});

describe("the selection box", () => {
	it("starts on a Shift press on open paper, and keeps the browser from selecting text", () => {
		made = setUp();
		const ev = made.board.view.emit("pointerdown", made.board.board, { shiftKey: true, clientX: 0, clientY: 0 });
		expect(ev.defaultPrevented).toBe(true);
	});

	it("shows who is inside it as it grows, and hands them over when it is let go", () => {
		made = setUp({ nodesIn: vi.fn(rect => (rect.right >= 15 ? ["n1"] : [])) });
		const { board, handlers } = made;
		board.view.emit("pointerdown", board.board, { shiftKey: true, clientX: 0, clientY: 0 });
		board.view.emit("pointermove", board.board, { shiftKey: true, clientX: 200, clientY: 150 });
		board.flush();
		expect(handlers.nodesIn).toHaveBeenLastCalledWith({ left: 0, right: 20, top: 0, bottom: 15 });
		expect(handlers.onSelect).toHaveBeenLastCalledWith(["n1"], { final: false });
		expect(board.board.classList.contains("is-boxing")).toBe(true);
		board.view.emit("pointerup", board.board, { shiftKey: true, clientX: 200, clientY: 150 });
		expect(handlers.onSelect).toHaveBeenLastCalledWith(["n1"], { final: true });
		expect(board.board.classList.contains("is-boxing")).toBe(false);
	});

	// Drawn from the corner the reader started at, whichever way they dragged.
	it("measures the box the same whichever way it is drawn", () => {
		made = setUp();
		const { board, handlers } = made;
		board.view.emit("pointerdown", board.board, { shiftKey: true, clientX: 300, clientY: 300 });
		board.view.emit("pointermove", board.board, { shiftKey: true, clientX: 100, clientY: 200 });
		board.flush();
		expect(handlers.nodesIn).toHaveBeenLastCalledWith({ left: 10, right: 30, top: 20, bottom: 30 });
	});

	// HOLDING SHIFT SAYS "ADDING", so the box adds to whoever was chosen before it.
	it("adds to the people already chosen", () => {
		made = setUp({ chosen: ["n3"], nodesIn: vi.fn(() => ["n1"]) });
		drag(made.board, made.board.board, [200, 150], { shiftKey: true });
		expect(made.handlers.onSelect).toHaveBeenLastCalledWith(["n3", "n1"], { final: true });
	});

	// Handed over only when the answer changes: a box dragged over open paper is the same list for
	// sixty frames a second, and each one handed over is a sweep of every face on the board.
	it("hands nothing over for a frame that changed nobody", () => {
		made = setUp({ nodesIn: vi.fn(() => ["n1"]) });
		const { board, handlers } = made;
		board.view.emit("pointerdown", board.board, { shiftKey: true, clientX: 0, clientY: 0 });
		board.view.emit("pointermove", board.board, { shiftKey: true, clientX: 200, clientY: 150 });
		board.flush();
		board.view.emit("pointermove", board.board, { shiftKey: true, clientX: 210, clientY: 160 });
		board.flush();
		expect(handlers.onSelect).toHaveBeenCalledTimes(1);
	});

	it("puts the selection back as it was when the box is abandoned", () => {
		made = setUp({ chosen: ["n3"], nodesIn: vi.fn(() => ["n1"]) });
		const { board, handlers } = made;
		board.view.emit("pointerdown", board.board, { shiftKey: true, clientX: 0, clientY: 0 });
		board.view.emit("pointermove", board.board, { shiftKey: true, clientX: 200, clientY: 150 });
		board.flush();
		board.view.emit("pointercancel", board.board, {});
		expect(handlers.onSelect).toHaveBeenLastCalledWith(["n3"], { final: true });
	});

	// The click a box's release derives is the tail of a drag, and must not let the new selection go.
	it("keeps what it chose through the click its release derives", () => {
		made = setUp({ nodesIn: vi.fn(() => ["n1"]) });
		drag(made.board, made.board.board, [200, 150], { shiftKey: true });
		expect(made.handlers.onSelect).not.toHaveBeenLastCalledWith([], { final: true });
		expect(made.handlers.onPickNone).not.toHaveBeenCalled();
	});

	// A Shift press on a portrait is the portrait's: it picks them up.
	it("does not start on a face", () => {
		made = setUp();
		drag(made.board, made.board.portraits.n1.face, [50, 30], { shiftKey: true });
		expect(made.handlers.nodesIn).not.toHaveBeenCalled();
		expect(made.handlers.onMove).toHaveBeenCalled();
	});

	it("does not start on a board the reader may not move people on", () => {
		made = setUp({ canMove: () => false });
		drag(made.board, made.board.board, [200, 150], { shiftKey: true });
		expect(made.handlers.nodesIn).not.toHaveBeenCalled();
	});
});

describe("which presses are the selection box's", () => {
	let board;
	beforeEach(() => { board = pointerBoard(); });
	afterEach(() => board.destroy());
	const ask = (target, extra = {}) => pressStartsBox(
		{ button: 0, shiftKey: true, target, ...extra }, { view: board.view, board: board.board },
	);

	it("claims a Shift press on open paper, and on the viewport round the board", () => {
		expect(ask(board.board)).toBe(true);
		expect(ask(board.view)).toBe(true);
	});

	it("leaves a press without Shift to the pan", () => {
		expect(ask(board.board, { shiftKey: false })).toBe(false);
	});

	it("leaves the other buttons alone", () => {
		expect(ask(board.board, { button: 2 })).toBe(false);
	});

	it("leaves everything drawn on the board to its own gesture", () => {
		expect(ask(board.portraits.n1.face)).toBe(false);
		expect(ask(board.captions.e1.words)).toBe(false);
		expect(ask(board.strokes.e1.hit)).toBe(false);
	});

	// Chrome floating in the viewport is not paper.
	it("leaves the tie bar alone", () => {
		expect(ask(board.tiebar)).toBe(false);
	});
});
