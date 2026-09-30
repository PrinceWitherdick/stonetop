// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import Handlebars from "handlebars";
import { sameProse } from "../../module/utils/same-prose.js";
import { patchChangesSection, queuePageWrite } from "../../module/journal/page-writes.js";
import { createStonetopLocationPageSheetClass } from "../../module/journal/StonetopLocationPageSheet.js";
import { createStonetopGmPrepPageSheetClass } from "../../module/journal/gm-prep-page-sheet.js";
import { holdRenderWhileTyping, keepTypingAcrossRedraw } from "../../module/journal/inline-page-view.js";

// Stands in for ProseMirror's parse + serialize: it drops class attributes and the whitespace
// between tags, which is the kind of difference book HTML has from what the editor writes out.
const fakeDom = {
	parseString: html => ({ content: html.replace(/\s+class="[^"]*"/g, "").replace(/>\s+</g, "><").trim() }),
	serializeString: content => content,
};

describe("sameProse", () => {
	afterEach(() => { delete globalThis.foundry.prosemirror; });

	it("is true for the same string, and for nothing against an empty string", () => {
		expect(sameProse("<p>a</p>", "<p>a</p>")).toBe(true);
		expect(sameProse(undefined, "")).toBe(true);
	});
	it("compares as ProseMirror would hold the HTML", () => {
		globalThis.foundry.prosemirror = { dom: fakeDom };
		expect(sameProse("<p>Wolves</p>", `<p class="question-bullet">Wolves</p>`)).toBe(true);
		expect(sameProse("<p>Wolves!</p>", `<p class="question-bullet">Wolves</p>`)).toBe(false);
	});
	it("only trusts plain equality without ProseMirror", () => {
		expect(sameProse("<p>Wolves</p>", `<p class="q">Wolves</p>`)).toBe(false);
	});
});

describe("patchChangesSection", () => {
	beforeEach(() => { globalThis.foundry.prosemirror = { dom: fakeDom }; });
	afterEach(() => { delete globalThis.foundry.prosemirror; });

	it("sees a Dangers list the editors only re-wrote as unchanged", () => {
		const section = { kind: "groups", groups: [{ heading: "Wolves", body: `<p class="x">Hungry</p>` }] };
		expect(patchChangesSection(section, { groups: [{ heading: "Wolves", body: "<p>Hungry</p>" }] })).toBe(false);
		expect(patchChangesSection(section, { groups: [{ heading: "Wolves", body: "<p>Starving</p>" }] })).toBe(true);
		expect(patchChangesSection(section, { groups: [] })).toBe(true);
	});
	it("compares answers trimmed, as they are stored", () => {
		const section = { kind: "qa", pairs: [{ prompt: "Who?", answer: "Olwin" }] };
		expect(patchChangesSection(section, { pairs: [{ prompt: "Who?", answer: "Olwin " }] })).toBe(false);
		expect(patchChangesSection(section, { pairs: [{ prompt: "Who?", answer: "Olwin, maybe" }] })).toBe(true);
		expect(patchChangesSection(section, { pairs: [{ prompt: "Who?", answer: "Olwin" }, { prompt: "", answer: "" }] })).toBe(true);
	});
	it("ignores stored fields the new rows do not carry", () => {
		const section = { pairs: [{ prompt: "Who?", answer: "Olwin", id: "a1" }] };
		expect(patchChangesSection(section, { pairs: [{ prompt: "Who?", answer: "Olwin" }] })).toBe(false);
	});
});

describe("queuePageWrite", () => {
	it("runs a page's writes one after another, and a failure does not stop the next", async () => {
		const doc = {};
		const order = [];
		let release;
		const first = queuePageWrite(doc, () => new Promise(r => { release = r; }).then(() => { order.push("first"); throw new Error("no"); }));
		const second = queuePageWrite(doc, async () => { order.push("second"); return 2; });
		await new Promise(r => setTimeout(r, 0));
		expect(order).toEqual([]);
		release();
		await expect(first).rejects.toThrow("no");
		await expect(second).resolves.toBe(2);
		expect(order).toEqual(["first", "second"]);
	});
});

// A page whose update lands a little later, and replaces the whole array, as the server's does.
function fakePage(sections) {
	const page = {
		system: { sections },
		updates: [],
		async update(data) {
			page.updates.push(data);
			await new Promise(r => setTimeout(r, 5));
			page.system.sections = structuredClone(data["system.sections"]);
		},
	};
	return page;
}

describe("location page: closing the popout", () => {
	beforeEach(() => { globalThis.foundry.prosemirror = { dom: fakeDom }; });
	afterEach(() => { delete globalThis.foundry.prosemirror; });

	const Sheet = createStonetopLocationPageSheetClass(class { static get defaultOptions() { return {}; } });
	const sheetFor = page => Object.assign(new Sheet(), { document: page });

	it("keeps the typed answer when every Dangers editor saves at the same moment", async () => {
		const page = fakePage([
			{ kind: "qa", pairs: [{ prompt: "When were you last here?", answer: "" }] },
			{ kind: "groups", groups: [{ heading: "Wolves", body: `<p class="x">Hungry</p>` }] },
		]);
		const sheet = sheetFor(page);
		await Promise.all([
			sheet._patchSection(0, { pairs: [{ prompt: "When were you last here?", answer: "Last spring" }] }),
			sheet._patchSection(1, { groups: [{ heading: "Wolves", body: "<p>Hungry</p>" }] }),
			sheet._patchSection(1, { groups: [{ heading: "Wolves", body: "<p>Hungry, and bold</p>" }] }),
		]);
		expect(page.system.sections[0].pairs[0].answer).toBe("Last spring");
		expect(page.system.sections[1].groups[0].body).toBe("<p>Hungry, and bold</p>");
	});

	it("an editor from the view before an Add saves its body without undoing the Add", async () => {
		const drawn = `<p class="x">Hungry</p>`;
		const page = fakePage([{ kind: "groups", groups: [{ heading: "Wolves", body: drawn }, { heading: "", body: "" }] }]);
		// The old view's editor for Wolves, with a word typed in, saves as the view goes.
		await sheetFor(page)._patchGroupBody(0, 0, "<p>Hungry and bold</p>", drawn);
		expect(page.system.sections[0].groups).toEqual([{ heading: "Wolves", body: "<p>Hungry and bold</p>" }, { heading: "", body: "" }]);
	});

	it("finds its entry after the ones above it were removed, and writes nothing once it is gone", async () => {
		const page = fakePage([{ kind: "groups", groups: [{ heading: "Ice drakes", body: "<p>Cold</p>" }] }]);
		const sheet = sheetFor(page);
		// Drawn when Ice drakes was the second entry.
		await sheet._patchGroupBody(0, 1, "<p>Cold, and hungry</p>", "<p>Cold</p>");
		expect(page.system.sections[0].groups[0].body).toBe("<p>Cold, and hungry</p>");
		page.updates.length = 0;
		await sheet._patchGroupBody(0, 3, "<p>Gone</p>", "<p>Never here</p>");
		expect(page.updates).toEqual([]);
	});

	it("a body editor that only re-worded what is stored writes nothing", async () => {
		const page = fakePage([{ kind: "groups", groups: [{ heading: "Wolves", body: `<p class="x">Hungry</p>` }] }]);
		await sheetFor(page)._patchGroupBody(0, 0, "<p>Hungry</p>", `<p class="x">Hungry</p>`);
		expect(page.updates).toEqual([]);
	});

	it("writes nothing when the editors only re-wrote an untouched page", async () => {
		const page = fakePage([{ kind: "groups", groups: [{ heading: "Wolves", body: `<p class="x">Hungry</p>` }] }]);
		await sheetFor(page)._patchSection(0, { groups: [{ heading: "Wolves", body: "<p>Hungry</p>" }] });
		expect(page.updates).toEqual([]);
	});
});

describe("location page: reading the Dangers back off the edit form", () => {
	// The edit list exactly as templates/journal/location.hbs draws it.
	const TEMPLATE = fs.readFileSync(path.resolve(import.meta.dirname, "../../templates/journal/location.hbs"), "utf8");
	const FROM = `<div class="stonetop-entry-group-list">`;
	const list = Handlebars.create();
	list.registerHelper("localize", key => key);
	const draw = list.compile(TEMPLATE.slice(TEMPLATE.indexOf(FROM), TEMPLATE.indexOf("</div>", TEMPLATE.indexOf("{{/each}}", TEMPLATE.indexOf(FROM))) + "</div>".length));

	it("reads each entry once", () => {
		const groups = [{ heading: "Wolves", body: "<p>Hungry</p>" }, { heading: "Ice drakes", body: "<p>In warm months</p>" }];
		const section = document.createElement("div");
		section.dataset.sectionIndex = "3";
		section.innerHTML = draw({ index: 3, groups: groups.map(g => ({ ...g, enrichedBody: g.body })) });
		// An editor's value is its own property in Foundry; here it is the attribute it was drawn with.
		for (const ed of section.querySelectorAll("prose-mirror")) ed.value = ed.getAttribute("value");
		const Sheet = createStonetopLocationPageSheetClass(class { static get defaultOptions() { return {}; } });
		// Both the row and the editor inside it carry the entry's index.
		expect(section.querySelectorAll("[data-group-index]").length).toBe(4);
		const root = document.createElement("div");
		root.append(section);
		expect(new Sheet()._readGroups(root, 3)).toEqual(groups);
	});
});

describe("GM-prep page popout", () => {
	it("does not try to submit a form it does not have when closed", () => {
		const Sheet = createStonetopGmPrepPageSheetClass(class { static get defaultOptions() { return { submitOnClose: true }; } }, {});
		expect(Sheet.defaultOptions.submitOnClose).toBe(false);
	});
});

// A popout window: its frame, and the form the sheet draws inside it.
function drawWindow(answer = "") {
	const frame = document.createElement("div");
	frame.className = "app window-app";
	frame.innerHTML = `<section class="window-content"></section>`;
	document.body.appendChild(frame);
	return { frame, form: redraw(frame, answer) };
}
function redraw(frame, answer = "") {
	const form = document.createElement("form");
	form.innerHTML = `<div data-section-index="0"><textarea class="stonetop-entry-qa-answer">${answer}</textarea></div>`;
	frame.querySelector(".window-content").replaceChildren(form);
	return form;
}
function typeInto(form, text) {
	const field = form.querySelector("textarea");
	field.focus();
	field.value = text;
	field.dispatchEvent(new Event("input", { bubbles: true }));
	return field;
}

describe("typing kept across a popout redraw", () => {
	afterEach(() => { document.body.replaceChildren(); });

	it("puts the typing back when the window is redrawn", () => {
		const sheet = {};
		const { frame, form } = drawWindow();
		keepTypingAcrossRedraw(sheet, form);
		typeInto(form, "Olwin taught me");
		const again = redraw(frame);
		keepTypingAcrossRedraw(sheet, again);
		expect(again.querySelector("textarea").value).toBe("Olwin taught me");
	});

	it("does not put old typing into a window opened again after it was closed", () => {
		const sheet = {};
		const first = drawWindow();
		keepTypingAcrossRedraw(sheet, first.form);
		typeInto(first.form, "Olwin taught me");
		first.frame.remove();
		const reopened = drawWindow("Saved since");
		keepTypingAcrossRedraw(sheet, reopened.form);
		expect(reopened.form.querySelector("textarea").value).toBe("Saved since");
	});
});

describe("redraw held while typing", () => {
	afterEach(() => { document.body.replaceChildren(); delete globalThis.ui; });

	it("lets go in a reopened window even if the last one closed mid-hold", async () => {
		vi.useFakeTimers();
		try {
			const sheet = { appId: 7, rendered: true, render: vi.fn() };
			globalThis.ui = { windows: { 7: sheet } };
			const first = drawWindow();
			sheet.element = [first.frame];
			typeInto(first.form, "a");
			expect(holdRenderWhileTyping(sheet, false)).toBe(true);
			// Closed without its focusout ever arriving.
			first.frame.remove();
			const reopened = drawWindow();
			sheet.element = [reopened.frame];
			const field = typeInto(reopened.form, "b");
			expect(holdRenderWhileTyping(sheet, false)).toBe(true);
			field.blur();
			await vi.runAllTimersAsync();
			expect(sheet.render).toHaveBeenCalledWith(false);
		} finally {
			vi.useRealTimers();
		}
	});
});
