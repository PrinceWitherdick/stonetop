import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addOpenMapButton } from "../../module/hooks/journal-directory-maps.js";
import { matchesSelector, walk } from "../fakes/dom.js";

// The one way into the map from the Journal sidebar, since its own rows are taken out of it. The
// test env is node, so the directory header is a small tree of stand-in elements.

class El {
	constructor(tag, className = "") {
		this.tagName = tag.toUpperCase();
		this.className = className;
		this.children = [];
		this.parent = null;
		this.dataset = {};
		this.attributes = {};
		this.listeners = {};
		this.textContent = "";
	}

	get classes() { return this.className.split(/\s+/).filter(Boolean); }

	append(...kids) {
		for (const kid of kids) {
			kid.parent = this;
			this.children.push(kid);
		}
	}

	prepend(...kids) {
		for (const kid of [...kids].reverse()) {
			kid.parent = this;
			this.children.unshift(kid);
		}
	}

	after(node) {
		const siblings = this.parent.children;
		siblings.splice(siblings.indexOf(this) + 1, 0, node);
		node.parent = this.parent;
	}

	setAttribute(name, value) { this.attributes[name] = value; }

	addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }

	matches(selector) { return matchesSelector(this, selector); }

	querySelector(selector) { return walk(this.children, selector)[0] ?? null; }
}

/** A rendered Journal directory's header, drawn the way core draws it: create buttons, then search. */
function journalDirectory({ withActions = true } = {}) {
	const root = new El("section");
	const header = new El("header", "directory-header");
	root.append(header);
	const actions = withActions ? new El("div", "header-actions action-buttons flexrow") : null;
	if (actions) header.append(actions);
	const search = new El("div", "header-search flexrow");
	header.append(search);
	const app = { collection: { documentName: "JournalEntry", get: () => null } };
	return { app, root, header, actions, search };
}

/** Every "Relationship Map" button under an element. */
function buttonsIn(el) {
	const found = [];
	const walk = node => {
		for (const kid of node.children) {
			if (kid.dataset.relmapOpenMap !== undefined) found.push(kid);
			walk(kid);
		}
	};
	walk(el);
	return found;
}

const SAVED_DOCUMENT = globalThis.document;

beforeEach(() => {
	globalThis.document = { createElement: tag => new El(tag) };
});

afterEach(() => {
	if (SAVED_DOCUMENT === undefined) delete globalThis.document;
	else globalThis.document = SAVED_DOCUMENT;
});

describe("addOpenMapButton", () => {
	it("puts a row of its own straight under core's create buttons", () => {
		const { app, root, header, actions, search } = journalDirectory();
		addOpenMapButton(app, root, () => {});
		const row = header.children[1];
		expect(header.children).toEqual([actions, row, search]);
		expect(row.classes).toContain("stonetop-relmap-directory-actions");
		const [button] = buttonsIn(row);
		expect(button.tagName).toBe("BUTTON");
		expect(button.type).toBe("button");
		expect(button.children.map(kid => kid.textContent).join("")).toBe("Relationship Map");
	});

	// The words are the button's name; the glyph beside them is decoration.
	it("draws its icon inert", () => {
		const { app, root } = journalDirectory();
		addOpenMapButton(app, root, () => {});
		const [button] = buttonsIn(root);
		const icon = button.children.find(kid => kid.tagName === "I");
		expect(icon.className).toContain("fa-diagram-project");
		expect(icon.attributes).toHaveProperty("inert");
	});

	it("opens the map on a press, and keeps the press from doing anything else", () => {
		const { app, root } = journalDirectory();
		const onOpen = vi.fn();
		addOpenMapButton(app, root, onOpen);
		const [button] = buttonsIn(root);
		const ev = { preventDefault: vi.fn() };
		for (const fn of button.listeners.click) fn(ev);
		expect(onOpen).toHaveBeenCalledTimes(1);
		expect(ev.preventDefault).toHaveBeenCalled();
	});

	// The hook fires on every render, and a directory renders again on any change to any entry.
	it("never adds a second button to a header that already has one", () => {
		const { app, root } = journalDirectory();
		addOpenMapButton(app, root, () => {});
		addOpenMapButton(app, root, () => {});
		expect(buttonsIn(root)).toHaveLength(1);
	});

	it("goes at the top of a header that has no create buttons", () => {
		const { app, root, header } = journalDirectory({ withActions: false });
		addOpenMapButton(app, root, () => {});
		expect(buttonsIn(header.children[0])).toHaveLength(1);
	});

	it("finds the header inside a jQuery-wrapped element", () => {
		const { app, root } = journalDirectory();
		addOpenMapButton(app, { jquery: "3.7.1", 0: root }, () => {});
		expect(buttonsIn(root)).toHaveLength(1);
	});

	it("adds nothing to any other sidebar tab, or to a compendium's journal", () => {
		const actors = journalDirectory();
		actors.app.collection.documentName = "Actor";
		addOpenMapButton(actors.app, actors.root, () => {});
		expect(buttonsIn(actors.root)).toHaveLength(0);

		const pack = journalDirectory();
		pack.app.collection.index = new Map();
		addOpenMapButton(pack.app, pack.root, () => {});
		expect(buttonsIn(pack.root)).toHaveLength(0);
	});

	it("does nothing, and does not throw, without a header to put it in", () => {
		const { app } = journalDirectory();
		expect(() => addOpenMapButton(app, new El("section"), () => {})).not.toThrow();
		expect(() => addOpenMapButton(app, null, () => {})).not.toThrow();
	});
});
