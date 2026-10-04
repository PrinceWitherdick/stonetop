// THE YEAR SCRUBBER: a slider along the bottom of the timeline, one tick per year the record holds
// (user, 2026-10-03: "a scrubber on the bottom that can slide to different years quickly. When
// scrubbed, we should center the timeline in the view").
//
// Sliding it brings that year into the MIDDLE of the column along the timeline's own axis (across
// for Horizontal, down for Vertical), and puts the timeline back in the middle the other way too:
// the drag gutter lets a reader haul it nearly out of sight, and a scrub is how they get it back.
// It follows the other way as well: drag, throw or zoom the column and the thumb moves to wherever
// the view is, so it always says where the reader is.
//
// THE THUMB SLIDES, IT DOES NOT SNAP (user, 2026-10-03: "I want to be able to slide in between years
// as well"). The range's value is a FRACTIONAL index into the stops: 1.5 is halfway from where year 2
// sits centred to where year 3 does, and the column scrolls to that blend. Only the keyboard steps a
// whole year at a time, so arrowing along still lands on each one.
//
// ⚠ AN INSTANT JUMP, NOT A GLIDE. The slider fires on every step of the thumb; a smooth scroll per
// step would leave the column chasing the hand, and its in-between scroll events would pull the thumb
// back under it. A video scrubber jumps, and so does this.
//
// Everything is measured off the LIVE layout (`getBoundingClientRect`), so the wheel's zoom, the drag
// gutter and the four shapes need no arithmetic of their own: a year is wherever its `[data-year]`
// elements are drawn.

/** What every element a year occupies is stamped with, in all four shapes. */
export const YEAR_ATTR = "data-year";

/**
 * How far, in pixels, the column may sit from where the thumb last put it and still be that jump's
 * own echo: reading the place back off it could only nudge the thumb off where the reader's hand put
 * it (a rounded pixel). Any further is the reader moving the column some other way.
 */
const SCRUB_ECHO_PX = 1;

/**
 * The years a scrubber stops at, oldest first: one per year with anything shown in it. The undated
 * block has no year and no stop.
 *
 * @param {Array<{year: number, yearLabel: string, undated?: boolean}>} periods  From the view model.
 * @returns {Array<{year: number, label: string}>}
 */
export function yearStops(periods = []) {
	const stops = [];
	for (const period of periods) {
		if (period?.undated || !period?.yearLabel) continue;
		if (stops.at(-1)?.year === period.year) continue;
		stops.push({ year: period.year, label: period.yearLabel });
	}
	return stops;
}

/**
 * Where each stop's tick sits along the slider, as a share of the thumb's travel: 0 for the first
 * year, 1 for the last. The stylesheet turns it into a place on the track (see
 * `.stonetop-timeline-scrub-tick`), allowing for the thumb's width, since the thumb's CENTRE is what
 * stops over a year.
 *
 * @param {Array<{year, label}>} stops  From `yearStops`.
 * @returns {Array<{year: number, at: number}>}
 */
export function scrubTicks(stops = []) {
	const last = stops.length - 1;
	return stops.map((stop, index) => ({ year: stop.year, at: last > 0 ? Number((index / last).toFixed(4)) : 0 }));
}

/**
 * The scroll offset along one axis that puts a span in the middle of the view.
 *
 * A YEAR longer than the view cannot be centred and still be read from its start, so it is laid
 * against the view's near edge instead (less `inset`, the breathing room the column keeps at its
 * top): the year's opening season is what the reader slid to. `fromStart: false` turns that off,
 * for Horizontal's cross axis, where the timeline is centred top to bottom however big the zoom has
 * made it (user, 2026-10-03).
 *
 * All positions are on screen (client pixels), as `getBoundingClientRect` gives them.
 *
 * @param {{scroll: number, viewStart: number, viewSize: number, spanStart: number, spanSize: number, inset?: number, fromStart?: boolean}} at
 * @returns {number}  The new scroll offset (unclamped; the browser clamps).
 */
export function centredScroll({ scroll = 0, viewStart = 0, viewSize = 0, spanStart = 0, spanSize = 0, inset = 0, fromStart = true } = {}) {
	if (fromStart && spanSize > viewSize) return Math.round(scroll + spanStart - viewStart - inset);
	return Math.round(scroll + (spanStart + spanSize / 2) - (viewStart + viewSize / 2));
}

