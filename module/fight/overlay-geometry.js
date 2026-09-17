// The shapes the fight overlay draws, as numbers.
//
// PURE, so the arithmetic is tested without PIXI, and the painter (fight-overlay.js) only turns
// these into strokes. Everything is in scene pixels; rectangles are `{x, y, w, h}` token footprints.

/** The middle of a rectangle. */
export function rectCenter(r) {
	return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/** The point of rectangle `r` nearest to point `p`. */
function nearestPoint(r, p) {
	return {
		x: Math.min(Math.max(p.x, r.x), r.x + r.w),
		y: Math.min(Math.max(p.y, r.y), r.y + r.h),
	};
}

/**
 * Where two tokens meet: halfway between each one's nearest point to the other's centre. For two
 * tokens side by side that is the middle of the edge they share; corner to corner, the corner.
 */
export function contactPoint(a, b) {
	const pa = nearestPoint(a, rectCenter(b));
	const pb = nearestPoint(b, rectCenter(a));
	return { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
}

/** A unit vector from `from` toward `to`, or pointing right when the two coincide. */
function direction(from, to) {
	const dx = to.x - from.x;
	const dy = to.y - from.y;
	const length = Math.hypot(dx, dy);
	return length > 0 ? { x: dx / length, y: dy / length } : { x: 1, y: 0 };
}

/**
 * The melee mark: a short bar straddling the point where the two tokens meet, lying along the line
 * between their centres, so it reads as a join between the two rather than as a mark on either one.
 *
 * @param {number} length  the bar's length, in scene pixels
 */
export function meleeTie(a, b, length) {
	const mid = contactPoint(a, b);
	const dir = direction(rectCenter(a), rectCenter(b));
	const half = Math.max(0, Number(length) || 0) / 2;
	return { x1: mid.x - dir.x * half, y1: mid.y - dir.y * half, x2: mid.x + dir.x * half, y2: mid.y + dir.y * half };
}

/**
 * Where a line from the centre of rectangle `r` toward point `toward` leaves the rectangle.
 */
export function edgePoint(r, toward) {
	const c = rectCenter(r);
	const dir = direction(c, toward);
	const tx = dir.x !== 0 ? (r.w / 2) / Math.abs(dir.x) : Infinity;
	const ty = dir.y !== 0 ? (r.h / 2) / Math.abs(dir.y) : Infinity;
	const t = Math.min(tx, ty);
	return { x: c.x + dir.x * t, y: c.y + dir.y * t };
}

/** The ranged line: from the edge of the shooter's token to the edge of the target's. */
export function rangedSegment(from, to) {
	const start = edgePoint(from, rectCenter(to));
	const end = edgePoint(to, rectCenter(from));
	return { x1: start.x, y1: start.y, x2: end.x, y2: end.y };
}

/**
 * A segment cut into dashes, starting with a dash. A segment shorter than one dash is one dash.
 *
 * @returns {Array<{x1: number, y1: number, x2: number, y2: number}>}
 */
export function dashes(seg, dash, gap) {
	const length = Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1);
	const on = Math.max(1, Number(dash) || 1);
	const off = Math.max(0, Number(gap) || 0);
	if (length <= on) return [{ ...seg }];
	const ux = (seg.x2 - seg.x1) / length;
	const uy = (seg.y2 - seg.y1) / length;
	const out = [];
	for (let at = 0; at < length; at += on + off) {
		const end = Math.min(length, at + on);
		out.push({ x1: seg.x1 + ux * at, y1: seg.y1 + uy * at, x2: seg.x1 + ux * end, y2: seg.y1 + uy * end });
	}
	return out;
}

/**
 * An arrowhead at the segment's END, as a triangle's three corners, `size` long and as wide.
 *
 * @returns {Array<{x: number, y: number}>} tip first
 */
export function arrowHead(seg, size) {
	const tip = { x: seg.x2, y: seg.y2 };
	const dir = direction({ x: seg.x1, y: seg.y1 }, tip);
	const s = Math.max(0, Number(size) || 0);
	const back = { x: tip.x - dir.x * s, y: tip.y - dir.y * s };
	const nx = -dir.y * (s / 2);
	const ny = dir.x * (s / 2);
	return [tip, { x: back.x + nx, y: back.y + ny }, { x: back.x - nx, y: back.y - ny }];
}

/**
 * Where a token's count badge sits: its top-right corner, pulled in so most of the disc stays on
 * the token it belongs to rather than straying onto a neighbour's.
 */
export function badgeCircle(r, radius) {
	const rad = Math.max(0, Number(radius) || 0);
	return { x: r.x + r.w - rad * 0.6, y: r.y + rad * 0.6, r: rad };
}

/**
 * A size in scene pixels that never draws smaller than `minPx` screen pixels: zoomed far out, a line
 * scaled to the grid would thin to nothing, and a reader who cannot see it gets nothing from it.
 *
 * @param {number} world       the size wanted, in scene pixels
 * @param {number} stageScale  the canvas zoom (screen pixels per scene pixel)
 * @param {number} minPx       the smallest it may look on screen
 */
export function screenFloor(world, stageScale, minPx) {
	const scale = Number(stageScale) > 0 ? Number(stageScale) : 1;
	return Math.max(Number(world) || 0, (Number(minPx) || 0) / scale);
}
