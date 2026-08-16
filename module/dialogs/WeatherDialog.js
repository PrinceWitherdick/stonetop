import { StonetopDialog } from "../utils/stonetop-dialog.js";
import { openOrFocus } from "../utils/open-or-focus.js";
import { getSetting, setSetting } from "../settings.js";
import { WEATHER_SEASONS, getWeatherSeason, rollWeather, rowRange, defaultWeatherSeason, weatherSeasonForCampaignSeason } from "../utils/weather.js";
import { getStonetopSteadingActor } from "../utils/world.js";
import { readCurrentSeason, currentSeasonView } from "../seasons/current-season.js";

const SEASON_SETTING = "weatherSeason";

// ── WeatherDialog ────────────────────────────────────────────────────────────
// A compact GM tool for the expedition weather roll (Book I, p.325): pick the
// season, roll 1d6 on its table, post a result card. The season tables and roll
// live in utils/weather.js; this is just the picker. Opened from the sun-cloud
// hotbar macro (see hooks/Ready.js).
//
// The picker opens on the season the steading's clock is actually in — the book tells the
// GM to roll "informed by the latest Seasons Change", and the world already knows what that
// was, so making the GM re-answer it every time was asking for a summer roll in autumn. A
// deliberate pick still sticks for as long as that season lasts; see defaultWeatherSeason.

export class WeatherDialog extends StonetopDialog {
	constructor(options = {}) {
		super(options);
		// The steading's stamped season, read once at open. A world with no Seasons Change
		// recorded yet has no clock to follow (readCurrentSeason returns null rather than the
		// header's display default), and falls back to the remembered pick as before.
		this._clock  = readCurrentSeason(getStonetopSteadingActor());
		this._season = defaultWeatherSeason(this._clock?.season ?? null, getSetting(SEASON_SETTING));
	}

	static open() {
		return openOrFocus("stonetop-weather", () => new WeatherDialog().render(true));
	}

	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id:        "stonetop-weather",
			title:     "Weather",
			template:  "systems/stonetop-pwd/templates/dialogs/weather.hbs",
			width:     420,
			height:    "auto",
			resizable: true,
			classes:   ["stonetop", "stonetop-weather-dialog"],
		});
	}

	activateListeners(html) {
		super.activateListeners(html);
		html.find(".stonetop-weather-season").on("click", ev => this._pickSeason(ev.currentTarget.dataset.season));
		html.find(".stonetop-weather-roll-btn").on("click", () => this._roll());
	}

	getData() {
		const season = getWeatherSeason(this._season);
		return {
			seasons: WEATHER_SEASONS.map(s => ({ key: s.key, label: s.label, isActive: s.key === this._season })),
			label:   season.label,
			clock:   this._clockLine(),
			rows:    season.rows.map(r => ({
				range:  rowRange(r),
				text:   r.text,
				reroll: !!r.reroll,
			})),
		};
	}

	// The "your clock says…" line: which season the steading is in, and whether the table
	// showing is the one that season points at. Named so the GM can see the pick came from
	// the world rather than from wherever they left the dialog last — and so a straddle
	// table they chose themselves reads as a choice, not as the picker ignoring the clock.
	//
	// Spelled by `currentSeasonView`, the same function the steading header's clock reads,
	// rather than by calling `seasonLabel` and `yearLabel` here: this diff renamed a campaign
	// year ("First Year" → "Year One") and had to chase every surface that names one, so a
	// second hand-assembled clock is a second place to have to find. `stamped` is the view's
	// own "there is no clock" signal, which is exactly the question this line opens with.
	_clockLine() {
		const view = currentSeasonView(this._clock);
		if (!view.stamped) return null;
		return {
			label:     view.label,
			yearLabel: view.yearLabel,
			followed:  this._season === weatherSeasonForCampaignSeason(view.season),
		};
	}

	// Switch season and remember it for next time — paired with the season it was picked
	// under, so the clock takes back over once that season turns.
	async _pickSeason(key) {
		if (!getWeatherSeason(key) || key === this._season) return;
		this._season = key;
		await setSetting(SEASON_SETTING, { key, for: this._clock?.season ?? null });
		this.render(false);
	}

	// Roll 1d6 on the current season's table; the result posts to chat, so just
	// close the picker rather than echoing the roll back into the dialog.
	async _roll() {
		await rollWeather(this._season);
		this.close();
	}
}
