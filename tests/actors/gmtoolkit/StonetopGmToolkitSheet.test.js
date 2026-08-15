import Handlebars from "handlebars";
import { describe, it, expect, vi } from "vitest";
import { readRepo as read, readCss, repoFileExists } from "../../fakes/css.js";
import { createStonetopGmToolkitSheetClass } from "../../../module/actors/gmtoolkit/StonetopGmToolkitSheet.js";
import { BASIC_GM_MOVES, EXPLORATION_GM_MOVES, HOMEFRONT_GM_MOVES, gmMoveSections } from "../../../module/gm-toolkit/gm-moves.js";
import { actorOptionsFor } from "../../../module/dialogs/create-actor-dialog.js";

// The GM Toolkit: the GM's own actor sheet, the screen-side companion to the GM playbook.
//
// Most of what can go wrong here goes wrong SILENTLY, which is why so much of this file
// asserts on source text rather than on behaviour. A missing registration leg renders a blank
// sheet; a renamed header class moves the tab rail to a fallback position that looks nearly
// right; a `data-tab` key with no icon mapping paints a solid block where the glyph should be.
// None of those throw, and none show up in a render test that only checks the moves are there.


const SHEET_JS      = read("module/actors/gmtoolkit/StonetopGmToolkitSheet.js");
const STONETOP_JS   = read("stonetop.js");
const SYSTEM_JSON   = read("system.json");
const SHEET_HBS     = read("templates/actor/gm-toolkit.hbs");
const MOVES_HBS     = read("templates/actor/partials/gm-toolkit-tab-moves.hbs");
const EXPEDITION_JS = read("module/dialogs/ExpeditionDialog.js");
const CSS           = readCss();

