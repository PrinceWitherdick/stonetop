import { StonetopSteading, HERD_SURPLUS_PER, WINTER_DEBT_STEP, SURPLUS_SEASON_STEP, REMINDER_SEASON_STEP, INN_ROLL_SEASON_STEP } from "./StonetopSteading.js";
import { confirmOutcome } from "../../utils/ask-with-buttons.js";
import { sign, postSeasonsRollPrompt } from "../../utils/roll-engine.js";
import { escHtml as _esc } from "../../utils/strings.js";
import { rolledTotalCard } from "../../utils/chat.js";
import { winterConsequencesHtml, sufferWinterShortfall, winterDebtState, winterDebtStepHtml, wireWinterDebtStep } from "./winter-debt.js";
import { winterConsumption, seasonalYields, MILITIA_SEASON_STEP } from "./season-effects.js";
import { upkeepsDue, withSurplusBonus, surplusBonusNote } from "./improvement-rules.js";
import { promptRoll, tookOffer } from "../../dialogs/RollDialog.js";
import { settleSteadingRoll } from "./steading-roll.js";
import { postSeasonsChangeReminder, seasonIconSrc, seasonLabel } from "../../seasons/seasons-change-reminders.js";
import { recordSeasonsChange, yearLabel } from "../../seasons/seasons-chronicle.js";
import { readCurrentSeason, recordCurrentSeason } from "../../seasons/current-season.js";
import { SEASONAL_GAINS } from "../../dialogs/spring-burst-data.js";
import { applySeasonalGains, MECHANICAL_GAIN_KEYS } from "./seasonal-gains.js";
import { addStonetopSteadingButton } from "../../utils/world.js";
import { createInlineActionsDialog } from "../../utils/inline-actions-dialog.js";
import { applyGuideRail, guideRailStep } from "../../utils/guide-rail.js";

// ── The Seasons Change window ─────────────────────────────────────────────────
// The move itself, walked step by step: what the book times at the season's start, the
// +Fortunes roll and the gains it lets them pick, what the season brings and what it costs,
// the Inn's talk, and the Chronicle close-out. Opened by the steading sheet's
// `_showSeasonDialog` (the move's season picker, the hotbar macro, the time banner).
//
// Split the way the other steading windows are (winter-debt.js, inn-gathering.js):
//   • seasonsChangeView reads the steading ONCE, when the window opens;
//   • seasonsChangeSteps / seasonsChangeHtml turn that view into markup, pure, so every
//     season's rail is renderable and testable without a world;
//   • openSeasonsChangeDialog draws it and wires each step's buttons.
//
// The sheet it was opened from is the `sheet` argument, for the four things that are the
// sheet's own: repainting it (`render(false)`), its harvest and militia readers, its roll
// pipeline (`_rollSeasonsChangeFortunes`, `_sheetRollMode`, `_rollSeasonSurplus`, shared with
// the header and the Moves tab), and the requirement-box write `_onImprovementReq`.

/** Who says the Seasons Change rolls (the harvest, winter's consumption, the herd) in chat: the
 *  move, not whichever character the GM happens to have selected. */
export const SEASONS_SPEAKER = { alias: "Seasons Change" };

/** Every stat change in this walkthrough is an effect of the Seasons Change homefront move, so
 *  the ledger attributes them to it. A fresh object per write, as the update options it rides in. */
const seasonsMove = () => ({ stonetopMove: "Seasons Change" });

/** The rule the window draws between two blocks sharing a step. */
const SEASON_DIVIDER = `<hr class="stonetop-season-divider">`;

/**
 * What the Seasons Change window says about one improvement's upkeep (improvement-rules.js#upkeepsDue):
 * its sentence, its two buttons and the notices either answer posts. The watch and the weapons keep
 * the words they always had; any other improvement's (a homebrew one's) gets the same shape in
 * general words. Labels go into HTML through `_esc`; the notices are plain text.
 */
export function upkeepCopy(due) {
	const n = due.surplus;
	if (due.slug === "standingWatch") return {
		icon: "fa-shield-halved", payIcon: "fa-drumstick-bite",
		sentence: `consumes <strong>${n} Surplus</strong> at the start of the season, or it disbands.`,
		pay: `Feed the watch (${n} Surplus)`, lose: "Disband the watch", shortNote: "",
		shortWarning: "No Surplus left to feed the watch. It disbands unless you find one.",
		done: left => `The watch is fed: ${n} Surplus spent (${left} left).`,
		lost: () => "The standing watch disbands. Its warriors go back to their trades.",
	};
	if (due.slug === "weaponsOfWar") return {
		icon: "fa-hammer", payIcon: "fa-hammer",
		sentence: `want <strong>${n} Surplus</strong> this spring, to maintain and replace them, or the steading loses the improvement.`,
		pay: `Pay the upkeep (${n} Surplus)`, lose: "Don't pay: lose Weapons of War",
		shortNote: "No Surplus to pay with: unless some is found, the steading loses Weapons of War.",
		shortWarning: "No Surplus left for the weapons' upkeep. The steading loses Weapons of War unless you find one.",
		done: left => `Weapons of War maintained: ${n} Surplus spent (${left} left).`,
		lost: summary => summary.length
			? `The weapons go unmaintained, and the steading loses Weapons of War. Reverted: ${summary.join("; ")}.`
			: "The weapons go unmaintained, and the steading loses Weapons of War.",
	};
	const name = _esc(due.label);
	const when = due.start ? "at the start of the season" : `this ${due.seasons.length === 1 ? due.seasons[0] : "season"}`;
	return {
		icon: "fa-coins", payIcon: "fa-coins",
		sentence: `wants <strong>${n} Surplus</strong> ${when}, or the steading loses the improvement.`,
		pay: `Pay the upkeep (${n} Surplus)`, lose: `Don't pay: lose ${name}`,
		shortNote: `Not enough Surplus to pay with: unless some is found, the steading loses ${name}.`,
		shortWarning: `Not enough Surplus left for the upkeep of ${due.label}. The steading loses it unless you find some.`,
		done: left => `${due.label} maintained: ${n} Surplus spent (${left} left).`,
		lost: summary => `The upkeep of ${due.label} goes unpaid, and the steading loses it.${summary.length ? ` Reverted: ${summary.join("; ")}.` : ""}`,
	};
}

// ── What the window reads off the steading ────────────────────────────────────

/**
 * Everything the window's markup is built from, read once as it opens. Plain data (plus the
 * `built` lookup), so seasonsChangeSteps can be handed a hand-made one in a test.
 *
 * NOT the season's opening Fortunes: a window opened early to look would lock in a mid-play
 * figure. That is noted when the +Fortunes roll is made (or handed over), and failing that by
 * the reset (StonetopSteading#openingFortunes).
 *
 * @param {object} sheet     the steading sheet the window is opened from
 * @param {string} seasonId  the season beginning
 * @param {number} year      the campaign year it belongs to
 */
export function seasonsChangeView(sheet, seasonId, year) {
	const steading   = sheet._stonetopSteading;
	const fortunes   = steading.getStatValue("fortunes");
	const surplus    = steading.getStatValue("surplus");
	const population = steading.getStatValue("population");

	// Ten of the book's improvements end in a seasonal "Henceforth…". The arithmetic lives in
	// season-effects.js, pure; what happens here is only reading what it needs.
	const rules = steading.improvementRules();
	// Size sets winter's dice: a hamlet's 1d2, a village's 1d4, a town's 2d6 (Book I p. 518).
	const size = steading.steadingSize();

	// Each improvement's `seasonalYield` (season-effects.js). `surplus` is the figure the season
	// opened with, for a yield that asks "and Stonetop has at least 1 Surplus". The Golden
	// Sapling's "+1 whenever the steading generates Surplus" is added to each one that pays.
	const yields = seasonalYields({ seasonId, population, surplus, rules })
		.map(y => {
			// `take`: what taking it gives, the bonus included.
			const bonus = y.amount ? withSurplusBonus(y.amount, rules) : null;
			return { ...y, bonus, take: bonus?.gain ?? y.amount };
		});

	// Winter's 7-9 debt, unpaid when winter ran out. "Before winter ends, or suffer the
	// consequences again": spring's Seasons Change opens on it. Found by the stamp it was
	// rolled under (last year's winter), not by the clock, so a clock corrected by hand
	// in between does not lose it.
	const lastWinter = `${year - 1}:winter`;
	const winterDebtDue = seasonId === "spring" ? steading.winterDebtFor(lastWinter) : null;

	// Autumn's harvest, never rolled, as winter arrives: only while the clock still reads THAT
	// autumn (winter's window opens before winter is recorded), so a table that never ran autumn
	// through the sheet is not asked about a harvest it never had.
	const clockNow = readCurrentSeason(sheet.actor);
	const harvestLate = seasonId === "winter"
		&& clockNow?.season === "autumn" && clockNow.year === year
		&& steading.harvestOwed(year, "autumn");

	return {
		seasonId, year,
		label: seasonLabel(seasonId),
		fortunes, surplus, population,
		// "Reset Fortunes to +1 (or +0 if the village is currently malcontent)", as it reads now.
		resetFortunes: steading.fortunesResetTarget(),
		rules, size,
		harvest: sheet._harvestRoll(rules),
		winterBill: winterConsumption({ population, rules, size }),
		// Winter's 7-9 asks for the same roll a second time, so its ladder line names what THIS
		// steading would roll rather than the book's general 1d4+Population — a Township that
		// read "1d4" there and then watched 2d6 come up would have to guess which was right.
		winterAgain: winterConsumption({ population, rules, size, second: true }),
		yields,
		upkeeps: upkeepsDue(rules, seasonId),
		tactics: sheet._militiaTactics(),
		built: slug => steading.improvementCompleted(slug),
		lastWinter, winterDebtDue, harvestLate,
	};
}

// ── The window's markup ───────────────────────────────────────────────────────

const step = (key, title, icon, body) => ({ key, title, icon, body: body.trim() });

// Blocks sharing a step get a rule BETWEEN them, never before the first.
const joinBlocks = blocks => blocks.filter(Boolean).join(SEASON_DIVIDER);

// One line naming every improvement that rewrote a roll, under the button that rolls it.
// Without it the dice simply change and nothing on screen says why — which is the same
// complaint as a formula the GM is asked to trust.
const partsNote = parts => parts.length > 1
	? `<p class="stonetop-season-note">${parts.map(p => `${_esc(p.label)}: <strong>${_esc(p.amount)}</strong>`).join(" &nbsp;·&nbsp; ")}</p>`
	: "";

// ONE shape for the seasonal dues. Each was written out in full — the divider, the
// `.stonetop-season-watch` box, the icon/name/"Surplus: N" line, then the body — so they
// differed only in their sentence and their controls, and had already drifted on where the
// weapons' block put its `.stonetop-season-actions`.
//
// No divider of its own: the blocks share a step, and joinBlocks puts one BETWEEN them, so
// the first never opens on a rule.
const upkeepBlock = ({ icon, name, sentence, body }, surplus) => `<div class="stonetop-season-watch">
		<p class="stonetop-season-note"><i class="fas ${icon}"></i> <strong>${name}</strong> ${sentence} Surplus: <strong>${surplus}</strong>.</p>
		${body}
	</div>`;

