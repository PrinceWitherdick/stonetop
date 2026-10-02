import { afterEach, describe, expect, it, vi } from "vitest";

// Passed straight through to the opener, so what is asserted is the window the reopen mints.
vi.mock("../../module/utils/open-or-focus.js", () => ({ openOrFocus: vi.fn((_id, open) => open()) }));

import { readRepo } from "../fakes/css.js";
import {
	TIMELINE_WINDOW_ID, TimelineWindow, reopenTimelineWindow,
} from "../../module/dialogs/TimelineWindow.js";
import { openOrFocus } from "../../module/utils/open-or-focus.js";

/**
 * The aggregate timeline left open when Foundry reloads comes back with the sheets
 * (utils/window-restore.js), where it was left.
 */

afterEach(() => openOrFocus.mockClear());

function fakeScroll({ gutterX = 0, gutterY = 0, left = 0, top = 0 } = {}) {
	const vars = { "--drag-scroll-gutter-x": `${gutterX}px`, "--drag-scroll-gutter-y": `${gutterY}px` };
	return { scrollLeft: left, scrollTop: top, style: { getPropertyValue: (name) => vars[name] ?? "" } };
}

function fakeRoot(scroll) {
	return { querySelector: (sel) => (sel === ".stonetop-timeline-scroll" ? scroll : null) };
}

describe("the timeline window across a reload", () => {
	it("saves the aggregate under a key of its own kind", () => {
		expect(new TimelineWindow().restoreKey).toBe("timeline:all");
	});

	// A single thread is a sheet's tab, which comes back with its sheet.
	it("saves no single-track window", () => {
		expect(new TimelineWindow({ trackId: "pc-ellis", trackKind: "character", name: "Ellis" }).restoreKey).toBeNull();
	});

	it("reopens the aggregate unrendered, through openOrFocus on the window's own id", () => {
		const app = reopenTimelineWindow("timeline:all");
		expect(app).toBeInstanceOf(TimelineWindow);
		expect(app.isSingleTrack).toBe(false);
		expect(app.rendered).toBeFalsy();
		expect(openOrFocus).toHaveBeenCalledWith(TIMELINE_WINDOW_ID, expect.any(Function));
	});

	it("reopens nothing from any other key", () => {
		expect(reopenTimelineWindow("timeline:pc-ellis")).toBeNull();
		expect(reopenTimelineWindow("camp:all")).toBeNull();
		expect(openOrFocus).not.toHaveBeenCalled();
	});

	// Where the reader had dragged and zoomed to, counted from the timeline's own corner past the
	// drag gutter: the gutter is a share of the box, and the box may come back another size.
	it("saves its zoom and how far it was dragged, past the gutter", () => {
		const app = new TimelineWindow();
		app._zoom = 1.5;
		app.element = [fakeRoot(fakeScroll({ gutterX: 200, gutterY: 100, left: 650, top: 130 }))];
		expect(app.restoreView).toEqual({ zoom: 1.5, left: 450, top: 30 });
	});

	// A minimized window's column is hidden and reads 0 down and across: less the gutter, the corner.
	it("saves where it was when it went down, not what a minimized column reads", async () => {
		const base = Object.getPrototypeOf(TimelineWindow.prototype);
		base.minimize = async function () { this._minimized = true; };
		base.maximize = async function () { this._minimized = false; };
		try {
			const app = new TimelineWindow();
			const scroll = fakeScroll({ gutterX: 200, gutterY: 100, left: 650, top: 130 });
			app.element = [fakeRoot(scroll)];
			await app.minimize();
			scroll.scrollLeft = 0;
			scroll.scrollTop = 0;
			expect(app.restoreView).toEqual({ zoom: 1, left: 450, top: 30 });
			await app.maximize();
			expect(app.restoreView).toEqual({ zoom: 1, left: -200, top: -100 });
		} finally {
			delete base.minimize;
			delete base.maximize;
		}
	});

	it("saves no view before it is drawn", () => {
		expect(new TimelineWindow().restoreView).toBeNull();
	});

	it("reopens at the saved zoom and place, against the gutter it is drawn with now", async () => {
		const app = new TimelineWindow();
		const scroll = fakeScroll({ gutterX: 150, gutterY: 80 });
		let zoomWhenDrawn = null;
		const drawn = vi.spyOn(Object.getPrototypeOf(TimelineWindow.prototype), "_render")
			.mockImplementation(async function () { zoomWhenDrawn = this._zoom; this.element = [fakeRoot(scroll)]; });
		try {
			await app._render(true, { left: 10, top: 20, view: { zoom: 9, left: 450, top: 30 } });
		} finally { drawn.mockRestore(); }
		// Clamped to the wheel's range, and on BEFORE the draw so the wiring paints it.
		expect(zoomWhenDrawn).toBe(4);
		expect(scroll.scrollLeft).toBe(600);
		expect(scroll.scrollTop).toBe(110);
	});

	it("is registered with window restore when the system loads", () => {
		expect(readRepo("stonetop.js")).toMatch(/^registerTimelineWindowRestore\(\);$/m);
	});
});
