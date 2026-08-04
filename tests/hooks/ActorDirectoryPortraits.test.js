import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { onRenderActorDirectoryPortraits, onUpdateActorPortraitFrame } from "../../module/hooks/ActorDirectoryPortraits.js";
import { SYSTEM_ID } from "../../module/system-id.js";

// The pass rewrites Actors sidebar rows after render. The test env is node, so we fake just the
// DOM surface it touches: the row list, each row's <img>, and replaceWith/appendChild.

const ART = "worlds/mine/art/bryn.webp";
const RECT = [0.2, 0.05, 0.7, 0.55];
const FRAMEISH = { src: ART, rect: RECT };

class El {
	constructor(tag, className = "") {
		this.tag = tag;
		this.className = className;
		this.children = [];
		this.parent = null;
		this.dataset = {};
		this.attrs = {};
	}
	getAttribute(n) { return this.attrs[n] ?? null; }
	setAttribute(n, v) { this.attrs[n] = v; }
	removeAttribute(n) { delete this.attrs[n]; }
	hasAttribute(n) { return n in this.attrs; }
	appendChild(k) { k.parent = this; this.children.push(k); return k; }
	replaceWith(node) {
		if (!this.parent) return;
		this.parent.children = this.parent.children.map((c) => (c === this ? node : c));
		node.parent = this.parent;
		this.parent = null;
	}
	remove() {
		if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this);
		this.parent = null;
	}
	_descendants(out = []) { for (const c of this.children) { out.push(c); c._descendants(out); } return out; }
	querySelector(sel) {
		if (sel === ".stonetop-dir-portrait") {
			return this._descendants().find((n) => n.className === "stonetop-dir-portrait") ?? null;
		}
		if (sel === ".stonetop-dir-portrait > img") {
			const box = this.querySelector(".stonetop-dir-portrait");
			return box?.children.find((n) => n.tag === "img") ?? null;
		}
		if (sel === ":scope > img") return this.children.find((n) => n.tag === "img") ?? null;
		if (sel === "img") return this._descendants().find((n) => n.tag === "img") ?? null;
		// The single-row lookup the update hook makes.
		const byId = sel.match(/^li\.directory-item\.document\[data-entry-id="(.+)"\]$/);
		if (byId) return this._descendants().find((n) => n.tag === "li" && n.dataset.entryId === byId[1]) ?? null;
		throw new Error(`unexpected selector ${sel}`);
	}
	querySelectorAll(sel) {
		if (sel !== "li.directory-item.document[data-entry-id]") throw new Error(`unexpected selector ${sel}`);
		return this._descendants().filter((n) => n.tag === "li" && n.dataset.entryId);
	}
}

const originalDocument = globalThis.document;
globalThis.document = { createElement: (tag) => new El(tag) };
afterEach(() => { globalThis.document = originalDocument ?? { createElement: (tag) => new El(tag) }; });

/** A rendered Actors directory: one <li> per actor, drawn the way core's partial draws it. */
function render(actors, { lazy = false } = {}) {
	const root = new El("div");
	for (const a of actors) {
		const li = new El("li", "directory-item entry document actor");
		li.dataset.entryId = a.id;
		const img = new El("img", "");
		img.setAttribute(lazy ? "data-src" : "src", a.img);
		li.appendChild(img);
		li.appendChild(new El("a", "entry-name"));
		root.appendChild(li);
	}
	return root;
}

const actor = (id, { img = ART, frame } = {}) => ({
	id, img,
	flags: frame ? { [SYSTEM_ID]: { portraitFrame: frame } } : {},
});

const collection = (actors, over = {}) => ({
	documentName: "Actor",
	get: (id) => actors.find((a) => a.id === id) ?? null,
	...over,
});

/** The row's picture, wherever the pass left it. */
const rowImg = (root, i = 0) => root.querySelectorAll("li.directory-item.document[data-entry-id]")[i].querySelector("img");
const rowBox = (root, i = 0) => root.querySelectorAll("li.directory-item.document[data-entry-id]")[i].querySelector(".stonetop-dir-portrait");

