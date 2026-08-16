import Handlebars from "handlebars";
import { describe, it, expect } from "vitest";
import { readRepo as read, readCss } from "../../fakes/css.js";
import { GM_DIAGRAMS, gmDiagrams } from "../../../module/gm-toolkit/gm-diagrams.js";
import { GM_CORE_LOOP, GM_FLOW_OF_PLAY } from "../../../module/gm-toolkit/gm-loop-text.js";
import { BOOK2_ART_APPLY_MANIFEST } from "../../../module/book2-art/manifest.js";
import { DURABLE_ART_DIRS } from "../../../module/book2-art/browse.js";
import { ART_INDEX_SETTINGS } from "../../../module/book2-art/reapply.js";

// The GM Toolkit's Core Loop tab, and the chain that feeds it.
//
// The two flowcharts are the publisher's artwork, so nothing ships: a world only has them after
// the GM runs Import Book Art against their own GM playbook PDF. Four separate things have to
// agree on the same two slugs and the same folder for a picture to reach the tab — the extraction
// manifest, the browse directory list, the published index, and the tab's own lookup — and every
// way they can disagree fails SILENTLY, with an empty tab that looks exactly like "not imported
// yet". So most of this file pins the joins rather than the rendering.


const SHEET_JS  = read("module/actors/gmtoolkit/StonetopGmToolkitSheet.js");
const SHEET_HBS = read("templates/actor/gm-toolkit.hbs");
const LOOP_HBS  = read("templates/actor/partials/gm-toolkit-tab-loop.hbs");
const STONETOP_JS = read("stonetop.js");
const SETTINGS_JS = read("module/settings.js");
const CSS       = readCss();

/** Stub just enough of game.settings for the guarded index read. Mirrors treasure-drops.test.js. */
const withSettings = (values, fn) => {
	const prev = globalThis.game;
	globalThis.game = values === null ? undefined : {
		settings: {
			settings: new Map(Object.keys(values).map(k => [`stonetop-pwd.${k}`, {}])),
			get: (ns, key) => values[key],
		},
		// gm-diagrams localizes its captions; without this they come back as raw keys, which is
		// a fine fallback but makes the caption assertions below say nothing.
		i18n: prev?.i18n,
	};
	try { return fn(); } finally { globalThis.game = prev; }
};

