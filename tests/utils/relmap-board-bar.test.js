import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RelmapBoardBar } from "../../module/utils/relmap-board-bar.js";
import { boardEl } from "../fakes/pointer-board.js";

// WHAT BOTH BARS OVER A RELATIONSHIP MAP INHERIT: the arrow-key walk along a row of presses, the
// field held back a breath before it is written, the seat over a point of a board that pans, and
// the listeners given back on the way out. The tie bar's and the group bar's own suites cover each
// bar through these; this one drives them on a bar that is nothing else, so a fault here is the
// base's and not a bar's.

const HELD_MS = 100;

/** The smallest bar there is: one field, one row of presses, nothing of its own to say. */
class PlainBar extends RelmapBoardBar {
	constructor(root, handlers) {
		super(root, {
			bar: ".plain-bar",
			press: "plain-bar",
			writing: { field: "name", key: "title" },
			held: { name: { ms: HELD_MS, flush: bar => bar.flush() } },
			spacing: { gap: 10, edge: 5, drop: 20 },
		}, handlers);
		this.letGo = vi.fn();
		this._wire();
		this._on(this._field, "input", () => this._defer("name"));
	}

	_letGo() { this.letGo(); }

	_key(ev) {
		// A stride read off the button, so one test can ask for a grid.
		this._rove(ev, ["ink"], button => Number(button.dataset.across ?? 1));
	}

	open(id, at = { left: 50, top: 50 }) {
		this.id = id;
		this._at = at;
		this._box = null;
		this._saved = this._field?.value ?? "";
		this.el.hidden = false;
		this.place();
		return true;
	}
}

function setUp({ inks = 3, across } = {}) {
	const root = boardEl();
	const view = boardEl({ cls: ["stonetop-relmap-view"], parent: root });
	const bar = boardEl({ cls: ["plain-bar"], parent: view });
	bar.hidden = true;
	bar.rect = { left: 0, top: 0, width: 100, height: 30 };
	const name = boardEl({ dataset: { plainBar: "name" }, parent: bar });
	name.value = "Old";
	const row = [];
	for (let i = 0; i < inks; i++) {
		const one = boardEl({ dataset: { plainBar: "ink", ...(across ? { across: String(across) } : {}) }, parent: bar });
		one.focus = () => { one.focused = true; };
		row.push(one);
	}
	const surface = { painted: () => ({ width: 1000, height: 800 }), offset: { x: 0, y: 0 }, viewSize: { width: 1000, height: 800 } };
	const handlers = {
		surface: () => surface,
		onField: vi.fn(() => Promise.resolve(true)),
		onPicked: vi.fn(),
	};
	return { dom: { root, view, bar, name, row }, surface, handlers, bar: new PlainBar(root, handlers) };
}

const key = (target, k) => {
	const ev = {
		key: k, target, defaultPrevented: false, propagationStopped: false,
		preventDefault() { ev.defaultPrevented = true; }, stopPropagation() { ev.propagationStopped = true; },
	};
	return ev;
};
const press = (dom, target, k) => {
	const ev = key(target, k);
	dom.bar.handlers.keydown.forEach(fn => fn(ev));
	return ev;
};

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("the arrow keys along a row of presses", () => {
	it("moves the focus and the tab stop, wrapping at either end, without choosing", () => {
		const { dom, bar } = setUp();
		bar.open("a");
		const [first, second, third] = dom.row;
		const ev = press(dom, first, "ArrowLeft");
		expect(third.focused).toBe(true);
		expect(third.attrs.tabindex).toBe("0");
		expect(first.attrs.tabindex).toBe("-1");
		expect(ev.defaultPrevented).toBe(true);
		expect(ev.propagationStopped).toBe(true);
		press(dom, third, "ArrowRight");
		expect(first.focused).toBe(true);
		expect(second.focused).toBeUndefined();
	});

	// A hidden slot is not in the row: the focus landing on it would look like the keys had died.
	it("steps over a hidden press", () => {
		const { dom, bar } = setUp();
		bar.open("a");
		dom.row[1].hidden = true;
		press(dom, dom.row[0], "ArrowRight");
		expect(dom.row[1].focused).toBeUndefined();
		expect(dom.row[2].focused).toBe(true);
	});

	it("steps Up and Down by the stride the bar asks for, and Left and Right by one", () => {
		const { dom, bar } = setUp({ inks: 6, across: 3 });
		bar.open("a");
		press(dom, dom.row[1], "ArrowDown");
		expect(dom.row[4].focused).toBe(true);
		press(dom, dom.row[4], "ArrowRight");
		expect(dom.row[5].focused).toBe(true);
	});

	// ⚠ OFF A ROW AN ARROW IS STILL NOT THE SCENE'S, and it is still the field's: stopped, so core
	// cannot pan the canvas with it, and NOT prevented, so the caret still moves.
	it("keeps an arrow in the field from the scene and leaves the caret to move", () => {
		const { dom, bar } = setUp();
		bar.open("a");
		const ev = press(dom, dom.name, "ArrowLeft");
		expect(ev.propagationStopped).toBe(true);
		expect(ev.defaultPrevented).toBe(false);
	});
});

