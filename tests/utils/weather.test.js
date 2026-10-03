import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	WEATHER_SEASONS,
	CAMPAIGN_SEASON_TABLES,
	WEATHER_ROLL_PLANS,
	getWeatherSeason,
	resolveWeatherRow,
	rowRange,
	weatherSeasonForCampaignSeason,
	defaultWeatherSeason,
	weatherRollPlan,
	rollWeatherResult,
	rollWeatherResults,
} from "../../module/utils/weather.js";
import { SEASON_IDS } from "../../module/seasons/seasons-change-reminders.js";

// The seasonal weather tables (Book I, p.325) are GM-facing rules content, so the
// data itself is what we guard: each season must cover a 1d6 with no gaps or overlaps.

describe("weather tables", () => {
	it("has the six Book I seasons", () => {
		expect(WEATHER_SEASONS.map(s => s.key)).toEqual([
			"late-winter-early-spring",
			"spring-early-summer",
			"summer",
			"late-summer-early-autumn",
			"autumn",
			"winter",
		]);
	});

	for (const season of WEATHER_SEASONS) {
		describe(season.label, () => {
			it("maps every 1d6 result to exactly one row", () => {
				for (let n = 1; n <= 6; n++) {
					const matches = season.rows.filter(r => n >= r.min && n <= r.max);
					expect(matches, `d6=${n}`).toHaveLength(1);
				}
			});

			it("has rows that are contiguous and in order, 1 through 6", () => {
				const sorted = [...season.rows].sort((a, b) => a.min - b.min);
				expect(sorted[0].min).toBe(1);
				expect(sorted.at(-1).max).toBe(6);
				for (let i = 1; i < sorted.length; i++) {
					expect(sorted[i].min, season.label).toBe(sorted[i - 1].max + 1);
				}
			});

			it("gives every row non-empty text", () => {
				for (const row of season.rows) expect(row.text.trim().length).toBeGreaterThan(0);
			});
		});
	}

	it("resolves a roll to its row", () => {
		expect(resolveWeatherRow("winter", 1).text).toMatch(/Blizzard/);
		expect(resolveWeatherRow("winter", 6).text).toMatch(/Warm \(for winter\)/);
		expect(resolveWeatherRow("autumn", 5).text).toMatch(/Crisp, breezy/);
	});

	it("returns null for an unknown season or out-of-range roll", () => {
		expect(getWeatherSeason("nope")).toBeNull();
		expect(resolveWeatherRow("nope", 3)).toBeNull();
		expect(resolveWeatherRow("winter", 9)).toBeNull();
	});

	it("formats single and range labels", () => {
		expect(rowRange({ min: 4, max: 4 })).toBe("4");
		expect(rowRange({ min: 2, max: 3 })).toBe("2–3");
	});

	it("flags the reroll rows", () => {
		expect(resolveWeatherRow("autumn", 3).reroll).toBe(true);
		expect(resolveWeatherRow("late-winter-early-spring", 4).reroll).toBe(true);
		expect(resolveWeatherRow("winter", 3).reroll).toBeUndefined();
	});
});

// Every row as Book I prints it (p.325, the right-hand page of the 324/325 spread), with its
// range and whether it carries "; roll again later with disadvantage", which the data holds as
// `reroll` rather than in the text. Quoted verbatim, the book's own spelling included ("thunder
// storms", the missing "a" before "day of cold").
const BOOK_TABLES = {
	"late-winter-early-spring": [
		["1",   "Snow/sleet/hail, an early thunderstorm or day of cold, soaking rains"],
		["2–3", "Cold and windy, maybe some showers"],
		["4",   "Clouds on the horizon, steady wind", "reroll"],
		["5–6", "A fine, sunny spring day; some clouds, some gusting winds"],
	],
	"spring-early-summer": [
		["1",   "A heavy storm; high winds, hail, thunder, lightning"],
		["2",   "Steady, chilly rain"],
		["3–4", "Warm and windy, maybe some brief showers"],
		["5–6", "Warm, sunny, pleasant"],
	],
	"summer": [
		["1",   "A heavy storm; high winds, hail, thunder, lightning, tornadoes"],
		["2",   "Blazing heat, still air, not a cloud in sight"],
		["3",   "Hot and humid, with brief, drenching thunder storms"],
		["4–5", "Hot, muggy, some wind"],
		["6",   "Warm, sunny, breezy, perfect"],
	],
	"late-summer-early-autumn": [
		["1",   "A powerful thunderstorm or cold, soaking rain"],
		["2",   "Windy with a few rain showers"],
		["3",   "Warm, clouds on the horizon, steady wind", "reroll"],
		["4–5", "Hot and dry during the day; cooler and windy at night"],
		["6",   "Warm, sunny, breezy, perfect"],
	],
	"autumn": [
		["1",   "Cold, drenching rain and/or sleet"],
		["2",   "Cold, windy, light rain or early snow"],
		["3",   "Chilly, windy, clouds on the horizon", "reroll"],
		["4–6", "Crisp, breezy"],
	],
	"winter": [
		["1",   "Blizzard: wind, snow, all of it"],
		["2",   "Intense cold and wind"],
		["3",   "Very cold, very clear, very still"],
		["4",   "Cold and snowy, or cold and windy"],
		["5",   "Some snow, but mostly just dreary"],
		["6",   "Warm (for winter) and sunny"],
	],
};