describe("onRenderActorDirectoryPortraits", () => {
	it("wraps a framed row's image in a clipping box and paints the frame on it", () => {
		const actors = [actor("a1", { frame: { src: ART, rect: RECT } })];
		const root = render(actors);
		onRenderActorDirectoryPortraits({ collection: collection(actors) }, root);

		const box = rowBox(root);
		expect(box, "no clipping box was inserted").not.toBeNull();
		// The image moved INTO the box — an absolutely-positioned image with no clipping
		// ancestor paints across the whole sidebar.
		expect(box.children.map((c) => c.tag)).toEqual(["img"]);
		expect(rowImg(root).getAttribute("style")).toMatch(/position:absolute/);
		expect(rowImg(root).getAttribute("style")).toMatch(/width:200%/);
	});

	it("leaves an unframed row exactly as core rendered it", () => {
		const actors = [actor("a1")];
		const root = render(actors);
		onRenderActorDirectoryPortraits({ collection: collection(actors) }, root);
		expect(rowBox(root)).toBeNull();
		expect(rowImg(root).getAttribute("style")).toBeNull();
	});

	it("unwraps again when a frame is cleared, putting the image back where core had it", () => {
		const framed = [actor("a1", { frame: { src: ART, rect: RECT } })];
		const root = render(framed);
		onRenderActorDirectoryPortraits({ collection: collection(framed) }, root);
		expect(rowBox(root)).not.toBeNull();

		// Same rendered DOM, frame gone from the document.
		const bare = [actor("a1")];
		onRenderActorDirectoryPortraits({ collection: collection(bare) }, root);
		expect(rowBox(root)).toBeNull();
		expect(rowImg(root).getAttribute("style")).toBeNull();
		expect(rowImg(root).parent.tag).toBe("li");
	});

	it("does not double-wrap when the directory re-renders", () => {
		const actors = [actor("a1", { frame: { src: ART, rect: RECT } })];
		const root = render(actors);
		onRenderActorDirectoryPortraits({ collection: collection(actors) }, root);
		onRenderActorDirectoryPortraits({ collection: collection(actors) }, root);
		const li = root.querySelectorAll("li.directory-item.document[data-entry-id]")[0];
		expect(li.children.filter((c) => c.className === "stonetop-dir-portrait")).toHaveLength(1);
		expect(rowBox(root).children).toHaveLength(1);
	});

	it("fills core's lazy-load attribute, not the src it has not swapped in yet", () => {
		// Core renders `data-src` and hides the image until its own observer moves the value to
		// `src`. Writing `src` here would show the picture before the row scrolls into view, and
		// the observer would then overwrite it with the unredirected path.
		const actors = [actor("a1", { frame: { src: ART, rect: RECT } })];
		const root = render(actors, { lazy: true });
		onRenderActorDirectoryPortraits({ collection: collection(actors) }, root);
		expect(rowImg(root).getAttribute("data-src")).toBe(ART);
		expect(rowImg(root).getAttribute("src")).toBeNull();
	});

	it("stays out of every other sidebar tab, and out of compendium rows", () => {
		const actors = [actor("a1", { frame: { src: ART, rect: RECT } })];
		// renderDocumentDirectory fires for Items, Journals, Scenes… as well.
		const items = render(actors);
		onRenderActorDirectoryPortraits({ collection: collection(actors, { documentName: "Item" }) }, items);
		expect(rowBox(items)).toBeNull();

		// A pack renders off its INDEX, which carries img but no flags — there is no frame to
		// read there without fetching every document in the pack on every render.
		const pack = render(actors);
		onRenderActorDirectoryPortraits({ collection: collection(actors, { index: new Map() }) }, pack);
		expect(rowBox(pack)).toBeNull();
	});

	it("survives a row whose actor is gone, and a call with nothing to work on", () => {
		const root = render([actor("a1", { frame: { src: ART, rect: RECT } })]);
		expect(() => onRenderActorDirectoryPortraits({ collection: collection([]) }, root)).not.toThrow();
		expect(rowBox(root)).toBeNull();
		expect(() => onRenderActorDirectoryPortraits({}, render([]))).not.toThrow();
		expect(() => onRenderActorDirectoryPortraits(undefined, render([]))).not.toThrow();
	});
});