describe("the GM playbook diagrams", () => {
	it("names the two the playbook's last spread prints, in its order", () => {
		expect(GM_DIAGRAMS.map(d => d.slug)).toEqual(["core-loop", "flow-of-play"]);
	});

	// The single most breakable join in the feature: the extraction manifest names the file, the
	// index is keyed by the row's slug, and this table looks the slug up. A rename on either side
	// leaves a world that imported both diagrams showing two placeholders.
	it("uses the same slugs the extraction manifest publishes", () => {
		expect(BOOK2_ART_APPLY_MANIFEST.gmDiagrams.map(d => d.slug))
			.toEqual(GM_DIAGRAMS.map(d => d.slug));
	});

	// The macro writes into assets/diagrams; reapply can only republish an index for a directory
	// it actually browses. Miss this and the tab works right after an import and goes blank on the
	// next world load, when the authoritative refresh computes {} and clears it.
	it("writes into a folder the durable-art browse actually lists", () => {
		for (const d of BOOK2_ART_APPLY_MANIFEST.gmDiagrams) {
			expect(DURABLE_ART_DIRS.some(dir => d.out.startsWith(`${dir}/`)), d.out).toBe(true);
		}
	});

	// Writing an art index has to bust the browse cache, and that hook reads this one list.
	it("declares its index alongside the other document-less art indexes", () => {
		expect(ART_INDEX_SETTINGS).toContain("gmDiagramArt");
		expect(SETTINGS_JS).toContain('game.settings.register(SYSTEM_ID, "gmDiagramArt"');
		expect(SETTINGS_JS).toMatch(/"gmDiagramArt",\s*\{[^}]*scope:\s*"world"/s);
	});

	it("resolves an imported diagram against the durable art root", () => {
		const rows = withSettings({
			gmDiagramArt: { "core-loop": "assets/diagrams/core-loop.webp" },
			book2ArtRoot: "stonetop-book-art",
		}, () => gmDiagrams());
		expect(rows.find(r => r.slug === "core-loop").src)
			.toBe("stonetop-book-art/assets/diagrams/core-loop.webp");
	});

	// The index carries the path, and nothing re-derives one from the slug — the same contract
	// treasure-drops.js keeps, so a file that moves stays reachable.
	it("uses the path the index carries rather than one built from the slug", () => {
		const rows = withSettings({ gmDiagramArt: { "core-loop": "assets/diagrams/moved/other.png" } },
			() => gmDiagrams());
		expect(rows.find(r => r.slug === "core-loop").src)
			.toBe("stonetop-book-art/assets/diagrams/moved/other.png");
	});

	// A partly-imported world is the interesting one: both entries still come back, so the tab
	// can say WHICH diagram is missing instead of quietly looking complete with one figure.
	it("returns every diagram either way, with a null src for the ones not on disk", () => {
		const rows = withSettings({ gmDiagramArt: { "core-loop": "assets/diagrams/core-loop.webp" } },
			() => gmDiagrams());
		expect(rows).toHaveLength(2);
		expect(rows.find(r => r.slug === "flow-of-play").src).toBeNull();
	});

	it("survives a world with no index registered at all", () => {
		const rows = withSettings({}, () => gmDiagrams());
		expect(rows.map(r => r.src)).toEqual([null, null]);
		expect(rows.every(r => r.caption && r.note)).toBe(true);
	});

	it("localizes its captions rather than handing the template raw keys", () => {
		const rows = withSettings({}, () => gmDiagrams());
		expect(rows.find(r => r.slug === "core-loop").caption).toBe("The core loop");
		expect(rows.find(r => r.slug === "flow-of-play").caption).toBe("The flow of play");
	});

	// What the pictures SAY, which is rules text (Book I p.169) and not artwork. This is the half
	// of the tab that renders in every world, so a GM who has not run the import meets the
	// procedure rather than an apology for not having a picture of it.
	describe("as text", () => {
		it("carries both charts, whether or not the art was ever imported", () => {
			const rows = withSettings({}, () => gmDiagrams());
			expect(rows.every(r => r.src === null)).toBe(true);
			expect(rows.find(r => r.slug === "core-loop").steps).toHaveLength(GM_CORE_LOOP.length);
			expect(rows.find(r => r.slug === "flow-of-play").steps).toHaveLength(GM_FLOW_OF_PLAY.length);
		});

		// Five numbered steps that cycle. Step 4 is the game's whole GM-facing procedure, and the
		// 6- branch is the line a GM checks when they are not sure they owe the table a move.
		it("keeps the core loop's five steps in the book's order", () => {
			expect(GM_CORE_LOOP.map(s => s.name)).toEqual([
				"Establish the situation",
				"Make a soft GM move",
				"Ask \"What do you do?\"",
				"Resolve their actions",
				"Repeat",
			]);
			expect(GM_CORE_LOOP[3].items.join(" ")).toContain("roll a 6-");
			expect(GM_CORE_LOOP[3].items.join(" ")).toContain("hard GM move");
		});

		// The flow chart is an index as much as a map: each stage names the chapter that runs it.
		it("cites the chapter behind every stage of the flow of play", () => {
			for (const stage of GM_FLOW_OF_PLAY) {
				expect(stage.page, `${stage.name} names no chapter`).toBeGreaterThan(0);
			}
			const rows = withSettings({}, () => gmDiagrams());
			const flow = rows.find(r => r.slug === "flow-of-play");
			expect(flow.steps[0].pageRef).toBe("Book I, page 251");
			// The core loop's five steps are one page of one chapter, which the heading already
			// names, so they carry no citation of their own.
			expect(rows.find(r => r.slug === "core-loop").steps.every(s => !s.pageRef)).toBe(true);
		});

		// Numbering the flow of play would promise an order it doesn't have: a game goes from
		// downtime to crisis and back without passing through an expedition.
		it("numbers the loop and not the stages", () => {
			const rows = withSettings({}, () => gmDiagrams());
			expect(rows.find(r => r.slug === "core-loop").numbered).toBe(true);
			expect(rows.find(r => r.slug === "flow-of-play").numbered).toBe(false);
			expect(LOOP_HBS).toContain('{{#unless numbered}} stonetop-gm-loop--stages{{/unless}}');
		});

		// A modifier that sorts BEFORE its base loses to it at equal specificity, so the stages
		// would silently take the numbered list's decimal marker and indent.
		it("declares the stages modifier after the list it modifies", () => {
			expect(CSS.indexOf(".stonetop-gm-loop {"))
				.toBeLessThan(CSS.indexOf(".stonetop-gm-loop--stages {"));
		});
	});
});