describe("the weather tables, against the book", () => {
	it("has exactly the book's six tables", () => {
		expect(WEATHER_SEASONS.map(s => s.key)).toEqual(Object.keys(BOOK_TABLES));
	});

	for (const [key, rows] of Object.entries(BOOK_TABLES)) {
		it(`quotes ${key} row for row`, () => {
			const table = getWeatherSeason(key).rows.map(r => [rowRange(r), r.text, ...(r.reroll ? ["reroll"] : [])]);
			expect(table).toEqual(rows);
		});
	}
});

// The picker opens on the season the steading's clock is in. The map is written out in
// weather.js rather than imported from the seasons module (see the note there), so the two
// halves are pinned together here instead.
describe("the campaign season's table", () => {
	it("maps every campaign season, and only campaign seasons", () => {
		expect(Object.keys(CAMPAIGN_SEASON_TABLES)).toEqual(SEASON_IDS);
	});

	it("maps each one to a real weather table", () => {
		for (const [season, key] of Object.entries(CAMPAIGN_SEASON_TABLES)) {
			expect(getWeatherSeason(key), season).not.toBeNull();
		}
	});

	it("points at the table that names that season outright", () => {
		expect(weatherSeasonForCampaignSeason("spring")).toBe("spring-early-summer");
		expect(weatherSeasonForCampaignSeason("summer")).toBe("summer");
		expect(weatherSeasonForCampaignSeason("autumn")).toBe("autumn");
		expect(weatherSeasonForCampaignSeason("winter")).toBe("winter");
	});

	it("has nothing to say without a stamped season", () => {
		expect(weatherSeasonForCampaignSeason(null)).toBeNull();
		expect(weatherSeasonForCampaignSeason("harvest")).toBeNull();
	});
});

// The clock as the picker hands it over: the season, and its "<year>:<season>" stamp key.
const clock = (season, year = 1) => ({ season, key: `${year}:${season}` });

describe("the picker's opening season", () => {
	it("follows the clock over a pick made in an earlier season", () => {
		expect(defaultWeatherSeason(clock("autumn"), { key: "summer", for: "1:summer" })).toBe("autumn");
	});

	it("follows the clock when nothing has been picked yet", () => {
		expect(defaultWeatherSeason(clock("winter"))).toBe("winter");
		expect(defaultWeatherSeason(clock("winter"), {})).toBe("winter");
	});

	it("keeps a deliberate pick made within the season showing", () => {
		expect(defaultWeatherSeason(clock("autumn"), { key: "late-summer-early-autumn", for: "1:autumn" }))
			.toBe("late-summer-early-autumn");
	});

	// The same season a YEAR later is a different season. Keyed by the bare id, a straddle
	// table picked in the first summer came back as the opening table of the second.
	it("does not carry a pick into the same season of a later year", () => {
		expect(defaultWeatherSeason(clock("summer", 2), { key: "late-summer-early-autumn", for: "1:summer" }))
			.toBe("summer");
	});

	// A pick saved by an older build, under the bare season id, gives way to the clock once.
	it("lets a pick saved under the old bare-season key give way to the clock", () => {
		expect(defaultWeatherSeason(clock("autumn"), { key: "late-summer-early-autumn", for: "autumn" }))
			.toBe("autumn");
	});

	it("keeps the remembered pick in a world with no season stamped", () => {
		expect(defaultWeatherSeason(null, { key: "winter", for: null })).toBe("winter");
	});

	it("honours a pick saved before it was paired, but only where the clock is silent", () => {
		expect(defaultWeatherSeason(null, "winter")).toBe("winter");
		expect(defaultWeatherSeason(clock("spring"), "winter")).toBe("spring-early-summer");
	});

	it("falls back to the first table when there is nothing to go on", () => {
		expect(defaultWeatherSeason(null)).toBe(WEATHER_SEASONS[0].key);
		expect(defaultWeatherSeason(null, "")).toBe(WEATHER_SEASONS[0].key);
		expect(defaultWeatherSeason(null, { key: "nope", for: null })).toBe(WEATHER_SEASONS[0].key);
	});

	it("always names a real table", () => {
		expect(getWeatherSeason(defaultWeatherSeason(clock("summer"), { key: "nope", for: "1:summer" }))).not.toBeNull();
	});
});