/**
 * The window's steps, in the order the GM works through them, each `{ key, title, icon, body }`.
 * A step with nothing in it this season is left off the rail entirely.
 *
 * The order is what the GM does in: what the book times at the season's START (last winter's
 * debt, the watch's upkeep), then the roll and what it lets them pick, then what the season
 * BRINGS (Surplus rolled and earned), then what it COSTS (the weapons in spring, the militia in
 * summer, the herd in winter), then the Inn's talk, then the notes and the close-out. It is
 * deliberately not the order the improvements appear on their own tab, because nobody works
 * through a season alphabetically.
 *
 * @param {ReturnType<typeof seasonsChangeView>} v
 */
export function seasonsChangeSteps(v) {
	const { seasonId, fortunes, surplus, resetFortunes, harvest, winterBill, winterAgain, yields, upkeeps, built } = v;

	// Spring hands the roll to the table (the most hopeful PC rolls in chat), so it
	// shows "Ask the most hopeful…" where the other seasons show "Roll +Fortunes".
	// "Whatever the result, reset Fortunes to +1" is its own button, directly under the
	// roll it follows, and never a side effect of closing the window: the GM takes each
	// step of the season deliberately. Once a season, like the Surplus steps.
	const rollOrAskBtn = seasonId === "spring"
		? `<button class="stonetop-season-btn" data-action="ask-hopeful">
			<i class="fas fa-comment-dots"></i> Ask the most hopeful to roll (in chat)
		</button>`
		: `<button class="stonetop-season-btn" data-action="roll-fortunes">
			<i class="fas fa-dice-d6"></i> Roll +Fortunes (current: <span data-season-live="fortunes">${sign(fortunes)}</span>)
		</button>`;
	// Both figures are kept live by the window's updateActor hook: winter is the one season
	// whose Fortunes moves BEFORE its roll (a shortfall), and a shortfall at −1 can mark
	// malcontent, which turns the reset into +0.
	const fortunesBtns = `<div class="stonetop-season-actions">
		${rollOrAskBtn}
		<button class="stonetop-season-btn" data-action="reset-fortunes">
			<i class="fas fa-rotate-left"></i> Then reset Fortunes to <span data-season-live="reset">${sign(resetFortunes)}</span>
		</button>
	</div>`;

	// Seasonal gains as a checklist the GM ticks (recorded into the Seasons Change journal by
	// the Chronicle step's "Record the season"). The ones with a mechanical effect (Population
	// boom, Unexpected bounty, Tor's blessing; seasonal-gains.js) are applied by that same
	// button when ticked rather than via their own buttons; it relabels to say so. Gain copy
	// comes from the shared SEASONAL_GAINS so the dialog and Chronicle stay in lockstep.
	const gainsRef = `<div class="stonetop-season-gains">
		<p class="stonetop-season-gains-label">Seasonal gains <span class="stonetop-season-gains-hint">(tick what they pick)</span></p>
		<ul class="stonetop-season-gains-list">
			${SEASONAL_GAINS.map(g => `<li class="stonetop-season-gain">
				<label class="stonetop-season-gain-label">
					<input type="checkbox" class="stonetop-season-gain-check" data-gain-key="${g.key}">
					<span class="stonetop-season-gain-body">
						<span class="stonetop-season-gain-name">${g.name}</span>
						<span class="stonetop-season-gain-text">${g.text}</span>
					</span>
				</label>
			</li>`).join("")}
		</ul>
		<p class="stonetop-season-note" data-season-gains-over hidden></p>
	</div>`;

	// Free-text notes recorded onto the season's Chronicle page (the omen, the threat that
	// surfaced, the hook it opens), and under them the button that closes the season out. It
	// lives on the LAST step, not in the footer, so it is only in reach once the GM has walked
	// the rest. The unreset warning is shown by the wiring, which knows whether the roll step's
	// reset has been taken.
	const notesBlock = `<div class="stonetop-season-notes-wrap">
		<label class="stonetop-season-notes-label"><i class="fas fa-feather"></i> Notes for the Chronicle</label>
		<textarea class="stonetop-season-notes" rows="2" placeholder="The omen, threat, or hook this season opens…"></textarea>
	</div>
	<p class="stonetop-season-note" data-season-unreset hidden>⚠️ Fortunes has not been reset yet this season. That is on the <strong>Roll +Fortunes</strong> step.</p>
	<p class="stonetop-season-note" data-season-debt-unpaid hidden>⚠️ Last winter's debt is still unsettled. That is on the <strong>Winter's end</strong> step.</p>
	<div class="stonetop-season-actions">
		<button class="stonetop-season-btn" data-action="record-season">
			<i class="fas fa-book"></i> Record the season &amp; close
		</button>
	</div>`;

	// Every improvement's UPKEEP this season, off its own `upkeep` grant (improvement-rules.js):
	// the Standing Watch's "At the start of each season, the watch consumes 1 Surplus or it
	// disbands"; Weapons of War's "Each spring, the village must expend 1 Surplus"; and any
	// homebrew one's (Book II's logging camp, "1 Surplus every summer or else it ceases
	// operation"). The price of not paying is the book's: "If the PCs fail to pay that cost,
	// they lose the improvement" (Book I p. 514). So every one is pay or lose, both offered as
	// buttons because the book makes them a genuine choice: a steading that would rather keep
	// the Surplus can let it go. Either answer settles the season. With too little Surplus to
	// pay, losing it is the only answer left, and the window says so.
	//
	// One owed EVERY season is owed at the start of it (the watch's own words), so it opens
	// the window, before the season's roll; one owed in named seasons is a cost of that season.
	const upkeepHtml = due => {
		const copy = upkeepCopy(due);
		const short = surplus < due.surplus;
		return upkeepBlock({
			icon: copy.icon,
			name: _esc(due.label),
			sentence: copy.sentence,
			body: `${short && copy.shortNote ? `<p class="stonetop-season-note"><em>${copy.shortNote}</em></p>` : ""}
				<div class="stonetop-season-actions" data-upkeep-slug="${_esc(due.slug)}">
				${short ? "" : `<button class="stonetop-season-btn" data-action="pay-upkeep" data-upkeep-slug="${_esc(due.slug)}">
					<i class="fas ${copy.payIcon}"></i> ${copy.pay}
				</button>`}
				<button class="stonetop-season-btn stonetop-season-btn--warn" data-action="lose-upkeep" data-upkeep-slug="${_esc(due.slug)}">
					<i class="fas fa-person-walking-arrow-right"></i> ${copy.lose}
				</button>
			</div>`,
		}, surplus);
	};
	const watchBlock = upkeeps.filter(u => u.start).map(upkeepHtml).join(SEASON_DIVIDER);
	const upkeepCostBlocks = upkeeps.filter(u => !u.start).map(upkeepHtml);

	// Well-Trained Militia: "Each summer, the militia must spend 1 Surplus and a week or so
	// practicing or else lose its training in 1 tactic." SUMMER only, and the watch's shape
	// rather than the weapons' — the book prices the neglect here, so both outcomes are
	// offered and taking either settles the season.
	//
	// WHICH tactic is lost is the table's, not ours: the book says "1 tactic" and names no
	// order, so the trained ones are listed and one is clicked, the way winter's four
	// consequences are. They are the improvement's own requirement boxes, so losing one
	// un-ticks the box that recorded the drilling.
	const drillsDue = seasonId === "summer" && built("wellTrainedMilitia");
	const tactics = drillsDue ? v.tactics : [];
	const militiaBlock = drillsDue
		? upkeepBlock({
			icon: "fa-bullseye",
			name: "Well-Trained Militia",
			sentence: "wants <strong>1 Surplus</strong> and a week of drills this summer, or it loses its training in 1 tactic.",
			body: `${surplus >= 1 ? `<div class="stonetop-season-actions">
				<button class="stonetop-season-btn" data-action="drill-militia">
					<i class="fas fa-bullseye"></i> Drill this summer (1 Surplus)
				</button>
			</div>` : ""}
			${tactics.length
				? `<p class="stonetop-season-note"><em>${surplus >= 1 ? "Or skip" : "No Surplus for the drills"}: the militia forgets one of these. Click the one it loses.</em></p>
					<ol class="stonetop-disaster-choices">
						${tactics.map(t => `<li class="stonetop-disaster-choice" data-tactic="${t.index}">
							<span class="stonetop-disaster-choice-label">${_esc(String(t.label).split(":")[0])}</span>
							<span class="stonetop-disaster-choice-detail">${_esc(t.label)}</span>
						</li>`).join("")}
					</ol>`
				: `<p class="stonetop-season-note"><em>The militia has no trained tactics left to lose.</em></p>`}`,
		}, surplus) : "";

	// Aurochs Hunting, and the one seasonal improvement that gets a LINE rather than a
	// button. "When you lead the aurochs hunt in spring, roll +Defenses" is a thing the
	// steading DOES at some point during spring, not a thing the turning of the season does
	// to it — the same distinction the Inn's gathering is filed under (see inn-gathering.js,
	// which says outright that a once-per-season thing with a fictional trigger belongs on
	// the improvement card and not in this window). Giving it a roll button here would
	// teach the table that the hunt happens when the Seasons Change, which is not what the
	// book says and would quietly pin a whole expedition to one click in a GM's window.
	//
	// So spring says it is available and where to run it, which closes the only gap that
	// mattered: a GM working through spring had nothing at all to remind them it exists.
	const aurochsNote = (seasonId === "spring" && built("aurochsHunting"))
		? `<p class="stonetop-season-note"><i class="fas fa-cow"></i> The herds are on the Flats: <strong>Aurochs Hunting</strong> is open this spring. It is led when the group leads it, not when the season turns, so it is rolled from its own card on the Improvements tab, or as the Aurochs Hunt in the Homefront moves.</p>`
		: "";

	// The Inn's own +Fortunes roll — a SECOND roll the season makes, not a variant of the
	// season's. "Henceforth, when the Seasons Change, whoever is friendliest rolls
	// +Fortunes", with no season named, so it is offered in all four.
	//
	// Handed to the table rather than rolled here, for the same reason spring's is: the
	// friendliest is a player. It does NOT spend a held +Fortunes advantage — that hold is
	// Rites of the Land's, promised to the steading's own roll, and which of two rolls in
	// one window counts as "next" is a ruling the table makes, not one to make for them.
	const innRollBlock = built("inn") ? `<div class="stonetop-season-watch">
			<p class="stonetop-season-note"><i class="fas fa-beer-mug-empty"></i> <strong>The Inn</strong>: whoever is friendliest rolls +Fortunes. On a <strong>10+</strong>, ask the GM 3 questions about the wider world; on a <strong>7-9</strong>, ask 1; on a <strong>6-</strong>, ask 1, but the GM describes some trouble that stems from the inn or its guests.</p>
			<div class="stonetop-season-actions">
				<button class="stonetop-season-btn" data-action="ask-friendliest">
					<i class="fas fa-comment-dots"></i> Ask the friendliest to roll (in chat)
				</button>
			</div>
		</div>` : "";

	// What the season's improvements generate, one row each. Separate buttons rather than
	// one "take it all", because they are separate rules with separate conditions and two
	// of them wait on a roll this window cannot read — and because a once-per-season marker
	// per row is what stops a reopen taking any single one of them twice.
	const yieldsBlock = yields.length ? `<div class="stonetop-season-yields">
			<p class="stonetop-season-gains-label">What the improvements bring <span class="stonetop-season-gains-hint">(each taken once a season)</span></p>
			<ul class="stonetop-season-yield-list">
				${yields.map(y => `<li class="stonetop-season-yield">
					<div class="stonetop-season-yield-head">
						<span class="stonetop-season-yield-name">${_esc(y.label)}</span>
						<span class="stonetop-season-yield-amount">${y.blocked || !y.amount ? "&mdash;" : `+${y.take} Surplus`}</span>
					</div>
					<p class="stonetop-season-yield-rule">${_esc(y.rule)}${y.bonus?.bonus ? _esc(surplusBonusNote(y.bonus)) : ""}</p>
					${y.blocked
						? `<p class="stonetop-season-note">${_esc(y.unmet)}</p>`
						: !y.amount
							? `<p class="stonetop-season-note">At this Population it generates nothing.</p>`
							: `<div class="stonetop-season-actions">
								<button class="stonetop-season-btn" data-action="take-yield"
									data-yield-key="${_esc(y.key)}" data-yield-amount="${y.take}" data-yield-label="${_esc(y.label)}">
									<i class="fas fa-wheat-awn"></i> ${y.needsHit ? `On a 7+: take ${y.take} Surplus` : `Take ${y.take} Surplus`}
								</button>
							</div>`}
				</li>`).join("")}
			</ul>
		</div>` : "";

	// The roll and the gains it lets them pick are ONE step: the ladder says how many to
	// pick, so the checklist belongs directly under it rather than a click away.
	const rollStep = (who, ladder, note) => step("roll", "Roll +Fortunes", "fa-dice-d6", `
		<p>Whoever is the <strong>${who}</strong> rolls +Fortunes:</p>
		<ul>${ladder.map(([tier, text]) => `<li><strong>${tier}:</strong> ${text}</li>`).join("")}</ul>
		<p class="stonetop-season-note">${note}</p>
		${fortunesBtns}
		${gainsRef}`);

	// Herd of Horses: summer promotes the tiers and adds foals (the season bringing
	// something), winter feeds the herd off Surplus (the season costing something).
	const hasHerd = built("herdOfHorses");
	const herdAdvanceBlock = (seasonId === "summer" && hasHerd) ? `<div class="stonetop-season-actions">
		<button class="stonetop-season-btn" data-action="advance-herd">
			<i class="fas fa-horse"></i> Advance the herd (promote tiers, add foals)
		</button>
	</div>` : "";
	const herdFeedBlock = (seasonId === "winter" && hasHerd) ? `<div>
		<p class="stonetop-season-note">The herd eats 1 Surplus per ${HERD_SURPLUS_PER} grown-or-yearling horses; each Surplus it goes short costs 1d6 horses.</p>
		<div class="stonetop-season-actions">
			<button class="stonetop-season-btn" data-action="feed-herd">
				<i class="fas fa-horse"></i> Feed the herd (consume Surplus, roll any losses)
			</button>
		</div>
	</div>` : "";

	// Spring opens on last winter's unpaid debt (seasonsChangeView#winterDebtDue).
	const winterEndStep = v.winterDebtDue
		? step("winterEnd", "Winter's end", "fa-hourglass-end", winterDebtStepHtml(winterDebtState(v.winterDebtDue)))
		: null;

	// Autumn's harvest, never rolled, as winter arrives. It belongs to the autumn just
	// ending, so it comes before winter eats anything: the Surplus it brings is what winter's
	// consumption is measured against.
	const harvestLateStep = v.harvestLate
		? step("harvestLate", "Autumn's harvest", "fa-wheat-awn", `
			<p>Autumn's harvest was never rolled. It comes before winter's consumption, which it feeds.</p>
			<div class="stonetop-season-actions">
				<button class="stonetop-season-btn" data-action="roll-late-harvest">
					<i class="fas fa-dice-d4"></i> Roll ${harvest.formula} Surplus (the harvest)
				</button>
			</div>
			${partsNote(harvest.parts)}`)
		: null;

	let seasonSteps;
	if (seasonId === "spring") {
		seasonSteps = [
			rollStep("most hopeful", [
				["10+", "Pick 1 seasonal gain."],
				["7–9", "Pick 1 seasonal gain, but a threat makes itself known or gets worse."],
				["6−", "Threats abound. Don't mark XP."],
			], "Whatever the result, reset Fortunes to +1."),
			step("brings", "What it brings", "fa-wheat-awn", joinBlocks([aurochsNote, yieldsBlock])),
		];
	} else if (seasonId === "summer") {
		seasonSteps = [
			rollStep("most content", [
				["10+", "Pick 2 seasonal gains."],
				["7–9", "Pick 1 seasonal gain."],
				["6−", "A threat makes itself known or gets worse. Don't mark XP."],
			], "Whatever the result, the steading generates 1d4−1 Surplus, then Fortunes resets to +1."),
			step("brings", "What it brings", "fa-wheat-awn", joinBlocks([
				`<div class="stonetop-season-actions">
					<button class="stonetop-season-btn" data-action="roll-surplus">
						<i class="fas fa-dice-d4"></i> Roll 1d4−1 Surplus (add to steading)
					</button>
				</div>${herdAdvanceBlock}`,
				yieldsBlock,
			])),
		];
	} else if (seasonId === "autumn") {
		seasonSteps = [
			rollStep("most determined", [
				["10+", "Pick 1 seasonal gain."],
				["7–9", "Pick 1 seasonal gain, but a threat makes itself known or gets worse."],
				["6−", "Threats abound. Don't mark XP."],
			], `Whatever the result, reset Fortunes to +1. When harvest is complete, the steading generates ${harvest.formula} Surplus.`),
			step("brings", "What it brings", "fa-wheat-awn", joinBlocks([
				// "When the harvest is complete, roll 1d4": the END of autumn ("that roll
				// comes at the end of the season", p. 523). So it is not a thing to do on
				// the season's first day: until it is rolled it waits on the steading's
				// header, and the season can be recorded without it.
				`<p class="stonetop-season-note"><i class="fas fa-wheat-awn"></i> <strong>The harvest</strong> is rolled when it is complete, at the end of autumn, not now. Until then it waits on the steading's header (the sheaf); roll it from there when autumn's play is done, or here if it already is.</p>
				<div class="stonetop-season-actions">
					<button class="stonetop-season-btn" data-action="roll-surplus" data-formula="${_esc(harvest.formula)}">
						<i class="fas fa-dice-d4"></i> The harvest is complete: roll ${harvest.formula} Surplus
					</button>
				</div>
				${partsNote(harvest.parts)}`,
				yieldsBlock,
			])),
		];
	} else {
		// Winter has no gains to pick, and its consumption and +Fortunes roll stay ONE step:
		// the roll only unlocks once the consumption is settled (see wireWinterToll), so a step
		// of its own would open on nothing.
		seasonSteps = [
			step("toll", "Winter's toll", "fa-snowflake", `
				<p>Whoever is the <strong>weariest</strong> rolls ${winterBill.formula} (min 0); the steading consumes that much Surplus.</p>
				${partsNote(winterBill.parts)}
				<div id="stonetop-winter-step1" class="stonetop-season-actions">
					<button class="stonetop-season-btn" data-action="roll-consumption" data-formula="${_esc(winterBill.formula)}">
						<i class="fas fa-dice-d4"></i> Roll ${winterBill.formula} for Surplus Consumption
					</button>
				</div>
				<!-- Stands in for step 1 when the window is REOPENED on a winter whose
				     consumption has already been settled. Winter is the one season that
				     runs in two halves, and the second half used to be reachable only as a
				     side effect of clicking the first: see wireWinterToll. -->
				<p id="stonetop-winter-settled" class="stonetop-season-note" hidden>
					The steading's winter consumption is already settled this season. What is left of winter follows.
				</p>
				<div id="stonetop-winter-step2" hidden>
					<p id="stonetop-winter-result" class="stonetop-season-note"></p>
					<div id="stonetop-winter-ok" hidden>
						<div class="stonetop-season-actions">
							<button class="stonetop-season-btn" data-action="apply-consumption">Apply Surplus Consumption</button>
						</div>
					</div>
					<div id="stonetop-winter-shortfall" hidden>
						<p>⚠️ <strong>Not enough Surplus.</strong> Surplus drops to 0 and the steading Meets with Disaster (Fortunes −1, or at −1 the GM marks a debility). Then the weariest picks 1:</p>
						${winterConsequencesHtml()}
					</div>
				</div>
				<!-- On screen from the start, greyed and inert, so the window shows winter
				     HAS a +Fortunes roll before the toll is settled (the book's order:
				     "Then, roll +Fortunes"). Unlocked by wireWinterToll. -->
				<div id="stonetop-winter-step3" class="stonetop-season-later" inert>
					<hr class="stonetop-season-divider">
					<p class="stonetop-season-later-note"><i class="fas fa-lock" aria-hidden="true"></i> Once the toll above is settled:</p>
					<p>Then, roll +Fortunes:</p>
					<ul>
						<li><strong>10+:</strong> Winter is relatively mild. Each player names a local NPC with whom their relationship improves.</li>
						<li><strong>7–9:</strong> The steading must consume ${winterAgain.formula} more Surplus before winter ends, or suffer the consequences again.</li>
						<li><strong>6−:</strong> As 7–9, plus threats abound. Don't mark XP.</li>
					</ul>
					<p class="stonetop-season-note">Whatever the result, reset Fortunes to +1.</p>
					${fortunesBtns}
					<div class="stonetop-season-actions">
						<button class="stonetop-season-btn stonetop-season-btn--warn" data-action="record-winter-debt">
							<i class="fas fa-hourglass-half"></i> On a 7-9 or 6-: roll what winter still wants
						</button>
					</div>
				</div>`),
		];
	}

	// Every season closes the same way, so these are appended ONCE rather than pasted into
	// each of the four branches, and each block gates on its own season inside its own
	// definition. A ninth seasonal obligation is one edit here, not four.
	//
	// Two steps come BEFORE the season's own, because the book times them there:
	//  · Winter's end (spring only): last winter's unpaid debt, due "before winter ends".
	//  · The Standing Watch: "At the start of each season, the watch consumes 1 Surplus or
	//    it disbands." Most visibly in winter, where feeding it before the consumption roll
	//    or after decides whether there is anything left to feed it with.
	const steps = [
		harvestLateStep,
		winterEndStep,
		step("start", "Start of the season", "fa-shield-halved", watchBlock),
		...seasonSteps,
		step("costs", "What it costs", "fa-coins", joinBlocks([herdFeedBlock, ...upkeepCostBlocks, militiaBlock])),
		step("inn", "The Inn", "fa-beer-mug-empty", innRollBlock),
		step("chronicle", "Chronicle", "fa-feather", notesBlock),
	].filter(s => s?.body);
	return steps;
}