/** The stops that have a scroll offset, as `[index, offset]` pairs in stop order. */
function knownTargets(targets) {
	const points = [];
	targets.forEach((offset, index) => { if (Number.isFinite(offset)) points.push([index, offset]); });
	return points;
}

/**
 * The scroll offset for a slider value: a whole value is that year's own offset, a fraction the
 * straight blend of the two years either side. A year with nothing drawn (null) is skipped over.
 *
 * @param {Array<number|null>} targets  One scroll offset per stop, from `yearTargets`.
 * @param {number} value  A fractional index into the stops.
 * @returns {number|null}  Null when no year is drawn.
 */
export function scrollForValue(targets = [], value = 0) {
	const points = knownTargets(targets);
	if (!points.length) return null;
	if (value <= points[0][0]) return points[0][1];
	for (let i = 1; i < points.length; i++) {
		const [ia, ta] = points[i - 1];
		const [ib, tb] = points[i];
		if (value <= ib) return Math.round(ta + (tb - ta) * (value - ia) / (ib - ia));
	}
	return points.at(-1)[1];
}

/**
 * The slider value for a scroll offset: the inverse of `scrollForValue`, so the thumb lands between
 * two ticks as far along as the view is between those two years. -1 when no year is drawn.
 *
 * @param {Array<number|null>} targets  One scroll offset per stop, from `yearTargets`.
 * @param {number} offset  The column's scroll along the timeline's axis.
 */
export function valueForScroll(targets = [], offset = 0) {
	const points = knownTargets(targets);
	if (!points.length) return -1;
	if (offset <= points[0][1]) return points[0][0];
	// Scrolled to the far end: the last year, even when the clamp has pinned the one before it there too.
	if (offset >= points.at(-1)[1]) return points.at(-1)[0];
	for (let i = 1; i < points.length; i++) {
		const [ia, ta] = points[i - 1];
		const [ib, tb] = points[i];
		if (offset > tb) continue;
		// Two years the browser's clamp has pinned to one offset: the later one is where it lands.
		if (tb === ta) return ib;
		return ia + (ib - ia) * (offset - ta) / (tb - ta);
	}
	return points.at(-1)[0];
}

/** The whole year a fractional slider value is nearest, for the readout. */
export function nearestStop(value = 0) {
	return Math.round(value);
}

/**
 * The on-screen extent of each year, as one rectangle per year: every element stamped with it, read
 * in ONE pass over the column (this runs every scroll frame). A year with nothing drawn is absent.
 *
 * @returns {Map<string, {left, top, right, bottom}>}  keyed by the attribute's text
 */
function yearRects(scroll) {
	const rects = new Map();
	for (const el of scroll.querySelectorAll(`[${YEAR_ATTR}]`)) {
		const r = el.getBoundingClientRect();
		if (!r.width && !r.height) continue;
		const year = el.getAttribute(YEAR_ATTR);
		const rect = rects.get(year);
		rects.set(year, rect
			? { left: Math.min(rect.left, r.left), top: Math.min(rect.top, r.top), right: Math.max(rect.right, r.right), bottom: Math.max(rect.bottom, r.bottom) }
			: { left: r.left, top: r.top, right: r.right, bottom: r.bottom });
	}
	return rects;
}

/**
 * Where the timeline itself is drawn, on screen: what the picture HOLDS, not the picture's box.
 *
 * ⚠ THE AXIS'S BOX IS THE WINDOW'S HEIGHT. The sideways single track (`.stonetop-timeline-htrack`)
 * is stretched to `min-height: 100%` and centres its band of cards inside, so its own box is as tall
 * as the view whatever it holds, and centring THAT centres nothing. Its children are the band.
 *
 * A child PINNED by `position: sticky` (the swimlanes' season heads, the board's thread names) is
 * drawn where it is stuck, not where it lies, and would drag the extent to the view's edge; a
 * picture with pinned children is one sized to its content anyway, so its own box is the answer.
 */
