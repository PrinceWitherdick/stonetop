import { describe, it, expect, afterEach } from "vitest";
import { watchAnchor } from "../../module/utils/avatar-preview.js";

// The hover preview is portaled to <body>, so nothing in the sheet's own subtree owns its
// lifetime. `mouseleave` covers the pointer moving away; watchAnchor covers the thumbnail
// being REMOVED from under a pointer that never moved — closing a sheet with Escape, a
// re-render replacing the row, a tab switch, a section folding shut. Without it those leave
// the popup on <body> with nothing left to take it down.
//
// Driven through a hand-rolled requestAnimationFrame so each frame is stepped explicitly:
// the thing worth pinning down is WHEN the loop stops, which a real rAF would hide behind
// timing. Both nodes are plain objects — watchAnchor reads `isConnected` and calls `remove`,
// and nothing else.

/** A controllable requestAnimationFrame: `frame()` runs exactly one pending callback. */
function fakeRaf() {
	let pending = [];
	globalThis.requestAnimationFrame = cb => { pending.push(cb); return pending.length; };
	return {
		get scheduled() { return pending.length; },
		frame() {
			const due = pending;
			pending = [];
			due.forEach(cb => cb());
		},
	};
}

/** A stand-in node that starts in the document and remembers being removed. */
function node() {
	return {
		isConnected: true,
		removed: false,
		remove() { this.isConnected = false; this.removed = true; },
	};
}

afterEach(() => { delete globalThis.requestAnimationFrame; });

describe("watchAnchor", () => {
	it("leaves a preview alone while its thumbnail is still in the document", () => {
		const raf = fakeRaf();
		const popup = node();
		const anchor = node();

		watchAnchor(popup, anchor);
		raf.frame();
		raf.frame();
		raf.frame();

		expect(popup.removed).toBe(false);
		// Still watching: a hover that outlives three frames is the ordinary case.
		expect(raf.scheduled).toBe(1);
	});

	it("takes the preview down once the thumbnail leaves the document", () => {
		const raf = fakeRaf();
		const popup = node();
		const anchor = node();

		watchAnchor(popup, anchor);
		raf.frame();
		expect(popup.removed).toBe(false);

		// The sheet closes / re-renders under a pointer that never moved, so no mouseleave.
		anchor.isConnected = false;
		raf.frame();

		expect(popup.removed).toBe(true);
		// And it stops watching rather than spinning on a popup it has already removed.
		expect(raf.scheduled).toBe(0);
	});

	it("stops watching when the preview was taken down some other way", () => {
		const raf = fakeRaf();
		const popup = node();
		const anchor = node();

		watchAnchor(popup, anchor);
		// mouseleave, or the next hover's removeAvatarPreview, got there first.
		popup.isConnected = false;
		raf.frame();

		expect(raf.scheduled).toBe(0);
	});

	it("does not remove a popup that outlives an anchor it never shared a fate with", () => {
		const raf = fakeRaf();
		const popup = node();
		const anchor = node();

		watchAnchor(popup, anchor);
		// Both gone: the popup is already down, so there is nothing to remove and no
		// second remove() call to make.
		popup.isConnected = false;
		anchor.isConnected = false;
		raf.frame();

		expect(popup.removed).toBe(false);
		expect(raf.scheduled).toBe(0);
	});

	it("is a no-op where there is no requestAnimationFrame to schedule against", () => {
		delete globalThis.requestAnimationFrame;
		const popup = node();
		const anchor = node();

		expect(() => watchAnchor(popup, anchor)).not.toThrow();
		expect(popup.removed).toBe(false);
	});
});