/**
 * The whole window: the same left rail as the Welcome guide (the shared `.stonetop-guide-*`
 * chrome), the season's header and the steading's numbers at the top of it, and one step
 * showing at a time beside it. Stacked, a summer with a few improvements ran well past the
 * height of a laptop screen.
 *
 * Every step's markup is IN the window from the start and only hidden, never rendered on
 * demand: the listeners bind once against the whole content, "Record the season" reads the
 * gains and notes off it wherever they are, and a ticked gain survives the GM wandering off to
 * another step and back.
 *
 * @param {ReturnType<typeof seasonsChangeView>} v
 * @param {ReturnType<typeof seasonsChangeSteps>} steps
 */
export function seasonsChangeHtml(v, steps) {
	// The season beside its icon, and the year in the same stadium chip the steading header's
	// clock wears. NOT in the season's ink: those four colours belong to the header's clock and
	// nowhere else — see the token block in styles/stonetop.css. The season is named by the
	// window title, by this heading and by its glyph already; a colour spent here would be the
	// fourth thing saying it and the second place teaching the eye that a coloured season means
	// something.
	//
	// The icon's `alt` is empty on purpose, as it is on the picker's cards: the <h3> right
	// beside it names the season in text, and a filled alt would say "Spring" twice.
	const header = `<div class="stonetop-season-flow-header">
		<img src="${seasonIconSrc(v.seasonId)}" alt="" class="stonetop-season-icon-sm">
		<h3 class="stonetop-season-flow-title">${v.label}</h3>
		<span class="stonetop-season-flow-year stonetop-year-chip">${yearLabel(v.year)}</span>
	</div>`;

	// The steading's three numbers, under the header at the top of the rail, so they stay in
	// view whichever step is showing. Kept LIVE by the window's updateActor hook, because half
	// the buttons in this window move Surplus and a figure captured at open would be wrong by
	// the second click.
	const statsNote = `<dl class="stonetop-season-rail-stats">
		<div><dt>Fortunes</dt><dd data-season-stat="fortunes">${sign(v.fortunes)}</dd></div>
		<div><dt>Surplus</dt><dd data-season-stat="surplus">${v.surplus}</dd></div>
		<div><dt>Population</dt><dd data-season-stat="population">${sign(v.population)}</dd></div>
	</dl>`;

	return `<div class="stonetop-season-flow">
		<div class="stonetop-guide-split">
			<aside class="stonetop-guide-toc stonetop-season-rail">
				${header}
				${statsNote}
				<nav aria-label="Seasons Change steps">
					<ol class="stonetop-guide-toc-list">
						${steps.map((s, i) => `<li class="stonetop-guide-toc-item${i === 0 ? " is-active" : ""}">
							<button type="button" class="stonetop-guide-toc-btn stonetop-season-tab" data-season-tab="${s.key}"${i === 0 ? ` aria-current="true"` : ""}>
								<i class="fas ${s.icon} stonetop-guide-toc-icon"></i>
								<span class="stonetop-guide-toc-text">${s.title}</span>
								${s.key === "roll" ? `<span class="stonetop-guide-toc-count stonetop-season-gains-count" hidden></span>` : ""}
							</button>
						</li>`).join("")}
					</ol>
				</nav>
			</aside>
			<div class="stonetop-guide-main stonetop-season-main">
				${steps.map((s, i) => `<section class="stonetop-season-section" data-season-tab="${s.key}"${i === 0 ? "" : " hidden"}>${s.body}</section>`).join("")}
			</div>
		</div>
	</div>`;
}

