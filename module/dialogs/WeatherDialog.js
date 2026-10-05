import { StonetopDialog } from "../utils/stonetop-dialog.js";
import { openOrFocus } from "../utils/open-or-focus.js";
import { getSetting, setSetting } from "../settings.js";
import { WEATHER_SEASONS, getWeatherSeason, rollWeatherResults, rowRange, defaultWeatherSeason, weatherSeasonForCampaignSeason, weatherRollPlan } from "../utils/weather.js";
import { getStonetopSteadingActor, isSteadingActor } from "../utils/world.js";
import { readCurrentSeason, currentSeasonView, seasonStampKey, isCurrentSeasonChange } from "../seasons/current-season.js";
import { announceWeather, readCurrentWeather, setWeatherFxPaused } from "../seasons/current-weather.js";
import { fxMasterActive, weatherFxPaused, WEATHER_FX_SETTING } from "../seasons/weather-fx.js";
import { openSystemSetting } from "../utils/open-settings.js";
import { spinHighlight } from "../utils/flash-highlight.js";

const SEASON_SETTING = "weatherSeason";

// The class the row now standing as the weather wears. Its own class rather than the walk's
// `stonetop-flash`, because that one is written to go out on a timer — "this is what just
// happened" — and this one IS a selection: it has to still be there when the GM comes back to
// the window a minute later to press Post.
const PICKED_CLASS = "is-picked";

// The class each of Tor's blessing's two rows wears (painted by the template, taken off here at
// the start of the next walk). Both are LIT in the standing green while neither is chosen; once
// one is, the other keeps only this class, still clickable to change the GM's mind back.
const OFFERED_CLASS = "is-offered";

// ── WeatherDialog ────────────────────────────────────────────────────────────
// A compact GM tool for the expedition weather roll (Book I, p.325): pick the
// season, roll 1d6 on its table, post a result card. The season tables and roll
// live in utils/weather.js; this is just the picker. Opened from the sun-cloud
// hotbar macro (see hooks/Ready.js).
//
// The roll LANDS in the window rather than going straight to chat. A light walks the season's
// rows and stops on the one the die gave (the GM Moves randomizer's walk, utils/flash-highlight.js),
// and the row stays lit until the GM either posts it, re-rolls, or clicks a different row. Two
// reasons the button no longer fires and closes:
//
//  • The rows already looked like options — six boxed lines you could click — and the window
//    was the only place in the system where that shape did nothing. It does now.
//  • The weather is the GM's call ("You decide when it rains", p.324) and the table is offered
//    as a prompt, not an oracle. A roll you can look at before the table sees it is the version
//    of that table the book actually describes; a roll that posts as it lands makes the die the
//    authority and puts every discarded re-roll in the log.
//
// The picker opens on the season the steading's clock is actually in — the book tells the
// GM to roll "informed by the latest Seasons Change", and the world already knows what that
// was, so making the GM re-answer it every time was asking for a summer roll in autumn. A
// deliberate pick still sticks for as long as that season lasts; see defaultWeatherSeason.

export class WeatherDialog extends StonetopDialog {
	constructor(options = {}) {
		super(options);
		// The steading's stamped season. A world with no Seasons Change recorded yet has no
		// clock to follow (readCurrentSeason returns null rather than the header's display
		// default), and falls back to the remembered pick as before. Read again on every render
		// (`_syncClock`), and the window re-renders when the steading's season changes, so a
		// picker left open across a Seasons Change follows it rather than rolling last season.
		this._clock  = readCurrentSeason(getStonetopSteadingActor());
		this._season = this._defaultSeason();
		// The row standing as the weather: {index, row, roll, note}. `roll` is the evaluated d6
		// when the die gave it and null when the GM picked the row themselves, which is the whole
		// difference the card prints. Null until either happens, and that null is what the
		// footer reads to decide whether it shows one button or two.
		this._picked = null;
		// Tor's blessing's two results, each shaped like `_picked`, while the GM chooses between
		// them. Null outside a blessed roll, and when both dice land on the same row.
		this._offered = null;
		// The walk in flight, so a second Re-roll abandons the first where it stands. One per
		// dialog: there is one list and one light. Collides with nothing in Application.
		this._spin = null;
		// Redraw when the steading's season moves. Taken off in `close`.
		this._clockHook = globalThis.Hooks?.on?.("updateActor", (actor, changed) => {
			if (this.rendered && isSteadingActor(actor) && isCurrentSeasonChange(changed)) this.render(false);
		}) ?? null;
	}

