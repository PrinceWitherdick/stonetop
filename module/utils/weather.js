import { stonetopCardShell, rollFormulaChip } from "./chat.js";

// Stonetop's seasonal weather tables (Book I, p.325). Each season is a 1d6 table;
// the GM picks the season (informed by the latest Seasons Change move, p.517) and
// rolls. A few results carry a "roll again later with disadvantage" rider, which
// we surface as `reroll` so the card can call it out.
//
// The pure data + resolver live here (and are unit-tested); the picker UI is
// WeatherDialog, and the hotbar macro opens it (see hooks/Ready.js).

const REROLL_NOTE = "Roll again later with disadvantage.";

export const WEATHER_SEASONS = [
	{
		key:   "late-winter-early-spring",
		label: "Late winter / early spring",
		rows:  [
			{ min: 1, max: 1, text: "Snow / sleet / hail, an early thunderstorm, or a day of cold, soaking rains" },
			{ min: 2, max: 3, text: "Cold and windy, maybe some showers" },
			{ min: 4, max: 4, text: "Clouds on the horizon, steady wind", reroll: true },
			{ min: 5, max: 6, text: "A fine, sunny spring day; some clouds, some gusting winds" },
		],
	},
	{
		key:   "spring-early-summer",
		label: "Spring / early summer",
		rows:  [
			{ min: 1, max: 1, text: "A heavy storm; high winds, hail, thunder, lightning" },
			{ min: 2, max: 2, text: "Steady, chilly rain" },
			{ min: 3, max: 4, text: "Warm and windy, maybe some brief showers" },
			{ min: 5, max: 6, text: "Warm, sunny, pleasant" },
		],
	},
	{
		key:   "summer",
		label: "Summer",
		rows:  [
			{ min: 1, max: 1, text: "A heavy storm; high winds, hail, thunder, lightning, tornadoes" },
			{ min: 2, max: 2, text: "Blazing heat, still air, not a cloud in sight" },
			{ min: 3, max: 3, text: "Hot and humid, with brief, drenching thunderstorms" },
			{ min: 4, max: 5, text: "Hot, muggy, some wind" },
			{ min: 6, max: 6, text: "Warm, sunny, breezy, perfect" },
		],
	},
	{
		key:   "late-summer-early-autumn",
		label: "Late summer / early autumn",
		rows:  [
			{ min: 1, max: 1, text: "A powerful thunderstorm or cold, soaking rain" },
			{ min: 2, max: 2, text: "Windy with a few rain showers" },
			{ min: 3, max: 3, text: "Warm, clouds on the horizon, steady wind", reroll: true },
			{ min: 4, max: 5, text: "Hot and dry during the day; cooler and windy at night" },
			{ min: 6, max: 6, text: "Warm, sunny, breezy, perfect" },
		],
	},
	{
		key:   "autumn",
		label: "Autumn",
		rows:  [
			{ min: 1, max: 1, text: "Cold, drenching rain and/or sleet" },
			{ min: 2, max: 2, text: "Cold, windy, light rain or early snow" },
			{ min: 3, max: 3, text: "Chilly, windy, clouds on the horizon", reroll: true },
			{ min: 4, max: 6, text: "Crisp, breezy" },
		],
	},
	{
		key:   "winter",
		label: "Winter",
		rows:  [
			{ min: 1, max: 1, text: "Blizzard: wind, snow, all of it" },
			{ min: 2, max: 2, text: "Intense cold and wind" },
			{ min: 3, max: 3, text: "Very cold, very clear, very still" },
			{ min: 4, max: 4, text: "Cold and snowy, or cold and windy" },
			{ min: 5, max: 5, text: "Some snow, but mostly just dreary" },
			{ min: 6, max: 6, text: "Warm (for winter) and sunny" },
		],
	},
];

/** Look up a season table by its key. */
export function getWeatherSeason(key) {
	return WEATHER_SEASONS.find(s => s.key === key) ?? null;
}