/**
 * The word when more gains are ticked than any roll allows, or "" when they are not: "On a 7+
 * in spring or autumn or a 7-9 in summer, the rolling player gets to pick a seasonal gain. On a
 * 10+ in summer, they get to pick two." A warning, not a lock: the window cannot read the tier,
 * and a table that has another reason to take one more is told, not stopped.
 */
export function gainsOverWarning(seasonId, n) {
	const gainsMax = seasonId === "summer" ? 2 : 1;
	if (n <= gainsMax) return "";
	return seasonId === "summer"
		? `⚠️ ${n} ticked. Summer's roll picks 2 on a 10+ and 1 on a 7-9.`
		: `⚠️ ${n} ticked. This season's roll picks 1 on a 7+.`;
}

/** The close-out button's label, naming the gains it is about to write when any are ticked. */
export function recordSeasonLabel(checkedKeys = []) {
	const willApply = checkedKeys.some(key => MECHANICAL_GAIN_KEYS.includes(key));
	return `<i class="fas fa-book"></i> ${willApply
		? "Apply those gains, record the season &amp; close"
		: "Record the season &amp; close"}`;
}

/** The ticked gains' names, in the order they were ticked off the list, for the Chronicle. */
export function seasonGainNames(checkedKeys = []) {
	return checkedKeys
		.map(key => SEASONAL_GAINS.find(g => g.key === key)?.name)
		.filter(Boolean);
}

/** The ticked gains' keys off the window. */
function checkedGainKeys(root) {
	return Array.from(root.querySelectorAll(".stonetop-season-gain-check:checked"))
		.map(el => el.dataset.gainKey);
}

// ── The window's writes ───────────────────────────────────────────────────────

/**
 * The Chronicle step's "Record the season": apply the ticked gains with a mechanical effect,
 * record this season into the chosen `year`'s page of the "Seasons Change" Chronicle journal
 * (with the net Surplus change since the window opened), stamp the season on the clock, then
 * open the page. Completing a Winter advances the steading's current year so the next picker
 * defaults to the new one. GM-only.
 *
 * Fortunes is NOT reset here: that is its own button on the roll step, so the GM takes it
 * deliberately after the roll rather than as a side effect of closing the window.
 *
 * @param {object} steading  the StonetopSteading
 * @param {object} actor     its actor, whose clock is stamped
 * @param {object} season
 * @param {string} season.seasonId
 * @param {number} season.year
 * @param {string[]} season.checkedKeys     the gains ticked
 * @param {string} season.notes             the Chronicle notes
 * @param {number} [season.fortunes]       the Fortunes to record when the season's opening figure
 *   was never noted; the live figure when omitted. The opening figure wins whenever there is one
 * @param {number|null} season.initialSurplus  the Surplus the window opened with
 */
export async function recordSeason(steading, actor, { seasonId, year, checkedKeys = [], notes = "", fortunes, initialSurplus = null }) {
	// The Fortunes the season OPENED with, the one its roll was made off — not the figure the
	// window happened to read when it opened. A window opened early to look would otherwise file
	// a mid-play figure, the very case StonetopSteading#openingFortunes is noted to guard against
	// (the herd's foals and the Inn read the same note). Read before the gains below, which can
	// move Fortunes. Nothing noted means the window never saw the roll made nor the reset taken,
	// so Fortunes has not been reset and the live figure is still the season's own.
	const opening = steading.openingFortunes?.(year, seasonId) ?? null;
	const chronicleFortunes = opening ?? (Number.isFinite(fortunes) ? fortunes : steading.getStatValue("fortunes"));

	// A muster does not survive the turning of the season ("until the threat passes, the
	// Seasons Change, or you cease to oversee it"). It would lapse on its own by the
	// clock, but a muster that took the +1 Defenses has to be stood DOWN rather than
	// simply forgotten, or the bonus is stranded on the sheet with nothing left to
	// explain it. Read raw, since the clock may already have moved past it.
	const updates = {};
	const flagUpdates = {};
	const notices = [];
	const lapse = steading.musterLapseChanges();
	if (lapse) {
		Object.assign(updates, lapse.system);
		Object.assign(flagUpdates, lapse.flags);
		notices.push(lapse.held.defenses
			? "The muster lapses with the season; its +1 Defenses is given back."
			: "The muster lapses with the season.");
	}

	// Apply the mechanical gains the GM ticked (Population boom, Unexpected bounty, Tor's
	// blessing; the others are narrative-only) with the lapse above, in ONE update named
	// for the Seasons Change, so the ledger appends once and the stats card together.
	// The gains themselves live in seasonal-gains.js, shared with the session-zero spring.
	//
	// `surplus` is the Surplus once the bounty lands, the end of the season flow's net
	// change: the live value already reflects the season's surplus/consumption buttons.
	const { surplus: finalSurplus } = await applySeasonalGains(steading, checkedKeys,
		{ year, seasonId, also: { system: updates, flags: flagUpdates, notices } });

	const surplusChange = Number.isFinite(initialSurplus) ? finalSurplus - initialSurplus : 0;

	const journal = await recordSeasonsChange({ seasonId, year, gainNames: seasonGainNames(checkedKeys), fortunes: chronicleFortunes, surplusChange, notes });

	// This season has begun: stamp it on the steading so the sheet header reads it,
	// and carry the picker's year with it in the same write. Winter closes out the
	// year, so it hands the picker the NEXT one; every other season leaves the count
	// where it is (a `pickerYear` already behind is a no-op).
	//
	// advanceOnly because re-recording an older season to fix its journal entry
	// mustn't rewind the header's clock, and recordCurrentSeason owns the matching
	// guard against an out-of-order older Winter regressing the year.
	await recordCurrentSeason(actor, seasonId, year, {
		advanceOnly: true,
		pickerYear:  seasonId === "winter" ? year + 1 : year,
	});

	journal?.sheet?.render(true);
}

/**
 * Summer: yearlings become grown horses, foals become yearlings, and the herd gains
 * 1d4+Fortunes (min 0) new foals. Rolls the foals to chat, applies, and reports.
 *
 * @param {object} steading
 * @param {number|null} [openingFortunes]  the Fortunes summer opened with, when one was noted
 *   (StonetopSteading#openingFortunes); the live figure otherwise
 * @param {Function} [repaint]  repaints the sheet behind the window
 */
export async function advanceHerdSummer(steading, openingFortunes = null, repaint = () => {}) {
	const before = steading.getHerd();
	const fortunes = Number.isFinite(openingFortunes) ? openingFortunes : steading.getStatValue("fortunes");
	// Roll Fortunes INTO the die so the chat card's total is the actual foals added
	// (1d4 + Fortunes), not a bare 1d4 that disagrees with the herd change / notification.
	const formula = fortunes >= 0 ? `1d4 + ${fortunes}` : `1d4 - ${Math.abs(fortunes)}`;
	const roll = await new Roll(formula).evaluate();
	await roll.toMessage({ speaker: SEASONS_SPEAKER, flavor: rolledTotalCard(roll, ["The Herd", "Summer"], "new foals", `1d4 + Fortunes (${sign(fortunes)})`) });
	const newFoals = Math.max(0, roll.total);
	const next = StonetopSteading.advanceHerdForSummer(before, newFoals);
	await steading.setHerd(next, seasonsMove());
	repaint();
	const total = next.grown + next.yearlings + next.foals;
	ui.notifications.info(`Herd advanced: grown ${before.grown}→${next.grown}, yearlings ${before.yearlings}→${next.yearlings}, foals ${before.foals}→${next.foals} (+${newFoals}). Total ${before.total}→${total}.`);
}