// Both files discuss at length the very things being forbidden below, so the prose has to come
// out first or a guard fails on its own rationale.
const stripComments = src => src
	.replace(/\{\{!--[\s\S]*?--\}\}/g, "")
	.replace(/\/\*[\s\S]*?\*\//g, "")
	.replace(/\/\/[^\n]*/g, "");

/**
 * The sheet, over a five-line stand-in for Foundry's ActorSheet. `options` and `position` are
 * what withSheetSizeMemory writes a restored size into on construction.
 */
function makeSheet(actor = { id: "toolkit1", name: "GM Toolkit", system: {} }) {
	const Base = class {
		options  = {};
		position = {};
		constructor() { this._actor = actor; }
		get actor() { return this._actor; }
		get isEditable() { return true; }
		static get defaultOptions() { return { classes: [], resizable: false }; }
		async getData() { return {}; }
		activateListeners() {}
		// What core's Application hands the sheet: the gear, the token link, Close.
		_getHeaderButtons() {
			return [
				{ label: "Sheet",     class: "configure-sheet", icon: "fas fa-cog" },
				{ label: "Prototype", class: "configure-token", icon: "fas fa-user-circle" },
				{ label: "Close",     class: "close",           icon: "fas fa-times" },
			];
		}
	};
	const Sheet = createStonetopGmToolkitSheetClass(Base);
	return new Sheet();
}

describe("GM Toolkit move lists", () => {
	// The counts the GM playbook's first spread prints. A move quietly dropped in an edit is
	// otherwise invisible: the tab still renders, just missing one line out of thirty.
	it("carries every move the playbook prints, in its three sections", () => {
		expect(BASIC_GM_MOVES).toHaveLength(13);
		expect(EXPLORATION_GM_MOVES).toHaveLength(7);
		expect(HOMEFRONT_GM_MOVES).toHaveLength(10);
	});

	it("keeps the playbook's order rather than sorting", () => {
		expect(BASIC_GM_MOVES[0].name).toBe("Announce trouble (future or offscreen)");
		expect(BASIC_GM_MOVES.at(-1).name).toBe("Advance towards impending doom");
		expect(EXPLORATION_GM_MOVES[0].name).toBe("Provide a choice of paths");
		expect(EXPLORATION_GM_MOVES.at(-1).name).toBe("Bar the way");
		expect(HOMEFRONT_GM_MOVES[0].name).toBe("Introduce someone interesting");
		expect(HOMEFRONT_GM_MOVES.at(-1).name).toBe("Play them against each other");
	});

	it("gives every move a gloss", () => {
		for (const move of [...BASIC_GM_MOVES, ...EXPLORATION_GM_MOVES, ...HOMEFRONT_GM_MOVES]) {
			expect(move.gloss, move.name).toBeTruthy();
		}
	});

	// The GM playbook's Homefront list is the GM's moves for at-home play. The steading sheet's
	// "Homefront Moves" tab is the PLAYERS' homefront moves (Bolster, Muster, Seasons Change...).
	// Two different things with one name, in one world, sometimes on screen together. This pins
	// the fact that they share no entries, so a later edit cannot merge them by accident.
	it("does not overlap the steading's player-facing Homefront moves", () => {
		const players = ["Bolster", "Convalesce", "Deploy", "Make a Plan", "Meet with Disaster",
			"Muster", "Pull Together", "Seasons Change", "Trade and Barter"];
		const gm = HOMEFRONT_GM_MOVES.map(m => m.name);
		for (const name of players) expect(gm).not.toContain(name);
	});

	// The Expedition walkthrough teaches these same seven, and a GM meets both surfaces in the
	// same session. It now RENDERS this table instead of restating it, so "same move, same
	// words" holds by construction. What is pinned is that it still does: the failure mode this
	// replaces is somebody pasting the list back in as literal prose, after which the two
	// screens are free to drift with nothing to say so.
	it("hands the Expedition walkthrough the same list rather than a second copy", () => {
		expect(EXPEDITION_JS).toContain('import { EXPLORATION_GM_MOVES } from "../gm-toolkit/gm-moves.js"');

		const step = EXPEDITION_JS.match(/key:\s*"explore"[\s\S]*?\n\t\},/)?.[0];
		expect(step, "the ExpeditionDialog exploration step moved or was renamed").toBeTruthy();
		expect(step).toContain("${EXPLORATION_MOVE_LIST}");
		// No literal move survives in the step's prose. Checking one name is enough to catch a
		// paste-back, and checking every name would fail on the surrounding sentences that
		// legitimately mention a move by name ("bar the way with a blizzard").
		for (const move of EXPLORATION_GM_MOVES) {
			expect(step, `${move.name} is written out again`).not.toContain(`<strong>${move.name}`);
		}
	});
});

