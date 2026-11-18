import { describe, it, expect, vi, beforeEach } from "vitest";

// The Chronicle page and the clock are the seasons modules' own business (seasons-chronicle.test.js,
// steading-header-season.test.js); here it is only what the close-out hands them.
const { recordSeasonsChange, recordCurrentSeason } = vi.hoisted(() => ({
	recordSeasonsChange: vi.fn(async () => null),
	recordCurrentSeason: vi.fn(async () => {}),
}));
vi.mock("../../../module/seasons/seasons-chronicle.js", async importOriginal => ({
	...(await importOriginal()), recordSeasonsChange,
}));
vi.mock("../../../module/seasons/current-season.js", async importOriginal => ({
	...(await importOriginal()), recordCurrentSeason,
}));

import {
	seasonsChangeSteps, seasonsChangeHtml, gainsOverWarning, recordSeasonLabel, seasonGainNames,
	upkeepCopy, disableIfSeasonStepDone, recordSeason,
} from "../../../module/actors/steading/seasons-change-dialog.js";
import { StonetopSteading, builtInImprovementRules } from "../../../module/actors/steading/StonetopSteading.js";
import { autumnHarvest, winterConsumption } from "../../../module/actors/steading/season-effects.js";
import { upkeepsDue } from "../../../module/actors/steading/improvement-rules.js";
import { MECHANICAL_GAIN_KEYS } from "../../../module/actors/steading/seasonal-gains.js";

// The Seasons Change window's markup is built from a plain view of the steading, so every
// season's rail can be drawn and read here without a world (seasonsChangeView is the impure
// reader; seasons-change-rules.test.js and its siblings cover what it reads).

/** A view as seasonsChangeView would build it, for a steading with `built` improvements. */
function view(seasonId, { built = [], surplus = 2, year = 3, ...rest } = {}) {
	const rules = builtInImprovementRules(built);
	return {
		seasonId, year, label: seasonId, fortunes: 1, surplus, population: 0, resetFortunes: 1,
		rules, size: "village",
		harvest: autumnHarvest({ rules }),
		winterBill: winterConsumption({ population: 0, rules }),
		winterAgain: winterConsumption({ population: 0, rules, second: true }),
		yields: [], upkeeps: upkeepsDue(rules, seasonId), tactics: [],
		built: slug => built.includes(slug),
		lastWinter: `${year - 1}:winter`, winterDebtDue: null, harvestLate: false,
		...rest,
	};
}
const keys = v => seasonsChangeSteps(v).map(s => s.key);

