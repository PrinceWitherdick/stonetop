import { describe, expect, it } from "vitest";
import { pickRandomPortrait, rolledScrollTop } from "../../../module/actors/steading/PeopleGalleryDialog.js";

// The dialog hands this only the tiles the filters left showing, so "respects the filters"
// is the caller's job; what is tested here is the choice made out of that pool.
describe("pickRandomPortrait", () => {
	const pool = ["a.webp", "b.webp", "c.webp"];

	it("picks from the pool it is given", () => {
		expect(pickRandomPortrait(pool, { rng: () => 0 })).toBe("a.webp");
		expect(pickRandomPortrait(pool, { rng: () => 0.5 })).toBe("b.webp");
		expect(pickRandomPortrait(pool, { rng: () => 0.99 })).toBe("c.webp");
	});

	it("stays in range on an rng that returns 1", () => {
		expect(pickRandomPortrait(pool, { rng: () => 1 })).toBe("c.webp");
	});

	it("never rolls the portrait already in use, so a re-roll always changes something", () => {
		// Every roll lands on the excluded index; with "a" out of the pool it can only be b or c.
		for (const r of [0, 0.34, 0.5, 0.99]) {
			expect(pickRandomPortrait(pool, { current: "a.webp", rng: () => r })).not.toBe("a.webp");
		}
	});

	it("still returns the one showing when it is the one already in use", () => {
		expect(pickRandomPortrait(["a.webp"], { current: "a.webp", rng: () => 0.5 })).toBe("a.webp");
	});

	it("returns nothing when the filters left no portraits", () => {
		expect(pickRandomPortrait([], { rng: () => 0.5 })).toBeNull();
		expect(pickRandomPortrait(undefined, { rng: () => 0.5 })).toBeNull();
		expect(pickRandomPortrait(["", null], { rng: () => 0.5 })).toBeNull();
	});
});

// The scroll the roll animates towards. A 400px-tall gallery body sitting 100px down the
// viewport, over 2000px of grid, showing 220px tiles — so a centred tile sits 90px below
// the body's top edge and the scroll range ends at 1600.
describe("rolledScrollTop", () => {
	const BODY = { scrollTop: 0, viewTop: 100, viewHeight: 400, tileHeight: 220, scrollHeight: 2000 };

	it("centres a tile that rolled in off the bottom of the view", () => {
		// 800px below the body's top edge, less the 90px that centres it.
		expect(rolledScrollTop({ ...BODY, tileTop: 900 })).toBe(710);
	});

	it("stays put when the roll landed on a tile already centred", () => {
		expect(rolledScrollTop({ ...BODY, tileTop: 190 })).toBe(0);
	});

	it("stops at the top rather than asking for a negative offset", () => {
		// A tile in the first row can't be centred — there is nothing above it to scroll in.
		expect(rolledScrollTop({ ...BODY, tileTop: 100 })).toBe(0);
	});

	it("stops at the end of the grid rather than scrolling past it", () => {
		expect(rolledScrollTop({ ...BODY, scrollTop: 1500, tileTop: 480 })).toBe(1600);
	});

	it("asks for no scroll at all when the grid is shorter than the view", () => {
		expect(rolledScrollTop({ ...BODY, tileTop: 300, scrollHeight: 300 })).toBe(0);
	});
});
