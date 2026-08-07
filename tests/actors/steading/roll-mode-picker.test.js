import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

// The steading's roll modifier used to be a section of its own on the Moves tab: a heading, a
// page-wide underline, and three stacked radios — the visual weight of the page's subject for
// a three-way toggle, and a layout left over from the narrow sidebar it came from. In the
// MODERN layout it is a segmented pill on the Homefront Moves heading, the same component and
// the same place as the Relationships card's table/board toggle.
//
// Both shapes are live. CLASSIC means the layout as it was, so its sidebar brings the stacked
// radios back — the same partial the character sheet's sidebar has always used. Which one
// renders is a per-user setting read at render time, so the sheet binds BOTH handlers.
//
// These guard the wiring. Layout is verified in a browser, not here.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = rel => fs.readFileSync(path.resolve(HERE, "../../..", rel), "utf8");

const PICKER_HBS = read("templates/actor/partials/roll-mode-picker.hbs");
const RADIOS_HBS = read("templates/actor/partials/roll-mode-radios.hbs");
const CHARACTER_HBS = read("templates/actor/character.hbs");
const SIDEBAR_HBS = read("templates/actor/partials/steading-moves-sidebar.hbs");
const MOVES_HBS = read("templates/actor/partials/steading-tab-moves.hbs");
const SHEET_JS = read("module/actors/steading/StonetopSteadingSheet.js");
const STONETOP_JS = read("stonetop.js");
const CSS = read("styles/stonetop.css");
const EN = JSON.parse(read("languages/en.json"));

/** Markup only — the file comments still discuss the section this replaced. */
const stripComments = hbs => hbs.replace(/\{\{!--[\s\S]*?--\}\}/g, "");

describe("roll mode picker", () => {
	// Worst to best, left to right, so the strip reads as a scale rather than a menu.
	it("offers exactly the three modes the roll engine knows, in order", () => {
		const modes = [...PICKER_HBS.matchAll(/data-roll-mode="(\w+)"/g)].map(m => m[1]);
		expect(modes).toEqual(["dis", "normal", "adv"]);
		// _normalizeSheetRollMode falls back to "normal" for anything else, so a typo here
		// would silently become a segment that does nothing but deselect the others.
		expect(read("module/utils/roll-engine.js")).toContain('rollMode === "adv" ? "3d6kh2"');
	});

	// A NAMED input inside an actor sheet's form is submitted into _updateObject and lands in
	// expandObject(formData) as a stray top-level key — the reason the relationships view
	// toggle is buttons too. The old radios carried `name="stonetop-roll-mode"`.
	it("is buttons, with no named input to ride along into the form", () => {
		expect(PICKER_HBS).not.toMatch(/<input/);
		expect(PICKER_HBS).not.toContain("name=");
		expect((PICKER_HBS.match(/<button type="button"/g) ?? []).length).toBe(3);
		expect(MOVES_HBS).not.toContain("stonetop-roll-mode-input");
	});

	it("reuses the shared segmented picker rather than a look-alike", () => {
		expect(PICKER_HBS).toContain("stonetop-segmented-picker");
		expect(PICKER_HBS).toContain("stonetop-segmented-picker-option");
	});

	// The fold walk only hides a heading's FOLLOWING siblings, so a control inside the heading
	// has to opt in by name or it survives the fold — a roll modifier over hidden moves.
	it("folds away with the section it modifies", () => {
		expect(PICKER_HBS).toContain("stonetop-section-heading-control");
		expect(SHEET_JS).toContain(".stonetop-move-group-title");
	});

	it("localizes every label and tooltip", () => {
		for (const key of [...PICKER_HBS.matchAll(/localize "([\w.]+)"/g)].map(m => m[1])) {
			const value = key.split(".").reduce((o, k) => o?.[k], { stonetop: EN.stonetop });
			expect(value, key).toBeTypeOf("string");
		}
	});

	it("registers the partial", () => {
		expect(STONETOP_JS).toContain('"stonetop.roll-mode-picker":');
	});
});