describe("the Core Loop tab", () => {
	// Each of these is a silent failure on its own: an unregistered partial renders nothing, a
	// missing include leaves the rail button pointing at a panel that does not exist, and a
	// data-tab with no icon row paints a solid block where the glyph belongs.
	it("is registered, mounted, and has a rail button", () => {
		expect(STONETOP_JS).toContain('"stonetop.gm-toolkit-tab-loop"');
		expect(SHEET_HBS).toContain('{{> "stonetop.gm-toolkit-tab-loop"}}');
		expect(SHEET_HBS).toMatch(/\{\{>\s*"stonetop\.tab-rail-item"\s+tab="loop"/);
	});

	it("binds to the same tab group as the rest of the sheet", () => {
		expect(LOOP_HBS).toMatch(/<div class="tab loop"[^>]*data-group="primary"/);
		expect(LOOP_HBS).toContain('data-tab="loop"');
	});

	it("earns a rail glyph from the icon table", () => {
		expect(CSS).toMatch(/\.stonetop-tab-rail \.item\[data-tab="loop"\]\s*\{\s*--st-tab-icon:/);
	});

	// The rail is icon-only, so a tab with no label has no name anywhere on screen.
	it("has a localized name", () => {
		expect(game.i18n.localize("stonetop.gmToolkit.tabs.loop")).toBe("Core Loop");
	});

	it("gets its panel gutter from the shared tab-padding rule", () => {
		expect(CSS).toContain(":is(.tab.moves, .tab.loop, .tab.threats, .tab.sites)");
	});

	// Core's `body.game .app img` paints a 1px black border on every image inside a sheet, so a
	// border here is not decoration — leaving it off means wearing that one.
	it("declares its own image border rather than inheriting core's black one", () => {
		expect(CSS).toMatch(/\.stonetop-gm-diagram-img\s*\{[^}]*border:\s*1px solid/s);
	});

	it("puts the diagrams in the sheet context", () => {
		expect(SHEET_JS).toContain("context.stonetop.diagrams = gmDiagrams();");
	});

	// The placeholder's button is the only route from "I didn't know these existed" to having
	// them, so it has to actually launch the macro.
	it("offers the import macro from the placeholder, GM-only", () => {
		expect(LOOP_HBS).toContain("stonetop-gm-diagram-import");
		// `@root` is load-bearing: inside {{#each}} the context is the diagram, so a bare
		// `stonetop.isGM` finds nothing and the button silently never renders — which looks
		// exactly like the GM-only guard working.
		expect(LOOP_HBS).toContain("{{#if @root.stonetop.isGM}}");
		expect(SHEET_JS).toContain("runImportBookArtMacro()");
	});

	// The bug the `@root` fix was for, asserted on the render rather than on the source: the
	// placeholder has to actually carry a button for a GM, and not carry one for a player.
	it("renders the import button in the gap, for a GM and only a GM", () => {
		// The template calls `localize`; without it Handlebars throws on the first caption.
		const hb = Handlebars.create();
		hb.registerHelper("localize", key => game.i18n.localize(key));
		const tpl = hb.compile(LOOP_HBS);
		const ctx = isGM => ({ stonetop: { isGM, diagrams: [
			{ slug: "core-loop", caption: "The core loop", note: "n", src: "art/core-loop.webp" },
			{ slug: "flow-of-play", caption: "The flow of play", note: "n", src: null },
		] } });

		const asGM = tpl(ctx(true));
		expect(asGM).toContain("stonetop-gm-diagram-import");
		expect(asGM).toContain('src="art/core-loop.webp"');       // the imported one still draws
		expect(asGM.match(/stonetop-gm-diagram-missing/g)).toHaveLength(1); // only the absent one

		expect(tpl(ctx(false))).not.toContain("stonetop-gm-diagram-import");
	});
});
