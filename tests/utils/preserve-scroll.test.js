import { describe, it, expect } from "vitest";
import { preserveScroll } from "../../module/utils/scroll-parent.js";

// The NPC sheet is auto-height, so every note it opens and every tab it switches re-measures
// through `setPosition({height: "auto"})` — and that measure clears the frame's inline height,
// which leaves the active tab's `height: 100%` with nothing definite to resolve against. The
// tab briefly grows to its own content, stops overflowing, and the browser clamps its scrollTop
// to zero; the frame comes back the same size (a CSS max-height was capping it either way), so
// the only visible effect is the reader being thrown to the top of the relationships board.
//
// The suite has no jsdom, and jsdom would not lay anything out anyway, so the zeroing is modelled
// here rather than produced: these guard the save/restore contract. The layout half was verified
// in Chromium against the real sheet's height chain (2242 -> 0 without this, 2242 held with it).

/** A scrollport that behaves like the element the browser is about to zero. */
function port(scrollTop, { max = Infinity } = {}) {
	const writes = [];
	return {
		writes,
		get scrollTop() { return this._top; },
		// Browsers clamp a write to what the element can actually scroll, which is what keeps a
		// restore honest after the content SHRANK — collapsing a note is exactly that case.
		set scrollTop(v) { writes.push(v); this._top = Math.min(v, max); },
		_top: scrollTop,
	};
}

/** A duck-typed sheet root holding `children`, matching what `this.element[0]` offers. */
function root(children, scrollTop = 0) {
	const el = port(scrollTop);
	el.querySelectorAll = () => children;
	return el;
}

describe("preserveScroll", () => {
	it("hands a zeroed scrollport its position back", () => {
		const tab = port(2242);
		const el = root([tab]);

		preserveScroll(el, () => { tab.scrollTop = 0; });

		expect(tab.scrollTop).toBe(2242);
	});

	it("clamps the restore when the content shrank under it", () => {
		// Collapsing a card's note removes height the old offset depended on. Writing the stale
		// number back must not park the reader past the end of the board.
		const tab = port(2242, { max: 832 });
		const el = root([tab]);

		preserveScroll(el, () => { tab.scrollTop = 0; });

		expect(tab.scrollTop).toBe(832);
	});

	it("holds the root itself, not only its descendants", () => {
		// `.window-content` is a scrollport on this sheet, and on a short viewport it is the one
		// that scrolls — so a helper that only looked downward would miss the live case.
		const el = root([], 140);

		preserveScroll(el, () => { el.scrollTop = 0; });

		expect(el.scrollTop).toBe(140);
	});

	it("leaves an unscrolled element alone rather than writing zero over it", () => {
		const idle = port(0);
		preserveScroll(root([idle]), () => {});
		expect(idle.writes).toEqual([]);
	});

	it("restores even when the operation throws, and passes its result through otherwise", () => {
		const tab = port(500);
		const el = root([tab]);

		expect(() => preserveScroll(el, () => {
			tab.scrollTop = 0;
			throw new Error("setPosition blew up");
		})).toThrow("setPosition blew up");
		expect(tab.scrollTop).toBe(500);

		expect(preserveScroll(el, () => "position")).toBe("position");
	});

	it("is a no-op on a sheet that has not rendered yet", () => {
		expect(() => preserveScroll(null, () => {})).not.toThrow();
		expect(preserveScroll(undefined, () => 7)).toBe(7);
	});
});
