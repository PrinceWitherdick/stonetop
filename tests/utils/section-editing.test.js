import { describe, it, expect } from "vitest";
import { withSectionEditing } from "../../module/utils/section-editing.js";

// The pencil's state change lives in openSectionEdit / closeSectionEdit, so a sheet opening a
// pencil from code (the character sheet's "needs your input" hand, a move that frees a
// companion trait) goes through exactly what a click on the pencil does — the hook included.
class Base {
	_editMode = false;
	renders = 0;
	render() { this.renders++; }
}

class Sheet extends withSectionEditing(Base) {
	hooks = [];
	_onSectionEditOpened(section) { this.hooks.push(["opened", section]); }
	_onSectionEditClosed(section) { this.hooks.push(["closed", section]); }
}

describe("openSectionEdit / closeSectionEdit", () => {
	it("opens a pencil, runs the hook and repaints", () => {
		const sheet = new Sheet();
		expect(sheet.openSectionEdit("moves")).toBe(true);
		expect(sheet.isSectionEditable("moves")).toBe(true);
		expect(sheet.hooks).toEqual([["opened", "moves"]]);
		expect(sheet.renders).toBe(1);
	});

	it("does nothing for a pencil already open — no second hook, no repaint", () => {
		const sheet = new Sheet();
		sheet.openSectionEdit("moves");
		expect(sheet.openSectionEdit("moves")).toBe(false);
		expect(sheet.hooks).toHaveLength(1);
		expect(sheet.renders).toBe(1);
	});

	it("leaves the repaint to the caller on `render: false`", () => {
		const sheet = new Sheet();
		sheet.openSectionEdit("moves", { render: false });
		expect(sheet.isSectionEditable("moves")).toBe(true);
		expect(sheet.renders).toBe(0);
	});

	it("closes a pencil, runs the hook and repaints; a closed one is a no-op", () => {
		const sheet = new Sheet();
		expect(sheet.closeSectionEdit("moves")).toBe(false);
		expect(sheet.renders).toBe(0);
		sheet.openSectionEdit("moves", { render: false });
		expect(sheet.closeSectionEdit("moves")).toBe(true);
		expect(sheet.isSectionEditable("moves")).toBe(false);
		expect(sheet.hooks).toEqual([["opened", "moves"], ["closed", "moves"]]);
		expect(sheet.renders).toBe(1);
	});
});

describe("_wireSectionEditToggle", () => {
	const wire = () => {
		const sheet = new Sheet();
		let handler;
		const root = { addEventListener: (type, fn, capture) => { if (type === "click" && capture) handler = fn; } };
		sheet._wireSectionEditToggle([root], ".pencil");
		const toggle = { dataset: { section: "moves" } };
		const click = (target = toggle) => {
			const ev = { target: { closest: sel => (sel === ".pencil" ? target : null) }, stopPropagation() { this.stopped = true; } };
			handler(ev);
			return ev;
		};
		return { sheet, click };
	};

	it("flips the pencil with one repaint per click", () => {
		const { sheet, click } = wire();
		expect(click().stopped).toBe(true);
		expect(sheet.isSectionEditable("moves")).toBe(true);
		click();
		expect(sheet.isSectionEditable("moves")).toBe(false);
		expect(sheet.hooks).toEqual([["opened", "moves"], ["closed", "moves"]]);
		expect(sheet.renders).toBe(2);
	});

	it("ignores clicks that aren't on a pencil", () => {
		const { sheet, click } = wire();
		click(null);
		expect(sheet.renders).toBe(0);
		expect(sheet.hooks).toHaveLength(0);
	});
});
