// The onboarding's last page lists the earlier pages the player Skipped past unfinished. A flag,
// never a block: Create Character stays live (gated only on the last page's own answers), and each
// listed name jumps back to its page.

import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import Handlebars from "handlebars";
import { CharacterOnboardingDialog } from "../../../module/actors/character/dialogs/CharacterOnboardingDialog.js";

const HBS = fs.readFileSync(path.join(process.cwd(), "templates", "dialogs", "character-onboarding.hbs"), "utf8");
const footer = Handlebars.compile(HBS.match(/<footer class="stonetop-onboarding-footer">[\s\S]*?<\/footer>/)[0]);

function dialogAt(steps, step, unfinished) {
	const dialog = Object.create(CharacterOnboardingDialog.prototype);
	dialog._steps = steps;
	dialog._step = step;
	dialog._isStepAnsweredForResume = stepType => !unfinished.includes(stepType);
	dialog._resolveLoreSection = () => undefined;
	return dialog;
}

const STEPS = ["background", "instinct", "appearance", "origin", "stats", "possession", "moves"];

describe("the pages skipped unfinished", () => {
	it("names each earlier page left unfinished, in order, with its index", () => {
		const dialog = dialogAt(STEPS, 6, ["instinct", "stats"]);
		expect(dialog._skippedRequiredSteps()).toEqual([
			{ index: 1, label: "Instinct" },
			{ index: 4, label: "Stats" },
		]);
	});

	it("leaves out the page the player is on", () => {
		expect(dialogAt(STEPS, 6, ["moves"])._skippedRequiredSteps()).toEqual([]);
	});

	it("names the non-question pages by their page titles", () => {
		const dialog = dialogAt(STEPS, 6, ["origin", "possession"]);
		expect(dialog._skippedRequiredSteps().map(s => s.label)).toEqual(["Origin & Name", "Special Possessions"]);
	});
});

describe("jumping back to a skipped page", () => {
	it("goes straight to that page, without the Next gate", () => {
		const dialog = dialogAt(STEPS, 6, ["instinct"]);
		dialog._clearPopups = vi.fn();
		dialog.render = vi.fn();
		dialog._jumpToStep(1);
		expect(dialog._step).toBe(1);
		expect(dialog.render).toHaveBeenCalledWith(false);
	});

	it("ignores an index that is not a page", () => {
		const dialog = dialogAt(STEPS, 6, []);
		dialog._clearPopups = vi.fn();
		dialog.render = vi.fn();
		dialog._jumpToStep(NaN);
		dialog._jumpToStep(99);
		expect(dialog._step).toBe(6);
		expect(dialog.render).not.toHaveBeenCalled();
	});
});

describe("the last page's footer", () => {
	it("lists the skipped pages as jump buttons and keeps Create Character live", () => {
		const html = footer({
			isLast: true, stepComplete: true, stepNumber: 7, stepCount: 7,
			skippedSteps: [{ index: 1, label: "Instinct" }, { index: 4, label: "Stats" }],
		});
		expect(html).toContain('data-step-index="1">Instinct</button>');
		expect(html).toContain('data-step-index="4">Stats</button>');
		expect(html).toMatch(/<button type="button" class="stonetop-onboarding-confirm" >Create Character/);
	});

	it("shows no list when nothing was skipped", () => {
		const html = footer({ isLast: true, stepComplete: true, skippedSteps: [] });
		expect(html).not.toContain("stonetop-onboarding-skipped");
	});
});