/**
 * Winter: the herd needs 1 Surplus per HERD_SURPLUS_PER grown-or-yearling horses. Feed what
 * Surplus is available; for each Surplus it goes short, roll 1d6 horses lost (taken from the
 * oldest tiers first). Surplus and herd changes are attributed to Seasons Change in the ledger.
 *
 * @param {object} steading
 * @param {Function} [repaint]  repaints the sheet behind the window
 */
export async function feedHerdWinter(steading, repaint = () => {}) {
	const before = steading.getHerd();
	const surplus = steading.getStatValue("surplus");
	const cost = StonetopSteading.herdWinterCost(before);
	if (cost <= 0) {
		ui.notifications.info("The herd is small enough to forage: no Surplus needed this winter.");
		return;
	}
	const shortfall = Math.max(0, cost - Math.max(0, surplus));
	let losses = 0;
	if (shortfall > 0) {
		const roll = await new Roll(`${shortfall}d6`).evaluate();
		await roll.toMessage({ speaker: SEASONS_SPEAKER, flavor: rolledTotalCard(roll, ["The Herd", "Winter"], "horses lost", `${shortfall} Surplus short: 1d6 for each`) });
		losses = roll.total;
	}
	const result = StonetopSteading.feedHerdForWinter(before, surplus, losses);
	if (result.paid > 0) {
		await steading.setSystemValue("attributes.surplus.value", surplus - result.paid, seasonsMove());
	}
	if (result.lost > 0) {
		await steading.setHerd(result.herd, seasonsMove());
	}
	repaint();
	let msg = `Herd fed: needed ${result.cost} Surplus, paid ${result.paid} (Surplus ${surplus}→${surplus - result.paid}).`;
	if (result.shortfall > 0) {
		const newTotal = result.herd.grown + result.herd.yearlings + result.herd.foals;
		msg += ` ${result.shortfall} short → lost ${result.lost} horse${result.lost === 1 ? "" : "s"} (herd ${before.total}→${newTotal}).`;
	}
	ui.notifications.info(msg);
}

// ── The window's buttons ──────────────────────────────────────────────────────

/**
 * Disable a once-per-season button (and tooltip why) when its step has already been applied
 * for this year+season, so closing and reopening the window can't re-run it. Returns true when
 * it disabled the button.
 */
export function disableIfSeasonStepDone(steading, btn, step, year, seasonId) {
	if (!btn || !steading.seasonStepApplied(step, year, seasonId)) return false;
	btn.disabled = true;
	btn.title = "Already done this season: reopening won't repeat it.";
	return true;
}

/**
 * Lock a button for as long as its click's `run` takes, so a double-click cannot run it twice
 * (the window stays open, and only the sheet behind it re-renders, so a second click would
 * re-read the just-spent Surplus and do the step again). Given back when `run` answers false
 * (a prompt dismissed: nothing happened) or throws; otherwise it stays down.
 */
function lockWhile(btn, run) {
	btn?.addEventListener("click", async ev => {
		if (btn.disabled) return;
		btn.disabled = true;
		try {
			if (await run(ev) === false) btn.disabled = false;
		} catch (err) { btn.disabled = false; throw err; }
	});
}

/** A once-per-season button: drawn dead when `step` is done for the season, else lockWhile. */
function wireOnceButton(ctx, btn, step, run, { seasonId = ctx.seasonId } = {}) {
	disableIfSeasonStepDone(ctx.steading, btn, step, ctx.year, seasonId);
	lockWhile(btn, run);
}

const setDisabled = (btns, disabled) => btns.forEach(b => { if (b) b.disabled = disabled; });

/**
 * A "spend Surplus and close this season's step" button, wired.
 *
 * The seasonal dues — every improvement's upkeep and the militia's drill — are the same six
 * steps in the same order: a re-entry guard, lock the controls, `spendSurplus` (which owns the
 * LIVE re-read and the one write), the could-not-afford branch that puts back only what should
 * come back, the re-render and the report, and a catch that unlocks and rethrows. Only the
 * lock/unlock and two sentences differ, so only those are passed.
 *
 * `shortUnlock` rather than reusing `unlock`: what a steading too poor to pay leaves clickable
 * is not what a throw leaves clickable. The watch that cannot be fed must be disbandable but not
 * re-feedable; a throw puts both buttons back.
 *
 * @param {object} ctx                   the window's wiring context
 * @param {HTMLElement|null} btn
 * @param {object} opts
 * @param {string} opts.step             season-step key closed in the same write
 * @param {number} [opts.amount]
 * @param {Function} [opts.lock]         called before the write
 * @param {Function} [opts.unlock]       called when the write throws
 * @param {Function} [opts.shortUnlock]  called when there was no Surplus to spend
 * @param {string} opts.shortWarning     what to say when it could not be afforded
 * @param {Function} opts.doneMessage    left => what to say when it was
 */
function wireSurplusUpkeep(ctx, btn, { step, amount = 1, lock, unlock, shortUnlock, shortWarning, doneMessage }) {
	const { steading, year, seasonId } = ctx;
	disableIfSeasonStepDone(steading, btn, step, year, seasonId);
	btn?.addEventListener("click", async () => {
		if (btn.disabled) return;
		if (lock) lock(); else btn.disabled = true;
		try {
			const left = await steading.spendSurplus(amount, { ...seasonsMove(), step, year, seasonId });
			if (left === null) {
				ui.notifications.warn(shortWarning);
				shortUnlock?.();
				return;
			}
			ctx.repaint();
			ui.notifications.info(doneMessage(left));
		} catch (err) {
			if (unlock) unlock(); else btn.disabled = false;
			throw err;
		}
	});
}

// The step rail. Switched in the DOM, never by re-rendering, for the reasons given on
// seasonsChangeHtml. Back/Next ride in the Dialog's own footer, as plain buttons WITHOUT
// `.dialog-button`: core binds its close-on-click to that class, and these must not close
// anything.
function wireStepRail({ root }, steps, dialog) {
	const appEl = dialog.element?.jquery ? dialog.element[0] : dialog.element;
	let activeStep = steps[0]?.key;
	const footer = appEl?.querySelector(".dialog-buttons");
	footer?.querySelectorAll(".stonetop-season-step").forEach(el => el.remove());
	const stepBtn = (cls, html) => {
		const btn = document.createElement("button");
		btn.type = "button";
		btn.className = `stonetop-season-step ${cls}`;
		btn.innerHTML = html;
		footer?.append(btn);
		return btn;
	};
	const backBtn = stepBtn("stonetop-season-step--back", `<span class="stonetop-nav-arrow stonetop-nav-arrow--back"></span>Back`);
	const nextBtn = stepBtn("stonetop-season-step--next", `Next<span class="stonetop-nav-arrow"></span>`);
	const showStep = key => {
		const index = steps.findIndex(s => s.key === key);
		if (index < 0) return;
		activeStep = key;
		applyGuideRail(root, {
			key, dataKey: "seasonTab",
			tabSelector: ".stonetop-season-tab",
			sectionSelector: ".stonetop-season-section",
			mainSelector: ".stonetop-season-main",
		});
		// Set here rather than through applyGuideRail's back/next selectors: the footer is a
		// sibling of `root`, which is all that helper searches.
		backBtn.disabled = index <= 0;
		nextBtn.disabled = index >= steps.length - 1;
	};
	root.querySelectorAll(".stonetop-season-tab").forEach(btn =>
		btn.addEventListener("click", () => showStep(btn.dataset.seasonTab)));
	backBtn.addEventListener("click", () => showStep(guideRailStep(steps, activeStep, -1)?.key));
	nextBtn.addEventListener("click", () => showStep(guideRailStep(steps, activeStep, 1)?.key));
	showStep(activeStep);
}

// The gains checklist's two readouts: how many are ticked, on the rail beside "Roll +Fortunes",
// so a GM on another step can see the pick was made without going back to look; the warning
// when more are ticked than the roll picks; and the close-out button's label, which names the
// gains it is about to write. One listener for the list, rather than two on every box.
function wireGains({ root, seasonId }) {
	const gainsCount = root.querySelector(".stonetop-season-gains-count");
	const gainsOver  = root.querySelector("[data-season-gains-over]");
	const recordBtn  = root.querySelector("[data-action='record-season']");
	const refresh = () => {
		const checked = checkedGainKeys(root);
		const n = checked.length;
		if (gainsOver) {
			const warning = gainsOverWarning(seasonId, n);
			gainsOver.hidden = !warning;
			gainsOver.textContent = warning;
		}
		if (gainsCount) {
			gainsCount.textContent = n ? String(n) : "";
			gainsCount.hidden = !n;
		}
		if (recordBtn) recordBtn.innerHTML = recordSeasonLabel(checked);
	};
	root.addEventListener("change", ev => {
		if (ev.target?.classList?.contains("stonetop-season-gain-check")) refresh();
	});
	refresh();
}

// The rail's numbers follow the steading while the window is open, and so do the two button
// labels that quote a figure (the roll's current Fortunes and the reset's target).
function liveStatsHook({ root, steading, actor }) {
	const cells = sel => Array.from(root.querySelectorAll(sel));
	const fortunes   = cells(`[data-season-stat="fortunes"], [data-season-live="fortunes"]`);
	const surplus    = cells(`[data-season-stat="surplus"]`);
	const population = cells(`[data-season-stat="population"]`);
	const reset      = cells(`[data-season-live="reset"]`);
	const set = (els, text) => els.forEach(el => { el.textContent = text; });
	return updated => {
		if (updated?.id !== actor.id) return;
		set(fortunes, sign(steading.getStatValue("fortunes")));
		set(surplus, String(steading.getStatValue("surplus")));
		set(population, sign(steading.getStatValue("population")));
		set(reset, sign(steading.fortunesResetTarget()));
	};
}

/**
 * Spring's "Ask the most hopeful to roll" (see wireFortunes): the click handler, built once per
 * window. Exported for its test; wireFortunes is the only caller.
 *
 * The card goes up BEFORE the hold is spent and the step is closed, so a card that fails to post
 * costs no sacrifice. That ordering leaves a window where the card is in chat but the writes after
 * it have not landed: when one of them throws, lockWhile gives the button back, and a retry used
 * to prompt and post all over again — a second card in chat, and at advantage again if the hold
 * had not been cleared. So the handler remembers the card it posted, and a retry only finishes the
 * bookkeeping that failed. Per window: a reopened window starts afresh, as it does for every step.
 *
 * @param {object} ctx                the window's wiring context
 * @param {Function} [onHandedOver]   called once the roll is recorded as handed over
 * @returns {() => Promise<false|void>}  false when the prompt was dismissed
 */