describe("roll mode radios", () => {
	// The classic sidebar and the character sidebar were hand-copies of the same twenty lines.
	// One partial, two mounts — the same rule the rest of the classic/modern split follows.
	it("is one partial with two mounts, not two copies", () => {
		expect(STONETOP_JS).toContain('"stonetop.roll-mode-radios":');
		expect(CHARACTER_HBS).toContain('{{> "stonetop.roll-mode-radios" rollMode=stonetop.rollMode enabled=editable}}');
		expect(SIDEBAR_HBS).toContain('{{> "stonetop.roll-mode-radios"');
		for (const [name, hbs] of [["character", CHARACTER_HBS], ["classic sidebar", SIDEBAR_HBS]])
			expect(hbs, name).not.toContain('class="stonetop-roll-mode-input"');
	});

	// Same three the engine knows; best to worst, which is how this list has always read (the
	// pill runs the other way because a horizontal strip reads as a scale left to right).
	it("offers exactly the three modes, best to worst", () => {
		expect([...RADIOS_HBS.matchAll(/value="(\w+)"/g)].map(m => m[1])).toEqual(["adv", "normal", "dis"]);
	});

	// `checked` and `is-checked` are both server-stamped, so the fill only follows the click
	// because the write re-renders — the same contract the pill's `.is-active` has.
	it("stamps the chosen row from the rendered rollMode", () => {
		expect(RADIOS_HBS).toMatch(/\{\{#if \(eq rollMode "adv"\)\}\}checked/);
		expect(RADIOS_HBS).toContain("is-checked");
	});

	it("localizes every label", () => {
		const keys = [...RADIOS_HBS.matchAll(/localize "([\w.]+)"/g)].map(m => m[1]);
		expect(keys.length).toBeGreaterThan(3);
		for (const key of keys)
			expect(key.split(".").reduce((o, k) => o?.[k], { stonetop: EN.stonetop }), key).toBeTypeOf("string");
	});
});

describe("steading moves tab", () => {
	it("carries the picker in the moves heading, not a section of its own", () => {
		expect(MOVES_HBS).toContain('{{> "stonetop.roll-mode-picker" rollMode=stonetop.rollMode}}');
		expect(stripComments(MOVES_HBS)).not.toContain("Roll Modifier");
		// The picker has to be INSIDE the h3 — that is what puts it on the heading's own line,
		// above the underline, rather than in the padding above it.
		const h3 = MOVES_HBS.slice(MOVES_HBS.indexOf("<h3"), MOVES_HBS.indexOf("</h3>"));
		expect(h3).toContain("stonetop.roll-mode-picker");
		expect(h3).toContain("stonetop.section-collapse");
	});

	it("leaves one move group, so nothing else is swallowed by its caret", () => {
		expect((MOVES_HBS.match(/class="stonetop-move-group"/g) ?? []).length).toBe(1);
	});
});

describe("roll mode wiring", () => {
	// BOTH shapes are live and only one renders at a time: the pill in the modern moves
	// heading, the stacked radios in the classic sidebar. Which one is a per-user setting read
	// at render, so the sheet cannot pick a listener — it has to carry both. Binding one is
	// silent: the other renders, highlights correctly off its server-stamped state, and never
	// writes. (That is exactly what the classic layout shipped with at first.)
	it("listens for the pill's clicks AND the radios' changes", () => {
		expect(SHEET_JS).toMatch(/closest\("\.stonetop-roll-mode-btn"\)/);
		expect(SHEET_JS).toMatch(/find\("\.stonetop-roll-mode-input"\)\.on\("change"/);
	});

	// Rolling is available to a player who cannot edit the sheet, so choosing how to roll must
	// be too. The guard sits further down activateListeners; this has to be above it.
	it("is wired above the isEditable guard", () => {
		const start = SHEET_JS.indexOf("activateListeners(html)");
		const picker = SHEET_JS.indexOf(".stonetop-roll-mode-btn", start);
		const guard = SHEET_JS.indexOf("if (!this.isEditable) return;", start);
		expect(picker).toBeGreaterThan(start);
		expect(picker).toBeLessThan(guard);
	});

	// `is-active` is server-stamped, so the fill only follows if the flip re-renders — and it
	// does, because setFlag is a document update and `updateActor` re-renders every sheet on the
	// actor. Rendering again by hand on top of that is a second full rebuild of six tabs, which
	// visibly flickers the tab being read; the write is what has to be there, not the render.
	it("normalizes what it writes, and leaves the re-render to the document update", () => {
		const block = SHEET_JS.slice(SHEET_JS.indexOf(".stonetop-roll-mode-btn"));
		expect(block).toContain("_normalizeSheetRollMode(btn.dataset.rollMode)");
		const handler = block.slice(0, block.indexOf("}, true);"));
		expect(handler).toContain('setFlag(STONETOP_SCOPE, "rollMode", mode)');
		expect(handler).not.toContain("this.render(");
	});
});

describe("roll mode picker styling", () => {
	const block = sel => CSS.match(new RegExp(`\\n${sel.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")} \\{([^}]*)\\}`))?.[1];

	// Core's `body.game .app button` is display:flex/width:100%/min-height:2em — without the
	// undo each segment claims its own row and the pill stacks vertically.
	//
	// The undo is not written here: it is the reset shared with the board's two segmented
	// strips, which this pill was added to rather than restating. So assert membership in that
	// grouped selector, and that the shared rule still carries the properties.
	it("undoes core's block-level button rules, via the shared segmented reset", () => {
		const reset = CSS.match(
			/\n\.stonetop-rel-viewpicker \.stonetop-rel-view-btn,\n([^{]*)\{([^}]*)\}/);
		expect(reset, "the shared segmented reset is gone").toBeTruthy();
		expect(reset[1], "the pill is not in the shared reset")
			.toContain(".stonetop-roll-mode-picker .stonetop-roll-mode-btn");
		expect(reset[2]).toMatch(/display:\s*inline-flex/);
		expect(reset[2]).toMatch(/width:\s*auto/);
		expect(reset[2]).toMatch(/min-height:\s*0/);
	});

	// Its own block must not restate any of that — a second copy is what drifts.
	it("keeps only its own deltas in its own block", () => {
		const b = block(".stonetop-roll-mode-picker .stonetop-roll-mode-btn");
		expect(b, "the button rule is gone").toBeTruthy();
		for (const prop of ["display", "width", "min-height", "border-radius", "box-shadow"])
			expect(b, prop).not.toMatch(new RegExp(`\\n\\s*${prop}:`));
	});

	// It renders inside an `h3`, whose em box is not the body's, so a relative type step would
	// size the pill by where it was mounted. Same reason the view toggle pins its size.
	it("pins its type size to the root base, not a relative step", () => {
		const b = block(".stonetop-roll-mode-picker .stonetop-roll-mode-btn");
		expect(b).toMatch(/font-size:\s*calc\(0\.95rem \* var\(--stonetop-font-scale/);
		expect(b).not.toMatch(/font-size:\s*var\(--st-fs-/);
	});

	// Server-stamped class, not :has(input:checked) — there are no inputs.
	it("fills the chosen segment from .is-active", () => {
		expect(block(".stonetop-roll-mode-picker .stonetop-roll-mode-btn.is-active"))
			.toMatch(/background:\s*var\(--st-btn-primary-bg/);
	});

	it("gives keyboard focus a visible ring, which core strips from buttons", () => {
		expect(block(".stonetop-roll-mode-picker .stonetop-roll-mode-btn:focus-visible"))
			.toMatch(/outline:/);
	});

	// The heading is the flex row the pill's `margin-left: auto` pushes against, and it has to
	// reserve room below: the pill is taller than the letterforms, so with no padding it clears
	// its own underline by a pixel and reads as resting on it. 4px is what the settlements
	// heading gives the table/board toggle.
	it("makes the moves heading the control's row, with room above the rule", () => {
		const h = block(".steading-moves-tab .stonetop-move-group-title");
		expect(h).toMatch(/display:\s*flex/);
		expect(h).toMatch(/padding-bottom:\s*4px/);
		expect(block(".stonetop-roll-mode-bar")).toMatch(/margin-left:\s*auto/);
	});

	// The radio list is the live component in both sidebars, so its styling stays. What must
	// NOT come back is either sidebar-era override: the pill has no business being stacked into
	// a narrow column (that shape is what the radios are for), and the modern moves TAB is not
	// a sidebar.
	it("keeps the radio list's styling and no override for a shape nothing renders", () => {
		expect(CSS).toContain(".stonetop-roll-mode-option");
		expect(CSS).not.toContain(".steading-moves-tab .stonetop-roll-mode-control");
		expect(CSS).not.toContain(".stonetop-moves-sidebar .stonetop-roll-mode-picker");
	});
});
