import { describe, it, expect } from "vitest";
import { readRepo as read, readCss } from "../../fakes/css.js";

// The steading header's clock — the season Stonetop is in and the campaign year, beside
// the title. What it SAYS is decided by module/seasons/current-season.js (covered by
// tests/seasons/current-season.test.js); these guard the wiring around it, which is the
// part that breaks silently: a partial that was never registered renders as nothing, and
// a readout mounted inside a layout guard vanishes for half the users.

// The comments explain the very wiring being asserted, so they have to come out first or
// a guard passes on its own rationale rather than on the markup.
const stripComments = hbs => hbs.replace(/\{\{!--[\s\S]*?--\}\}/g, "");

const STEADING_HBS = stripComments(read("templates/actor/steading.hbs"));
const SEASON_HBS   = stripComments(read("templates/actor/partials/steading-header-season.hbs"));
const STONETOP_JS  = read("stonetop.js");
const SHEET_JS     = read("module/actors/steading/StonetopSteadingSheet.js");
const SPRING_JS    = read("module/dialogs/SpringBurstDialog.js");
const CSS          = readCss();

/**
 * One `<div …>` block, from its opening tag to the `</div>` that closes IT — found by
 * counting nesting rather than taking the first close, so the header's inner name block
 * doesn't end the slice early. Cut to its own boundaries, not to "everything above the
 * tabs", so the layout-guard assertion below is about the header and not about the stat
 * band and nav that follow it.
 */
function divBlock(html, openTag) {
	const start = html.indexOf(openTag);
	expect(start, openTag).toBeGreaterThan(-1);
	const re = /<div\b|<\/div>/g;
	re.lastIndex = start;
	for (let depth = 0, m; (m = re.exec(html)); ) {
		depth += m[0] === "</div>" ? -1 : 1;
		if (depth === 0) return html.slice(start, re.lastIndex);
	}
	throw new Error(`unclosed ${openTag}`);
}

/** The sheet's constant top: the title and the clock beside it, shown on every tab. */
const header = divBlock(STEADING_HBS, '<div class="steading-header">');

describe("the steading header's season clock", () => {
	it("sits in the header beside the title", () => {
		expect(header).toContain('<h1 class="steading-title">Stonetop</h1>');
		expect(header).toContain("steading-header-season");
		// After the name block, so it reads to the RIGHT of "Stonetop".
		expect(header.indexOf("steading-header-season")).toBeGreaterThan(header.indexOf("steading-title"));
	});

	it("shows in both layouts", () => {
		// The classic/modern split is what moves blocks around this sheet; the clock is part
		// of the constant top, so it must not be caught inside either guard.
		expect(header).not.toContain("classicLayout");
	});

	it("registers the partial it mounts", () => {
		expect(STEADING_HBS).toContain('{{> "stonetop.steading-header-season"');
		expect(STONETOP_JS).toContain(
			'"stonetop.steading-header-season":    "systems/stonetop-pwd/templates/actor/partials/steading-header-season.hbs"');
	});

	// A GM gets a button (it opens the setter); everyone else gets a plain div. Two
	// wrappers, ONE readout — the partial is what keeps them from drifting apart, so both
	// branches have to mount it and neither may inline the markup.
	it("gives the GM a button and everyone else plain text, over the same partial", () => {
		expect(header).toContain('{{#if stonetop.isGM}}');
		expect(header).toContain('{{#unless stonetop.isGM}}');
		expect(header.match(/\{\{> "stonetop\.steading-header-season"/g)).toHaveLength(2);
		expect(header).toContain('data-action="set-current-season"');
		expect(header.match(/<button /g), "GM button").toHaveLength(1);
	});

	it("omits the season half until one is stamped, but always names the year", () => {
		// A world that has never made the Seasons Change move has no season to name, and
		// guessing one would put a wrong season on the sheet. The year is always known.
		const guarded = SEASON_HBS.slice(SEASON_HBS.indexOf("{{#if season.season}}"), SEASON_HBS.indexOf("{{/if}}"));
		expect(guarded).toContain("season.iconSrc");
		expect(guarded).toContain("season.label");
		expect(guarded).not.toContain("season.yearLabel");
		expect(SEASON_HBS).toContain("{{season.yearLabel}}");
	});

	it("wires the GM's click to the setter, which is gated on being a GM", () => {
		expect(SHEET_JS).toContain(`html.find("[data-action='set-current-season']").on("click", () => this._onSetCurrentSeason());`);
		expect(SHEET_JS).toMatch(/async _onSetCurrentSeason\(\)\s*\{\s*\n\s*if \(!game\.user\?\.isGM\) return;/);
	});

	// The setter only writes the flag. Applying seasonal gains, resetting Fortunes and
	// writing the journal entry belong to the move; a GM correcting the header wants none
	// of them.
	it("keeps the setter clear of the move's own effects", () => {
		const setter = SHEET_JS.slice(
			SHEET_JS.indexOf("async _onSetCurrentSeason()"),
			SHEET_JS.indexOf("async _onSeasonsChange()"));
		expect(setter).not.toContain("recordSeasonsChange");
		expect(setter).not.toContain("setSystemValues");
		expect(setter).not.toContain("postSeasonsChangeReminder");
	});

	// Both places that complete a Seasons Change record the clock, or the header goes stale
	// the moment the table plays past the season it was last set to. `recordCurrentSeason` is
	// the ONE writer for both halves (the stamp and the picker's year), so a caller cannot
	// land one without the other the way the session-zero spring used to.
	it("is recorded by the move and by session zero's opening spring", () => {
		expect(SHEET_JS).toContain("await recordCurrentSeason(this.actor, seasonId, year, {");
		expect(SHEET_JS).toContain('pickerYear:  seasonId === "winter" ? year + 1 : year,');
		expect(SPRING_JS).toContain('recordCurrentSeason(getStonetopSteadingActor(), "spring", 1, { advanceOnly: true })');
	});

	// Nothing may write half the clock. Both partial writers are gone, and the sheet reaches
	// the flags only through the one function that writes them together.
	it("has no way left to write half the clock", () => {
		for (const js of [SHEET_JS, SPRING_JS]) {
			expect(js).not.toContain("stampCurrentSeason");
			expect(js).not.toContain("advanceCurrentYear");
		}
	});

	// The clock is the header's second flex item and sits directly beside the title, so the
	// name block must not claim the whole row.
	it("leaves room for itself in the header row", () => {
		const nameBlock = CSS.slice(CSS.indexOf(".steading-header-name {"));
		expect(nameBlock.slice(0, nameBlock.indexOf("}"))).not.toMatch(/flex:\s*1\s*;/);
	});
});