	/**
	 * Open the picker, or bring it forward. GM-only: posting the weather writes the steading,
	 * and the canvas and the world setting behind the Pause button are the GM's too. Every way in
	 * (the hotbar macro, the steading header, the time banner, `game.stonetop.openWeather`) comes
	 * through here, so this is the one gate.
	 */
	static open() {
		if (!globalThis.game?.user?.isGM) return null;
		return openOrFocus("stonetop-weather", () => new WeatherDialog().render(true));
	}

	// The clock as defaultWeatherSeason reads it: the season, and the "<year>:<season>" key the
	// remembered pick is filed under.
	_clockRef() {
		return this._clock ? { season: this._clock.season, key: seasonStampKey(this._clock) } : null;
	}

	_defaultSeason() {
		return defaultWeatherSeason(this._clockRef(), getSetting(SEASON_SETTING));
	}

	/**
	 * Re-read the steading's clock. When it has moved since this window last looked, the table
	 * follows it (through the same remembered-pick rule the window opened with) and whatever
	 * was standing goes: a summer row posted under an autumn clock would be the stale weather
	 * this exists to stop. No game with actors (the tests' bare world) leaves the clock as set.
	 * @returns {boolean} true when the clock had moved.
	 */
	_syncClock() {
		if (!globalThis.game?.actors) return false;
		const clock = readCurrentSeason(getStonetopSteadingActor());
		if (seasonStampKey(clock) === seasonStampKey(this._clock)) return false;
		this._spin?.cancel();
		this._clock   = clock;
		this._season  = this._defaultSeason();
		this._picked  = null;
		this._offered = null;
		return true;
	}

	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id:        "stonetop-weather",
			title:     "Weather",
			template:  "systems/stonetop_pwd/templates/dialogs/weather.hbs",
			width:     420,
			height:    "auto",
			resizable: true,
			classes:   ["stonetop", "stonetop-weather-dialog"],
		});
	}

	activateListeners(html) {
		super.activateListeners(html);
		html.find(".stonetop-weather-season").on("click", ev => this._pickSeason(ev.currentTarget.dataset.season));
		html.find(".stonetop-weather-row").on("click", ev => this._pickRow(Number(ev.currentTarget.dataset.index)));
		// Both the opening "Roll the weather" and the "Re-roll" beside a landed result do the
		// same thing; they differ only in what they say and where they sit, so they share a
		// handler rather than a class — the class is what the stylesheet tells apart.
		html.find(".stonetop-weather-roll-btn, .stonetop-weather-reroll-btn").on("click", () => this._roll());
		html.find(".stonetop-weather-post-btn").on("click", () => this._post());
		html.find(".stonetop-weather-fx-btn").on("click", () => this._toggleFx());
		html.find(".stonetop-weather-fx-link").on("click", () => this._openWeatherSettings());
	}

	/** Cancel any walk still running, so nothing lands on a window that has gone. */
	async close(options = {}) {
		this._spin?.cancel();
		if (this._clockHook !== null && this._clockHook !== undefined) globalThis.Hooks?.off?.("updateActor", this._clockHook);
		this._clockHook = null;
		return super.close(options);
	}

	getData() {
		this._syncClock();
		const season = getWeatherSeason(this._season);
		const clock  = this._clockLine();
		const plan   = this._rollPlan();
		// The selected button goes red when the table showing is not the one the steading's clock
		// points at. Only ever a warning ON the selection, never on the other three: the sentence
		// above says which season the world is in, and colouring the unpicked buttons too would
		// leave the GM reading a row of reds to work out which one they were actually on.
		//
		// A world with no Seasons Change stamped has no clock to be off, so nothing goes red —
		// `_clockLine` returns null there and the whole line is absent.
		const offClock = !!clock && !clock.followed;
		return {
			seasons: WEATHER_SEASONS.map(s => ({
				key:        s.key,
				label:      s.label,
				isActive:   s.key === this._season,
				isOffClock: offClock && s.key === this._season,
			})),
			label:   season.label,
			clock,
			// How the next roll is thrown, said BEFORE it is: Tor's blessing, the last weather's
			// rider, or the two cancelling. The same words the card prints after (weather.js).
			rollHint: plan.hint || null,
			// `picked` rather than the row itself: the footer only needs to know whether there
			// is one, and the row that IS picked says so on its own line.
			picked:  !!this._picked,
			// A blessed roll's two rows are up and neither is chosen yet: Re-roll, no Post.
			choosing: !this._picked && !!this._offered,
			// The canvas control, or null when there is nothing on a canvas to control. The
			// template hangs the whole row off it.
			fx:      this._fxControl(),
			rows:    season.rows.map((r, i) => ({
				index:     i,
				range:     rowRange(r),
				text:      r.text,
				reroll:    !!r.reroll,
				// Lit in the standing green only once it stands. A blessed roll's two rows wait
				// as `isOffered` (a dashed edge), so neither reads as already chosen.
				isPicked:  this._picked?.index === i,
				isOffered: !!this._offered?.some(o => o.index === i),
			})),
		};
	}

	// Is Tor's blessing holding this season? A world with no game (or no steading) has none.
	_torsBlessing() {
		if (!globalThis.game) return false;
		return !!getStonetopSteadingActor()?.typedActor?.torsBlessingActive?.();
	}

	// Does the weather standing now owe this roll disadvantage ("roll again later with
	// disadvantage", Book I p.325)? Posting the next weather is what pays it off.
	_riderPending() {
		if (!globalThis.game) return false;
		return !!readCurrentWeather(getStonetopSteadingActor())?.reroll;
	}

	// The plan the next roll takes. When the blessing and the rider both apply they cancel to
	// one plain d6 (see WEATHER_ROLL_PLANS).
	_rollPlan() {
		return weatherRollPlan({ blessing: this._torsBlessing(), rider: this._riderPending() });
	}

	// The Pause / Resume control for the weather on the players' map, or null when this window
	// has no business offering one.
	//
	// HIDDEN rather than disabled in both of its off cases, which is the unusual call here. A
	// greyed-out button is a promise that something could happen if the reader worked out what
	// they were missing, and for a table with no particle module installed nothing ever can —
	// the honest version of "you have no FXMaster" is a picker that never mentions FXMaster.
	// The second case is a player who somehow reached the window: they cannot write a
	// world setting, so the button would be a lie about who is in charge of the map.
	//
	// FXMaster+ counts as FXMaster (see fxMasterActive), because a table that bought the paid
	// build would have no way to guess why the button was missing.
	_fxControl() {
		if (!fxMasterActive() || !globalThis.game?.user?.isGM) return null;
		const paused = weatherFxPaused();
		return {
			paused,
			label: paused ? "Resume weather effects" : "Pause weather effects",
			// Said in terms of what the TABLE sees, not of the setting behind it: "off" would
			// leave a GM wondering whether the weather itself had stopped being rolled.
			hint:  paused
				? "Posted weather stays off the map until you resume."
				: "Posted weather also falls on the scene your players are on.",
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
	//
	// The standing result goes with it. A row index means nothing across two tables of
	// different lengths, and even where it resolved it would be a summer result sat under an
	// autumn heading — the pick belongs to the table it was made on.
	//
	// Remembered under the clock's "<year>:<season>" key, not the bare season, so a straddle
	// table picked one summer does not come back a year later (see defaultWeatherSeason).
	async _pickSeason(key) {
		if (!getWeatherSeason(key) || key === this._season) return;
		this._spin?.cancel();
		this._season  = key;
		this._picked  = null;
		this._offered = null;
		await setSetting(SEASON_SETTING, { key, for: this._clockRef()?.key ?? null });
		this.render(false);
	}

	// Roll on the current season's table and walk the light to the row it gave. Nothing is
	// posted: the landing IS the answer, and the footer's Post button is what sends it out.
	//
	// The plan decides the dice. One d6 as a rule; two kept-lower when the standing weather owes
	// disadvantage; and under Tor's blessing ("roll twice and take your pick") two separate d6,
	// both rows lit, neither chosen until the GM clicks one, which then posts with its OWN die.
	// Two dice that agree are one answer and simply stand. Blessing and rider together cancel
	// to one plain d6. Every rolled result carries the plan's `note`, which the card prints.
	async _roll() {
		const plan    = this._rollPlan();
		const results = await rollWeatherResults(this._season, plan);
		const rows    = getWeatherSeason(this._season)?.rows ?? [];
		const landed  = (results ?? [])
			.filter(r => r?.row)
			.map(r => ({ index: rows.indexOf(r.row), row: r.row, roll: r.roll, note: plan.note }));
		if (!landed.length) return;

		// A later click superseded this walk — that click's result is the one to keep, and this
		// one drops out rather than overwriting it on arrival.
		if (!await this._spinTo(landed.at(-1).index)) return;

		const distinct = landed.filter((r, i) => landed.findIndex(o => o.index === r.index) === i);
		this._offered = distinct.length > 1 ? distinct : null;
		this._picked  = distinct.length > 1 ? null : distinct[0];
		this.render(false);
	}

	// The GM naming the weather themselves, which the book puts first ("You decide when it
	// rains", p.324). Same standing result as a roll, minus the die — so the card that goes out
	// carries no total, and the footer offers the same two buttons either way.
	//
	// Except on one of a blessed roll's two lit rows: that is the GM TAKING THEIR PICK of the
	// two dice, and the row stands with the die that gave it.
	_pickRow(index) {
		const row = getWeatherSeason(this._season)?.rows?.[index];
		if (!row || this._picked?.index === index) return;
		this._spin?.cancel();
		this._picked = this._offered?.find(o => o.index === index) ?? { index, row, roll: null, note: "" };
		this.render(false);
	}

	/**
	 * Run the light down the rows and leave it standing on `index`.
	 *
	 * The landing class goes on the row HERE, in the same task the walk ends, and the re-render
	 * that follows paints the same class back on the same row. Waiting for the render instead
	 * would leave a frame with nothing lit at the exact moment being watched.
	 *
	 * The previous result is unlit before the walk sets off, rather than left burning while a
	 * light travels towards its replacement. It is only taken off the DOM, not out of
	 * `this._picked`: the footer must not flip back to a single button mid-walk, and a walk that
	 * gets cancelled leaves the old answer to be repainted by the next render.
	 *
	 * @returns {Promise<boolean>}  false if a later click superseded this walk — the caller's
	 *          cue to keep its result to itself. True when there was no walk to make at all
	 *          (rows not on the page, motion turned off), since the result still stands.
	 */
	async _spinTo(index) {
		const root = this.element?.[0] ?? null;
		const rows = [...(root?.querySelectorAll(".stonetop-weather-row") ?? [])];
		for (const el of rows) el.classList.remove(PICKED_CLASS, OFFERED_CLASS);
		if (!rows[index]) return true;

		this._spin?.cancel();
		const spin = spinHighlight(rows, index, { scope: root, from: this._picked?.index ?? -1 });
		this._spin = spin;

		if (!await spin.done) return false;
		rows[index].classList.add(PICKED_CLASS);
		return true;
	}

	// Stop the rain (or start it again) without closing the window.
	//
	// The one control here that acts the moment it is pressed rather than waiting for Post: the
	// GM reaching for this is a GM whose players are watching a blizzard right now. Nothing else
	// in the window moves — a standing result is still standing when the canvas goes still.
	//
	// It writes the same world setting the config screen shows, so there is one answer to "why
	// is nothing happening on the map" rather than two that can disagree. See setWeatherFxPaused.
	async _toggleFx() {
		if (!fxMasterActive()) return;
		await setWeatherFxPaused(!weatherFxPaused());
		this.render(false);
	}

	// The way out to the permanent switch, in core's own Configure Settings.
	//
	// A LINK rather than a third button: Pause is for tonight, and this is for a table that has
	// decided it does not want its canvas touched at all. The window stays open behind it (see
	// utils/front-on-open.js — our windows float as they open and then take their turn in the
	// stack like anything else), so a GM who only wanted a look can come straight back to the
	// row they were about to post.
	_openWeatherSettings() {
		return openSystemSetting(WEATHER_FX_SETTING);
	}

	// Send the standing result to the table and close.
	//
	// ONE call, because the card and the steading's glyph are one act: a card in the log saying
	// it is snowing over a header still showing a sun is worse than either. This used to be the
	// two calls in a row with a comment saying they must not be split, which held only while
	// this stayed the one caller — see `announceWeather` in seasons/current-weather.js, which
	// is where the pair now lives, along with the steading lookup it does for itself.
	//
	// A refused post (a user who may not write the steading) leaves the window up with its
	// result still standing, since nothing went out.
	async _post() {
		if (!this._picked) return;
		if (await announceWeather(this._season, this._picked)) this.close();
	}
}