// ── How the die is thrown ────────────────────────────────────────────────────
// Tor's blessing ("roll twice and take your pick", p.518) and the rider ("roll again later with
// disadvantage", p.325). Both together cancel to one plain d6: the user's ruling, 2026-10-02.
describe("the weather roll's plan", () => {
	it("throws one plain d6 when nothing applies", () => {
		const plan = weatherRollPlan();
		expect(plan).toBe(WEATHER_ROLL_PLANS.plain);
		expect(plan.dice).toBe(1);
		expect(plan.rollMode).toBe("normal");
		expect(plan.hint).toBe("");
	});

	it("throws two separate dice under Tor's blessing", () => {
		const plan = weatherRollPlan({ blessing: true });
		expect(plan.dice).toBe(2);
		expect(plan.rollMode).toBe("normal");
	});

	it("throws two and keeps the lower while the rider is owed", () => {
		const plan = weatherRollPlan({ rider: true });
		expect(plan.dice).toBe(1);
		expect(plan.rollMode).toBe("dis");
	});

	it("cancels the blessing against the rider to one plain roll, and says so", () => {
		const plan = weatherRollPlan({ blessing: true, rider: true });
		expect(plan).toBe(WEATHER_ROLL_PLANS.cancel);
		expect(plan.dice).toBe(1);
		expect(plan.rollMode).toBe("normal");
		expect(plan.hint).toBe("Tor's blessing and the clouds' warning cancel out: one plain roll.");
		expect(plan.note).toBe(plan.hint);
	});

	it("explains every plan but the plain one, before the roll and after", () => {
		for (const plan of Object.values(WEATHER_ROLL_PLANS)) {
			const says = plan.key !== "plain";
			expect(Boolean(plan.hint), plan.key).toBe(says);
			expect(Boolean(plan.note), plan.key).toBe(says);
			// House rule: no em dashes in user-facing copy.
			expect(plan.hint + plan.note, plan.key).not.toContain(String.fromCharCode(0x2014));
		}
	});
});

describe("rolling the weather", () => {
	let formulas;
	beforeEach(() => {
		formulas = [];
		let face = 0;
		globalThis.Roll = class {
			constructor(formula) { this.formula = formula; formulas.push(formula); }
			async evaluate() { this.total = [2, 5][face++ % 2]; return this; }
		};
	});
	afterEach(() => { delete globalThis.Roll; });

	it("rolls a plain d6 by default", async () => {
		const result = await rollWeatherResult("winter");
		expect(formulas).toEqual(["1d6"]);
		expect(result.row).toBe(resolveWeatherRow("winter", 2));
	});

	it("rolls two dice and keeps the lower under disadvantage", async () => {
		const [result] = await rollWeatherResults("winter", WEATHER_ROLL_PLANS.disadvantage);
		expect(formulas).toEqual(["2d6kl1"]);
		expect(result.roll.formula).toBe("2d6kl1");
	});

	it("rolls two separate Rolls under the blessing, each with its own row", async () => {
		const results = await rollWeatherResults("winter", WEATHER_ROLL_PLANS.blessing);
		expect(formulas).toEqual(["1d6", "1d6"]);
		expect(results.map(r => r.roll.total)).toEqual([2, 5]);
		expect(results.map(r => r.row)).toEqual([resolveWeatherRow("winter", 2), resolveWeatherRow("winter", 5)]);
		expect(results[0].roll).not.toBe(results[1].roll);
	});

	it("rolls one plain d6 when the two cancel", async () => {
		const results = await rollWeatherResults("winter", WEATHER_ROLL_PLANS.cancel);
		expect(formulas).toEqual(["1d6"]);
		expect(results).toHaveLength(1);
	});

	it("rolls nothing for an unknown season", async () => {
		expect(await rollWeatherResults("nope", WEATHER_ROLL_PLANS.blessing)).toBeNull();
		expect(formulas).toEqual([]);
	});
});
