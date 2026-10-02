import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RelmapGroupBar } from "../../module/utils/relmap-group-bar.js";
import { TIE_WRITE_DELAY_MS } from "../../module/utils/relmap-tie-bar.js";
import { boardEl } from "../fakes/pointer-board.js";

// THE BAR A NAMED GROUP RAISES: its name typed in place, its colour and shape, the two buttons that
// move the selected people in or out, and the button that rubs it out. The window's half is
// relationship-map-window.test.js's.

/** The bar's markup, as the window template prints it. */
function barDom() {
	const root = boardEl();
	const view = boardEl({ cls: ["stonetop-relmap-view"], parent: root });
	const bar = boardEl({ cls: ["stonetop-relmap-groupbar"], parent: view });
	bar.hidden = true;
	const name = boardEl({ dataset: { relmapGbar: "name" }, parent: bar });
	name.value = "";
	name.focus = vi.fn(() => { name.focused = true; });
	name.setSelectionRange = vi.fn();
	const inks = {};
	for (const key of ["rose", "green", "slate"]) {
		inks[key] = boardEl({ dataset: { relmapGbar: "ink", relmapGbarValue: key }, parent: bar });
		inks[key].focus = () => { inks[key].focused = true; };
	}
	const shapes = {};
	for (const key of ["box", "oval"]) {
		shapes[key] = boardEl({ dataset: { relmapGbar: "shape", relmapGbarValue: key }, parent: bar });
	}
	const add = boardEl({ dataset: { relmapGbar: "add", relmapSaid: "Put the {count} selected in" }, parent: bar });
	const take = boardEl({ dataset: { relmapGbar: "take", relmapSaid: "Take the {count} selected out" }, parent: bar });
	const drop = boardEl({ dataset: { relmapGbar: "drop" }, parent: bar });
	return { root, view, bar, name, inks, shapes, add, take, drop };
}

const HUNTERS = { name: "The hunters", shape: "box", ink: "green", members: { n1: true, n2: true } };

function setUp({ group = HUNTERS, selected = [], canEdit = () => true } = {}) {
	const dom = barDom();
	const state = { group, selected };
	const handlers = {
		surface: () => ({
			painted: () => ({ width: 1000, height: 800 }), offset: { x: 0, y: 0 }, viewSize: { width: 1000, height: 800 },
		}),
		groupAt: vi.fn(id => (id === "g1" && state.group
			? { group: state.group, members: Object.keys(state.group.members), at: { left: 50, top: 50 } }
			: null)),
		onField: vi.fn(() => Promise.resolve(true)),
		onMembers: vi.fn(),
		onDrop: vi.fn(),
		onPicked: vi.fn(),
		selected: () => state.selected,
		canEdit,
	};
	const bar = new RelmapGroupBar(dom.root, handlers);
	return { dom, state, handlers, bar };
}

const press = button => button.handlers.click?.forEach(fn => fn({ preventDefault() {}, stopPropagation() {} }));
const key = (target, k) => {
	const ev = {
		key: k, target, defaultPrevented: false, propagationStopped: false,
		preventDefault() { ev.defaultPrevented = true; }, stopPropagation() { ev.propagationStopped = true; },
	};
	return ev;
};

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("opening the bar on a group", () => {
	it("shows the group as it is, and marks its outline", () => {
		const { dom, bar, handlers } = setUp();
		expect(bar.open("g1")).toBe(true);
		expect(dom.bar.hidden).toBe(false);
		expect(dom.name.value).toBe("The hunters");
		expect(dom.inks.green.attrs["aria-checked"]).toBe("true");
		expect(dom.inks.rose.attrs["aria-checked"]).toBe("false");
		expect(dom.shapes.box.attrs["aria-checked"]).toBe("true");
		expect(handlers.onPicked).toHaveBeenLastCalledWith("g1");
		// A click on a group does not pull the focus off the board; only asking for it does.
		expect(dom.name.focus).not.toHaveBeenCalled();
		bar.close();
		bar.open("g1", { focusName: true });
		expect(dom.name.focus).toHaveBeenCalled();
	});

	it("refuses a group that is not on the board", () => {
		const { bar } = setUp();
		expect(bar.open("nope")).toBe(false);
	});
});