export function handOffSpringRoll(ctx, onHandedOver = () => {}) {
	const { sheet, steading, actor, year, seasonId, view } = ctx;
	// { held, spend, opening, spent } once the card is up.
	let handedOver = null;
	return async () => {
		if (!handedOver) {
			// The same questions the other seasons' Roll +Fortunes asks, answered by the GM as the
			// roll is handed over, because the card the player clicks has no window and no Shift
			// buttons of its own: a mode, a modifier (Bolstered Preparation, p. 516), and Book II's
			// storm curse, whose "next Fortunes roll for Seasons Change is automatically a 6-" the
			// other seasons settle with Shift Down on their card.
			const stormMiss = { key: "stormMiss", label: "Automatically a 6- (a terrible storm's curse, Book II)", applied: false };
			const prompted = await promptRoll({ title: "Seasons Change: Spring", askModifier: true, offers: [stormMiss] });
			if (!prompted) return false;
			const { held, rollMode, spend } = await settleSteadingRoll(steading, {
				moveName: "Seasons Change", statKey: "fortunes",
				chosenMode: prompted.rollMode ?? sheet._sheetRollMode(),
				canSpend: !!actor.isOwner,
			});
			// Spent once the card that carries it is up, and not before. Fortunes read LIVE: the card
			// carries the number the player rolls, and "Winter's end" (the step before this one) can
			// take a Fortune off it. Noted as the season's opening Fortunes at the same moment, for
			// the same reason (StonetopSteading#openingFortunes).
			const opening = steading.openingFortunesFlags(year, seasonId);
			await postSeasonsRollPrompt({
				alias: `Seasons Change: ${view.label}`,
				fortunes: steading.getStatValue("fortunes"),
				rollMode,
				why: held?.source ?? "",
				modifier: prompted.situational ?? 0,
				countsAsMiss: tookOffer(stormMiss, prompted.takenOffers) ? "a terrible storm's curse" : "",
			});
			handedOver = { held, spend, opening, spent: false };
		}
		const { held, spend, opening } = handedOver;
		if (!handedOver.spent) {
			await spend();
			handedOver.spent = true;
		}
		await steading.setFlags({ ...opening, ...steading.seasonStepFlags("fortunesRoll", year, seasonId) });
		onHandedOver();
		if (held) ctx.repaint();
	};
}

// The season's +Fortunes roll (or spring's hand-off) and the reset that follows it.
function wireFortunes(ctx) {
	const { root, sheet, steading, year, seasonId } = ctx;
	const rollFortunesBtn  = root.querySelector("[data-action='roll-fortunes']");
	const askHopefulBtn    = root.querySelector("[data-action='ask-hopeful']");
	const resetFortunesBtn = root.querySelector("[data-action='reset-fortunes']");
	const unresetNote      = root.querySelector("[data-season-unreset]");
	const fortunesRollBtns = [rollFortunesBtn, askHopefulBtn].filter(Boolean);

	// "After the roll, reset Fortunes" (p. 516). Taken first, the roll would be made off the
	// reset's +1 rather than the season's own Fortunes. But the roll is not only made from this
	// window: the Moves tab and a player's card make it too, and this window cannot see those.
	// So the button is never locked; until this window has seen the roll made (or, in spring,
	// handed over) it ASKS whether it was made elsewhere, and a yes closes the roll buttons here
	// along with the reset.
	function refreshResetLock() {
		if (!resetFortunesBtn || steading.seasonStepApplied("fortunesReset", year, seasonId)) return;
		const rolled = steading.seasonStepApplied("fortunesRoll", year, seasonId);
		resetFortunesBtn.title = rolled ? "" : "The reset comes after the roll: you will be asked whether it has been made.";
	}
	// The Chronicle step warns while the reset is still untaken, so a GM who records the season
	// without it is told, not stopped.
	const refreshUnreset = () => {
		if (unresetNote) unresetNote.hidden = steading.seasonStepApplied("fortunesReset", year, seasonId);
	};

	// Once per season, like the Surplus rolls: the season's +Fortunes roll is the move itself,
	// and a second click would post a second verdict on the same season. Given back when the
	// prompt is dismissed, since nothing was rolled.
	wireOnceButton(ctx, rollFortunesBtn, "fortunesRoll", async () => {
		// The modifier is always offered here, whatever the setting says: "PCs can Bolster for a
		// coming season and spend the Preparation on the roll(s)" (Book I p. 516), and this
		// prompt is the only place to spend it.
		const prompted = await promptRoll({ title: "Seasons Change", askModifier: true });
		if (!prompted) return false;
		// Winter's card names the second bite as this steading rolls it, off the Population it
		// has NOW (a shortfall above may just have taken one).
		const winterAgainFormula = seasonId === "winter" ? ctx.winterAgainNow().formula : undefined;
		// The Fortunes this roll is made off, noted with its marker: the summer herd's foals are
		// "1d4+Fortunes" off it (StonetopSteading#openingFortunes).
		const opening = steading.openingFortunesFlags(year, seasonId);
		await sheet._rollSeasonsChangeFortunes(seasonId, prompted, { winterAgain: winterAgainFormula });
		await steading.setFlags({ ...opening, ...steading.seasonStepFlags("fortunesRoll", year, seasonId) });
		refreshResetLock();
	});

	// Spring only: hand the roll to the table — post a chat card asking the most hopeful
	// character's player to roll +Fortunes, with a button to do it.
	//
	// The roll's CONDITIONS are settled here, on the GM's machine, and ride across on the card.
	// Handing the roll over is the same act as making it, so the hold that promised advantage is
	// spent at that moment: the player who clicks the button may not own the steading, could not
	// read the flag, and certainly could not clear it.
	//
	// This matters most for the hold that exists: Rites of the Land buys "advantage on the
	// steading's next +Fortunes roll", and spring's Seasons Change is the ONLY roll in the flow
	// with no button of its own — so before this the one roll that names the hold was the one
	// roll that could not spend it. Settled exactly as `_onSteadingRoll` settles it
	// (./steading-roll.js): the hold outranks the sticky selector as a SOURCE of advantage, and
	// nets against a sticky Disadvantage. Once per season, under the same marker as the other
	// seasons' Roll +Fortunes: handing the roll over IS spring's roll. Locked before the await so
	// a double-click can't read the hold twice and hand out two cards at advantage for one
	// sacrifice; given back if posting the card or a write after it throws, and a retry after the
	// card is up does not post it again (handOffSpringRoll).
	wireOnceButton(ctx, askHopefulBtn, "fortunesRoll", handOffSpringRoll(ctx, refreshResetLock));

	// "Whatever the result, reset Fortunes to +1" (+0 while Malcontent), taken by hand under the
	// roll. Once a season, with the value and the season marker in ONE write, like the Surplus
	// steps.
	wireOnceButton(ctx, resetFortunesBtn, "fortunesReset", async () => {
		const rolled = steading.seasonStepApplied("fortunesRoll", year, seasonId);
		if (!rolled) {
			const madeElsewhere = await confirmOutcome({
				title: "Reset Fortunes",
				content: `<p>This window has not seen the season's +Fortunes roll made. The reset comes after the roll, so the roll is made off the Fortunes the season opened with.</p>
					<p>Was it rolled somewhere else, from the Moves tab or a player's card?</p>`,
				yes: { label: "It was rolled: reset Fortunes" },
				no:  { label: "Not yet: roll first" },
			});
			if (!madeElsewhere) return false;
		}
		const to = steading.fortunesResetTarget();
		// The roll marker rides the reset's write when the roll was made elsewhere, and so does
		// the opening Fortunes: the figure before this write is the one that roll was made off
		// (StonetopSteading#openingFortunes). Through the model's resetFortunes, which also spends
		// every improvement's one-time "+1 Fortunes" in the same write (Book I p. 514), so a later
		// loss takes back only what lasts.
		await steading.resetFortunes(to, {
			flags: () => {
				const flags = {
					...steading.openingFortunesFlags(year, seasonId),
					...steading.seasonStepFlags("fortunesReset", year, seasonId),
				};
				if (!rolled) flags.seasonSteps.fortunesRoll = `${year}:${seasonId}`;
				return flags;
			},
			options: seasonsMove(),
		});
		if (!rolled) fortunesRollBtns.forEach(b => { b.disabled = true; });
		ctx.repaint();
		refreshUnreset();
		ui.notifications.info(`Fortunes reset to ${sign(to)}.`);
	});
	refreshUnreset();
	refreshResetLock();
}

// Winter's 7-9 (and the 6- that repeats it): "consume 1d4+Population more Surplus before winter
// ends". A debt that outlives this window, so it is written onto the steading and becomes a
// header glyph, which is where it gets settled (module/actors/steading/winter-debt.js).
//
// The GM clicks this when the roll lands there rather than the window reading the tier: the
// +Fortunes roll is posted to chat by _onSteadingRoll, which tells this window nothing, and the
// same roll can be made from the Moves tab or handed to a player entirely. Every other
// mechanical effect in this walkthrough is a deliberate GM button for the same reason.
//
// Once a winter, like every other step here: a reopen must not roll it again, nor bring back a
// debt already paid by rolling a fresh one.
function wireWinterDebtRoll(ctx) {
	const { root, steading, year, seasonId } = ctx;
	wireOnceButton(ctx, root.querySelector("[data-action='record-winter-debt']"), WINTER_DEBT_STEP, async () => {
		// Population read LIVE, like the sibling steps read Surplus: this button sits BELOW the
		// shortfall list in the same window, and taking "Population loss" there is the likeliest
		// reason a winter reaches this roll at all. The value captured when the window opened
		// would bill the steading for a head it had just lost.
		//
		// `second: true` — a Township's 2d6 and Additional Housing's lower Population carry over
		// to this roll, because both say how a winter consumption is ROLLED. A Stone Wall's flat
		// −1 does not; see the note on winterConsumption for why one wall must not pay twice for
		// one winter.
		const { formula } = ctx.winterAgainNow();
		const roll = await new Roll(formula).evaluate();
		const owed = Math.max(0, roll.total);
		await roll.toMessage({ speaker: SEASONS_SPEAKER, flavor: rolledTotalCard(roll, "Winter is not done", "further Surplus owed") });
		if (!owed) {
			// Nothing owed is still the roll made: closed like any other.
			await steading.setSeasonStepApplied(WINTER_DEBT_STEP, year, seasonId);
			ui.notifications.info("Winter wants nothing further.");
			return;
		}
		await steading.setWinterDebt(owed, year, seasonId);
		ctx.repaint();
		// "Once the season is recorded": the clock is not stamped for this winter until the
		// Chronicle step's "Record the season" is pressed, and the glyph is read against that
		// stamp — so promising a header row that is not there yet would be the sheet telling a
		// small lie.
		ui.notifications.info(`Winter still wants ${owed} Surplus before it ends. Once the season is recorded it rides on the steading's header until it is settled.`);
	});
}