export function pictureRect(picture) {
	if (!picture?.getBoundingClientRect) return null;
	const own = picture.getBoundingClientRect();
	const view = picture.ownerDocument?.defaultView;
	let rect = null;
	for (const child of picture.children ?? []) {
		if (view?.getComputedStyle?.(child)?.position === "sticky") return own;
		const r = child.getBoundingClientRect();
		if (!r.width && !r.height) continue;
		rect = rect
			? { left: Math.min(rect.left, r.left), top: Math.min(rect.top, r.top), right: Math.max(rect.right, r.right), bottom: Math.max(rect.bottom, r.bottom) }
			: { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
	}
	if (!rect) return own;
	return { ...rect, width: rect.right - rect.left, height: rect.bottom - rect.top };
}

/**
 * The view's own rectangle: the column's padding box less its scrollbars, which is what the reader
 * actually sees through.
 */
function viewRect(scroll) {
	const r = scroll.getBoundingClientRect();
	const left = r.left + (scroll.clientLeft || 0);
	const top = r.top + (scroll.clientTop || 0);
	return { left, top, width: scroll.clientWidth || r.width, height: scroll.clientHeight || r.height };
}

/**
 * The scroll offset, along the timeline's axis, that centres each stop's year: null for a year with
 * nothing drawn. Each is held to the column's real scroll range, so the blend between two years runs
 * over offsets the column can actually reach, and the thumb read back off a clamped edge sits on the
 * end tick rather than short of it.
 *
 * @param {HTMLElement} scroll  The column that scrolls.
 * @param {Array<{year}>} stops
 * @param {{horizontal: boolean, inset?: number}} opts
 * @returns {Array<number|null>}
 */
export function yearTargets(scroll, stops, { horizontal, inset = 0 } = {}) {
	const view = viewRect(scroll);
	const offset = horizontal ? scroll.scrollLeft : scroll.scrollTop;
	const room = horizontal ? scroll.scrollWidth - scroll.clientWidth : scroll.scrollHeight - scroll.clientHeight;
	const spans = yearRects(scroll);
	return stops.map(({ year }) => {
		const span = spans.get(String(year));
		if (!span) return null;
		const target = horizontal
			? centredScroll({ scroll: offset, viewStart: view.left, viewSize: view.width, spanStart: span.left, spanSize: span.right - span.left })
			: centredScroll({ scroll: offset, viewStart: view.top, viewSize: view.height, spanStart: span.top, spanSize: span.bottom - span.top, inset });
		const low = Math.max(0, target);
		return room > 0 ? Math.min(room, low) : low;
	});
}

/**
 * Bring a slider value into the middle of the column (a year, or a blend of the two either side),
 * and the timeline into the middle the other way (user, 2026-10-03): Horizontal is centred top to
 * bottom whatever the zoom; Vertical is centred side to side when it FITS, and laid against the left
 * edge when it does not. A board of sixteen threads is four windows wide, and its middle is four
 * characters nobody asked for with the seasons off-screen; from the left it opens on the seasons and
 * the first threads.
 *
 * @param {HTMLElement} scroll  The column that scrolls.
 * @param {Array<{year}>} stops
 * @param {number} value  A fractional index into the stops.
 * @param {{horizontal: boolean, picture?: HTMLElement|null, inset?: number}} opts  `picture` is the
 *        timeline itself (the canvas's one child), centred on the cross axis.
 */
export function scrubTo(scroll, stops, value, { horizontal, picture = null, inset = 0 } = {}) {
	const main = scrollForValue(yearTargets(scroll, stops, { horizontal, inset }), value);
	if (main === null) return false;
	const view = viewRect(scroll);
	const whole = pictureRect(picture);
	const across = !whole ? null : horizontal
		? { scroll: scroll.scrollTop, viewStart: view.top, viewSize: view.height, spanStart: whole.top, spanSize: whole.height, fromStart: false }
		: { scroll: scroll.scrollLeft, viewStart: view.left, viewSize: view.width, spanStart: whole.left, spanSize: whole.width, inset };
	const cross = across ? centredScroll(across) : null;
	if (horizontal) {
		scroll.scrollLeft = main;
		if (cross !== null) scroll.scrollTop = cross;
	} else {
		scroll.scrollTop = main;
		if (cross !== null) scroll.scrollLeft = cross;
	}
	return true;
}

/** Where along the slider the column is, measured off the live layout: -1 for nowhere. */
export function valueInView(scroll, stops, { horizontal, inset = 0 } = {}) {
	return valueForScroll(yearTargets(scroll, stops, { horizontal, inset }), horizontal ? scroll.scrollLeft : scroll.scrollTop);
}

/** The keys that step the thumb a whole year, and which way. */
const YEAR_KEYS = { ArrowRight: 1, ArrowUp: 1, PageUp: 1, ArrowLeft: -1, ArrowDown: -1, PageDown: -1 };

/**
 * Wire a scrubber to its column.
 *
 * @param {HTMLElement} scroll  The column that scrolls.
 * @param {HTMLElement} bar     The scrubber's own element: holds the range input and the year readout.
 * @param {object} opts
 * @param {Array<{year, label}>} opts.stops  From `yearStops`; the range's value is a fractional
 *                                           index into it.
 * @param {boolean} opts.horizontal
 * @param {string}  [opts.picture]  Selector, inside the column, of the timeline itself.
 * @param {number}  [opts.inset]    Breathing room kept at the column's top (or left) when a year (or a
 *                                  Vertical board) is too long to centre.
 * @returns {() => void}  Takes every listener back off.
 */
export function wireYearScrubber(scroll, bar, { stops = [], horizontal = true, picture = "", inset = 0 } = {}) {
	const range = bar?.querySelector?.("input[type='range']");
	if (!scroll?.addEventListener || !range || stops.length < 2) return () => {};
	const readout = bar.querySelector("output");
	// Where the thumb's own jump left the column, until the column is moved some other way.
	let wrote = null;
	let frame = 0;

	const last = stops.length - 1;

	// The readout and the screen reader name the year the thumb is nearest.
	const show = (value) => {
		const stop = stops[nearestStop(value)];
		if (!stop) return;
		range.value = String(Number(value.toFixed(3)));
		range.setAttribute("aria-valuetext", stop.label);
		if (readout) readout.textContent = stop.label;
	};

	const go = (value) => {
		show(value);
		scrubTo(scroll, stops, value, {
			horizontal, inset, picture: picture ? scroll.querySelector(picture) : null,
		});
		// Read back rather than kept from the write: the column clamps and rounds what it is given.
		wrote = { left: scroll.scrollLeft, top: scroll.scrollTop };
	};

	// The scroll is the thumb's own jump, not the reader moving the column.
	const isEcho = () => !!wrote
		&& Math.abs(scroll.scrollLeft - wrote.left) <= SCRUB_ECHO_PX
		&& Math.abs(scroll.scrollTop - wrote.top) <= SCRUB_ECHO_PX;

	const onInput = () => go(Math.min(last, Math.max(0, Number(range.value) || 0)));

	// The keyboard steps a WHOLE year, from wherever the thumb was left between two: the next one
	// along, never a hundredth of the way to it.
	const onKeydown = (event) => {
		const value = Number(range.value) || 0;
		let next;
		if (event.key === "Home") next = 0;
		else if (event.key === "End") next = last;
		else if (YEAR_KEYS[event.key] > 0) next = Math.min(last, Math.floor(value + 0.001) + 1);
		else if (YEAR_KEYS[event.key] < 0) next = Math.max(0, Math.ceil(value - 0.001) - 1);
		else return;
		event.preventDefault();
		go(next);
	};

	const follow = () => {
		frame = 0;
		if (scroll.isConnected === false || isEcho()) return;
		wrote = null;
		const value = valueInView(scroll, stops, { horizontal, inset });
		if (value >= 0 && Math.abs(value - Number(range.value)) > 0.001) show(value);
	};

	// One read of the layout per frame however many scroll events the frame brought.
	const onScroll = () => {
		if (frame || typeof globalThis.requestAnimationFrame !== "function") return;
		frame = globalThis.requestAnimationFrame(follow);
	};

	range.addEventListener("input", onInput);
	range.addEventListener("keydown", onKeydown);
	scroll.addEventListener("scroll", onScroll, { passive: true });
	// Once now the column has its kept place back, so the thumb opens where the view is.
	onScroll();

	return () => {
		range.removeEventListener("input", onInput);
		range.removeEventListener("keydown", onKeydown);
		scroll.removeEventListener("scroll", onScroll);
		if (frame) globalThis.cancelAnimationFrame?.(frame);
		frame = 0;
	};
}