// ── The steading's clock, as a weather table ─────────────────────────────────
// Six tables, four seasons. The campaign clock (the Seasons Change stamp, see
// seasons/current-season.js) names one of spring/summer/autumn/winter, so it can only ever
// point at the four tables that name a season outright. The two straddle tables ("late
// winter / early spring", "late summer / early autumn") describe the seam BETWEEN two
// stamped seasons, and nothing in the clock says how deep into a season the party is —
// so those stay the GM's own pick rather than something we guess at.
//
// Keys are the SEASON_IDS of seasons-change-reminders.js. Not imported: that module pulls
// in the chat card and the playbook-actor scan for a four-string list, and this file is the
// pure rules data the tests drive directly. The pairing is guarded in tests/utils/weather.test.js
// instead, which asserts these keys ARE SEASON_IDS.
export const CAMPAIGN_SEASON_TABLES = Object.freeze({
	spring: "spring-early-summer",
	summer: "summer",
	autumn: "autumn",
	winter: "winter",
});

/**
 * The weather table a stamped campaign season rolls on.
 * @param {string|null} season  A SEASON_IDS key.
 * @returns {string|null} null when there's no season stamped (or it isn't one we know).
 */
export function weatherSeasonForCampaignSeason(season) {
	return CAMPAIGN_SEASON_TABLES[season] ?? null;
}

/**
 * Which table the picker opens on.
 *
 * The clock wins, because the season the table is actually playing in is a fact and the
 * remembered pick is only where this client happened to leave the dialog — a GM who ran the
 * Seasons Change into autumn and then opened the weather should not be rolling summer.
 *
 * But the remembered pick is still worth keeping WITHIN a season: the GM who deliberately
 * switched to "late summer / early autumn" is telling us where in the season they are, which
 * is exactly the thing the clock can't say. So the pick is remembered together with the
 * campaign season it was made under, and it only survives while that season does. One value
 * holding both halves, for the same reason the clock itself is one flag: a key remembered
 * separately from the season it belongs to is a pick that outlives its meaning.
 *
 * @param {string|null} campaignSeason        The stamped season, or null if none.
 * @param {{key?: string, for?: string|null}|string|null} [remembered]  The stored pick. A bare
 *   string is a pick saved before it was paired with a season — honoured only in an unstamped
 *   world, which is where the clock has nothing to say anyway.
 * @returns {string} Always a real WEATHER_SEASONS key.
 */
export function defaultWeatherSeason(campaignSeason, remembered = null) {
	const pick = typeof remembered === "string" ? { key: remembered } : (remembered ?? {});
	const rememberedKey = getWeatherSeason(pick.key) ? pick.key : null;
	const sameSeason    = (pick.for ?? null) === (campaignSeason ?? null);
	if (rememberedKey && sameSeason) return rememberedKey;
	return weatherSeasonForCampaignSeason(campaignSeason) ?? rememberedKey ?? WEATHER_SEASONS[0].key;
}

/** The row a given 1d6 total lands on for a season (or null if the key is unknown). */
export function resolveWeatherRow(seasonKey, total) {
	const season = getWeatherSeason(seasonKey);
	return season?.rows.find(r => total >= r.min && total <= r.max) ?? null;
}

/** Human-readable range label for a row, e.g. "1" or "2–3". */
export function rowRange(row) {
	return row.min === row.max ? `${row.min}` : `${row.min}–${row.max}`;
}

/**
 * Roll 1d6 on a season's weather table and post a result card to chat.
 * Returns the rolled total + row (handy for the dialog to highlight).
 */
export async function rollWeather(seasonKey) {
	const season = getWeatherSeason(seasonKey);
	if (!season) return null;

	const roll = await new Roll("1d6").evaluate();
	const row  = resolveWeatherRow(seasonKey, roll.total);

	await roll.toMessage({
		speaker: { alias: `Weather: ${season.label}` },
		flavor:  stonetopCardShell(_weatherCardBody(roll.total, row, roll.formula), "stonetop-weather-card"),
	});

	return { total: roll.total, row };
}

// We render the result ourselves (number + table text + the d6 formula) and hide
// Foundry's auto-rendered dice block in CSS, so the rolled total isn't shown twice.
function _weatherCardBody(total, row, formula) {
	const reroll = row?.reroll
		? `<p class="stonetop-weather-reroll"><i class="fas fa-rotate-right"></i> ${REROLL_NOTE}</p>`
		: "";
	return `<div class="card-content stonetop-weather">
		${rollFormulaChip(formula)}
		<div class="stonetop-weather-result">
			<span class="stonetop-weather-number">${total}</span>
			<span class="stonetop-weather-text">${row?.text ?? ""}</span>
		</div>
		${reroll}
	</div>`;
}

export { REROLL_NOTE };