// Spring's "Winter's end": last winter's unpaid debt, pay or suffer. The Chronicle step warns
// while it is still standing, the way it warns of an untaken reset.
function wireWinterEnd(ctx) {
	const { root, steading, view } = ctx;
	if (!view.winterDebtDue) return;
	const debtUnpaidNote = root.querySelector("[data-season-debt-unpaid]");
	const refreshDebtUnpaid = () => {
		if (debtUnpaidNote) debtUnpaidNote.hidden = !steading.winterDebtFor(view.lastWinter);
	};
	refreshDebtUnpaid();
	wireWinterDebtStep(root.querySelector(`.stonetop-season-section[data-season-tab="winterEnd"]`), steading, {
		stamp: view.lastWinter,
		onSettled: () => { ctx.repaint(); refreshDebtUnpaid(); },
	});
}

// Herd of Horses seasonal steps (only present when the herd is earned): summer promotes the
// tiers and adds foals; winter feeds the herd off Surplus. Each locked on click before the
// (async) apply runs, AND closed under a per-season marker so a close+reopen in the same season
// can't re-run it either.
function wireHerd(ctx) {
	const { root, steading, year, seasonId } = ctx;
	wireOnceButton(ctx, root.querySelector("[data-action='advance-herd']"), "advanceHerd", async () => {
		// Off the Fortunes summer OPENED with: the growth comes "when the Seasons Change to
		// summer", with the move, and this button sits after the reset.
		await advanceHerdSummer(steading, steading.openingFortunes(year, seasonId), ctx.repaint);
		await steading.setSeasonStepApplied("advanceHerd", year, seasonId);
	});
	wireOnceButton(ctx, root.querySelector("[data-action='feed-herd']"), "feedHerd", async () => {
		await feedHerdWinter(steading, ctx.repaint);
		await steading.setSeasonStepApplied("feedHerd", year, seasonId);
	});
}

// Each improvement's upkeep (upkeepsDue): pay, or lose the improvement (Book I p. 514). Both
// buttons settle the SAME season step (improvement-rules.js#upkeepStepKey: the watch's and the
// weapons' keep the keys they always had), so taking either one closes the season's question,
// and a close+reopen can't be used to pay twice, nor to pay after losing it.
function wireUpkeeps(ctx) {
	const { root, steading, year, seasonId, view } = ctx;
	for (const due of view.upkeeps) {
		const box = root.querySelector(`.stonetop-season-actions[data-upkeep-slug="${CSS.escape(due.slug)}"]`);
		const payBtn  = box?.querySelector("[data-action='pay-upkeep']") ?? null;
		const loseBtn = box?.querySelector("[data-action='lose-upkeep']") ?? null;
		const copy = upkeepCopy(due);
		const settle = () => setDisabled([payBtn, loseBtn], true);
		const reopen = () => setDisabled([payBtn, loseBtn], false);
		// Asked of the STEADING, not of whether a given button came back from the query: with
		// too little Surplus the pay button is never rendered, so keying "already settled" off
		// its return value would read false on a season that is done.
		disableIfSeasonStepDone(steading, loseBtn, due.key, year, seasonId);
		if (steading.seasonStepApplied(due.key, year, seasonId)) settle();

		// Spends and closes the step in one write, off a LIVE Surplus read: the herd feed and the
		// surplus roll in this same window may have moved it since the window was built.
		// Could-not-afford writes nothing — so the choice reverts to losing it, which is why the
		// short unlock differs from the throw's.
		wireSurplusUpkeep(ctx, payBtn, {
			step: due.key, amount: due.surplus,
			lock: settle,
			shortUnlock: () => {
				setDisabled([payBtn], true);
				setDisabled([loseBtn], false);
			},
			unlock: reopen,
			shortWarning: copy.shortWarning,
			doneMessage: copy.done,
		});

		loseBtn?.addEventListener("click", async () => {
			if (loseBtn.disabled) return;
			settle();
			try {
				// Un-completing runs the improvement's own revert, which is what takes its entry
				// back off the Fortifications list. Doing it by hand here would leave the
				// improvement ticked and the grant record stale, so a later re-complete would
				// refuse to re-apply it. The season's marker rides the SAME write: as two, a failed
				// second left the improvement gone and both buttons live again.
				const result = await steading.loseImprovement(due.slug, {
					seasonStep: { step: due.key, year, seasonId },
				});
				ctx.repaint();
				ui.notifications.info(copy.lost(result?.summary ?? []));
			} catch (err) {
				reopen();
				throw err;
			}
		});
	}
}

// What the improvements bring. One button and one season marker per row, so a reopen cannot
// take any single one of them twice — and so a GM who took the Market's Surplus, closed the
// window and came back for the Township's finds the Market's button already spent rather than
// the whole block gone.
//
// Surplus is re-read LIVE at the click, like every other spend and grant in this window: the
// harvest roll, the herd's feed and the watch's upkeep may all have moved it since the window
// was built, and repainting refreshes the sheet behind this window rather than this window.
function wireYields(ctx) {
	const { root, steading, year, seasonId } = ctx;
	root.querySelectorAll("[data-action='take-yield']").forEach(btn => {
		const key = btn.dataset.yieldKey;
		const gain = Math.max(0, Number(btn.dataset.yieldAmount) || 0);
		const name = btn.dataset.yieldLabel || "The season";
		wireOnceButton(ctx, btn, key, async () => {
			const now = steading.getStatValue("surplus");
			// ONE write, the way spendSurplus does it: the gain and the season marker are two
			// halves of a single act, and a write apiece cards the Surplus and the marker
			// separately in the ledger and re-renders every open steading sheet twice.
			await steading.applyChanges({
				system: { "attributes.surplus.value": now + gain },
				flags: steading.seasonStepFlags(key, year, seasonId),
			}, seasonsMove());
			ctx.repaint();
			ui.notifications.info(`${name} generates ${gain} Surplus. New total: ${now + gain}.`);
		});
	});
}

// The Inn's questions, handed to the table on its own ladder. "Henceforth, when the seasons
// change, whoever is friendliest rolls +Fortunes": a roll the move makes, once, so it is made
// off the Fortunes the season OPENED with (as the herd's foals are), not the reset's +1 this
// step sits after, and it closes its own season step. Once asked, the button posts the same
// card again rather than going dead, which is how a lost card is recovered.
function wireInn(ctx) {
	const { root, steading, year, seasonId, view } = ctx;
	const askFriendliestBtn = root.querySelector("[data-action='ask-friendliest']");
	if (!askFriendliestBtn) return;
	const innAsked = () => steading.seasonStepApplied(INN_ROLL_SEASON_STEP, year, seasonId);
	const relabelInn = () => {
		if (innAsked()) {
			askFriendliestBtn.innerHTML = `<i class="fas fa-rotate-right"></i> Post the Inn's card again (already asked this season)`;
		}
	};
	relabelInn();
	askFriendliestBtn.addEventListener("click", async () => {
		if (askFriendliestBtn.disabled) return;
		askFriendliestBtn.disabled = true;
		try {
			await postSeasonsRollPrompt({
				alias: `The Inn: ${view.label}`,
				fortunes: steading.openingFortunes(year, seasonId) ?? steading.getStatValue("fortunes"),
				table: "inn",
			});
			if (!innAsked()) await steading.setSeasonStepApplied(INN_ROLL_SEASON_STEP, year, seasonId);
			relabelInn();
		} finally {
			askFriendliestBtn.disabled = false;
		}
	});
}

// The militia's summer. Both outcomes settle the SAME step, exactly as the watch's two do, so a
// close-and-reopen can neither drill twice nor forget a second tactic after paying.
function wireMilitia(ctx) {
	const { root, sheet, steading, year, seasonId } = ctx;
	const drillMilitiaBtn = root.querySelector("[data-action='drill-militia']");
	const tacticEls = Array.from(root.querySelectorAll("[data-tactic]"));
	const lockTactics = locked => tacticEls.forEach(el => el.classList.toggle("is-disabled", locked));
	const settleMilitia = () => {
		setDisabled([drillMilitiaBtn], true);
		lockTactics(true);
	};
	// Asked of the STEADING rather than of the button, for the watch's reason: with no Surplus
	// the drill button is never rendered at all.
	if (steading.seasonStepApplied(MILITIA_SEASON_STEP, year, seasonId)) settleMilitia();
	wireSurplusUpkeep(ctx, drillMilitiaBtn, {
		step: MILITIA_SEASON_STEP,
		lock: settleMilitia,
		// A militia that cannot be paid for must still be able to forget a tactic, so the drill
		// button stays down and only the tactics come back.
		shortUnlock: () => {
			drillMilitiaBtn.disabled = true;
			lockTactics(false);
		},
		unlock: () => {
			drillMilitiaBtn.disabled = false;
			lockTactics(false);
		},
		shortWarning: "No Surplus left for the militia's drills. It loses a tactic unless you find one.",
		doneMessage: left => `The militia drills: 1 Surplus spent (${left} left).`,
	});
	tacticEls.forEach(el => {
		el.addEventListener("click", async () => {
			if (el.classList.contains("is-disabled")) return;
			settleMilitia();
			try {
				// Through the model, which takes back the militia's +1 Defenses in the same write
				// when this drops it below 2 tactics, and says so. The summer's MILITIA_SEASON_STEP
				// rides the same write.
				const result = await sheet._onImprovementReq("wellTrainedMilitia", Number(el.dataset.tactic), false, {
					seasonStep: { step: MILITIA_SEASON_STEP, year, seasonId },
				});
				ctx.repaint();
				if (!result?.summary?.length) ui.notifications.info("The militia forgets a tactic.");
			} catch (err) {
				lockTactics(false);
				setDisabled([drillMilitiaBtn], false);
				throw err;
			}
		});
	});
}

// The Surplus roll buttons: once a season, for the season each rolls FOR, and given back when
// the prompt is dismissed, since nothing was rolled. Both go through the sheet's
// _rollSeasonSurplus, the one door the header's sheaf uses too.
function wireSurplusRolls(ctx) {
	const { root, sheet, year, seasonId, view } = ctx;
	const wireSurplusBtn = (btn, rollFor) => wireOnceButton(ctx, btn, SURPLUS_SEASON_STEP,
		ev => sheet._rollSeasonSurplus({ ...rollFor, year, shiftKey: ev.shiftKey }),
		{ seasonId: rollFor.seasonId });

	// Autumn's is written onto the button, because the harvest is the one generation several
	// improvements rewrite (Greater Harvest, the Mill, and the fields Additional Housing may
	// have built on). Summer's 1d4−1 has no modifiers of its own — Raincatching pays
	// separately, as a yield.
	const rollSurplusBtn = root.querySelector("[data-action='roll-surplus']");
	wireSurplusBtn(rollSurplusBtn, {
		seasonId, label: view.label, harvest: seasonId === "autumn",
		formula: rollSurplusBtn?.dataset.formula || (seasonId === "summer" ? "1d4 - 1" : "1d4"),
	});

	// Winter's catch-up for an autumn whose harvest was never rolled. Stamped as AUTUMN's
	// Surplus roll, which is what it is, so the header's sheaf goes out too.
	wireSurplusBtn(root.querySelector("[data-action='roll-late-harvest']"), {
		seasonId: "autumn", formula: view.harvest.formula, label: seasonLabel("autumn"), harvest: true,
	});
}