describe("gmMoveSections", () => {
	it("boxes each section under its own fold id", () => {
		const ids = gmMoveSections().map(s => s.collapseId);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("names every section through the localization table", () => {
		for (const section of gmMoveSections()) {
			// A missing key localizes to itself, so this catches a typo the sheet would
			// otherwise render as a raw dotted path in place of the heading.
			expect(game.i18n.localize(section.titleKey)).not.toBe(section.titleKey);
			expect(game.i18n.localize(section.noteKey)).not.toBe(section.noteKey);
		}
	});
});

describe("StonetopGmToolkitSheet", () => {
	it("publishes the three move sections, localized, in playbook order", async () => {
		const data = await makeSheet().getData();
		const sections = data.stonetop.moveSections;

		expect(sections.map(s => s.key)).toEqual(["basic", "exploration", "homefront"]);
		expect(sections.map(s => s.title)).toEqual(["GM Moves", "Exploration", "Homefront"]);
		expect(sections.map(s => s.moves.length)).toEqual([13, 7, 10]);
		expect(sections[1].note).toBe("On an expedition, or inside a site");
	});

	it("opens on the moves tab, wired to the nav and body the template renders", async () => {
		const { tabs } = makeSheet().constructor.defaultOptions;
		expect(tabs).toEqual([
			{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "moves" },
		]);
		// A mismatch between any of these three and the markup renders a blank body.
		expect(SHEET_HBS).toContain('class="sheet-tabs tabs stonetop-tab-rail"');
		expect(SHEET_HBS).toContain('<section class="sheet-body">');
		expect(MOVES_HBS).toContain('data-tab="moves"');
	});

	// Foundry's Tabs binds a nav and its panels by `data-group`. Mismatch them and the controller
	// binds a group nothing answers to: the rail renders, the button highlights, and the body
	// never activates.
	it("uses one tab group across the nav and the panel", () => {
		expect(SHEET_HBS).toMatch(/<nav[^>]*data-group="primary"/s);
		expect(MOVES_HBS).toMatch(/<div class="tab moves"[^>]*data-group="primary"/);
	});

	// The sheet template is the thing Foundry renders. Everything else in this file reads the
	// PARTIAL off disk, which holds whether or not the sheet includes it, so without these two
	// the suite is green on a sheet with an empty body and a rail with no buttons.
	it("actually mounts its tab and its only rail button", () => {
		expect(SHEET_HBS).toContain('{{> "stonetop.gm-toolkit-tab-moves"}}');
		expect(SHEET_HBS).toMatch(/\{\{>\s*"stonetop\.tab-rail-item"\s+tab="moves"/);
	});

	// Nothing on this sheet is a drop target: ActorSheet's default entry has no dropSelector, so
	// the whole window-content accepts drops and the inherited handler attaches the dropped Item
	// to an actor that renders no item list and offers no way to delete it.
	it("accepts no document drops", () => {
		expect(makeSheet().constructor.defaultOptions.dragDrop).toEqual([]);
	});

	// Without "stonetop" the frame loses the parchment skin, the rail's button colours, and
	// the `overflow: visible` that stops the window clipping a rail hung outside it. Without
	// "gm-toolkit" the height floor and the whole sheet block in stonetop.css stop matching.
	it("wears the frame classes its CSS is written against", () => {
		const { classes } = makeSheet().constructor.defaultOptions;
		expect(classes).toEqual(["stonetop", "sheet", "actor", "gm-toolkit"]);
	});

	// The gear offers a choice of sheet class, and `gmToolkit` has exactly one — so it only ever
	// offers the sheet already on screen. In its place, the same steading shortcut the character
	// sheet's header carries: this sheet's Threats and Sites tabs read their storage OFF the
	// steading, so the jump is the one link this header owes.
	describe("the header", () => {
		const withActors = (actors, fn) => {
			const before = game.actors;
			game.actors = actors;
			try { return fn(); } finally { game.actors = before; }
		};

		it("drops the sheet-configuration gear", () => {
			const buttons = withActors([], () => makeSheet()._getHeaderButtons());
			expect(buttons.some(b => b.class === "configure-sheet")).toBe(false);
			// Only the gear goes — the rest of core's header is untouched.
			expect(buttons.map(b => b.class)).toContain("configure-token");
			expect(buttons.map(b => b.class)).toContain("close");
		});

		it("leads with a Stonetop button that opens the steading, named for it", () => {
			const sheet = { render: vi.fn() };
			const steading = { type: "stonetop", name: "Stonetop", sheet };
			const [first] = withActors([steading], () => makeSheet()._getHeaderButtons());

			expect(first.class).toBe("stonetop-open-steading");
			expect(first.label).toBe("Stonetop");
			expect(first.icon).toBe("fas fa-map-marker-alt");

			withActors([steading], () => first.onclick());
			expect(sheet.render).toHaveBeenCalledWith(true, { focus: true });
		});

		// No steading in the world yet: the button still draws, wearing the unset-state class,
		// and says so rather than throwing on a null sheet.
		it("marks itself unset when the world has no steading", () => {
			const warn = vi.fn();
			global.ui = { ...(global.ui ?? {}), notifications: { warn } };
			const [first] = withActors([], () => makeSheet()._getHeaderButtons());

			expect(first.class).toContain("stonetop-open-steading--unset");
			expect(() => withActors([], () => first.onclick())).not.toThrow();
			expect(warn).toHaveBeenCalled();
		});
	});

	// A `get template()` pointing at a file that is not there fails only when someone opens
	// the sheet, and one dropped hyphen does it. Resolve the path the way Foundry does and
	// look on disk.
	it("names a template that actually exists", () => {
		const declared = makeSheet().template;
		expect(declared).toMatch(/^systems\/stonetop-pwd\/templates\//);
		expect(repoFileExists(declared.replace("systems/stonetop-pwd/", "")), `${declared} does not exist`).toBe(true);
	});
});

// Render the REAL partial with the REAL section-heading, so the assertions below are about the
// markup that ships rather than about a description of it.
function renderMovesTab(sections) {
	const hb = Handlebars.create();
	hb.registerHelper("localize", k => k);
	hb.registerPartial("stonetop.section-heading", read("templates/actor/partials/section-heading.hbs"));
	hb.registerPartial("stonetop.section-collapse", read("templates/actor/partials/section-collapse.hbs"));
	hb.registerPartial("stonetop.section-randomize", read("templates/actor/partials/section-randomize.hbs"));
	return hb.compile(MOVES_HBS)({ stonetop: { moveSections: sections } });
}

describe("the rendered moves tab", () => {
	it("puts every heading INSIDE its own move-group box", async () => {
		const html = renderMovesTab((await makeSheet().getData()).stonetop.moveSections);

		// The fold walk claims a heading's FOLLOWING SIBLINGS up to the next heading. A heading
		// that escapes its box therefore swallows every section below it, and the sheet still
		// renders perfectly until someone clicks a caret. Split on the box opening: anything
		// before the FIRST box, or between a box's close and the next box's open, is a heading
		// that got out.
		const chunks = html.split(/<div class="stonetop-move-group"/);
		expect(chunks).toHaveLength(4);                       // preamble + 3 boxes
		expect(chunks[0]).not.toContain("stonetop-move-group-title");
		for (const chunk of chunks.slice(1)) {
			expect((chunk.match(/stonetop-move-group-title/g) ?? [])).toHaveLength(1);
			expect((chunk.match(/<ol class="items-list">/g) ?? [])).toHaveLength(1);
			// The heading must come FIRST inside the box, ahead of the list it folds.
			expect(chunk.indexOf("stonetop-move-group-title")).toBeLessThan(chunk.indexOf("<ol"));
		}
	});

	it("gives each heading a caret named for its own section", async () => {
		const html = renderMovesTab((await makeSheet().getData()).stonetop.moveSections);
		const ids = [...html.matchAll(/class="stonetop-section-collapse" data-section="([^"]+)"/g)].map(m => m[1]);
		expect(ids).toEqual(["gmMovesBasic", "gmMovesExploration", "gmMovesHomefront"]);
	});

	it("renders every move, name and gloss", async () => {
		const html = renderMovesTab((await makeSheet().getData()).stonetop.moveSections);
		expect(html.match(/stonetop-gm-move"/g)).toHaveLength(30);
		expect(html).toContain("Announce trouble (future or offscreen)");
		expect(html).toContain("Bar the way");
		expect(html).toContain("Play them against each other");
		// One gloss carries double quotes; Handlebars escapes them, which is correct and must
		// not be "fixed" into a triple-stache.
		expect(html).toContain("&quot;If you do that, you realize ___, right?&quot;");
	});
});

// The entries are deliberately NOT the bordered card the rest of the system sets a move in:
// they are a two-column reference list, each entry a name with its gloss on the line below.
// The panel still wears `.tab.moves`, so the card chrome comes with it and has to be undone
// rule for rule at the foot of stonetop.css.
//
// Every failure here is SILENT: the moves still render and still read, they just quietly turn
// back into a variable number of columns of boxes, or start handing an entry's gloss to the
// top of the next column where it reads as belonging to a different move.
describe("the Moves tab is a two-column reference list, not a card list", () => {
	const bodyOf = selector => {
		const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		return CSS.match(new RegExp(`\\n${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
	};

	// The shared rule sets a column WIDTH (240px) as well as a count, and when both are
	// declared the used count is the SMALLER of the two. Override only the count and the list
	// still reads as two columns at the default width, then silently collapses to one as soon
	// as the frame is narrowed past 2×240px.
	it("fixes the list at two columns, at every width", () => {
		const list = bodyOf(".stonetop-gm-toolkit-moves .stonetop-move-group .items-list");
		expect(list, "no override for the shared column layout").toMatch(/column-count:\s*2/);
		expect(list, "the shared 240px column-width would cap the count on a narrow frame")
			.toMatch(/column-width:\s*initial/);
	});

	// One line down the middle, drawn by the container. Painted per-entry instead it would stop
	// and restart at every hairline.
	it("divides the two columns with a column rule", () => {
		expect(bodyOf(".stonetop-gm-toolkit-moves .stonetop-move-group .items-list"))
			.toMatch(/column-rule:\s*1px/);
	});

	// An entry wears its OWN classes, not the shared move card's with the chrome unset again.
	// Wearing `stonetop-item` cost thirteen declarations of `border: none` / `background: none`
	// / `display: block` to arrive at two lines of text, and left every future edit to the
	// shared card free to leak a border or a fill in here with nothing failing.
	it("dresses an entry as a reference line, not as an un-carded card", () => {
		expect(MOVES_HBS).toContain('<li class="stonetop-gm-move">');
		expect(MOVES_HBS).toContain('class="stonetop-gm-move-name"');
		expect(MOVES_HBS).toContain('class="stonetop-gm-move-gloss"');
		// Asserted against the emitted CLASS ATTRIBUTES, not the file text: the header comment
		// above names the classes this tab used to wear, and a plain substring search would
		// read the explanation as the thing it explains.
		const worn = [...MOVES_HBS.matchAll(/class="([^"]*)"/g)].flatMap(m => m[1].split(/\s+/));
		for (const cardClass of ["stonetop-item", "stonetop-item-header", "stonetop-item-name",
			"stonetop-item-description"]) {
			expect(worn, `entries still wear ${cardClass}`).not.toContain(cardClass);
		}
		// ...and with the classes gone, so is every declaration that existed to undo them.
		const entry = bodyOf(".stonetop-gm-toolkit-moves .stonetop-gm-move");
		expect(entry).not.toMatch(/border:\s*none/);
		expect(entry).not.toMatch(/background:\s*none/);
		expect(entry).not.toMatch(/max-width:\s*none/);
	});

	it("rules between entries", () => {
		expect(bodyOf(".stonetop-gm-toolkit-moves .stonetop-gm-move")).toMatch(/border-bottom:\s*1px/);
	});

	// A name and its gloss are one entry. Let the column break fall inside one and the gloss
	// lands at the top of the RIGHT column, under a different move's name, reading as that
	// move's gloss. Nothing about that looks broken enough to notice.
	it("keeps a move's name and its gloss together at the column break", () => {
		expect(bodyOf(".stonetop-gm-toolkit-moves .stonetop-gm-move"))
			.toMatch(/break-inside:\s*avoid/);
	});

	// Only the DOM-last entry is `:last-child`, and it sits at the foot of the RIGHT column —
	// so an exception there would close one column with a hairline and the other without, at
	// the same height, side by side.
	it("rules every entry, with no :last-child exception", () => {
		expect(CSS).not.toContain(".stonetop-gm-toolkit-moves .stonetop-gm-move:last-child");
	});

	// These entries are not a character's move cards, but they are the same voice on the same
	// screen, so they take the sheet's own face rather than whatever Foundry hands a bare <li>.
	it("keeps both halves on the system font", () => {
		expect(CSS).toMatch(
			/\.stonetop-gm-move-name,\s*\.stonetop-gm-move-gloss,[\s\S]{0,240}?font-family:\s*var\(--font-stonetop\)/);
	});

	// The gloss hangs on the same left edge as the name it belongs to: that shared edge is what
	// a GM scanning the list runs their eye down.
	it("hangs the gloss on the same left edge as its name", () => {
		expect(bodyOf(".stonetop-gm-toolkit-moves .stonetop-gm-move-gloss"))
			.not.toMatch(/padding-left:\s*[1-9]/);
	});
});

// The die beside each heading's note. What it DOES is tested in random-gm-move.test.js; this
// is the wiring, every leg of which fails silently: a button with no section key draws from
// nothing, an unregistered partial throws only on first render, and a heading control that
// forgets `stonetop-section-heading-control` is left hanging on a folded section.
describe("the move randomizer", () => {
	const RANDOMIZE_HBS = read("templates/actor/partials/section-randomize.hbs");
	const HEADING_HBS   = read("templates/actor/partials/section-heading.hbs");

	it("puts one on each of the three headings, keyed to its own section", async () => {
		const html = renderMovesTab((await makeSheet().getData()).stonetop.moveSections);
		// Whitespace-tolerant: the partial breaks its attributes across two lines, and a negated
		// character class spans that newline where a literal space would not.
		const keys = [...html.matchAll(/<button[^>]*stonetop-section-randomize[^>]*data-section="([^"]+)"/g)].map(m => m[1]);
		expect(keys).toEqual(["basic", "exploration", "homefront"]);
	});

	// The button sits after the note and before the fold caret, which is what "beside the
	// description" means on this line. The caret is absolutely positioned at the heading's
	// right edge, so it is not competing for the space.
	it("sits right after the heading's note", async () => {
		const html = renderMovesTab((await makeSheet().getData()).stonetop.moveSections);
		const note = html.indexOf("Any time you owe the table a move");
		const die  = html.indexOf("stonetop-section-randomize");
		const caret = html.indexOf("stonetop-section-collapse");
		expect(note).toBeLessThan(die);
		expect(die).toBeLessThan(caret);
	});

	// section-editing.js finds heading-resident controls by this ONE class and hides them with
	// the section. A control that forgets it stays visible on a collapsed heading.
	it("folds away with its section", () => {
		expect(RANDOMIZE_HBS).toContain("stonetop-section-heading-control");
	});

	// Optional, so the dozens of other callers of the shared heading partial are untouched.
	it("is emitted only when a caller asks for it", () => {
		expect(HEADING_HBS).toMatch(/\{\{#if randomize\}\}/);
		const rendered = (() => {
			const hb = Handlebars.create();
			hb.registerPartial("stonetop.section-randomize", RANDOMIZE_HBS);
			return hb.compile(HEADING_HBS)({ title: "Plain", note: "no die here" });
		})();
		expect(rendered).not.toContain("stonetop-section-randomize");
	});

	// A partial with no map entry throws "partial could not be found" on the first render of
	// every sheet that heads a section, not just this one.
	it("registers its partial, at a path that exists", () => {
		const entry = STONETOP_JS.match(/"stonetop\.section-randomize":\s*"([^"]+)"/);
		expect(entry, "no preload entry for the randomize partial").toBeTruthy();
		expect(repoFileExists(entry[1].replace("systems/stonetop-pwd/", "")), `${entry[1]} does not exist`).toBe(true);
	});

	// A real <button>, so Enter and Space fire it with no keydown handler of our own. An <a> or
	// a <span> here would be mouse-only, and nothing about that shows up on screen.
	it("is a button, not an anchor", () => {
		expect(RANDOMIZE_HBS).toMatch(/<button type="button"/);
	});

	it("hands the sheet the click, and holds the draw to exclude next time", () => {
		const src = stripComments(SHEET_JS);
		expect(src).toContain("_wireToolkitButtons(html[0])");
		expect(src).toMatch(/closest\("\.stonetop-section-randomize"\)/);
		// The no-repeat only works if the drawn move is kept and passed back as `exclude`.
		expect(src).toMatch(/exclude:\s*this\._lastRandomMove\[key\]/);
		expect(src).toMatch(/this\._lastRandomMove\[key\]\s*=\s*move\.name/);
	});
});

describe("the GM Toolkit is registered on all three legs", () => {
	it("declares the actor subtype in the manifest", () => {
		expect(JSON.parse(SYSTEM_JSON).documentTypes.Actor).toHaveProperty("gmToolkit");
	});

	// Whitespace-tolerant: that assignment block is COLUMN-ALIGNED in stonetop.js, so adding any
	// Actor subtype with a longer key re-pads this line. Pinning the exact spacing would fail on
	// a change that is purely cosmetic.
	it("binds a data model, so actor.system is validated rather than a raw object", () => {
		expect(STONETOP_JS).toMatch(/CONFIG\.Actor\.dataModels\.gmToolkit\s*=\s*GmToolkitModel;/);
		// And the model is a real TypeDataModel, which is the claim the line above only implies.
		// Read as source: importing it would evaluate `extends foundry.abstract.TypeDataModel`
		// at module load, and tests/setup.js provides no `foundry.abstract`.
		const model = read("module/data-models/GmToolkitModel.js");
		expect(model).toMatch(/export class GmToolkitModel extends foundry\.abstract\.TypeDataModel/);
		expect(model).toMatch(/static defineSchema\(\)/);
	});

	// `makeDefault: false` is the silent one: the type still exists, still opens, and gets core's
	// base ActorSheet instead. No rail, no moves, no error.
	it("binds the sheet to the subtype, as the default sheet for it", () => {
		expect(STONETOP_JS).toMatch(/Actors\.registerSheet\(SYSTEM_ID, StonetopGmToolkitSheet, \{[^}]*types:\s*\["gmToolkit"\]/);
		expect(STONETOP_JS).toMatch(/Actors\.registerSheet\(SYSTEM_ID, StonetopGmToolkitSheet, \{[^}]*makeDefault:\s*true/);
	});

	// A partial with no map entry throws "partial could not be found" on first render. A partial
	// with a map entry pointing at a file that is not there throws identically, and is the more
	// likely typo, so check the VALUE and not just the key.
	it("preloads the moves partial, from a path that exists", () => {
		const entry = STONETOP_JS.match(/"stonetop\.gm-toolkit-tab-moves":\s*"([^"]+)"/);
		expect(entry, "no preload entry for the moves partial").toBeTruthy();
		expect(repoFileExists(entry[1].replace("systems/stonetop-pwd/", "")), `${entry[1]} does not exist`).toBe(true);
		// Both halves of the handshake: the map key and the name the sheet actually invokes.
		expect(SHEET_HBS).toContain('"stonetop.gm-toolkit-tab-moves"');
	});

	// Absent, the type dropdown and sheet-config show the raw key.
	it("has a display label", () => {
		expect(game.i18n.localize("TYPES.Actor.gmToolkit")).toBe("GM Toolkit");
	});

	// The sidebar's Create Actor is hijacked into our own picker (StonetopActor.createDialog),
	// so a type missing from ACTOR_OPTIONS cannot be made from the UI at all.
	it("is offered to the GM, and only to the GM", () => {
		expect(actorOptionsFor(true).map(o => o.id)).toContain("gmToolkit");
		expect(actorOptionsFor(false).map(o => o.id)).not.toContain("gmToolkit");
	});
});

describe("things that break silently", () => {
	// The rail IS this sheet's only nav, so a guarded call deletes the tabs outright. It is
	// also the cleanup path that sweeps stale rails off the frame between renders.
	it("mounts the tab rail unconditionally", () => {
		const call = SHEET_JS.indexOf("mountTabRail(this, html)");
		expect(call).toBeGreaterThan(-1);
		expect(stripComments(SHEET_JS.slice(call - 160, call))).not.toMatch(/isClassicLayout|classicLayout/);
	});

	// The frost watcher binds against the FRAME and needs the rail already lifted there.
	it("mounts the scroll frost after the rail, not before", () => {
		expect(SHEET_JS.indexOf("mountScrollFrost(this, html)"))
			.toBeGreaterThan(SHEET_JS.indexOf("mountTabRail(this, html)"));
	});

	// Modern only. There is no classic variant of this sheet and no `classicLayoutGmToolkit`
	// setting; a branch added here would read a key that is never registered and always answer
	// "modern", which is a dead code path that looks like a working toggle.
	it("carries no classic-layout branch", () => {
		const src = stripComments(SHEET_JS);
		expect(src).not.toMatch(/layoutClasses|stampLayoutClass|isClassicLayout/);
		expect(stripComments(SHEET_HBS)).not.toContain("classicLayout");
		expect(stripComments(MOVES_HBS)).not.toContain("classicLayout");
	});

	// tab-rail.js measures `.stonetop-sheet-header, .steading-header` inside the form to place
	// the rail, and bails silently if neither is found, dropping it to a flat 150px fallback.
	it("renders the header block the rail measures itself against", () => {
		expect(SHEET_HBS).toContain("stonetop-sheet-header");
	});

	// AppV1 hands activateListeners the form root; a second top-level element makes html[0]
	// the wrong node.
	//
	// Checked as the document's opening and closing tag rather than by counting lines that
	// START with `<`. That line-based count was wrong in both directions: a stray sibling
	// indented under `</form>` still counted as one root and passed, while merely indenting
	// `<form>` itself counted as zero and failed on a change that runs fine.
	it("has exactly one top-level element", () => {
		const body = stripComments(SHEET_HBS).trim();
		expect(body.startsWith("<form")).toBe(true);
		expect(body.endsWith("</form>")).toBe(true);
	});

	// `.tab.moves` + `.stonetop-move-group` is what earns this panel its tab padding, the 14px
	// gap between move groups and the fold caret's box — all three written against that pair.
	// (The card chrome the same pair brings is undone deliberately; see the glossary block
	// below.) `data-tab="moves"` is a separate mechanism that happens to share the word: it is
	// what earns the rail's move glyph from the flat icon table in stonetop.css.
	it("is a .tab.moves panel, so the tab padding and group rules reach it", () => {
		expect(MOVES_HBS).toContain('<div class="tab moves"');
		expect(MOVES_HBS).toContain('class="stonetop-move-group"');
	});

	// An unlayered `display` on the `.tab` element itself beats core's layered
	// `.tab { display: none }`, and the panel then shows on every tab at once.
	it("keeps its layout class off the .tab element", () => {
		expect(MOVES_HBS).toMatch(/<section class="sheet-tab stonetop-gm-toolkit-moves">/);
		expect(MOVES_HBS).not.toMatch(/<div class="tab[^"]*stonetop-gm-toolkit-moves/);
	});

	// The fold walk claims a heading's FOLLOWING SIBLINGS until the next heading, so three
	// headings in one flat run would let the first caret swallow the two below it.
	it("boxes each move section in its own group wrapper", () => {
		const groups = MOVES_HBS.match(/class="stonetop-move-group"/g) ?? [];
		expect(groups).toHaveLength(1);
		// One wrapper inside the {{#each}}, which is what makes it one box per section.
		expect(MOVES_HBS.indexOf("{{#each stonetop.moveSections}}"))
			.toBeLessThan(MOVES_HBS.indexOf('class="stonetop-move-group"'));
	});
});
