import { describe, expect, it } from "vitest";
import { hideBrokenJournalArt } from "../../module/journal/hide-broken-art.js";

// hide-broken-art.js watches this system's book-art images at journal render time
// and, if one fails to load, removes its wrapper so no reader sees a broken box.
// The test env is node, so we fake just the DOM surface the pass touches: a tiny
// tree with closest / remove / querySelector[All] semantics and <img> load state.

class El {
	constructor(tag, className = "") {
		this.tag = tag;
		this.className = className;
		this.children = [];
		this.parent = null;
	}
	get classList() {
		const set = new Set(String(this.className).split(/\s+/).filter(Boolean));
		return { contains: (c) => set.has(c) };
	}
	append(...kids) { for (const k of kids) { k.parent = this; this.children.push(k); } return this; }
	remove() {
		if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this);
		this.parent = null;
	}
	_matches(sel) {
		if (sel === "p") return this.tag === "p";
		if (sel === "img") return this.tag === "img";
		if (sel === "figure.stonetop-map") return this.tag === "figure" && this.classList.contains("stonetop-map");
		if (sel === ".stonetop-journal-art-banner") return this.classList.contains("stonetop-journal-art-banner");
		return false;
	}
	closest(sel) { let n = this; while (n) { if (n._matches(sel)) return n; n = n.parent; } return null; }
	_descendants(out = []) { for (const c of this.children) { out.push(c); c._descendants(out); } return out; }
	querySelector(sel) { return this._descendants().find((n) => n._matches(sel)) ?? null; }
	querySelectorAll(sel) {
		// The module queries exactly this one compound selector for its managed art.
		if (sel === "img.stonetop-journal-art, figure.stonetop-map img") {
			return this._descendants().filter((n) =>
				n.tag === "img" && (n.classList.contains("stonetop-journal-art") || n.closest("figure.stonetop-map")));
		}
		return this._descendants().filter((n) => n._matches(sel));
	}
}

class Img extends El {
	// complete:true + naturalWidth:0 models an already-failed load; complete:false
	// models one still in flight (resolve later via fireError()).
	constructor(className, { complete = true, naturalWidth = 10 } = {}) {
		super("img", className);
		this.complete = complete;
		this.naturalWidth = naturalWidth;
		this.listeners = [];
	}
	addEventListener(type, fn) { if (type === "error") this.listeners.push(fn); }
	fireError() { for (const fn of this.listeners) fn(); }
}

const artImg = (opts) => new Img("stonetop-journal-art", opts);
const para = (img) => { const p = new El("p"); p.append(img); return p; };

describe("hide broken journal art", () => {
	it("removes the wrapping <p> of an inline art image that already failed to load", () => {
		const img = artImg({ complete: true, naturalWidth: 0 });
		const p = para(img);
		const root = new El("div"); root.append(p);

		hideBrokenJournalArt(root);

		expect(p.parent).toBe(null);
		expect(root.children).not.toContain(p);
	});

	it("leaves a successfully-loaded image alone", () => {
		const img = artImg({ complete: true, naturalWidth: 42 });
		const p = para(img);
		const root = new El("div"); root.append(p);

		hideBrokenJournalArt(root);

		expect(p.parent).toBe(root);
		expect(img.listeners).toHaveLength(1); // wired, but the error never fires
	});

	it("removes the wrapper when an in-flight image errors after render", () => {
		const img = artImg({ complete: false });
		const p = para(img);
		const root = new El("div"); root.append(p);

		hideBrokenJournalArt(root);
		expect(p.parent).toBe(root); // still present while loading

		img.fireError();
		expect(p.parent).toBe(null);
	});

	it("drops only the failing paragraph in a multi-image banner, keeping the good one", () => {
		const good = artImg({ complete: true, naturalWidth: 10 });
		const bad = artImg({ complete: true, naturalWidth: 0 });
		const pGood = para(good);
		const pBad = para(bad);
		const banner = new El("div", "stonetop-journal-art-banner"); banner.append(pGood, pBad);
		const root = new El("div"); root.append(banner);

		hideBrokenJournalArt(root);

		expect(pBad.parent).toBe(null);      // broken paragraph gone
		expect(pGood.parent).toBe(banner);   // good one stays
		expect(banner.parent).toBe(root);    // banner still has art, so it stays
	});

	it("removes the whole banner shell once every image in it has failed", () => {
		const a = artImg({ complete: true, naturalWidth: 0 });
		const b = artImg({ complete: true, naturalWidth: 0 });
		const banner = new El("div", "stonetop-journal-art-banner"); banner.append(para(a), para(b));
		const root = new El("div"); root.append(banner);

		hideBrokenJournalArt(root);

		expect(banner.parent).toBe(null);
	});

	it("removes a Setting Overview map <figure> when its image fails", () => {
		const mapImg = new Img("", { complete: true, naturalWidth: 0 }); // map imgs carry no art class
		const fig = new El("figure", "stonetop-map"); fig.append(mapImg);
		const root = new El("div"); root.append(fig);

		hideBrokenJournalArt(root);

		expect(fig.parent).toBe(null);
	});

	it("wires each image at most once across repeated renders", () => {
		const img = artImg({ complete: false });
		const root = new El("div"); root.append(para(img));

		hideBrokenJournalArt(root);
		hideBrokenJournalArt(root);

		expect(img.listeners).toHaveLength(1);
	});

	it("unwraps a jQuery-shaped root (v12) and is a no-op on junk input", () => {
		const img = artImg({ complete: true, naturalWidth: 0 });
		const p = para(img);
		const root = new El("div"); root.append(p);

		hideBrokenJournalArt({ jquery: true, 0: root });
		expect(p.parent).toBe(null);

		expect(() => hideBrokenJournalArt(null)).not.toThrow();
		expect(() => hideBrokenJournalArt({})).not.toThrow();
	});
});
