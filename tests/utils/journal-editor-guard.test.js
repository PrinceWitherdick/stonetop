import { describe, it, expect } from "vitest";
import { isInJournalEditor, JOURNAL_EDITOR_SELECTOR } from "../../module/utils/journal-editor-guard.js";

// The guard decides whether a candidate line/li/table/card sits inside a LIVE journal
// editor (a ProseMirror surface) — where our render-time enhancers must NOT decorate, or
// their marks bake into the saved source and mangle it. The test env is node with no DOM,
// so build a faithful mini-tree whose `closest` matches the small grammar the guard uses
// (comma-separated tag / `.class` / `[attr="v"]` simple selectors). This pins the selector
// against the real editor element SHAPES (a `<prose-mirror>` element, a mounted
// `.ProseMirror` / `[contenteditable="true"]` div, a v11–12 `.editor` wrapper) versus the
// read-view wrappers treasures/checkboxes actually render in.

class El {
	constructor(tag, { classes = [], attrs = {} } = {}) {
		this.nodeType = 1;
		this.tagName = tag.toUpperCase();
		this.classList = { _s: new Set(classes), contains(c) { return this._s.has(c); } };
		this.attrs = attrs;
		this.parentElement = null;
	}
	append(child) { child.parentElement = this; return child; }
	// Minimal, faithful matcher for the simple selectors the guard's grammar uses.
	_matches(sel) {
		sel = sel.trim();
		if (sel.startsWith(".")) return this.classList.contains(sel.slice(1));
		const attr = sel.match(/^\[([^=\]]+)="([^"]*)"\]$/);
		if (attr) return this.attrs[attr[1]] === attr[2];
		return this.tagName === sel.toUpperCase();
	}
	closest(selector) {
		const parts = selector.split(",").map(s => s.trim());
		for (let el = this; el; el = el.parentElement) {
			if (parts.some(p => el._matches(p))) return el;
		}
		return null;
	}
}

/** Build a chain root→…→leaf and return the leaf, wiring parentElement upward. */
function chain(...els) {
	for (let i = 1; i < els.length; i++) els[i - 1].append(els[i]);
	return els[els.length - 1];
}

describe("isInJournalEditor", () => {
	it("is true for a line inside the v13+ <prose-mirror> custom element", () => {
		const line = chain(new El("prose-mirror", { classes: ["stonetop-entry-rich-editor"] }), new El("p"));
		expect(isInJournalEditor(line)).toBe(true);
	});

	it("is true inside a mounted ProseMirror editable div", () => {
		const line = chain(new El("div", { classes: ["ProseMirror"], attrs: { contenteditable: "true" } }), new El("li"));
		expect(isInJournalEditor(line)).toBe(true);
	});

	it("is true inside a v11–12 .editor / .editor-content wrapper", () => {
		const line = chain(new El("div", { classes: ["editor"] }), new El("div", { classes: ["editor-content"] }), new El("p"));
		expect(isInJournalEditor(line)).toBe(true);
	});

	it("is true when the element itself is the contenteditable surface", () => {
		expect(isInJournalEditor(new El("div", { attrs: { contenteditable: "true" } }))).toBe(true);
	});

	it("is false in the read view (the location section body treasures render in)", () => {
		const line = chain(
			new El("div", { classes: ["journal-page-content"] }),
			new El("div", { classes: ["stonetop-monster-readonly-text", "stonetop-monster-rich-text"] }),
			new El("p"),
		);
		expect(isInJournalEditor(line)).toBe(false);
	});

	it("is false for a plain prose journal read view", () => {
		const line = chain(new El("div", { classes: ["journal-page-content"] }), new El("li"));
		expect(isInJournalEditor(line)).toBe(false);
	});

	it("resolves a text node via its parent element", () => {
		const p = chain(new El("prose-mirror"), new El("p"));
		const textNode = { nodeType: 3, parentElement: p };
		expect(isInJournalEditor(textNode)).toBe(true);
	});

	it("is false / safe for null-ish input", () => {
		expect(isInJournalEditor(null)).toBe(false);
		expect(isInJournalEditor(undefined)).toBe(false);
	});

	it("keeps the editor shapes covered in the shared selector", () => {
		// Guards against a silent selector edit dropping one of the surfaces above.
		for (const token of ['.editor', '.editor-content', 'prose-mirror', '.ProseMirror', '[contenteditable="true"]']) {
			expect(JOURNAL_EDITOR_SELECTOR).toContain(token);
		}
	});
});
