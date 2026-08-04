import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addPortraitFrameControl } from "../../module/utils/popout-header-control.js";

// The framer is a real Application subclass; stand in for it so the click can be inspected.
const editor = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock("../../module/utils/PortraitFrameDialog.js", () => ({ openPortraitFrameEditor: editor.open }));

const OLD = "worlds/mine/art/old-face.webp";
const NEW = "worlds/mine/art/new-face.webp";

class El {
	constructor(tag, className = "") {
		this.tag = tag;
		this.className = className;
		this.children = [];
		this.attrs = {};
		this.listeners = {};
	}
	get classList() {
		return { contains: (c) => this.className.split(/\s+/).includes(c) };
	}
	setAttribute(n, v) { this.attrs[n] = v; }
	getAttribute(n) { return this.attrs[n] ?? null; }
	appendChild(k) { this.children.push(k); return k; }
	insertBefore(k, ref) { this.children.splice(this.children.indexOf(ref), 0, k); return k; }
	addEventListener(name, fn) { (this.listeners[name] ??= []).push(fn); }
	click() { for (const fn of this.listeners.click ?? []) fn({ preventDefault() {}, stopPropagation() {} }); }
	_all(out = []) { for (const c of this.children) { out.push(c); c._all(out); } return out; }
	querySelector(sel) { return this._all().find((n) => matches(n, sel)) ?? null; }
	querySelectorAll(sel) { return this._all().filter((n) => matches(n, sel)); }
	set innerHTML(_v) { /* the label markup; nothing here reads it back */ }
}

function matches(node, sel) {
	if (sel === ".window-header") return node.className.includes("window-header");
	if (sel === "a.header-button") return node.tag === "a" && node.className.includes("header-button");
	if (sel === "button.header-control") return node.tag === "button" && node.className.includes("header-control");
	if (sel.startsWith(".")) return node.className.split(/\s+/).includes(sel.slice(1));
	throw new Error(`unexpected selector ${sel}`);
}

/** An AppV2 popout with a rendered header, the shape the injector looks for. */
function makePopout() {
	const header = new El("div", "window-header");
	header.appendChild(new El("button", "header-control fa-solid fa-times"));
	const root = new El("div");
	root.appendChild(header);
	return { element: root, header };
}

/** A live handle: `img` is a getter over a document that can change under us. */
function makeHandle(doc) {
	return { canWrite: true, get img() { return doc.img; }, read: () => null, write: vi.fn(), clear: vi.fn() };
}

const originalDocument = globalThis.document;
beforeEach(() => {
	editor.open.mockReset();
	globalThis.document = { createElement: (tag) => new El(tag) };
});
afterEach(() => { globalThis.document = originalDocument; });

/** Let the injector's rAF/setTimeout passes run. */
const settle = () => new Promise((r) => setTimeout(r, 150));

describe("addPortraitFrameControl", () => {
	it("frames the picture the portrait is wearing WHEN CLICKED, not when the window opened", async () => {
		// The regression: this control is registered once and clicked later, and the window's own
		// "Edit Photo" can change the face in between. A snapshot taken at registration opened the
		// editor on the previous picture and would have stamped a rect measured on it.
		const doc = { img: OLD };
		const popout = makePopout();
		addPortraitFrameControl(popout, makeHandle(doc), { name: "Bryn", onSaved: () => {} });
		await settle();

		doc.img = NEW;                       // Edit Photo, while the window sits open
		popout.header.querySelector(".stonetop-frame-portrait").click();

		expect(editor.open).toHaveBeenCalledTimes(1);
		expect(editor.open.mock.calls[0][0].img).toBe(NEW);
	});

	it("titles the editor from the name it was given", async () => {
		const popout = makePopout();
		addPortraitFrameControl(popout, makeHandle({ img: OLD }), { name: "Bryn", onSaved: () => {} });
		await settle();
		popout.header.querySelector(".stonetop-frame-portrait").click();
		expect(editor.open.mock.calls[0][0].title).toBe("Frame Bryn");
	});

	it("adds nothing for a handle that cannot be written", async () => {
		const popout = makePopout();
		addPortraitFrameControl(popout, { canWrite: false, img: OLD }, { name: "Bryn" });
		addPortraitFrameControl(popout, null, { name: "Bryn" });
		await settle();
		expect(popout.header.querySelector(".stonetop-frame-portrait")).toBeNull();
	});
});
