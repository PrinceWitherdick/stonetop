// The season-and-year picker: four season cards over a year dropdown, click a card to commit.
//
// Two flows ask this same question and must read as the same question:
//   • Seasons Change (the MOVE) — "which season is beginning?", then the move's own dialog runs,
//     applying gains, resetting Fortunes and writing a journal page.
//   • Set the Current Season — "which season is Stonetop in?", which only corrects what the
//     header's clock says and makes no move at all.
//
// They were written twice, and had already drifted: only one of them offered the steading
// header shortcut. What varies between them is wording, how many years to offer, whether a
// season is shown as already-chosen, and what a click DOES — everything else, including the
// markup that `.stonetop-season-card` is styled against, is the same picture.
import { SEASON_IDS, seasonLabel, seasonIconSrc } from "./seasons-change-reminders.js";
import { yearLabel } from "./seasons-chronicle.js";
import { addStonetopSteadingButton } from "../utils/world.js";
import { bringDialogToFront } from "../utils/front-on-open.js";
import { escHtml } from "../utils/strings.js";

/** Ties the year label to its select. One picker is open at a time, so a constant id will do. */
const YEAR_SELECT_ID = "stonetop-season-year-select";

/**
 * Open the picker.
 *
 * @param {object}   options
 * @param {string}   options.title           Window title.
 * @param {string}   options.prompt          The italic question over the cards.
 * @param {string}   [options.note]          A footnote under the year row; omitted when empty.
 * @param {string}   [options.selected]      Season id to draw as already chosen.
 * @param {number}   options.years           How many years to offer (1..years).
 * @param {number}   options.selectedYear    Which of them starts selected, and the fallback if
 *                                           the select is somehow unreadable.
 * @param {boolean}  [options.headerShortcut=false]  Add the "Stonetop" header button. The move's
 *   picker carries it (it can be opened from a hotbar macro, away from the sheet); the
 *   correct-the-clock picker is opened FROM the steading header, where it would point at the
 *   window you are already looking at.
 * @param {(season: string, year: number) => any} options.onPick  Run after the dialog closes.
 */
export function openSeasonPicker({
	title,
	prompt,
	note = "",
	selected = null,
	years,
	selectedYear,
	headerShortcut = false,
	onPick,
}) {
	const yearOptions = Array.from({ length: years }, (_, i) => i + 1)
		.map(y => `<option value="${y}"${y === selectedYear ? " selected" : ""}>${yearLabel(y)}</option>`)
		.join("");

	const cards = SEASON_IDS.map(id => `
					<div class="stonetop-season-card${id === selected ? " is-selected" : ""}" data-season="${id}">
						<img src="${seasonIconSrc(id)}" alt="${escHtml(seasonLabel(id))}" class="stonetop-season-icon">
						<span class="stonetop-season-label">${escHtml(seasonLabel(id))}</span>
					</div>`).join("");

	// `const` despite the render callback below referring to `dialog`: the callback runs after
	// this statement completes, so the binding is always initialised by then.
	const dialog = new Dialog({
		title,
		content: `<div class="stonetop-season-picker">
				<p><em>${escHtml(prompt)}</em></p>
				<div class="stonetop-season-cards">${cards}</div>
				<div class="stonetop-season-year">
					<label class="stonetop-season-year-label" for="${YEAR_SELECT_ID}">Year</label>
					<select id="${YEAR_SELECT_ID}" class="stonetop-season-year-select">${yearOptions}</select>
				</div>
				${note ? `<p class="stonetop-season-picker-note"><em>${escHtml(note)}</em></p>` : ""}
			</div>`,
		buttons: {},
		render: (html) => {
			// Both callers open this FROM the steading sheet, which is the case front-on-open
			// exists for: an ad-hoc `new Dialog(...)` gets no subclass of ours, so without this
			// it can land behind the sheet that spawned it and read as a click that did nothing.
			// Every other sheet-spawned dialog in the system carries it.
			bringDialogToFront(html);
			if (headerShortcut) addStonetopSteadingButton(html);
			const yearSelect = html[0].querySelector(".stonetop-season-year-select");
			html[0].querySelectorAll(".stonetop-season-card").forEach(el => {
				el.addEventListener("click", async () => {
					const year = Math.trunc(Number(yearSelect?.value)) || selectedYear;
					// Closed BEFORE the pick runs: both callers open something else (the move's
					// dialog) or write a flag that re-renders the sheet underneath.
					dialog.close();
					await onPick(el.dataset.season, year);
				});
			});
		},
	}, { classes: ["dialog", "stonetop", "stonetop-season-picker-dialog"] });
	dialog.render(true);
	return dialog;
}
