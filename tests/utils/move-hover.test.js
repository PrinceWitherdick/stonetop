// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import {
	adoptHoverPanel, removeHoverPanels, wireBasicMoveHoverPanel,
} from "../../module/utils/move-hover.js";

// Hover panels are portaled to <body>, outside the sheet that raised them, so neither a
// re-render nor a close takes them down on its own. The sheet adopts each one and tears the
// lot down with one call — the character sheet's close once named only one of its two panels
// and leaked the other.

afterEach(() => { document.body.replaceChildren(); });

const panel = () => document.body.appendChild(document.createElement("div"));

describe("adoptHoverPanel / removeHoverPanels", () => {
	it("removes every panel the owner adopted, and only those", () => {
		const sheet = {}, other = {};
		const a = adoptHoverPanel(sheet, panel());
		const b = adoptHoverPanel(sheet, panel());
		const c = adoptHoverPanel(other, panel());
		removeHoverPanels(sheet);
		expect(a.isConnected).toBe(false);
		expect(b.isConnected).toBe(false);
		expect(c.isConnected).toBe(true);
	});

	it("forgets what it removed, so a later render's panels are the only ones tracked", () => {
		const sheet = {};
		adoptHoverPanel(sheet, panel());
		removeHoverPanels(sheet);
		const next = adoptHoverPanel(sheet, panel());
		removeHoverPanels(sheet);
		expect(next.isConnected).toBe(false);
		expect(document.body.children).toHaveLength(0);
	});

	it("is a no-op for an owner with nothing adopted", () => {
		expect(() => removeHoverPanels({})).not.toThrow();
		expect(() => removeHoverPanels(null)).not.toThrow();
	});
});

describe("wireBasicMoveHoverPanel", () => {
	const sheetRoot = () => {
		const root = document.createElement("div");
		root.innerHTML = `
			<li class="row">
				<span class="stonetop-move-name"> <b>Defy</b> Danger </span>
				<div class="stonetop-basic-move-desc"><p>Roll +STR.</p><details><summary>More</summary></details></div>
			</li>
			<li class="row"><span class="stonetop-move-name">No text</span></li>`;
		document.body.appendChild(root);
		return root;
	};

	it("shows the row's name and description on hover, and hides on leave", () => {
		const sheet = {};
		const root = sheetRoot();
		const p = wireBasicMoveHoverPanel(sheet, root, ".row");
		expect(p.className).toBe("stonetop-basic-move-panel");
		expect(p.parentElement).toBe(document.body);
		expect(p.hidden).toBe(true);

		const [row] = root.querySelectorAll(".row");
		row.dispatchEvent(new MouseEvent("mouseenter"));
		expect(p.hidden).toBe(false);
		const name = p.querySelector(".stonetop-basic-move-panel-name");
		// The name is text, never markup.
		expect(name.textContent).toBe("Defy Danger");
		expect(name.children).toHaveLength(0);
		expect(p.querySelector("p")?.textContent).toBe("Roll +STR.");
		// The shared hover pass ran: a collapsible this panel can't open is gone.
		expect(p.querySelector("details")).toBeNull();

		row.dispatchEvent(new MouseEvent("mouseleave"));
		expect(p.hidden).toBe(true);
	});

	it("ignores a row with no description", () => {
		const root = sheetRoot();
		const p = wireBasicMoveHoverPanel({}, root, ".row");
		root.querySelectorAll(".row")[1].dispatchEvent(new MouseEvent("mouseenter"));
		expect(p.hidden).toBe(true);
	});

	it("is adopted by its owner, so removeHoverPanels is its teardown", () => {
		const sheet = {};
		const p = wireBasicMoveHoverPanel(sheet, sheetRoot(), ".row");
		removeHoverPanels(sheet);
		expect(p.isConnected).toBe(false);
	});
});