// Winter's toll: the consumption roll, then the way out the Surplus allows, then the
// +Fortunes half of winter it unlocks.
function wireWinterToll(ctx) {
	const { root, steading, year, seasonId } = ctx;
	const rollConsumptionBtn = root.querySelector("[data-action='roll-consumption']");
	if (!rollConsumptionBtn) return;
	const el = id => root.querySelector(`#stonetop-winter-${id}`);
	const w = {
		step1: el("step1"), settled: el("settled"), step2: el("step2"), result: el("result"),
		ok: el("ok"), shortfall: el("shortfall"), step3: el("step3"),
	};
	const show = (node, shown = true) => { if (node) node.hidden = !shown; };
	// Step 3 is on screen from the start, greyed and inert; settling the toll unlocks it.
	const unlockWinterFortunes = () => {
		if (!w.step3) return;
		w.step3.inert = false;
		w.step3.classList.remove("stonetop-season-later");
	};

	// Winter is the only season that runs in two halves — the consumption, then the +Fortunes
	// roll and the debt it can leave behind — and the second half used to un-hide only as a SIDE
	// EFFECT of the consumption button being clicked. The consumption is also a once-per-season
	// step, so on a reopen that button comes back disabled and nothing ever un-hid it: a GM who
	// closed the window between winter's two halves could not get back to the second one from
	// anywhere. So when the step is already settled, the window opens on what is left
	// (#stonetop-winter-settled, and #stonetop-winter-step3 unlocked) instead of on a dead button.
	if (disableIfSeasonStepDone(steading, rollConsumptionBtn, "consumption", year, seasonId)) {
		show(w.step1, false);
		show(w.settled);
		unlockWinterFortunes();
	}

	// A consumption on the table, waiting to be taken: the roll just made, or one made before
	// the window was closed and reopened (StonetopSteading#winterConsumptionRolled). Enough
	// Surplus offers Apply; too little offers the four consequences. Each way out closes the
	// `consumption` step, and each is guarded against a second click, which would otherwise
	// deduct the consumption, or take a consequence, twice.
	const presentConsumption = consumption => {
		show(w.step1, false);
		show(w.step2);
		let busy = false;

		// Shows the way out LIVE Surplus allows and hides the other; true when there is enough.
		// Read live, not the value captured when the window opened: the herd's "Feed the herd"
		// step in this same window may have spent some, and repainting refreshes the sheet, not
		// this window.
		const showWayOut = () => {
			const surplusNow = steading.getStatValue("surplus");
			w.result.textContent = `Roll: ${consumption}. Surplus needed: ${consumption}, available: ${surplusNow}.`;
			const enough = surplusNow >= consumption;
			show(w.ok, enough);
			show(w.shortfall, !enough);
			return enough;
		};
		// Asked again at the click, because the window stays open while the steps around it move
		// Surplus: a herd fed after the roll can leave too little for the Apply on screen (which
		// would clamp to 0 and skip the shortfall), and a late harvest can make a shown shortfall
		// zero out Surplus that now covers winter. A click on the way out that no longer fits
		// swaps the window over instead of acting.
		const stillFits = wantEnough => {
			if (showWayOut() === wantEnough) return true;
			ui.notifications.warn(wantEnough
				? "Surplus has dropped since the roll and no longer covers winter. Pick what the shortfall costs."
				: "Surplus has risen since the roll and now covers winter. Apply the consumption instead.");
			return false;
		};
		showWayOut();

		root.querySelector("[data-action='apply-consumption']")?.addEventListener("click", async () => {
			if (busy || !stillFits(true)) return;
			busy = true;
			try {
				const live = steading.getStatValue("surplus");
				const remaining = live - consumption;
				await steading.applyChanges({
					system: { "attributes.surplus.value": remaining },
					flags: steading.seasonStepFlags("consumption", year, seasonId),
				}, seasonsMove());
				ctx.repaint();
				show(w.ok, false);
				unlockWinterFortunes();
				ui.notifications.info(`Consumed ${consumption} Surplus. Remaining: ${remaining}.`);
			} catch (err) { busy = false; throw err; }
		});
		w.shortfall?.querySelectorAll("[data-consequence]").forEach(choice => {
			choice.addEventListener("click", async () => {
				if (busy || !stillFits(false)) return;
				busy = true;
				try {
					// The write, the notice and (at Fortunes −1) the Meet with Disaster pick are
					// shared with the settle window the header glyph opens and with spring's
					// "Winter's end" (module/actors/steading/winter-debt.js), so a shortfall costs
					// the same whichever window takes it. The step closes in its write.
					await sufferWinterShortfall(steading, choice.dataset.consequence, {
						...seasonsMove(),
						onApplied: ctx.repaint,
						alsoFlags: steading.seasonStepFlags("consumption", year, seasonId),
					});
					ctx.repaint();
					show(w.step2, false);
					unlockWinterFortunes();
				} catch (err) { busy = false; throw err; }
			});
		});
	};

	const rolledBefore = steading.winterConsumptionRolled(year, seasonId);
	if (!rollConsumptionBtn.disabled && rolledBefore !== null) {
		rollConsumptionBtn.disabled = true;
		presentConsumption(rolledBefore);
	}

	// Locked synchronously on the click (like the sibling steps): the button stays visible
	// through the whole await below, so without it a second click posts a second roll and
	// double-binds the apply listener, deducting consumption from Surplus twice. Given back on
	// error so a failed roll can retry.
	lockWhile(rollConsumptionBtn, async () => {
		// Off the button, where the improvements' rewrites were already worked out: a Township
		// rolls 2d6 in place of 1d4, Additional Housing counts Population a point lower, and a
		// Stone Wall takes 1 off the total. No fallback: winter is the only season that draws
		// this button, and it always writes the formula onto it (unlike roll-surplus, which
		// three seasons draw and only some of them price).
		const roll = await new Roll(rollConsumptionBtn.dataset.formula).evaluate();
		const consumption = Math.max(0, roll.total);
		await roll.toMessage({ speaker: SEASONS_SPEAKER, flavor: rolledTotalCard(roll, ["Surplus Consumption", "Winter"], "Surplus consumed") });
		// Kept before it is shown, so closing the window from here on resumes this roll rather
		// than offering winter a second one.
		await steading.setWinterConsumptionRolled(consumption, year, seasonId);
		presentConsumption(consumption);
	});
}

// The close-out, on the Chronicle step: applies any ticked mechanical gains, files the
// Chronicle page, stamps the season on the clock, then closes.
function wireRecord(ctx, dialog) {
	const { root, steading, actor, year, seasonId, view } = ctx;
	lockWhile(root.querySelector("[data-action='record-season']"), async () => {
		// `surplus` (captured at open) is the baseline for the Chronicle's net change. Fortunes is
		// NOT the figure captured at open: recordSeason files the season's opening Fortunes.
		await recordSeason(steading, actor, {
			seasonId, year,
			checkedKeys: checkedGainKeys(root),
			notes: root.querySelector(".stonetop-season-notes")?.value ?? "",
			initialSurplus: view.surplus,
		});
		dialog.close();
	});
}

// ── The window ────────────────────────────────────────────────────────────────

/**
 * Open the Seasons Change window for one season of one year.
 *
 * @param {object} sheet     the steading sheet it is opened from (see the head of this file)
 * @param {string} seasonId  the season beginning
 * @param {number} year      the campaign year it belongs to
 */
export async function openSeasonsChangeDialog(sheet, seasonId, year) {
	const steading = sheet._stonetopSteading;
	const actor = sheet.actor;

	// The seasons have turned: post a chat card reminding the table of any character's seasonal
	// move/possession upkeep (Rites of the Land, Collected offerings, etc.). ONCE a season: the
	// window is reopened to finish a season (winter's second half, a harvest, a debt), and each
	// reopen used to post the same card again.
	const reminded = steading.seasonStepApplied(REMINDER_SEASON_STEP, year, seasonId);
	if (!reminded) postSeasonsChangeReminder(seasonId);
	if (!reminded && actor.isOwner) {
		await steading.setSeasonStepApplied(REMINDER_SEASON_STEP, year, seasonId);
	}

	const view = seasonsChangeView(sheet, seasonId, year);
	const steps = seasonsChangeSteps(view);

	// Set by the render callback, taken down by the Dialog's close.
	let statsHook = null;

	// `const`, even though the render callback below refers to `dialog`: it runs after this
	// statement completes, so the binding is always initialised by then. Every action is a
	// button in the steps, none in the footer, so core's Enter/Tab handling is taught not to
	// reach for a footer button that isn't there.
	const dialog = createInlineActionsDialog({
		title: `Seasons Change: ${view.label}`,
		content: seasonsChangeHtml(view, steps),
		// No footer button of its own: a one-click close-out let a GM skip every step. The
		// footer carries only Back/Next, and the season is finished from the Chronicle step's
		// "Record the season".
		buttons: {},
		close: () => {
			if (statsHook !== null) Hooks.off("updateActor", statsHook);
			statsHook = null;
		},
		render: (html) => {
			addStonetopSteadingButton(html);
			const ctx = {
				root: html[0], sheet, steading, actor, seasonId, year, view,
				repaint: () => sheet.render(false),
				// The second bite off the Population the steading has NOW, for the buttons that
				// roll or quote it later: a shortfall in this window may just have taken one.
				winterAgainNow: () => winterConsumption({
					population: steading.getStatValue("population"), rules: view.rules, size: view.size, second: true,
				}),
			};
			wireStepRail(ctx, steps, dialog);
			wireGains(ctx);
			if (statsHook !== null) Hooks.off("updateActor", statsHook);
			statsHook = Hooks.on("updateActor", liveStatsHook(ctx));
			wireFortunes(ctx);
			wireWinterDebtRoll(ctx);
			wireWinterEnd(ctx);
			wireRecord(ctx, dialog);
			wireHerd(ctx);
			wireUpkeeps(ctx);
			wireYields(ctx);
			wireInn(ctx);
			wireMilitia(ctx);
			wireSurplusRolls(ctx);
			wireWinterToll(ctx);
		},
	// A FIXED height, like the Welcome guide's: the steps take turns in one scrolling column
	// beside the rail, so the window no longer grows with the season. It used to be sized by
	// its content, and a summer with a few improvements ran past the screen.
	//
	// 700 wide is the rail's 168px plus the ~490px column the old 560px window gave its content
	// (at 400 the gains wrapped to three lines apiece and the watch's two buttons stopped
	// reading as a pair).
	}, { width: 700, height: 620, classes: ["dialog", "stonetop", "stonetop-season-flow-dialog"] });
	dialog.render(true);
}
