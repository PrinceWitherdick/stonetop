// THE COLUMNS SETTLE WHOLE beside a pinned head (user, 2026-10-03: "I don't like how the name
// columns are getting cutoff when we scroll through on timeline").
//
// Both multi-thread shapes pin a head at the left while the columns slide under it: the Down board's
// season cells (with the blank corner over them in the names row) and the swimlanes' thread names
// (with their corner over the season heads). Pinning is right while the board MOVES; what was wrong is
// where it STOPPED, with a column half under the head, its name and every card in it cut down the
// middle. So once the board comes to rest, whichever way it was moved (a drag, a throw, the wheel, the
// scrollbar, the keyboard, the scrubber), a column caught under the head is eased out to one side: back
// into full view if most of it was still showing, otherwise on under the head so the NEXT column
// starts flush against it.
//
// WHY IN SCRIPT AND NOT `scroll-snap`. Chrome snaps programmatic scrolls too, and the drag
// (utils/drag-scroll.js) moves the box by writing `scrollLeft` on every pointermove and every glide
// frame: under a snap the board would fight the hand. Here nothing happens until the hand has let go
// and any throw has died away.
//
// Only sideways, and only while the pinned head is actually PINNED: with the board at its left edge
// (or dragged off into the gutter past it) the head sits in its own place and covers nothing.

import { GLIDING_CLASS, PANNING_CLASS } from "../utils/drag-scroll.js";
import { prefersReducedMotion } from "../utils/reduced-motion.js";

/** Under this many window pixels a column is not "caught": rounding, not a cut. */
const SLOP_PX = 1;

/** The two shapes with a pinned head, and the cells that mark where their columns lie. */
export const COLUMN_SNAP_SHAPES = [
	// Down, every thread: the names row's corner rides over the season cells' column.
	{ pinned: ".stonetop-timeline-lane-spacer", columns: ".stonetop-timeline-lane-heads > .stonetop-timeline-lane-head" },
	// Across, every thread: the swimlanes' corner rides over the thread names' column.
	{ pinned: ".stonetop-timeline-swim-corner", columns: ".stonetop-timeline-swim-head" },
];

/**
 * How far to move the board sideways, in window pixels, so no column is left cut by the head.
 *
 * PURE. Every figure is a window position (a bounding rect's), so the arithmetic is the same at any
 * zoom; the caller turns the answer into scroll pixels.
 *
 * @param {object} args
 * @param {number} args.edge  Where a column starts when it sits flush against the head: the head's
 *                            right edge plus the gap the layout keeps after it.
 * @param {number} [args.gap]  That gap, which is also what the layout keeps between two columns.
 * @param {Array<{left: number, right: number}>} args.columns  In order, left to right.
 * @returns {number}  Positive to scroll on (the columns go left), negative to scroll back, 0 for none.
 */
export function columnSnapDelta({ edge, gap = 0, columns = [] } = {}) {
	if (!Number.isFinite(edge)) return 0;
	const at = columns.findIndex(c => c.left < edge - SLOP_PX && c.right > edge + SLOP_PX);
	if (at < 0) return 0;
	const caught = columns[at];
	const hidden = edge - caught.left;
	// Most of it still showing: bring it back whole.
	if (hidden <= (caught.right - caught.left) / 2) return -hidden;
	// Most of it gone: let it go under, and the next one starts at the head. The last column has no
	// next; the gap the layout keeps stands in for where one would start.
	const next = columns[at + 1];
	return (next ? next.left : caught.right + gap) - edge;
}

/** The gap a flex row or grid keeps between its cells, in window pixels at the current zoom. */
function gapAfter(pinned, scale) {
	const parent = pinned?.parentElement;
	const view = pinned?.ownerDocument?.defaultView ?? globalThis.window;
	const gap = parseFloat(view?.getComputedStyle?.(parent)?.columnGap);
	return (Number.isFinite(gap) ? gap : 0) * scale;
}

/**
 * Move the box, if a column is caught under the head, so it is not. Nothing to do returns false.
 *
 * @param {HTMLElement} scroll  The scrollport.
 * @param {{pinned: string, columns: string}[]} [shapes]
 */
export function settleColumns(scroll, shapes = COLUMN_SNAP_SHAPES) {
	if (!scroll?.querySelector) return false;
	for (const { pinned: pinnedSel, columns: columnSel } of shapes) {
		const pinned = scroll.querySelector(pinnedSel);
		if (!pinned) continue;
		// A box drawn at some scale (a transformed ancestor) measures in window pixels but scrolls in
		// its own; the ratio turns one into the other.
		const box = scroll.getBoundingClientRect();
		const scale = scroll.offsetWidth > 0 && box.width > 0 ? box.width / scroll.offsetWidth : 1;
		const head = pinned.getBoundingClientRect();
		const columns = [...scroll.querySelectorAll(columnSel)].map(c => c.getBoundingClientRect());
		const gap = gapAfter(pinned, scale);
		const delta = columnSnapDelta({ edge: head.right + gap, gap, columns });
		if (Math.abs(delta) <= SLOP_PX) return false;
		const left = scroll.scrollLeft + delta / scale;
		const behavior = prefersReducedMotion() ? "auto" : "smooth";
		if (typeof scroll.scrollTo === "function") scroll.scrollTo({ left, behavior });
		else scroll.scrollLeft = left;
		return true;
	}
	return false;
}

/**
 * Settle the columns whenever the box comes to rest.
 *
 * `scrollend` covers the wheel, the scrollbar, the keyboard and the scrubber; it ALSO fires while a
 * drag or a throw is still moving the box, so those are skipped (their classes say so) and the drag
 * calls `rest` itself when it is done (wire it as drag-scroll's `onRest`). A browser without
 * `scrollend` gets a short quiet spell after the last `scroll` instead.
 *
 * @param {HTMLElement} scroll
 * @returns {{rest: () => void, unwire: () => void}}
 */
export function wireColumnSnap(scroll, { shapes = COLUMN_SNAP_SHAPES, quietMs = 150 } = {}) {
	if (!scroll?.addEventListener) return { rest: () => {}, unwire: () => {} };
	const moving = () => scroll.classList?.contains(PANNING_CLASS) || scroll.classList?.contains(GLIDING_CLASS);
	const rest = () => {
		if (scroll.isConnected === false || moving()) return;
		settleColumns(scroll, shapes);
	};
	let timer = 0;
	const native = "onscrollend" in scroll;
	const type = native ? "scrollend" : "scroll";
	const onEvent = native ? rest : () => {
		clearTimeout(timer);
		timer = setTimeout(rest, quietMs);
	};
	scroll.addEventListener(type, onEvent, { passive: true });
	return {
		rest,
		unwire: () => {
			clearTimeout(timer);
			scroll.removeEventListener(type, onEvent, { passive: true });
		},
	};
}