describe("the name", () => {
	it("is written once the typing stops, as one write", () => {
		const { dom, bar, handlers } = setUp();
		bar.open("g1");
		dom.name.value = "The trappers";
		dom.name.handlers.input.forEach(fn => fn({}));
		expect(bar.isWriting()).toBe(true);
		expect(handlers.onField).not.toHaveBeenCalled();
		vi.advanceTimersByTime(TIE_WRITE_DELAY_MS);
		expect(handlers.onField).toHaveBeenCalledWith("g1", { name: "The trappers" });
		expect(bar.isWriting()).toBe(false);
	});

	it("is written at once when the bar is let go", () => {
		const { dom, bar, handlers } = setUp();
		bar.open("g1");
		dom.name.value = "Elders";
		dom.name.handlers.input.forEach(fn => fn({}));
		bar.close();
		expect(handlers.onField).toHaveBeenCalledWith("g1", { name: "Elders" });
	});

	it("goes back to what it was on Escape, and writes nothing", () => {
		const { dom, bar, handlers } = setUp();
		bar.open("g1");
		dom.name.value = "Oops";
		dom.name.handlers.input.forEach(fn => fn({}));
		const ev = key(dom.name, "Escape");
		dom.bar.handlers.keydown.forEach(fn => fn(ev));
		expect(ev.propagationStopped).toBe(true);
		expect(dom.name.value).toBe("The hunters");
		expect(dom.bar.hidden).toBe(true);
		vi.advanceTimersByTime(TIE_WRITE_DELAY_MS * 2);
		expect(handlers.onField).not.toHaveBeenCalled();
	});

	// Space pauses the game and Delete deletes the selected tokens, if either gets past the bar; a
	// digit runs a hotbar macro and a letter pans the scene. Every key is the bar's, as on the tie bar.
	it("keeps every key from the scene", () => {
		const { dom, bar } = setUp();
		bar.open("g1");
		for (const k of [" ", "Delete", "1", "w"]) {
			const ev = key(dom.name, k);
			dom.bar.handlers.keydown.forEach(fn => fn(ev));
			expect(ev.propagationStopped).toBe(true);
			expect(ev.defaultPrevented).toBe(false);
		}
	});
});

describe("the presses", () => {
	it("writes a colour and a shape, and marks them at once", () => {
		const { dom, bar, handlers } = setUp();
		bar.open("g1");
		press(dom.inks.rose);
		expect(handlers.onField).toHaveBeenLastCalledWith("g1", { ink: "rose" });
		expect(dom.inks.rose.attrs["aria-checked"]).toBe("true");
		press(dom.shapes.oval);
		expect(handlers.onField).toHaveBeenLastCalledWith("g1", { shape: "oval" });
	});

	it("offers to add or take out the selected only when that would do something, with the count", () => {
		const { dom, bar } = setUp({ selected: ["n1", "n3", "n4"] });
		bar.open("g1");
		expect(dom.add.hidden).toBe(false);
		expect(dom.add.attrs["aria-label"]).toBe("Put the 2 selected in");
		expect(dom.take.hidden).toBe(false);
		expect(dom.take.attrs["aria-label"]).toBe("Take the 1 selected out");
	});

	it("hides both with nobody selected, and follows the selection as it changes", () => {
		const { dom, bar, state } = setUp();
		bar.open("g1");
		expect(dom.add.hidden).toBe(true);
		expect(dom.take.hidden).toBe(true);
		state.selected = ["n3"];
		bar.selectionChanged();
		expect(dom.add.hidden).toBe(false);
	});

	// ⚠ THE BAR IS MEASURED ONCE PER OPENING, because it is placed on every frame of a pan -- so the
	// two buttons coming and going, the one thing that changes its width while it is up, have to
	// throw that measurement away, or it is seated by the width it used to be.
	it("measures itself again when the selection grows or shrinks it, and not per frame", () => {
		const { dom, bar, state } = setUp();
		dom.bar.rect = { left: 0, top: 0, width: 100, height: 30 };
		const measure = vi.spyOn(dom.bar, "getBoundingClientRect");
		bar.open("g1");
		bar.place();
		expect(measure).toHaveBeenCalledTimes(1);
		expect(dom.bar.style.left).toBe("450px");
		dom.bar.rect = { left: 0, top: 0, width: 200, height: 30 };
		state.selected = ["n3"];
		bar.selectionChanged();
		expect(measure).toHaveBeenCalledTimes(2);
		expect(dom.bar.style.left).toBe("400px");
	});

	it("hands the membership presses to the window", () => {
		const { dom, bar, handlers } = setUp({ selected: ["n3"] });
		bar.open("g1");
		press(dom.add);
		expect(handlers.onMembers).toHaveBeenCalledWith("g1", "add");
	});

	it("rubs the group out, letting go first and writing nothing half-typed", () => {
		const { dom, bar, handlers } = setUp();
		bar.open("g1");
		dom.name.value = "Half";
		dom.name.handlers.input.forEach(fn => fn({}));
		press(dom.drop);
		expect(handlers.onDrop).toHaveBeenCalledWith("g1");
		expect(handlers.onField).not.toHaveBeenCalled();
		expect(dom.bar.hidden).toBe(true);
	});

	it("does nothing for a reader who may only look", () => {
		const { dom, bar, handlers } = setUp({ canEdit: () => false });
		bar.open("g1");
		expect(dom.name.disabled).toBe(true);
		press(dom.inks.rose);
		press(dom.drop);
		expect(handlers.onField).not.toHaveBeenCalled();
		expect(handlers.onDrop).not.toHaveBeenCalled();
	});
});

describe("a repaint under the bar", () => {
	it("lets go of a group somebody else rubbed out", () => {
		const { dom, bar, state, handlers } = setUp();
		bar.open("g1");
		state.group = null;
		bar.refresh();
		expect(dom.bar.hidden).toBe(true);
		expect(handlers.onPicked).toHaveBeenLastCalledWith("");
	});

	it("never refills the name the reader is typing", () => {
		const { dom, bar, state } = setUp();
		bar.open("g1");
		dom.name.value = "Mine";
		state.group = { ...HUNTERS, name: "Theirs", ink: "rose" };
		bar.refresh();
		expect(dom.name.value).toBe("Mine");
		expect(dom.inks.rose.attrs["aria-checked"]).toBe("true");
	});
});
