// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";

// THE FILTER MENU SHUTS ON A PRESS OUTSIDE IT, as any dropdown does, and stays open for a press
// inside it (each tick in it re-renders the window, so shutting on those would undo the point).

const { TimelineWindow } = await import("../../module/dialogs/TimelineWindow.js");

let menu, inside, outside, app;
beforeEach(() => {
	document.body.innerHTML = `
		<details class="stonetop-timeline-show" open>
			<summary>Filter</summary>
			<div class="stonetop-timeline-show-menu"><input type="checkbox" class="inside"></div>
		</details>
		<div class="outside"></div>`;
	menu = document.querySelector(".stonetop-timeline-show");
	inside = document.querySelector(".inside");
	outside = document.querySelector(".outside");
	app = new TimelineWindow();
	app._wireMenuDismiss(menu);
});
afterEach(() => {
	app._unwireShowMenuDismiss?.();
	document.body.innerHTML = "";
});

const press = (el) => el.dispatchEvent(new Event("pointerdown", { bubbles: true }));

describe("the Filter menu's outside-press dismiss", () => {
	it("shuts the open menu when the press lands outside it", () => {
		press(outside);
		expect(menu.open).toBe(false);
	});

	it("leaves it open for a press inside it", () => {
		press(inside);
		expect(menu.open).toBe(true);
	});

	it("takes itself off once a repaint has replaced the menu", () => {
		menu.remove();
		press(outside);
		expect(app._unwireShowMenuDismiss).toBeNull();
	});

	it("wires only the newest menu after a repaint", () => {
		const fresh = menu.cloneNode(true);
		document.body.append(fresh);
		app._wireMenuDismiss(fresh);
		menu.open = true;
		press(outside);
		expect(fresh.open).toBe(false);
		expect(menu.open, "the old menu's listener should be gone").toBe(true);
	});
});