describe("the Seasons Change window's steps", () => {
	it("walks each season's own steps, and always ends on the Chronicle", () => {
		// Spring's "What it brings" has nothing in it without an improvement, so it is left off.
		expect(keys(view("spring"))).toEqual(["roll", "chronicle"]);
		expect(keys(view("summer"))).toEqual(["roll", "brings", "chronicle"]);
		expect(keys(view("autumn"))).toEqual(["roll", "brings", "chronicle"]);
		expect(keys(view("winter"))).toEqual(["toll", "chronicle"]);
	});

	it("opens on what the book times at the season's start", () => {
		expect(keys(view("winter", { built: ["standingWatch"] }))).toEqual(["start", "toll", "chronicle"]);
		expect(keys(view("winter", { built: ["standingWatch"], harvestLate: true }))[0]).toBe("harvestLate");
		expect(keys(view("spring", { built: ["standingWatch"], winterDebtDue: { amount: 2, surplus: 1 } })).slice(0, 2))
			.toEqual(["winterEnd", "start"]);
	});

	it("adds the costs and the Inn after the season's own steps", () => {
		expect(keys(view("winter", { built: ["herdOfHorses", "inn"] }))).toEqual(["toll", "costs", "inn", "chronicle"]);
		const summer = seasonsChangeSteps(view("summer", { built: ["herdOfHorses"] }));
		expect(summer.find(s => s.key === "brings").body).toContain(`data-action="advance-herd"`);
		expect(summer.find(s => s.key === "costs")).toBeUndefined();
	});

	it("offers the militia's drill only with Surplus to pay for it, and its tactics either way", () => {
		const tactics = [{ index: 0, label: "Shield wall: hold the line" }];
		const paid = seasonsChangeSteps(view("summer", { built: ["wellTrainedMilitia"], tactics })).find(s => s.key === "costs").body;
		expect(paid).toContain(`data-action="drill-militia"`);
		expect(paid).toContain(`data-tactic="0"`);
		expect(paid).toContain(">Shield wall<");
		const broke = seasonsChangeSteps(view("summer", { built: ["wellTrainedMilitia"], tactics, surplus: 0 })).find(s => s.key === "costs").body;
		expect(broke).not.toContain(`data-action="drill-militia"`);
		expect(broke).toContain("No Surplus for the drills");
	});

	it("leaves the pay button off an upkeep the steading cannot afford", () => {
		const body = v => seasonsChangeSteps(v).find(s => s.key === "start").body;
		expect(body(view("autumn", { built: ["standingWatch"], surplus: 1 }))).toContain(`data-action="pay-upkeep"`);
		const broke = body(view("autumn", { built: ["standingWatch"], surplus: 0 }));
		expect(broke).not.toContain(`data-action="pay-upkeep"`);
		expect(broke).toContain(`data-action="lose-upkeep"`);
	});

	it("names winter's second bite as this steading rolls it", () => {
		const toll = seasonsChangeSteps(view("winter")).find(s => s.key === "toll").body;
		expect(toll).toContain(`id="stonetop-winter-step3" class="stonetop-season-later" inert>`);
		expect(toll).toContain(`must consume ${view("winter").winterAgain.formula} more Surplus`);
	});
});

describe("the window's markup", () => {
	it("shows the first step and hides the rest, with the gains count on the roll's tab alone", () => {
		const v = view("summer");
		const html = seasonsChangeHtml(v, seasonsChangeSteps(v));
		expect(html).toContain(`<section class="stonetop-season-section" data-season-tab="roll">`);
		expect(html).toContain(`<section class="stonetop-season-section" data-season-tab="brings" hidden>`);
		expect(html.match(/stonetop-season-gains-count/g)).toHaveLength(1);
		expect(html.match(/aria-current="true"/g)).toHaveLength(1);
		expect(html).toContain(`<dd data-season-stat="surplus">2</dd>`);
	});
});

describe("the gains checklist", () => {
	it("warns past the roll's picks, and says nothing within them", () => {
		expect(gainsOverWarning("summer", 2)).toBe("");
		expect(gainsOverWarning("summer", 3)).toContain("Summer's roll picks 2 on a 10+");
		expect(gainsOverWarning("spring", 1)).toBe("");
		expect(gainsOverWarning("autumn", 2)).toContain("picks 1 on a 7+");
	});

	// Tor's blessing leaves a flag behind (seasonal-gains.js), so the close-out writes it too.
	it("says the close-out applies the gains whenever a mechanical one is ticked", () => {
		expect(MECHANICAL_GAIN_KEYS).toEqual(["population", "bounty", "tor"]);
		for (const key of MECHANICAL_GAIN_KEYS) expect(recordSeasonLabel([key]), key).toContain("Apply those gains");
		expect(recordSeasonLabel(["news"])).not.toContain("Apply");
		expect(recordSeasonLabel()).toContain("Record the season &amp; close");
	});

	it("names the ticked gains for the Chronicle, and drops a key it does not know", () => {
		expect(seasonGainNames(["bounty", "nope", "tor"])).toEqual(["Unexpected bounty", "Tor's blessing"]);
	});
});

