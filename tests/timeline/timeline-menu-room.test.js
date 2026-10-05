// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { readCss, declarations } from "../fakes/css.js";
import { MENU_ROOM_VAR, fitMenuToTimeline } from "../../module/timeline/timeline-menu-room.js";

// THE TOOLBAR'S DROPDOWNS FIT THE TIMELINE THEY HANG IN (user, 2026-10-05). A sheet's tab clipped the
// Colours menu's Save and Cancel off its foot; the pop-out could be dragged taller, the tab cannot.

const CSS = readCss();

/** A timeline with one menu in it, its geometry stubbed (happy-dom lays nothing out). */
function timeline({ open = true, timelineTop = 0, timelineHeight = 500, boxTop = 100, scale = 1 } = {}) {
	const root = document.createElement("div");
	root.className = "stonetop-timeline";
	root.innerHTML = `<details class="stonetop-timeline-colours-menu"${open ? " open" : ""}>
		<summary>Colours</summary><div class="stonetop-timeline-colours"></div></details>`;
	const rect = (top, height) => () => ({ top, bottom: top + height, height, left: 0, right: 0, width: 0 });
	root.getBoundingClientRect = rect(timelineTop, timelineHeight * scale);
	Object.defineProperty(root, "offsetHeight", { value: timelineHeight });
	const box = root.querySelector(".stonetop-timeline-colours");
	box.getBoundingClientRect = rect(boxTop, 900);
	document.body.append(root);
	return { menu: root.querySelector("details"), box };
}

describe("an open toolbar menu is told the room below it", () => {
	it("writes the room from its top to the timeline's foot, less a margin", () => {
		const { menu, box } = timeline({ timelineHeight: 500, boxTop: 100 });
		fitMenuToTimeline(menu);
		expect(box.style.getPropertyValue(MENU_ROOM_VAR)).toBe("392px");
	});

	it("measures in layout pixels in a window drawn at a UI scale", () => {
		const { menu, box } = timeline({ timelineHeight: 500, boxTop: 200, scale: 2 });
		fitMenuToTimeline(menu);
		// 1000 drawn pixels tall, the box 200 drawn pixels down: 800 drawn = 400 layout, less 8.
		expect(box.style.getPropertyValue(MENU_ROOM_VAR)).toBe("392px");
	});

	it("leaves a shut menu, and one on a tab that is not showing, alone", () => {
		const shut = timeline({ open: false });
		fitMenuToTimeline(shut.menu);
		expect(shut.box.style.getPropertyValue(MENU_ROOM_VAR)).toBe("");
		const hidden = timeline({ timelineHeight: 0 });
		fitMenuToTimeline(hidden.menu);
		expect(hidden.box.style.getPropertyValue(MENU_ROOM_VAR)).toBe("");
	});

	it("caps both menus at that room, and the Colours menu scrolls its rows, not its buttons", () => {
		expect(declarations(CSS, ".stonetop-timeline-show-menu")).toContain(`var(${MENU_ROOM_VAR}`);
		expect(declarations(CSS, ".stonetop-timeline-colours")).toContain(`var(${MENU_ROOM_VAR}`);
		expect(declarations(CSS, ".stonetop-timeline-show-menu")).toMatch(/overflow-y:\s*auto/);
		const list = declarations(CSS, ".stonetop-timeline-colours-list");
		expect(list).toMatch(/overflow-y:\s*auto/);
		expect(list).toMatch(/min-height:\s*0/);
		expect(declarations(CSS, ".stonetop-timeline-colours-actions")).toMatch(/flex:\s*none/);
	});
});
