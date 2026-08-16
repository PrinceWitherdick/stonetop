import { describe, it, expect } from "vitest";
import { readRepo as read } from "../fakes/css.js";

// The Import Book Art wizard's pages are three separate errands: the rulebooks you bought, the
// free GM playbook, and your own poster-map files. None of them needs the others, so each page
// carries an Import button that runs THAT page and closes, and the last page's "Import Art" still
// runs the lot.
//
// Everything here fails silently if it breaks. A button that submits more than its page starts a
// 1-2 minute run over PDFs the GM did not mean to hand over; one that submits less imports
// nothing and reports success; one that stays visible on every page turns a wizard into four
// buttons that all look like the finish line. So this file reads the SHIPPED macro command, which
// is what a world actually executes, rather than any local copy of its source.

const COMMAND = JSON.parse(read("packs/src/stonetop-macros/import-book2-art.json")).command;

/** The rail-entry literal for one panel, up to its closing brace. */
function section(key) {
	const at = COMMAND.indexOf(`key: "${key}",`);
	expect(at, `there is no "${key}" rail entry`).toBeGreaterThan(-1);
	return COMMAND.slice(at, COMMAND.indexOf("}", at));
}

/** Pages that take files, and pages that do not. */
const INPUT_PAGES = ["books", "playbook", "maps"];
const EMPTY_PAGES = ["overview", "options"];

describe("importing one page at a time", () => {
	it("offers it on every page that takes files, and on no other", () => {
		for (const key of INPUT_PAGES) expect(section(key), key).toMatch(/runLabel: "[^"]+"/);
		// A run button on a page holding no inputs would submit an empty selection, which the
		// macro answers with "nothing chosen" — an offer that can only ever fail.
		for (const key of EMPTY_PAGES) expect(section(key), key).not.toContain("runLabel");
	});

	// A button inside the panel body could not end the dialog: ApplicationV2 dispatches on
	// `[data-action]`, and everything downstream of `picks` is written against a dialog that has
	// closed with an answer. So these are declared buttons, built from the same section table that
	// draws the rail, rather than markup in the panel.
	it("declares them as real dialog buttons, one per page, off the section table", () => {
		expect(COMMAND).toContain("SETUP_SECTIONS.filter((s) => s.runLabel).map((s) => ({");
		expect(COMMAND).toContain("action: `run-${s.key}`");
		expect(COMMAND).toContain("callback: (event, button, dialog) => collectPage(dialog, s.key)");
	});

	// The whole promise of the button is that it does not touch what another page holds.
	it("submits that page's inputs and nothing another page holds", () => {
		expect(COMMAND).toContain('books: key === "maps" ? [] : collectBooks(dialog, key)');
		expect(COMMAND).toContain('maps: key === "maps" ? collectMaps(dialog) : NO_MAPS');
		// Scoped by the same panel-to-books answer the fields were BUILT from, so a book moved
		// between pages cannot leave its field on one page and its import on another.
		expect(COMMAND).toContain("for (const b of (key ? booksOn(key) : booksUsed))");
		// Force is the deliberate exception: set on Options, meant wherever it was set.
		expect(COMMAND).toContain("force: collectForce(dialog)");
	});

	// "Import Art" is unchanged: the last page still runs everything, unscoped.
	it("leaves the whole-run button running the whole thing", () => {
		expect(COMMAND).toContain("({ books: collectBooks(dialog), force: collectForce(dialog), maps: collectMaps(dialog) })");
	});

	// Declared AFTER the submit, which is what puts each page's import to the right of Back/Next
	// (the render hook inserts those before `[data-action="ok"]`), so the rightmost button in the
	// row is always the one that applies to the page you are on.
	it("sits at the end of the footer row, where the finishing button sits", () => {
		expect(COMMAND.indexOf('action: "ok"')).toBeLessThan(COMMAND.indexOf("action: `run-${s.key}`"));
	});

	it("shows only the one belonging to the page on screen", () => {
		expect(COMMAND).toContain("run.hidden = s.key !== sec.key;");
	});

	// Hidden, never removed, for the same reason Import Art is: DialogV2's submit handler walks
	// every declared action and disables its button.
	it("keeps every one of them in the DOM", () => {
		expect(COMMAND).not.toMatch(/run\.remove\(\)/);
	});

	// An enabled "Import these maps" over an empty page opens a progress window that imports
	// nothing. The count that decides this is the same one painted on the rail badge.
	it("cannot be pressed on a page with nothing filled in", () => {
		expect(COMMAND).toContain("run.disabled = !n;");
		expect(COMMAND).toContain("const n = filledOn(root, s.key);");
		// Settled once against the empty sheet the dialog opens on, or every button starts live.
		expect(COMMAND).toMatch(/showPanel\(root, SETUP_SECTIONS\[0\]\.key\);\s*\n\s*paintBadges\(root\);/);
	});

	// A button that appears on one page and not another reads as furniture. The point of it is
	// knowing you are ALLOWED to leave, which only words can say.
	it("says on each page that stopping there is allowed, and what the alternative is", () => {
		for (const key of INPUT_PAGES) expect(COMMAND, key).toContain(`runHint("${key}")`);
		expect(COMMAND).toContain("You can stop here.");
		expect(COMMAND).toContain("<strong>Import Art</strong> on the last page runs everything");
		// ...and the hint names the button by the same label the button is drawn with.
		expect(COMMAND).toContain("<em>${esc(s.runLabel)}</em>");
	});

	// The offer is the one thing on the page that must not read as an aside, so it is deliberately
	// not a `.stbook-setup-note` (which is muted small grey) and has a style of its own.
	it("is drawn as a callout rather than another muted aside", () => {
		expect(COMMAND).toContain(".stbook-setup-runhint{");
		expect(COMMAND).not.toContain('class="stbook-setup-note stbook-setup-runhint"');
	});
});
