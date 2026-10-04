import { afterEach, describe, expect, it, vi } from "vitest";
import {
	COLUMN_SNAP_SHAPES, columnSnapDelta, settleColumns, wireColumnSnap,
} from "../../module/timeline/timeline-column-snap.js";
import { GLIDING_CLASS, PANNING_CLASS } from "../../module/utils/drag-scroll.js";

// A COLUMN NEVER STOPS HALF UNDER THE PINNED HEAD (user, 2026-10-03: "I don't like how the name
// columns are getting cutoff when we scroll through on timeline"). Columns 200 wide with a 10 gap;
// the head's right edge (170) plus that gap is the flush edge, 180.
const cols = (firstLeft, n = 4) => Array.from({ length: n }, (_, i) => {
	const left = firstLeft + i * 210;
	return { left, right: left + 200 };
});

describe("columnSnapDelta", () => {
	it("leaves a board alone when no column is cut by the head", () => {
		expect(columnSnapDelta({ edge: 180, gap: 10, columns: cols(180) })).toBe(0);
		// Dragged off into the gutter: the head sits in its own place, nothing passes under it.
		expect(columnSnapDelta({ edge: 180, gap: 10, columns: cols(400) })).toBe(0);
		// A column wholly under the head is not cut either, and the one after it starts flush.
		expect(columnSnapDelta({ edge: 180, gap: 10, columns: cols(-30) })).toBe(0);
	});

	it("brings a column mostly showing back into full view", () => {
		// 60 of 200 hidden: scroll back 60.
		expect(columnSnapDelta({ edge: 180, gap: 10, columns: cols(120) })).toBe(-60);
	});

	it("lets a column mostly gone pass under, so the next starts flush", () => {
		// 150 of 200 hidden: the next column is at 240, 60 past the edge.
		expect(columnSnapDelta({ edge: 180, gap: 10, columns: cols(30) })).toBe(60);
	});

	it("uses the gap for where a column after the last would start", () => {
		expect(columnSnapDelta({ edge: 180, gap: 10, columns: [{ left: 30, right: 230 }] })).toBe(60);
	});

	it("does not twitch over a pixel of rounding", () => {
		expect(columnSnapDelta({ edge: 180, gap: 10, columns: cols(179.5) })).toBe(0);
		expect(columnSnapDelta({ edge: NaN, columns: cols(30) })).toBe(0);
	});
});

/** A scrollport holding one shape's pinned head and its columns, at window positions. */
function fakeScroll({ shape = COLUMN_SNAP_SHAPES[0], headRight = 170, gap = "10px", columns = cols(120), native = true } = {}) {
	const classes = new Set();
	const listeners = new Map();
	const pinned = { parentElement: {}, getBoundingClientRect: () => ({ right: headRight }) };
	const el = {
		isConnected: true,
		scrollLeft: 500,
		offsetWidth: 800,
		scrolledTo: null,
		getBoundingClientRect: () => ({ width: 800 }),
		scrollTo(opts) { this.scrolledTo = opts; },
		querySelector: sel => (sel === shape.pinned ? pinned : null),
		querySelectorAll: sel => (sel === shape.columns ? columns.map(r => ({ getBoundingClientRect: () => r })) : []),
		classList: { contains: c => classes.has(c), add: c => classes.add(c), remove: c => classes.delete(c) },
		addEventListener(type, fn) { listeners.set(type, fn); },
		removeEventListener(type) { listeners.delete(type); },
		emit: type => listeners.get(type)?.(),
		has: type => listeners.has(type),
	};
	if (native) el.onscrollend = null;
	globalThis.window = { getComputedStyle: () => ({ columnGap: gap }) };
	return el;
}

describe("settleColumns", () => {
	afterEach(() => { delete globalThis.window; delete globalThis.matchMedia; });

	it("eases the Down board so the caught name column shows whole", () => {
		const scroll = fakeScroll();
		expect(settleColumns(scroll)).toBe(true);
		expect(scroll.scrolledTo).toEqual({ left: 440, behavior: "smooth" });
	});

	it("does the same for the swimlanes' season columns under the thread names", () => {
		const scroll = fakeScroll({ shape: COLUMN_SNAP_SHAPES[1], columns: cols(30) });
		expect(settleColumns(scroll)).toBe(true);
		expect(scroll.scrolledTo.left).toBe(560);
	});

	it("does nothing on a shape with no pinned head, or with nothing caught", () => {
		expect(settleColumns(fakeScroll({ shape: { pinned: ".nope", columns: ".nope" } }))).toBe(false);
		const flush = fakeScroll({ columns: cols(180) });
		expect(settleColumns(flush)).toBe(false);
		expect(flush.scrolledTo).toBe(null);
	});

	it("jumps rather than glides for a reader who asked for less motion", () => {
		globalThis.matchMedia = () => ({ matches: true });
		const scroll = fakeScroll();
		settleColumns(scroll);
		expect(scroll.scrolledTo.behavior).toBe("auto");
	});
});

describe("wireColumnSnap", () => {
	afterEach(() => { delete globalThis.window; vi.useRealTimers(); });

	it("settles on scrollend, but never while a drag or a throw is still moving the box", () => {
		const scroll = fakeScroll();
		const { unwire } = wireColumnSnap(scroll);
		scroll.classList.add(PANNING_CLASS);
		scroll.emit("scrollend");
		scroll.classList.remove(PANNING_CLASS);
		scroll.classList.add(GLIDING_CLASS);
		scroll.emit("scrollend");
		expect(scroll.scrolledTo).toBe(null);
		scroll.classList.remove(GLIDING_CLASS);
		scroll.emit("scrollend");
		expect(scroll.scrolledTo.left).toBe(440);
		unwire();
		expect(scroll.has("scrollend")).toBe(false);
	});

	it("hands the drag a rest to call when it lets go", () => {
		const scroll = fakeScroll();
		wireColumnSnap(scroll).rest();
		expect(scroll.scrolledTo.left).toBe(440);
	});

	it("falls back to a quiet spell after scroll where there is no scrollend", () => {
		vi.useFakeTimers();
		const scroll = fakeScroll({ native: false });
		const { unwire } = wireColumnSnap(scroll, { quietMs: 100 });
		scroll.emit("scroll");
		vi.advanceTimersByTime(50);
		scroll.emit("scroll");
		vi.advanceTimersByTime(99);
		expect(scroll.scrolledTo).toBe(null);
		vi.advanceTimersByTime(1);
		expect(scroll.scrolledTo.left).toBe(440);
		unwire();
	});
});
