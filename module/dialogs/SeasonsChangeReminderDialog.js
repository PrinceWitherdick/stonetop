import { getSetting, setSetting } from "../settings.js";
import { openOrFocus } from "../utils/open-or-focus.js";
import { seasonIconSrc, seasonLabel } from "../seasons/seasons-change-reminders.js";

// ── SeasonsChangeReminderDialog ──────────────────────────────────────────────
// The per-player popup that fires when the Seasons Change move is used and the
// player's character carries a seasonal move/possession (see
// seasons-change-reminders.js). Lists each item and its season-facing rule, with
// an OK button and a "Don't show again" checkbox — the same dismissal pattern as
// the GM Welcome guide (a client-scoped setting).
export class SeasonsChangeReminderDialog extends Application {
	constructor(season, reminders, options = {}) {
		super(options);
		this._season = season;
		this._reminders = reminders;
	}

	// Singleton: a second seasons-change while one is open refreshes it with the
	// new season/reminders rather than stacking a duplicate window.
	static open(season, reminders) {
		const existing = Object.values(ui.windows).find(w => w.id === "stonetop-seasons-reminder");
		if (existing?.rendered) {
			existing._season = season;
			existing._reminders = reminders;
			existing.render(false);
			return existing.bringToTop();
		}
		return openOrFocus("stonetop-seasons-reminder", () =>
			new SeasonsChangeReminderDialog(season, reminders).render(true));
	}

	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id:        "stonetop-seasons-reminder",
			title:     "The Seasons Change",
			template:  "systems/stonetop_pwd/templates/dialogs/seasons-change-reminder.hbs",
			width:     460,
			height:    "auto",
			classes:   ["stonetop", "stonetop-seasons-reminder-dialog"],
		});
	}

	getData() {
		return {
			seasonLabel:   seasonLabel(this._season),
			seasonIcon:    seasonIconSrc(this._season),
			reminders:     this._reminders,
			multiChar:     new Set(this._reminders.map(r => r.character)).size > 1,
			dontShowAgain: !!getSetting("seasonsChangeReminderDismissed"),
		};
	}

	activateListeners(html) {
		super.activateListeners(html);
		html.find('[data-action="ok"]').on("click", () => this.close());
		html.find(".stonetop-seasons-reminder-dontshow-input").on("change", ev =>
			setSetting("seasonsChangeReminderDismissed", ev.currentTarget.checked));
	}
}