describe("the field, held back before it is written", () => {
	it("is written once the typing stops, and counts as writing until then", () => {
		const { dom, bar, handlers } = setUp();
		bar.open("a");
		dom.name.value = "New";
		dom.name.handlers.input.forEach(fn => fn({}));
		expect(bar.isWriting()).toBe(true);
		vi.advanceTimersByTime(HELD_MS - 1);
		expect(handlers.onField).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(handlers.onField).toHaveBeenCalledWith("a", { title: "New" });
		expect(bar.isWriting()).toBe(false);
	});

	it("writes nothing the document already has", () => {
		const { bar, handlers } = setUp();
		bar.open("a");
		expect(bar.flush()).toBeUndefined();
		expect(handlers.onField).not.toHaveBeenCalled();
	});

	// The field goes back as well as the timer: a field left holding the newer words would be a
	// write waiting for the next blur.
	it("is put back and disarmed by a discard, which still lets go", () => {
		const { dom, bar, handlers } = setUp();
		bar.open("a");
		dom.name.value = "New";
		dom.name.handlers.input.forEach(fn => fn({}));
		bar.discard();
		expect(dom.name.value).toBe("Old");
		expect(dom.bar.hidden).toBe(true);
		vi.advanceTimersByTime(HELD_MS * 2);
		expect(handlers.onField).not.toHaveBeenCalled();
	});

	it("is written by a close, before the bar's own letting go and the mark coming off", () => {
		const { dom, bar, handlers } = setUp();
		bar.open("a");
		dom.name.value = "New";
		bar.close();
		expect(handlers.onField).toHaveBeenCalledWith("a", { title: "New" });
		expect(bar.letGo).toHaveBeenCalledTimes(1);
		expect(handlers.onPicked).toHaveBeenLastCalledWith("");
		expect(bar.id).toBe("");
	});
});

describe("the seat over a point", () => {
	it("sits centred above the point where there is room", () => {
		const { dom, bar } = setUp();
		bar.open("a");
		// The point is 500, 400: centred is 450 across, and above is 400 - 30 - 10.
		expect(dom.bar.style.left).toBe("450px");
		expect(dom.bar.style.top).toBe("360px");
	});

	it("drops under the point near the top, and keeps inside the viewport at the side", () => {
		const { dom, bar } = setUp();
		bar.open("a", { left: 0, top: 1 });
		// The point is 0, 8: no room above, so under it by the drop, and pulled in to the edge.
		expect(dom.bar.style.left).toBe("5px");
		expect(dom.bar.style.top).toBe("28px");
	});

	// ⚠ ONCE PER OPENING, because `place` runs on every painted frame of a pan.
	it("measures itself once per opening and not on every frame", () => {
		const { dom, bar, surface } = setUp();
		const measure = vi.spyOn(dom.bar, "getBoundingClientRect");
		bar.open("a");
		surface.offset = { x: 40, y: 0 };
		bar.place();
		bar.place();
		expect(measure).toHaveBeenCalledTimes(1);
		expect(dom.bar.style.left).toBe("490px");
		bar.open("b");
		expect(measure).toHaveBeenCalledTimes(2);
	});
});

describe("the way out", () => {
	it("gives back every listener and drops every held write", () => {
		const { dom, bar, handlers } = setUp();
		bar.open("a");
		dom.name.value = "New";
		dom.name.handlers.input.forEach(fn => fn({}));
		bar.destroy();
		expect(dom.bar.handlers.keydown).toEqual([]);
		expect(dom.name.handlers.input).toEqual([]);
		vi.advanceTimersByTime(HELD_MS * 2);
		expect(handlers.onField).not.toHaveBeenCalled();
		expect(bar.el).toBeNull();
		expect(dom.bar.hidden).toBe(true);
	});
});
