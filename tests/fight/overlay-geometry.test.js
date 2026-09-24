import { describe, it, expect } from "vitest";
import {
	rectCenter, contactPoint, meleeTie, edgePoint, rangedSegment, dashes, arrowHead, badgeCircle, screenFloor,
} from "../../module/fight/overlay-geometry.js";

const r = (x, y, w = 100, h = 100) => ({ x, y, w, h });

describe("overlay geometry", () => {
	it("finds a rectangle's middle", () => {
		expect(rectCenter(r(100, 200, 50, 30))).toEqual({ x: 125, y: 215 });
	});

	it("puts the contact point on the shared edge of two tokens side by side", () => {
		expect(contactPoint(r(0, 0), r(100, 0))).toEqual({ x: 100, y: 50 });
	});

	it("puts it on the shared corner of two tokens corner to corner", () => {
		expect(contactPoint(r(0, 0), r(100, 100))).toEqual({ x: 100, y: 100 });
	});

	it("draws the melee tie across the contact point, along the line between the tokens", () => {
		expect(meleeTie(r(0, 0), r(100, 0), 60)).toEqual({ x1: 70, y1: 50, x2: 130, y2: 50 });
		const vertical = meleeTie(r(0, 0), r(0, 100), 40);
		expect(vertical).toEqual({ x1: 50, y1: 80, x2: 50, y2: 120 });
	});

	it("leaves a token through the side facing the other", () => {
		expect(edgePoint(r(0, 0), { x: 500, y: 50 })).toEqual({ x: 100, y: 50 });
		expect(edgePoint(r(0, 0), { x: 50, y: -400 })).toEqual({ x: 50, y: 0 });
		const corner = edgePoint(r(0, 0), { x: 150, y: 150 });
		expect(corner.x).toBeCloseTo(100);
		expect(corner.y).toBeCloseTo(100);
	});

	it("runs the ranged line from edge to edge", () => {
		expect(rangedSegment(r(0, 0), r(500, 0))).toEqual({ x1: 100, y1: 50, x2: 500, y2: 50 });
	});

	it("cuts a line into dashes, starting and ending inside it", () => {
		const parts = dashes({ x1: 0, y1: 0, x2: 100, y2: 0 }, 20, 10);
		expect(parts.map(p => [p.x1, p.x2])).toEqual([[0, 20], [30, 50], [60, 80], [90, 100]]);
		expect(dashes({ x1: 0, y1: 0, x2: 10, y2: 0 }, 20, 10)).toEqual([{ x1: 0, y1: 0, x2: 10, y2: 0 }]);
	});

	it("points the arrowhead at the target", () => {
		const [tip, left, right] = arrowHead({ x1: 0, y1: 0, x2: 100, y2: 0 }, 20);
		expect(tip).toEqual({ x: 100, y: 0 });
		expect(left.x).toBeCloseTo(80);
		expect(right.x).toBeCloseTo(80);
		expect(Math.abs(left.y - right.y)).toBeCloseTo(20);
	});

	it("tucks the badge into the token's top-right corner", () => {
		expect(badgeCircle(r(0, 0), 20)).toEqual({ x: 88, y: 12, r: 20 });
	});

	it("never lets a mark shrink below its on-screen minimum", () => {
		expect(screenFloor(6, 1, 3)).toBe(6);
		expect(screenFloor(6, 0.25, 3)).toBe(12);
		expect(screenFloor(6, 0, 3)).toBe(6);
	});
});