// Core redraws the directory for name / img / sort / folder and nothing else. A frame lives in
// `flags`, so without this half the sidebar kept the old crop until the world was reloaded.
describe("onUpdateActorPortraitFrame", () => {
	/** A rendered directory standing in for the sidebar tab. */
	function sidebar(actors, root) {
		return { collection: collection(actors), element: root };
	}

	beforeEach(() => { globalThis.foundry = { ...(globalThis.foundry ?? {}) }; });
	afterEach(() => { delete globalThis.ui; });

	it("paints the crop on the row the moment a frame is written", () => {
		const bare = [actor("a1")];
		const root = render(bare);
		onRenderActorDirectoryPortraits(sidebar(bare, root), root);
		expect(rowBox(root), "no frame yet, so no box").toBeNull();

		const framed = actor("a1", { frame: { src: ART, rect: RECT } });
		globalThis.ui = { actors: sidebar([framed], root) };
		onUpdateActorPortraitFrame(framed, { flags: { [SYSTEM_ID]: { portraitFrame: { src: ART, rect: RECT } } } });

		expect(rowBox(root)).not.toBeNull();
		expect(rowImg(root).getAttribute("style")).toMatch(/position:absolute/);
	});

	it("un-crops the row when a frame is cleared, through Foundry's deletion key", () => {
		const framed = [actor("a1", { frame: { src: ART, rect: RECT } })];
		const root = render(framed);
		onRenderActorDirectoryPortraits(sidebar(framed, root), root);
		expect(rowBox(root)).not.toBeNull();

		const cleared = actor("a1");
		globalThis.ui = { actors: sidebar([cleared], root) };
		onUpdateActorPortraitFrame(cleared, { flags: { [SYSTEM_ID]: { "-=portraitFrame": null } } });

		expect(rowBox(root)).toBeNull();
		expect(rowImg(root).getAttribute("style")).toBeNull();
	});

	it("ignores an update that has nothing to do with the frame", () => {
		const actors = [actor("a1")];
		const root = render(actors);
		globalThis.ui = { actors: sidebar(actors, root) };
		onUpdateActorPortraitFrame(actors[0], { name: "Bryn the Younger" });
		onUpdateActorPortraitFrame(actors[0], { flags: { [SYSTEM_ID]: { leads: true } } });
		onUpdateActorPortraitFrame(actors[0], {});
		expect(rowBox(root)).toBeNull();
	});

	it("reaches a popped-out directory, not just the sidebar tab", () => {
		const framed = [actor("a1", { frame: { src: ART, rect: RECT } })];
		const tab = render(framed);
		const popout = render(framed);
		globalThis.ui = { actors: sidebar(framed, tab), windows: { 7: sidebar(framed, popout) } };
		onUpdateActorPortraitFrame(framed[0], { flags: { [SYSTEM_ID]: { portraitFrame: { src: ART, rect: RECT } } } });
		expect(rowBox(tab), "the sidebar tab was missed").not.toBeNull();
		expect(rowBox(popout), "the popout was missed").not.toBeNull();
	});

	it("does not throw with no directory rendered at all", () => {
		const framed = actor("a1", { frame: { src: ART, rect: RECT } });
		globalThis.ui = {};
		expect(() => onUpdateActorPortraitFrame(framed, { flags: { [SYSTEM_ID]: { portraitFrame: FRAMEISH } } })).not.toThrow();
	});
});
