import { afterEach, describe, expect, it, vi } from "vitest";
import { onRenderCompendiumItemIcons } from "../../module/hooks/CompendiumItemIcons.js";
import { STONETOP_ITEM_ICONS } from "../../module/utils/item-icon.js";

// The pass rewrites compendium rows after render. The test env is node, so we fake just the
// DOM surface it touches: the row list, each row's thumbnail (or the generic <i> the partial
// draws when an entry has no img at all), and prepend/remove.

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
	get src() { return this.attrs.src ?? null; }
	set src(v) { this.attrs.src = v; }
	append(...kids) { for (const k of kids) { k.parent = this; this.children.push(k); } return this; }
	prepend(k) { k.parent = this; this.children.unshift(k); return this; }
	remove() {
		if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this);
		this.parent = null;
	}
	_descendants(out = []) { for (const c of this.children) { out.push(c); c._descendants(out); } return out; }
	querySelector(sel) {
		// The module asks for exactly these two.
		if (sel === "img.thumbnail") {
			return this._descendants().find((n) => n.tag === "img" && n.className.includes("thumbnail")) ?? null;
		}
		if (sel === ":scope > i") return this.children.find((n) => n.tag === "i") ?? null;
		throw new Error(`unexpected selector ${sel}`);
	}
	querySelectorAll(sel) {
		if (sel !== "li.directory-item.document[data-entry-id]") throw new Error(`unexpected selector ${sel}`);
		return this._descendants().filter((n) => n.tag === "li" && n.dataset.entryId);
	}
}

/** A rendered directory: one <li> per index entry, drawn the way the core partial draws it. */
function render(entries) {
	const root = new El("div");
	for (const e of entries) {
		const li = new El("li", "directory-item entry document item");
		li.dataset.entryId = e._id;
		if (e.img) li.append(Object.assign(new El("img", "thumbnail"), { attrs: { src: e.img } }));
		else li.append(new El("i", "fa-solid fa-suitcase"));
		li.append(new El("a", "entry-name"));
		root.append(li);
	}
	return root;
}

function pack(entries, { documentName = "Item", indexed = true } = {}) {
	return {
		documentName,
		indexed,
		index: new Map(entries.map((e) => [e._id, e])),
		getIndex: vi.fn(async function () { this.indexed = true; return this.index; }),
	};
}

const thumbSrcs = (root) =>
	root.querySelectorAll("li.directory-item.document[data-entry-id]")
		.map((li) => li.querySelector("img.thumbnail")?.getAttribute("src") ?? null);

const originalDocument = globalThis.document;
globalThis.document = { createElement: (tag) => new El(tag) };
afterEach(() => { globalThis.document = originalDocument; globalThis.document = { createElement: (tag) => new El(tag) }; });

describe("onRenderCompendiumItemIcons", () => {
	it("gives each art-less row the marker its type calls for", async () => {
		const entries = [
			{ _id: "a", name: "A folktale",  type: "move", system: { moveType: "arcanum" },   img: "icons/svg/item-bag.svg" },
			{ _id: "b", name: "Defy Danger", type: "move", system: { moveType: "basic" },     img: "icons/svg/item-bag.svg" },
			{ _id: "c", name: "Rations",     type: "move", system: { moveType: "inventory" }, img: "icons/svg/item-bag.svg" },
		];
		const root = render(entries);
		await onRenderCompendiumItemIcons({ collection: pack(entries) }, root);

		expect(thumbSrcs(root)).toEqual([
			STONETOP_ITEM_ICONS.arcanum, STONETOP_ITEM_ICONS.move, STONETOP_ITEM_ICONS.object,
		]);
	});

	it("leaves a row that has real art completely alone", async () => {
		const art = "systems/stonetop-pwd/assets/icons/arcana/icon-arcana-mindgem.webp";
		const entries = [{ _id: "a", name: "Mindgem", type: "move", system: { moveType: "arcanum" }, img: art }];
		const root = render(entries);
		await onRenderCompendiumItemIcons({ collection: pack(entries) }, root);

		expect(thumbSrcs(root)).toEqual([art]);
	});

	it("builds a thumbnail for an entry that carries no img, replacing the generic glyph", async () => {
		const entries = [{ _id: "a", name: "A folktale", type: "move", system: { moveType: "arcanum" } }];
		const root = render(entries);
		const li = root.querySelectorAll("li.directory-item.document[data-entry-id]")[0];
		expect(li.children.some((c) => c.tag === "i")).toBe(true);

		await onRenderCompendiumItemIcons({ collection: pack(entries) }, root);

		expect(li.children.some((c) => c.tag === "i")).toBe(false);
		expect(li.children[0].tag).toBe("img");
		expect(thumbSrcs(root)).toEqual([STONETOP_ITEM_ICONS.arcanum]);
	});

	it("fetches the index first when moveType has not been loaded yet", async () => {
		const entries = [{ _id: "a", name: "Rations", type: "move", system: { moveType: "inventory" }, img: "icons/svg/item-bag.svg" }];
		const p = pack(entries, { indexed: false });
		await onRenderCompendiumItemIcons({ collection: p }, render(entries));

		expect(p.getIndex).toHaveBeenCalledOnce();
	});

	it("does not re-fetch an index that already carries moveType", async () => {
		const entries = [{ _id: "a", name: "Rations", type: "move", system: { moveType: "inventory" }, img: "icons/svg/item-bag.svg" }];
		const p = pack(entries);
		await onRenderCompendiumItemIcons({ collection: p }, render(entries));

		expect(p.getIndex).not.toHaveBeenCalled();
	});

	describe("bails on anything that is not an Item compendium", () => {
		it("ignores packs of other document types", async () => {
			const entries = [{ _id: "a", name: "Marshedge", img: "icons/svg/item-bag.svg" }];
			const root = render(entries);
			await onRenderCompendiumItemIcons({ collection: pack(entries, { documentName: "JournalEntry" }) }, root);

			expect(thumbSrcs(root)).toEqual(["icons/svg/item-bag.svg"]);
		});

		it("ignores the world Items sidebar, which has no pack index and is already handled", async () => {
			// This handler is bound to renderDocumentDirectory, so ItemDirectory reaches it too.
			const entries = [{ _id: "a", name: "A folktale", type: "move", system: { moveType: "arcanum" }, img: "icons/svg/item-bag.svg" }];
			const root = render(entries);
			const worldItems = { documentName: "Item" };   // game.items: no index, no getIndex
			await expect(onRenderCompendiumItemIcons({ collection: worldItems }, root)).resolves.toBeUndefined();

			expect(thumbSrcs(root)).toEqual(["icons/svg/item-bag.svg"]);
		});

		it("survives an app with no collection at all", async () => {
			await expect(onRenderCompendiumItemIcons({}, render([]))).resolves.toBeUndefined();
			await expect(onRenderCompendiumItemIcons(undefined, render([]))).resolves.toBeUndefined();
		});
	});
});
