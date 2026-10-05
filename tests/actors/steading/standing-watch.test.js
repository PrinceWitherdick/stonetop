import { describe, it, expect } from "vitest";
import { readRepo as read } from "../../fakes/css.js";
import { IMPROVEMENT_GRANTS, WATCH_SEASON_STEP } from "../../../module/actors/steading/StonetopSteading.js";
import { upkeepStepKey, upkeepsDue } from "../../../module/actors/steading/improvement-rules.js";
import { builtInImprovementRules } from "../../../module/actors/steading/StonetopSteading.js";

// Standing Watch: "At the start of each season, the watch consumes 1 Surplus or it disbands."
//
// EVERY season, unlike the herd's summer/winter steps, and a genuine choice rather than a
// failure state: a steading that would rather keep the Surplus can let the watch go.

const SHEET = read("module/actors/steading/StonetopSteadingSheet.js");
const STEADING = read("module/actors/steading/StonetopSteading.js");

describe("the Standing Watch seasonal upkeep", () => {
	// The watch's upkeep is its `upkeep` grant, read off the improvements in force, so it is owed
	// only once the watch has been raised, and in every season.
	it("only appears once the watch has actually been raised", () => {
		expect(IMPROVEMENT_GRANTS.standingWatch.upkeep).toEqual({ seasons: ["spring", "summer", "autumn", "winter"], surplus: 1 });
		for (const season of ["spring", "summer", "autumn", "winter"]) {
			expect(upkeepsDue(builtInImprovementRules(["standingWatch"]), season).map(u => u.slug), season).toEqual(["standingWatch"]);
			expect(upkeepsDue(builtInImprovementRules([]), season), season).toEqual([]);
		}
		expect(SHEET).toContain("const upkeeps = upkeepsDue(rules, seasonId);");
		expect(SHEET).toContain("const watchBlock = upkeeps.filter(u => u.start)");
	});

	// The herd's steps are summer/winter only; this one is not. The watch block is its own step
	// ONCE, in the steps every season shares, outside the four-way branch on the season, which is
	// what makes it unconditional. And it comes BEFORE the season's own steps: "at the start of
	// each season", so in winter it is fed (or not) before the consumption roll, not after.
	it("rides every season's flow, at the start of the season", () => {
		const branch = SHEET.indexOf("let seasonSteps;");
		const shared = SHEET.indexOf("const steps = [", branch);
		expect(branch).toBeGreaterThan(-1);
		expect(shared).toBeGreaterThan(branch);
		// All four seasons assign their own steps, and none of them mentions the watch.
		const seasons = SHEET.slice(branch, shared);
		expect(seasons.match(/seasonSteps = \[/g) ?? []).toHaveLength(4);
		expect(seasons).not.toContain("watchBlock");
		const tail = SHEET.slice(shared, shared + 400);
		expect(tail).toContain("...seasonSteps");
		expect(tail).toMatch(/step\("start",[^\n]*watchBlock/);
		expect(tail.indexOf("watchBlock")).toBeLessThan(tail.indexOf("...seasonSteps"));
		expect(tail).not.toMatch(/step\("costs",[^\n]*watchBlock/);
	});

	it("offers both outcomes, and hides feeding when there is nothing to feed it with", () => {
		const at = SHEET.indexOf("const upkeepHtml = due =>");
		expect(at).toBeGreaterThan(-1);
		const block = SHEET.slice(at, at + 1400);
		expect(block).toContain("const short = surplus < due.surplus;");
		expect(block).toContain(`data-action="pay-upkeep"`);
		expect(block).toContain(`data-action="lose-upkeep"`);
		const copy = SHEET.slice(SHEET.indexOf("function upkeepCopy("), SHEET.indexOf("function upkeepCopy(") + 900);
		expect(copy).toContain("Feed the watch (");
		expect(copy).toContain(`lose: "Disband the watch"`);
	});

	// One step key for both buttons: answering the season's question either way closes it, so
	// a close+reopen can't feed the watch twice, nor feed it after disbanding it.
	it("settles one shared season step whichever way the table answers", () => {
		const at = SHEET.indexOf("for (const due of upkeeps)");
		expect(at).toBeGreaterThan(-1);
		const block = SHEET.slice(at, at + 3400);
		// Both answers close the SAME key: paying closes it inside the one spendSurplus write,
		// losing it inside the un-completion's own write (B8: as two writes, a failed second left
		// the watch gone and the season open). The watch's key is the one it was always stamped
		// under, so a season already settled before the upkeep moved onto the grant stays settled.
		expect(block).toContain(`step: due.key, year, seasonId`);
		expect(block).toContain(`seasonStep: { step: due.key, year, seasonId }`);
		expect(block).not.toContain(`setSeasonStepApplied(due.key`);
		expect(block).toContain(`_disableIfSeasonStepDone(loseBtn, due.key`);
		expect(upkeepStepKey("standingWatch")).toBe(WATCH_SEASON_STEP);
		// The feed button's own guard lives in _wireSurplusUpkeep, which takes the same key.
		expect(SHEET).toContain("_disableIfSeasonStepDone(btn, step, year, seasonId);");
		expect(STEADING).toContain(`export const WATCH_SEASON_STEP = "standingWatch";`);
	});

	// The herd feed and the Surplus roll in this same dialog can move Surplus after the window
	// was built, so the spend re-reads rather than writing back a stale count minus one. That
	// re-read lives in StonetopSteading#spendSurplus, which every seasonal spend goes through;
	// a null answer there means it could not be afforded and nothing was written.
	it("re-reads Surplus at click time", () => {
		// The spend, the null answer and the re-lock are _wireSurplusUpkeep's — the one shape
		// all three seasonal dues go through. The watch supplies only its own two sentences and
		// the short-unlock that leaves it disbandable but not re-feedable.
		const at = SHEET.indexOf("_wireSurplusUpkeep(payBtn");
		expect(at).toBeGreaterThan(-1);
		expect(SHEET.slice(at, at + 900)).toContain("shortWarning:");
		expect(SHEET.slice(at, at + 900)).toContain("amount: due.surplus");
		const wire = SHEET.indexOf("_wireSurplusUpkeep(btn, {");
		const block = SHEET.slice(wire, wire + 900);
		expect(block).toContain("spendSurplus(amount, { ...seasonsMove, step, year, seasonId })");
		expect(block).toContain("left === null");
		const spend = STEADING.indexOf("async spendSurplus(");
		expect(spend).toBeGreaterThan(-1);
		expect(STEADING.slice(spend, spend + 400)).toContain('this.getStatValue("surplus")');
	});

	// Disbanding runs the improvement's own revert, which is what takes "Standing Watch" back
	// off the Fortifications list and keeps the grant record honest for a later re-raise.
	it("disbands through the improvement revert rather than editing the list by hand", () => {
		const at = SHEET.indexOf("loseBtn?.addEventListener");
		const block = SHEET.slice(at, at + 1100);
		expect(block).toContain(`loseImprovement(due.slug, {`);
		const lose = STEADING.slice(STEADING.indexOf("async loseImprovement("), STEADING.indexOf("async loseImprovement(") + 300);
		expect(lose).toContain("this._setImprovementCompleted(slug, false, { seasonStep, clearEntries: true })");
	});

	it("is styled, with the modifier declared after its base class", () => {
		const css = read("styles/stonetop.css");
		expect(css).toContain(".stonetop-season-btn--warn");
		// A `--mod` ties with its base on specificity, so the later rule is the one that wins.
		expect(css.indexOf(".stonetop-season-btn--warn"))
			.toBeGreaterThan(css.indexOf(".stonetop-season-btn {"));
	});
});
