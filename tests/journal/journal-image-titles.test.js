import { describe, expect, it, afterEach } from "vitest";
import { patchJournalImagePopoutTitles } from "../../module/journal/journal-image-titles.js";

// journal-image-titles.js wraps core's JournalEntrySheet#_onClickImage so the
// click-to-enlarge popout is titled with the JournalEntry's name for images
// embedded in page content (which core would otherwise open untitled). The wrap
// sets the <img>'s `title` only for core's synchronous read, then strips it. The
// test env is node, so we fake just the surface the wrap touches: a proto with a
// base handler that records what title it saw, and a minimal <img>.

// ── Minimal fake <img> ───────────────────────────────────────────────────────
// `page` marks it as living on a dedicated .image page; `ownTitle` gives it a
// pre-existing title attribute; `nopopout` opts it out entirely.
function fakeImg({ page = false, ownTitle = null, nopopout = false } = {}) {
	let title = ownTitle;
	return {
		get title() { return title ?? ""; },
		getAttribute(name) { return name === "title" ? title : null; },
		setAttribute(name, val) { if (name === "title") title = val; },
		removeAttribute(name) { if (name === "title") title = null; },
		matches(sel) { return sel === "img:not(.nopopout)" ? !nopopout : sel === "img"; },
		closest(sel) { return sel === ".journal-entry-page.image" && page ? {} : null; },
	};
}

// Install a fake `foundry` global exposing one entry-sheet proto whose base
// _onClickImage records the title it observed. Returns the proto.
function installProto(baseImpl) {
	const proto = { _onClickImage: baseImpl };
	globalThis.foundry = { applications: { sheets: { journal: { JournalEntrySheet: { prototype: proto } } } } };
	return proto;
}

afterEach(() => { delete globalThis.foundry; });

describe("journal image popout titles", () => {
	it("titles a content image's popout with the entry name and leaves no lingering title", () => {
		let seen;
		const proto = installProto(function (event) { seen = event.target.title; });
		patchJournalImagePopoutTitles();

		const img = fakeImg();
		proto._onClickImage.call({ entry: { name: "Huffel Peaks" } }, { target: img });

		expect(seen).toBe("Huffel Peaks");           // core read our injected title
		expect(img.getAttribute("title")).toBe(null); // and it was stripped afterwards
	});

	it("leaves a dedicated image page to core (page name), injecting nothing", () => {
		let seen;
		const proto = installProto(function (event) { seen = event.target.title; });
		patchJournalImagePopoutTitles();

		const img = fakeImg({ page: true });
		proto._onClickImage.call({ entry: { name: "Huffel Peaks" } }, { target: img });

		expect(seen).toBe(""); // untouched: core resolves page.name itself
	});

	it("respects an image's own title attribute", () => {
		let seen;
		const proto = installProto(function (event) { seen = event.target.title; });
		patchJournalImagePopoutTitles();

		const img = fakeImg({ ownTitle: "Hand-authored caption" });
		proto._onClickImage.call({ entry: { name: "Huffel Peaks" } }, { target: img });

		expect(seen).toBe("Hand-authored caption");
		expect(img.getAttribute("title")).toBe("Hand-authored caption"); // preserved
	});

	it("is idempotent — patching twice does not double-wrap", () => {
		let calls = 0;
		const proto = installProto(function () { calls++; });
		patchJournalImagePopoutTitles();
		const afterFirst = proto._onClickImage;
		patchJournalImagePopoutTitles();
		expect(proto._onClickImage).toBe(afterFirst); // same wrapper, not re-wrapped

		proto._onClickImage.call({ entry: { name: "X" } }, { target: fakeImg() });
		expect(calls).toBe(1); // base invoked exactly once per click
	});

	it("falls through to the entry name via this.document / this.object too", () => {
		let seen;
		const proto = installProto(function (event) { seen = event.target.title; });
		patchJournalImagePopoutTitles();

		const img = fakeImg();
		proto._onClickImage.call({ object: { name: "Ferrier's Fen" } }, { target: img });
		expect(seen).toBe("Ferrier's Fen");
	});
});
