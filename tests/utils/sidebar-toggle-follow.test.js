import { describe, it, expect } from "vitest";
import { handleOffset } from "../../module/utils/sidebar-toggle-follow.js";

// A sheet scrolled to the top: the sidebar starts 200px down the window (portrait header
// + tab strip above it), runs 900px tall, and the scroll container's top edge is at 100.
const AT_REST = { sidebarTop: 200, sidebarHeight: 900, scrollerTop: 100, handleHeight: 26 };

describe("handleOffset", () => {
	it("rests at the sidebar's top edge while the sidebar starts below the fold", () => {
		expect(handleOffset(AT_REST)).toBe(0);
	});

	it("stays at 0 the instant the sidebar's top meets the scroll container's", () => {
		expect(handleOffset({ ...AT_REST, sidebarTop: 100 })).toBe(0);
	});

	it("slides down by exactly what has been scrolled past", () => {
		// Scrolled 250px further: the sidebar's top is now 150px above the visible area.
		expect(handleOffset({ ...AT_REST, sidebarTop: -50 })).toBe(150);
	});

	it("stops at the sidebar's bottom edge instead of floating off the end", () => {
		// Scrolled far enough that the whole sidebar is above the fold.
		expect(handleOffset({ ...AT_REST, sidebarTop: -2000 })).toBe(900 - 26);
	});

	it("never returns a negative offset when the sidebar is shorter than the handle", () => {
		expect(handleOffset({ sidebarTop: -500, sidebarHeight: 10, scrollerTop: 0, handleHeight: 26 }))
			.toBe(0);
	});
});