describe("upkeepCopy", () => {
	it("words a homebrew upkeep by its own season and name", () => {
		const copy = upkeepCopy({ slug: "loggingCamp", label: "Logging <Camp>", surplus: 1, seasons: ["summer"], start: false });
		expect(copy.sentence).toContain("this summer");
		expect(copy.lose).toBe("Don't pay: lose Logging &lt;Camp&gt;");
		expect(copy.lost([])).toBe("The upkeep of Logging <Camp> goes unpaid, and the steading loses it.");
	});
});

describe("disableIfSeasonStepDone", () => {
	it("disables and explains a button whose step is done, and leaves the rest alone", () => {
		const steading = { seasonStepApplied: vi.fn((step) => step === "feedHerd") };
		const done = { disabled: false, title: "" };
		expect(disableIfSeasonStepDone(steading, done, "feedHerd", 1, "winter")).toBe(true);
		expect(done).toEqual({ disabled: true, title: "Already done this season: reopening won't repeat it." });
		const open = { disabled: false, title: "" };
		expect(disableIfSeasonStepDone(steading, open, "advanceHerd", 1, "summer")).toBe(false);
		expect(open.disabled).toBe(false);
		expect(disableIfSeasonStepDone(steading, null, "feedHerd", 1, "winter")).toBe(false);
	});
});

describe("recordSeason", () => {
	beforeEach(() => vi.clearAllMocks());

	const fakeSteading = ({ lapse = null, surplus = 3 } = {}) => ({
		getStatValue: vi.fn(stat => (stat === "surplus" ? surplus : 0)),
		musterLapseChanges: vi.fn(() => lapse),
		torsBlessingFlags: vi.fn(() => ({ torsBlessing: "2:winter" })),
		applyChanges: vi.fn(async () => {}),
	});

	it("folds a lapsing muster into the gains' one write, and files the net Surplus change", async () => {
		const steading = fakeSteading({ lapse: { system: { "stats.defenses.value": 0 }, flags: { muster: null }, held: { defenses: true } } });
		const actor = { id: "s" };
		await recordSeason(steading, actor, {
			seasonId: "winter", year: 2, checkedKeys: ["bounty", "news"], notes: "An omen", fortunes: 1, initialSurplus: 1,
		});
		expect(steading.applyChanges).toHaveBeenCalledTimes(1);
		const [{ system, flags }] = steading.applyChanges.mock.calls[0];
		expect(system).toEqual({ "attributes.surplus.value": 4, "stats.defenses.value": 0 });
		expect(flags).toEqual({ muster: null });
		expect(recordSeasonsChange).toHaveBeenCalledWith({
			seasonId: "winter", year: 2, gainNames: ["Unexpected bounty", "Interesting news"], fortunes: 1, surplusChange: 3, notes: "An omen",
		});
		// Winter closes out the year, so it hands the picker the next one.
		expect(recordCurrentSeason).toHaveBeenCalledWith(actor, "winter", 2, { advanceOnly: true, pickerYear: 3 });
	});

	it("leaves the picker's year where it is for any other season", async () => {
		await recordSeason(fakeSteading(), { id: "s" }, { seasonId: "summer", year: 2, fortunes: 0 });
		expect(recordSeasonsChange).toHaveBeenCalledWith(expect.objectContaining({ surplusChange: 0, gainNames: [] }));
		expect(recordCurrentSeason).toHaveBeenCalledWith({ id: "s" }, "summer", 2, { advanceOnly: true, pickerYear: 2 });
	});
});

describe("StonetopSteading#fortunesResetTarget", () => {
	const steading = malcontent => new StonetopSteading({
		type: "stonetop", system: {},
		flags: { stonetop_pwd: { steading: { system: { attributes: { debilities: { options: { malcontent: { value: malcontent } } } } } } } },
		getFlag: () => null, setFlag: vi.fn(), update: vi.fn(),
	});

	it("is +1, or +0 while the steading is malcontent", () => {
		expect(steading(false).fortunesResetTarget()).toBe(1);
		expect(steading(true).fortunesResetTarget()).toBe(0);
	});
});
