import { IMPROVEMENT_CATEGORIES, STEADING_DEFAULTS, improvementRequirementsMet, SURPLUS_SEASON_STEP } from "./StonetopSteading.js";
import { confirmOutcome } from "../../utils/ask-with-buttons.js";
import { flatRequirementItems, forceCompleteTicks } from "../../utils/improvement-def.js";
import {rollStat, sign, resultsLegendHtml, SEASONAL_GAIN_LIST} from "../../utils/roll-engine.js";
import {SteadingLedger} from "./SteadingLedger.js";
import {TIER_KEYS} from "../../utils/move-results.js";
import {moveTiersHtml} from "../../utils/move-tiers.js";
import {wireBasicMoveHoverPanel, removeHoverPanels} from "../../utils/move-hover.js";
import {openLedgerDialog} from "../../utils/ledger-dialog.js";
import {wireTabSearch} from "../../utils/tab-search.js";
import {injectHeaderToggle} from "../../utils/sheet-chrome.js";
import {escHtml, stripHtmlToText} from "../../utils/strings.js";
import {CUSTOM_ASSET_VALUE, wireCustomAssetSelect} from "../../utils/requisition-asset.js";
import {postMoveToChat, rolledTotalCard, stonetopChatCard} from "../../utils/chat.js";
import {AddSteadingMemberDialog} from "../../dialogs/AddSteadingMemberDialog.js";
import {addPersonToSteading, personFieldPath, isActorRow, personRowActor, usedPersonPortraits, HOME_STONETOP} from "./steading-people.js";
import {PERSON_DEFAULT_IMG} from "../../utils/person-portrait.js";
import {openNpcNotesDialog} from "./npc-notes-dialog.js";
import {openReturnTriumphant} from "./return-triumphant.js";
import {openInnGathering} from "./inn-gathering.js";
import {openWinterDebtDialog} from "./winter-debt.js";
import {openDisasterPicker, openOwedDisasterPicker, meetWithDisaster, disasterFortunes} from "./steading-debilities.js";
import {autumnHarvest, surplusRollFormula, militiaTactics, builtOnTheFields} from "./season-effects.js";
import {withSurplusBonus, surplusBonusNote} from "./improvement-rules.js";
import {openPeoplePortraitPicker} from "./PeopleGalleryDialog.js";
import {STONETOP_SCOPE, StonetopFlags} from "../character/StonetopFlags.js";
import {SpecialItemPickerDialog} from "../character/dialogs/SpecialItemPickerDialog.js";
import {CharacterInventory} from "../character/CharacterInventory.js";
import {SPECIAL_ITEM_CATALOG} from "../../data/special-items.js";
import {getRollStatChipsSetting, getOpenSheetsInEditMode, getHoverDescriptionSetting, getSidebarCollapsed, setSidebarCollapsed, getAskRollModeEachRollSetting, isClassicLayout, isRelationshipMapShown, isTimelineShown, layoutClasses, stampLayoutClass} from "../../settings.js";
import {applyLabelTooltips} from "../../utils/label-tooltips.js";
import {wireSidebarToggle} from "../../utils/sidebar-toggle.js";
import {promptRoll, promptSurplusRoll, normalizeRollMode} from "../../dialogs/RollDialog.js";
import {wrapStonetopGlyphsInEl} from "../../utils/glyphs.js";
import {mountTabRail} from "../../utils/tab-rail.js";
import {mountScrollFrost} from "../../utils/scroll-frost.js";
import {withSheetSizeMemory} from "../../utils/sheet-size.js";
import {StonetopAutocomplete} from "../../utils/autocomplete.js";
import {makeColumnsResizable} from "../../utils/resizable-columns.js";
import {makeColumnsSortable} from "../../utils/sortable-columns.js";
import {withSectionEditing} from "../../utils/section-editing.js";
import {STEADING_IMPROVEMENT_DRAG_TYPE} from "../../journal/steading-improvement-cards.js";
import {ImprovementBuilderDialog, improvementEditSaver, steadingImprovementSaver} from "../../dialogs/ImprovementBuilderDialog.js";
import {PLACE_OF_INTEREST_DRAG_TYPE} from "../../hooks/PlaceOfInterestDrop.js";
import {getDragEventData, imagePopout, imagePopoutTitle} from "../../utils/foundry-compat.js";
import {wireCardDropZone} from "../../utils/card-drop-zone.js";
import {seasonLabel} from "../../seasons/seasons-change-reminders.js";
import {readCurrentSeason, recordCurrentSeason, currentSeasonView, readCurrentYear, seasonStampParts, pickedSeasonYear} from "../../seasons/current-season.js";
import {readCurrentWeather, currentWeatherView} from "../../seasons/current-weather.js";
import {openSeasonPicker} from "../../seasons/season-picker.js";
import {openSeasonsChangeDialog, SEASONS_SPEAKER} from "./seasons-change-dialog.js";
import {SETTLEMENTS} from "../../data/settlements.js";
import {relationshipRow, wireRelationshipTable} from "../../utils/relationship-hearts.js";
import {wireAvatarPreview, removeAvatarPreview} from "../../utils/avatar-preview.js";
import {ACTOR_LINK_MISSING, openLinkedActorSheet, withLinkedActor} from "../../utils/actor-link.js";
import {relationshipViewContext, wireRelationshipBoard} from "../../utils/relationship-board.js";
import {displayPortraitSrc} from "../../book2-art/people-portraits.js";
import {addPopoutHeaderControl, addPortraitFrameControl, addTokenizerControl} from "../../utils/popout-header-control.js";
import {personFrameHandle, actorPortraitPickUpdate, saveLegacyPersonRow} from "../../utils/portrait-frame-handles.js";
import {normalizeFrame} from "../../utils/portrait-frame.js";
import {bindImagePopoutToActor, pointImagePopoutAt, usedActorPortraits} from "../../utils/actor-portrait-picker.js";
import {openPortraitFrameEditor} from "../../utils/PortraitFrameDialog.js";
import {localize} from "../../utils/i18n.js";
import {closeRelmapTab, detachRelmapTab, makeFirstRelationshipMap, relmapTabContext, STEADING_RELMAP_TAB, syncRelmapTab} from "./steading-relmap-tab.js";
import {closeTimelineTab, detachTimelineTab, syncTimelineTab, TIMELINE_TAB} from "../../timeline/timeline-tab.js";
import {DIMINISHED_MOVES, PATHFINDER, STEADING_MOVE, improvementQuestions, rollAdjustments} from "./improvement-rolls.js";
import {settleSteadingRoll} from "./steading-roll.js";
import {worldLogisticsNames} from "../character/logistics.js";
import {worldLearnedHolderNames} from "../character/owns-move.js";
import {onCapture} from "../../utils/activation.js";

/**
 * What the member-photo WINDOW shows, given the path a member actually wears.
 *
 * A People-of-Stonetop portrait is stored as the SQUARE face, because every roster circle, heart
 * row and token needs one. This window is the opposite case — it exists so somebody can look at
 * the picture — so it shows the whole illustration the square was cut from, the same swap the NPC
 * sheet header and the hover preview make. Anything else (a browsed file, a default) resolves to
 * null and is shown as itself.
 *
 * Display only: the STORED path is what `_stonetopMemberImageEdit.current` keeps and what the
 * gallery is handed back, so re-opening Edit Photo still highlights the portrait the member wears.
 */
const memberPhotoDisplaySrc = displayPortraitSrc;

const _STEADING_MOVES_RAW = [
	{
		slug: "seasonsChange",
		label: "Seasons Change",
		stat: "fortunes",
		statLabel: "Fortunes",
		rollable: false,
		interactive: true,
		description: `<div class="stonetop-seasons-grid">
  <img src="systems/stonetop_pwd/assets/icons/seasons/spring_icon.svg" class="stonetop-season-row-icon" alt="Spring">
  <div><strong>Spring</strong>: The <em>most hopeful</em> rolls +Fortunes. <strong>10+:</strong> pick 1 seasonal gain. <strong>7–9:</strong> pick 1 gain, but a threat makes itself known. <strong>6−:</strong> threats abound; don't mark XP. Reset Fortunes to +1.</div>

  <img src="systems/stonetop_pwd/assets/icons/seasons/summer_icon.svg" class="stonetop-season-row-icon" alt="Summer">
  <div><strong>Summer</strong>: The <em>most content</em> rolls +Fortunes. <strong>10+:</strong> pick 2 seasonal gains. <strong>7–9:</strong> pick 1. <strong>6−:</strong> a threat makes itself known; don't mark XP. The steading generates 1d4−1 Surplus. Reset Fortunes to +1.</div>

  <img src="systems/stonetop_pwd/assets/icons/seasons/fall_icon.svg" class="stonetop-season-row-icon" alt="Autumn">
  <div><strong>Autumn</strong>: The <em>most determined</em> rolls +Fortunes. <strong>10+:</strong> pick 1 seasonal gain. <strong>7–9:</strong> pick 1 gain, but a threat makes itself known. <strong>6−:</strong> threats abound; don't mark XP. The steading generates 1d4 Surplus at harvest. Reset Fortunes to +1.</div>

  <img src="systems/stonetop_pwd/assets/icons/seasons/winter_icon.svg" class="stonetop-season-row-icon" alt="Winter">
  <div><strong>Winter</strong> — The <em>weariest</em> rolls 1d4+Population (min 0); the steading consumes that much Surplus. If there isn't enough: Surplus → 0, the steading Meets with Disaster, and the weariest picks 1 consequence. Then roll +Fortunes. Reset Fortunes to +1.</div>
</div>
<p class="stonetop-seasons-cta">Click <strong>Seasons Change</strong> above to walk through the current season step by step.</p>`,
	},
	{
		slug: "pullTogether",
		label: "Pull Together",
		stat: "population",
		statLabel: "Population",
		rollable: true,
		interactive: true,
		description: `<p>When you <strong>set a community to work on improvements, to secure new resources, or to make major repairs</strong>, spend whatever the GM says is required and roll <strong>+Population</strong>.</p>
<p><strong>On a 10+:</strong> the job gets done.</p>
<p><strong>On a 7-9:</strong> pick 1: other work does not get done; the work is shoddy or crude; there is a consequence; or there is an unforeseen cost, requirement, or challenge.</p>
<p><em>Diminished debility: disadvantage on this roll.</em></p>`,
	},
	{
		slug: "muster",
		label: "Muster",
		stat: "population",
		statLabel: "Population",
		rollable: true,
		interactive: true,
		description: `<p>When <strong>Stonetop needs mustering against a threat</strong>, reduce Fortunes by 1 and roll <strong>+Population</strong>.</p>
<p><strong>On a 7+:</strong> the steading is alert and ready for action until the threat passes, the Seasons Change, or you cease to oversee the muster. On a 10+, also pick 2; on a 7-9, also pick 1.</p>
<ul>
  <li>Increase Defenses by 1 as long as the muster holds</li>
  <li>Everyone's willing to pitch in; don't reduce Fortunes after all</li>
  <li>The muster holds together even without your presence</li>
  <li>1 or 2 individuals show real potential; ask the GM who and how</li>
</ul>
<p><em>Diminished debility: disadvantage on this roll.</em></p>`,
	},
	{
		slug: "deploy",
		label: "Deploy",
		stat: "defenses",
		statLabel: "Defenses",
		rollable: true,
		interactive: true,
		description: `<p>When you <strong>send a steading's people into danger or rally them against an attack</strong>, roll <strong>+Defenses</strong>.</p>
<p><strong>On a 10+:</strong> it goes as well as can be expected.</p>
<p><strong>On a 7-9:</strong> it works, but someone picks 1 from the list below. If the steading is acting from a position of strength, you choose. Otherwise, the GM chooses.</p>
<ul>
  <li>It's less effective than you expected</li>
  <li>Injuries abound; the steading marks diminished</li>
  <li>The GM picks a named NPC involved in the action; they die</li>
</ul>
<p><em>Diminished debility: disadvantage on this roll.</em></p>`,
	},
	{
		slug: "tradeBarter",
		label: "Trade & Barter",
		stat: "prosperity",
		statLabel: "Prosperity",
		rollable: true,
		interactive: true,
		description: `<p>When you <strong>wish to acquire or sell a commonly available item</strong>, you can. When you seek to acquire or sell a special item, roll <strong>+Prosperity</strong> and subtract the item's Value. In winter, you have disadvantage.</p>
<p><strong>On a 10+:</strong> you can get it or sell it for a fair price.</p>
<p><strong>On a 7-9 when buying:</strong> the GM picks 1 complication.</p>`,
	},
	{
		slug: "meetWithDisaster",
		label: "Meet with Disaster",
		stat: null,
		statLabel: null,
		rollable: false,
		interactive: true,
		description: `<p>When <strong><em>calamity befalls the steading or panic spreads</em></strong>, reduce Fortunes by 1 (min -1).</p><p>When <strong><em>Fortunes would drop below -1 for any reason</em></strong> (not just calamity or panic), then the GM picks 1 instead:</p><ul><li>The steading marks <em>diminished</em> from injuries/sickness/doubt (disadvantage to Deploy, Muster, Pull Together)</li><li>The steading marks <em>lacking</em> due to shortages/hoarding/distrust (treat Prosperity as 1 lower)</li><li>The steading marks <em>malcontent</em> from fear/anger/despair (Fortunes reset to +0 each season, not +1; folks need Persuading more often than usual)</li><li>Folks start to leave; reduce Population by 1</li></ul>`,
	},
	{
		slug: "requisition",
		label: "Requisition",
		stat: "fortunes",
		statLabel: "Fortunes",
		rollable: false,
		interactive: true,
		description: `<p>When you <strong>borrow some of the steading's assets for an expedition</strong> or otherwise put them at risk, roll <strong>+Fortunes</strong>.</p>
<p><strong>On a 10+:</strong> go ahead, but bring it back safely.</p>
<p><strong>On a 7-9:</strong> you'll need to do some convincing.</p>
<p><strong>On a 6-:</strong> don't mark XP; you can take the asset with you if you want, but if you do, reduce Fortunes by 1.</p>`,
	},
	{
		slug: "returnTriumphant",
		label: "Return Triumphant",
		// No dice: Return Triumphant clears a steading debility (or raises Fortunes
		// if none are marked), so it's a non-rollable interactive walkthrough like
		// Meet with Disaster. `stat`/`statLabel` stay null so no "+Fortunes" roll chip
		// renders. A player makes this move, but its effects land on the steading —
		// hence its home on the steading sheet, not the character sheet's expedition list.
		stat: null,
		statLabel: null,
		rollable: false,
		interactive: true,
		description: `<p>When you <strong>return home in triumph</strong> — having saved your fellows, put down the threat, seized the opportunity, etc. — clear one of the steading's debilities (<em>diminished</em>, <em>lacking</em>, or <em>malcontent</em>).</p>
<p>If the steading has no debilities marked, then increase Fortunes by 1.</p>`,
	},
	{
		slug: "persuade",
		label: "Persuade",
		stat: "fortunes",
		statLabel: "Fortunes",
		rollable: true,
		interactive: true,
		description: `<p>When you need to <strong>convince the residents of Stonetop to do something costly, dangerous, or against their interests</strong>, roll <strong>+Fortunes</strong>.</p>
<p><strong>On a 10+:</strong> they go along with it, at least for now.</p>
<p><strong>On a 7–9:</strong> they need something in return, or they'll only go partway.</p>
<p><strong>On a miss:</strong> they refuse outright, and may resent being asked.</p>
<p><em>Malcontent debility: folks need Persuading more often than usual.</em></p>`,
	},
	// The two improvements that ARE a move. Listed only once built (`requires`), since a
	// steading without them has no such move to make.
	{
		slug: "aurochsHunt",
		label: "Aurochs Hunt",
		stat: "defenses",
		statLabel: "Defenses",
		rollable: true,
		interactive: true,
		requires: "aurochsHunting",
		description: `<p>When you <strong>lead the aurochs hunt in spring</strong>, roll <strong>+Defenses</strong>.</p>
<p><strong>On a 10+:</strong> gain 1d4 Surplus.</p>
<p><strong>On a 7-9:</strong> gain 1d4 Surplus, but pick 1 from the list below.</p>
<p><strong>On a 6-:</strong> pick 1 from the list below, or pick 2 and gain 1d4 Surplus.</p>
<ul>
  <li>1d4 of the town's horses are lamed or killed</li>
  <li>A number of locals are injured; the steading marks diminished</li>
  <li>The GM picks an NPC present for the hunt; they are killed</li>
  <li>The Hillfolk are somehow offended</li>
  <li>The herd is weak; if you hunt next year, they'll be wiped out</li>
</ul>
<p><em>From the Aurochs Hunting improvement.</em></p>`,
	},
	{
		slug: "heroicReputation",
		label: "Heroic Reputation",
		stat: "fortunes",
		statLabel: "Fortunes",
		rollable: true,
		interactive: true,
		requires: "heroicReputation",
		description: `<p>When you <strong>first meet someone from beyond Stonetop</strong>, roll <strong>+Fortunes</strong>.</p>
<p><strong>On a 10+:</strong> say what they've heard about you or Stonetop, and gain advantage on your next move against them.</p>
<p><strong>On a 7-9:</strong> say what they've heard.</p>
<p><strong>On a 6-:</strong> the GM decides what they've heard.</p>
<p><em>From the Heroic Reputation improvement.</em></p>`,
	},
];
const STEADING_MOVES = [..._STEADING_MOVES_RAW].sort((a, b) => a.label.localeCompare(b.label));
const STEADING_STAT_CHIP_LABELS = {
	Defenses: "DEF",
	Fortunes: "FOR",
	Population: "POP",
	Prosperity: "PRO",
};

// Hover tooltips for the steading stat labels, keyed by data-steading-stat
// (Book I "Homefront"). Gated by hoverDescriptionsSteadingStats.
const STEADING_STAT_TOOLTIPS = {
	surplus:    "Stores of food and trade goods. A resource you accumulate, spend, and consume, not rolled. Generated in summer and autumn, eaten through in winter.",
	fortunes:   "The steading's morale, social cohesion, and the favor of the gods: “how things are going.” Roll +Fortunes to Requisition and when the Seasons Change; resets to +1 each season.",
	size:       "How big the steading is: hamlet (under 50 people), village (150–350), town (500–1500), city (2500+). Mostly descriptive, but it affects winter Surplus consumption and the Muster, Pull Together, and Trade & Barter moves.",
	population: "The number of able bodies living here, relative to its Size. Roll +Population to Muster or Pull Together; higher Population also eats more Surplus each winter.",
	prosperity: "The goods in circulation, the variety of tradesfolk, and merchant traffic. Roll +Prosperity to Trade & Barter; it also sets the value of “x piercing” and what gear is available.",
	defenses:   "The steading's martial readiness: trained, armed residents and veteran warriors. Roll +Defenses to Deploy its people against a threat.",
	debilities: "Ongoing afflictions that drag the steading down: diminished (injury, sickness, or doubt), lacking (shortages, hoarding, or distrust), and malcontent (fear, anger, or despair). Check any that apply; each imposes its own penalty until it's cleared.",
};
const _esc = escHtml;

// The two people lists whose add button works outside edit mode (see activateListeners); every
// other list's add button is an edit-mode control.
const PEOPLE_LISTS = Object.freeze(["residents", "neighbors"]);

/**
 * One yes/no question an improvement (or the Marshal's Logistics) asks in a homefront window.
 * `checked` questions start ticked: they are usually true, and unticking is the exception.
 */
export function improvementCheckHtml(q) {
	return `<label class="stonetop-homestead-field stonetop-homestead-field--check">
		<input type="checkbox" class="stonetop-check" name="${_esc(q.name)}" value="yes"${q.checked ? " checked" : ""}>
		<span>${_esc(q.label)}</span>
	</label>`;
}

/** Any improvement question (improvementQuestions) as its control: a tick, a pick, or a count. */
export function improvementQuestionHtml(q) {
	if (q.type === "select") {
		return `<label class="stonetop-homestead-field">
			<span>${_esc(q.label)}</span>
			<select name="${_esc(q.name)}">${q.options.map(o => `<option value="${_esc(o.value)}">${_esc(o.label)}</option>`).join("")}</select>
		</label>`;
	}
	if (q.type === "number") {
		return `<label class="stonetop-homestead-field">
			<span>${_esc(q.label)}</span>
			<input type="number" name="${_esc(q.name)}" min="${Number(q.min) || 0}"${Number.isFinite(q.max) ? ` max="${q.max}"` : ""} value="${Number(q.value) || 0}">
		</label>`;
	}
	return improvementCheckHtml(q);
}

// A steading move's result table is an ordered list of rows. Each row declares which PbtA
// tier(s) its line feeds — success (10+), partial (7-9), both (a 7+ line), failure (6-/Miss),
// or none (an informational row shown in the legend only) — plus a display label and line.
// The legend renders every row; the roll card's per-tier text buckets each row's line into
// its tiers. Data-driven, so the copy can be reworded freely without a regex silently
// re-bucketing it or failing to bold its prefix (the old string round-trip's failure mode).
const RESULT = {
	strong: (line, label = "10+") => ({ tiers: ["success"],            label, line }),
	weak:   (line, label = "7-9") => ({ tiers: ["partial"],            label, line }),
	hit:    (line, label = "7+")  => ({ tiers: ["success", "partial"], label, line }),
	miss:   (line, label = "6-")  => ({ tiers: ["failure"],            label, line }),
	info:   (label, line)         => ({ tiers: [],                     label, line }),
};

function _resultsLegendHtml(rows) {
	return resultsLegendHtml((rows ?? []).map(row =>
		// Real result tiers get a bold label; informational rows (e.g. "Commonly available
		// item") stay unbolded, matching the old prefix-only bolding.
		row.tiers?.length
			? `<strong>${_esc(row.label)}:</strong> ${_esc(row.line)}`
			: `${_esc(row.label)}: ${_esc(row.line)}`
	));
}

function _moveResultsFromRows(rows) {
	const collect = tier => (rows ?? [])
		.filter(row => row.tiers?.includes(tier))
		.map(row => row.line)
		.join(" ");
	return Object.fromEntries(TIER_KEYS.map(key => [key, { value: collect(key) }]));
}

// `winterAgain` is the second bite's formula as THIS steading rolls it (a hamlet's 1d2, a town's
// 2d6), so the card names the dice the "roll what winter still wants" button is about to roll.
function _seasonFortunesResultRows(seasonId, { winterAgain = "1d4+Population" } = {}) {
	switch (seasonId) {
		case "summer":
			return [
				RESULT.strong("pick 2 seasonal gains."),
				RESULT.weak("pick 1 seasonal gain."),
				RESULT.miss("a threat makes itself known or gets worse; don't mark XP."),
			];
		case "winter":
			return [
				RESULT.strong("winter is relatively mild; each player names a local NPC with whom their relationship improves."),
				RESULT.weak(`the steading must consume ${winterAgain} more Surplus before winter ends, or suffer the consequences again.`),
				RESULT.miss("as 7-9, plus threats abound; don't mark XP."),
			];
		case "spring":
		case "autumn":
		default:
			return [
				RESULT.strong("pick 1 seasonal gain."),
				RESULT.weak("pick 1 seasonal gain, but a threat makes itself known or gets worse."),
				RESULT.miss("threats abound; don't mark XP."),
			];
	}
}

function _seasonRollOptions(seasonId, { winterAgain } = {}) {
	const moveResults = _moveResultsFromRows(_seasonFortunesResultRows(seasonId, { winterAgain }));
	return {
		moveResults,
		// The ladder as a move card carries it: under the title, landed rung lit (rollStat marks
		// it), rather than a "Results" box under the result.
		moveDescription: moveTiersHtml(moveResults),
		// The seasonal gains on the card, so the players can see what the 10+/7-9 lets them
		// choose. A list to read, not tick: they say what they choose and the GM enters it in the
		// Seasons Change window. Winter's roll picks no gains.
		...(seasonId === "winter" ? {} : SEASONAL_GAIN_LIST),
	};
}

// Deploy's one list (Book I): on a 7-9 "it works but someone picks 1 from the list below". Who
// picks is the position-of-strength question the move's window asks (improvement-rolls.js).
const DEPLOY_CONSEQUENCES = [
	"It's less effective than you expected.",
	"Injuries abound; the steading marks diminished.",
	"The GM picks a named NPC involved in the action; they die.",
];

// "Injuries abound; the steading marks diminished", the one consequence with something to write,
// so its button rides the tiers that can call for it: the 7-9 pick, and the 6- where the GM may
// have the militia "suffer heavy losses (mark diminished)". `data-move` names the card it is on
// for the steading's ledger. Wired in stonetop.js.
const markDiminishedAction = move => `<button type="button" class="stonetop-deploy-mark-diminished" data-action="deploy-mark-diminished" data-move="${move}">
				<i class="fas fa-band-aid"></i> Injuries abound: mark diminished
			</button>`;

/**
 * Deploy's result lines. `strength` is the window's answer: true when the steading acts from a
 * position of strength (so the player picks the 7-9 consequence), false when the GM does, and null
 * for a roll nobody was asked about. The 6- line is the book's advice to the GM, since the move
 * itself says nothing past the 7-9.
 */
function deployResults(strength) {
	const picker = strength === true ? "you pick 1 from the list below (a position of strength)."
		: strength === false ? "the GM picks 1 from the list below."
		: "someone picks 1 from the list below: you, if the steading is acting from a position of strength; otherwise the GM.";
	return [
		RESULT.strong("it goes as well as can be expected."),
		RESULT.weak(`it works, but ${picker}`),
		RESULT.miss("the GM says what happens: the villagers might refuse your orders, get outfought and suffer heavy losses (mark diminished), or be put in a spot."),
	];
}
// The Aurochs Hunting improvement's list, picked from on a 7-9 and a 6-.
const AUROCHS_CONSEQUENCES = [
	"1d4 of the town's horses are lamed or killed.",
	"A number of locals are injured; the steading marks diminished.",
	"The GM picks an NPC present for the hunt; they are killed.",
	"The Hillfolk are somehow offended.",
	"The herd is weak; if you hunt next year, they'll be wiped out.",
];

// The hunt's buttons, one per thing it can write: the Surplus it brings home, and the two
// consequences that change the sheet (the herd's weakness is remembered for next spring's
// warning). Wired in stonetop.js; each settles once per card.
const AUROCHS_SURPLUS_ACTION = `<button type="button" class="stonetop-aurochs-surplus" data-action="aurochs-surplus">
		<i class="fas fa-drumstick-bite"></i> Gain 1d4 Surplus
	</button>`;
const AUROCHS_CONSEQUENCE_ACTIONS = `<button type="button" class="stonetop-aurochs-horses" data-action="aurochs-horses">
		<i class="fas fa-horse"></i> Horses lamed or killed: roll 1d4
	</button>
	${markDiminishedAction("Aurochs Hunt")}
	<button type="button" class="stonetop-aurochs-weak" data-action="aurochs-weak">
		<i class="fas fa-cow"></i> The herd is weak: remember it next spring
	</button>`;

const MUSTER_CHOICES = [
	"Increase Defenses by 1 as long as the muster holds.",
	"Everyone is willing to pitch in; do not reduce Fortunes after all.",
	"The muster holds together even without your presence.",
	"1 or 2 individuals show real potential; ask the GM who and how.",
];

// A 7+ leaves the steading "alert and ready for action until the threat passes, the Seasons
// Change, or you cease to oversee the muster" — a STATE, not a one-off, and the only steading
// move that leaves one behind. Raising it from the card rather than the pre-roll dialog for the
// reason Deploy's diminished button is there too: on a 6- there is no muster to raise, and
// offering it before the dice were read asks about an outcome nobody has yet.
//
// Two buttons because "Increase Defenses by 1 as long as the muster holds" is one of the picks
// above, and it is the half that MUST be given back when the muster ends. A +1 nobody remembers
// to remove is worse than one nobody remembers to add: it is invisible on the sheet either way,
// but the stale one is wrong. Taking it here is what lets standing down undo it.
const MUSTER_RAISE_ACTIONS = `<button type="button" class="stonetop-muster-raise" data-action="muster-raise">
		<i class="fas fa-tower-observation"></i> Raise the muster
	</button>
	<button type="button" class="stonetop-muster-raise" data-action="muster-raise" data-defenses="1">
		<i class="fas fa-shield-halved"></i> Raise it, +1 Defenses while it holds
	</button>`;

/**
 * The homefront moves, as their dialog and their roll card between them present them.
 *
 * A flow is REFERENCE plus, at most, the controls that change the roll — `trigger`, `results`
 * and `note` are read before the dice, `fields` is only for something the roll itself needs
 * (Trade & Barter's Value and its winter disadvantage). It deliberately holds no free-text
 * boxes: nothing stored the answers, so all they did was stand between the move and its roll.
 *
 * `pickPools` names, per result tier, the list that tier chooses from. Those render on the
 * ROLL CARD (roll-engine's pickOptions), as a checklist whose ticks persist on the message —
 * so the choice is made once the dice have said which tier, and how many, rather than being
 * guessed at in the dialog beforehand. How many to take is already in each tier's `results`
 * line ("choose 2", "the GM chooses 2 consequences"), so no count is repeated here.
 */
const HOMESTEAD_MOVE_FLOWS = {
	pullTogether: {
		label: "Pull Together",
		stat: "population",
		statLabel: "Population",
		trigger: "When you set a community to work on improvements, to secure new resources, or to make major repairs, spend whatever the GM says is required and roll +Population.",
		pickPools: {
			partial: [
				"It gets done, but other work does not; reduce Fortunes by 1.",
				"It gets done, but the work is shoddy or crude.",
				"It gets done, but there is a consequence.",
				"There is an unforeseen cost, requirement, or challenge; address it and the job gets done.",
			],
		},
		results: [
			RESULT.strong("the job gets done."),
			RESULT.weak("the job gets done, but pick 1."),
			RESULT.miss("the GM says what happens."),
		],
		note: "Diminished gives disadvantage on this roll.",
	},
	muster: {
		label: "Muster",
		stat: "population",
		statLabel: "Population",
		trigger: "When Stonetop needs mustering against a threat, reduce Fortunes by 1 and roll +Population.",
		beforeRoll: "musterCost",
		pickPools: {
			success: MUSTER_CHOICES,
			partial: MUSTER_CHOICES,
		},
		// Both 7+ tiers, since both leave the steading alert; only the number of picks differs.
		tierActions: {
			success: MUSTER_RAISE_ACTIONS,
			partial: MUSTER_RAISE_ACTIONS,
		},
		results: [
			RESULT.hit("the steading is alert and ready for action until the threat passes, the Seasons Change, or you cease to oversee the muster."),
			RESULT.strong("also pick 2."),
			RESULT.weak("also pick 1."),
			RESULT.miss("the GM says what happens."),
		],
		note: "Diminished gives disadvantage on this roll.",
	},
	deploy: {
		label: "Deploy",
		stat: "defenses",
		statLabel: "Defenses",
		trigger: "When you send a steading's people into danger or rally them against an attack, roll +Defenses. Before the roll, say what a 10+ looks like.",
		pickPools: {
			partial: DEPLOY_CONSEQUENCES,
		},
		tierActions: {
			partial: markDiminishedAction("Deploy"),
			failure: markDiminishedAction("Deploy"),
		},
		// The 7-9 line names who picks once the window has asked (deployResults); read bare, off
		// the Moves tab's roll chip, it says both.
		results: deployResults(null),
		note: "Diminished gives disadvantage on this roll.",
	},
	tradeBarter: {
		label: "Trade & Barter",
		stat: "prosperity",
		statLabel: "Prosperity",
		// BEHAVIOUR FLAGS, not decoration — the same way `beforeRoll: "musterCost"` is read by
		// key rather than by name. Both of these used to be selected by testing `flow.label`
		// against the string "Trade &amp; Barter", so renaming the move on screen (or changing how
		// the ampersand is escaped) silently took away the special-item button and stopped the
		// item's Value being subtracted from the roll — no error, no failing test, the move just
		// rolled wrong.
		specialItems: true,
		rollFields: true,
		trigger: "When you wish to acquire or sell a commonly available item, you can. When you seek to acquire or sell a special item, roll +Prosperity and subtract the item's Value. In winter, you have disadvantage.",
		// The only two controls in any homefront dialog, because these two are the only ones
		// the dice read: Value is subtracted as a modifier, and winter forces disadvantage.
		fields: [
			{ name: "value", label: "Item Value", type: "number", placeholder: "0", min: 0 },
			// Starts ticked while the steading's clock reads winter, as Forage's and On the Hoof's
			// winter do; still the table's to untick.
			{ name: "winter", label: "It is winter", type: "checkbox", checkedInSeason: "winter" },
		],
		results: [
			RESULT.info("Commonly available item", "you can acquire or sell it without rolling."),
			RESULT.strong("you can get it or sell it for a fair price."),
			RESULT.weak("the GM picks 1 (below).", "7-9 when buying"),
			RESULT.weak("you can sell it now, but you won't get its full worth.", "7-9 when selling"),
			RESULT.miss("don't mark XP. If you still want to acquire/sell it, you'll need to travel elsewhere or wait until next season, and then try again.", "6- either way"),
		],
		pickPools: {
			partial: [
				"You can get it, but it'll cost more than usual",
				"Someone has it, but they aren't keen to give it up",
				"You can get something close, but not quite right",
			],
		},
		note: "For unique or truly exceptional items, don't Trade & Barter — Make a Plan with the GM or wait for a trade opportunity when Seasons Change. Lacking treats Prosperity as 1 lower; subtract the item's Value as a modifier.",
	},
	// Aurochs Hunting (an improvement): "when you lead the aurochs hunt in spring, roll +Defenses".
	aurochsHunt: {
		label: "Aurochs Hunt",
		stat: "defenses",
		statLabel: "Defenses",
		requires: "aurochsHunting",
		trigger: "When you lead the aurochs hunt in spring, roll +Defenses.",
		pickPools: {
			partial: AUROCHS_CONSEQUENCES,
			failure: AUROCHS_CONSEQUENCES,
		},
		tierActions: {
			success: AUROCHS_SURPLUS_ACTION,
			partial: `${AUROCHS_SURPLUS_ACTION}${AUROCHS_CONSEQUENCE_ACTIONS}`,
			failure: `${AUROCHS_SURPLUS_ACTION}${AUROCHS_CONSEQUENCE_ACTIONS}`,
		},
		results: [
			RESULT.strong("gain 1d4 Surplus."),
			RESULT.weak("gain 1d4 Surplus, but pick 1 from the list below."),
			RESULT.miss("pick 1 from the list below, or pick 2 and gain 1d4 Surplus."),
		],
		note: "",
	},
	// Heroic Reputation (an improvement). "Advantage on your next move against them" belongs to
	// one person in one scene, so it is said on the card rather than held on anybody's sheet.
	heroicReputation: {
		label: "Heroic Reputation",
		stat: "fortunes",
		statLabel: "Fortunes",
		requires: "heroicReputation",
		trigger: "When you first meet someone from beyond Stonetop, roll +Fortunes.",
		results: [
			RESULT.strong("say what they've heard about you or Stonetop, and gain advantage on your next move against them."),
			RESULT.weak("say what they've heard about you or Stonetop."),
			RESULT.miss("the GM decides what they've heard."),
		],
		note: "",
	},
	persuade: {
		label: "Persuade",
		stat: "fortunes",
		statLabel: "Fortunes",
		trigger: "When you need to convince the residents of Stonetop to do something costly, dangerous, or against their interests, roll +Fortunes.",
		results: [
			RESULT.strong("they go along with it, at least for now."),
			RESULT.weak("they need something in return, or they'll only go partway."),
			RESULT.miss("they refuse outright, and may resent being asked.", "Miss"),
		],
		note: "Malcontent means folks need Persuading more often than usual.",
	},
};

// Every editable section carries its own hover edit pencil; each is read-only
// until its pencil (or the global header wrench) turns it on. Keys match the
// `data-section` attributes in the templates.
const STEADING_EDIT_SECTIONS = [
	"surplus", "fortunes", "population", "defenses", "prosperity",
	"size", "fortifications", "currency",
	"resources", "assets", "places",
	// "threats" and "sites" left with their tabs, which moved to the GM Toolkit sheet
	// (module/actors/gmtoolkit/gm-prep-tabs.js declares its own list).
	"players", "residents", "neighbors", "settlements", "improvements",
];

export function createStonetopSteadingSheetClass(Base) {
	// Sections with their own heading pencil (Residents, Neighbors) track edit
	// state independently of the global header-wrench `_editMode` via the shared
	// section-editing mixin.
	//
	// withSheetSizeMemory: reopen at the size this user last left this steading's sheet.
	return class StonetopSteadingSheet extends withSectionEditing(withSheetSizeMemory(Base)) {
		_stonetopSteading;
		_editMode = false;
		// Sections whose edit mode was just turned off: their "done" check lingers
		// for a beat, fades out, then reverts to the hover pencil. Each has a timer.
		_recentlyEditedSections = new Set();
		_recentlyEditedTimers = new Map();
		// Slugs of improvement cards the user has expanded. Tracked here (not in the
		// DOM) so a card stays open across the re-render that ticking a requirement
		// or completion checkbox triggers — it only collapses when its header/chevron
		// is clicked.
		_openImprovements = new Set();
		// The single lit category chip on the Improvements tab (see IMPROVEMENT_CATEGORIES).
		// One at a time: picking a second chip drops the first. "" means no filter, so the
		// tab opens showing everything, and clicking the lit chip again returns to that.
		// Instance state like _openImprovements, deliberately NOT an actor flag: it's one
		// viewer's lens on the list, not a property of the steading, and a player with
		// read-only access to the actor could not write a flag anyway.
		_improvementCategory = "";
		// The relationship map board, once this reader has opened that tab, and null until then.
		// Held on the SHEET rather than rebuilt per render because it is a long-lived thing with a
		// reader's zoom, pan and open tie bar in it, and because its first render seats the party
		// and the village. See steading-relmap-tab.js, which owns every read and write of this.
		_relmapPanel = null;
		// The timeline, once this reader has opened that tab, and null until then. Held on the SHEET
		// for the same reason as the board above: it carries where the reader had scrolled to in a
		// campaign's worth of entries. See timeline/timeline-tab.js, which owns every read and write
		// of this field.
		_timelinePanel = null;
		constructor(...args) {
			super(...args);
			this._stonetopSteading = this.actor.typedActor;
			// Honor the "Open Sheets in Edit Mode" client setting on first open.
			this._editMode = getOpenSheetsInEditMode();
		}

		static get defaultOptions() {
			return foundry.utils.mergeObject(super.defaultOptions, {
				// `stonetop-layout-classic` when this user reads steading sheets in the classic
				// layout — see the character sheet's note for why it is set both here and in
				// _render.
				classes: ["pbta", "stonetop", "sheet", "actor", "steading", ...layoutClasses("steading")],
				width: 1080,
				minWidth: 600,
				height: 840,
				// Mirrors the CSS floor in stonetop.css — see the character sheet's note.
				minHeight: 620,
				tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "overview" }],
			});
		}

		get template() {
			return "systems/stonetop_pwd/templates/actor/steading.hbs";
		}

		async _render(force, options) {
			// The hover preview is a document.body singleton, so a re-render while the cursor is
			// over an avatar tears out the anchor without firing mouseleave — clear it up front so
			// no orphaned floating preview is left stuck on screen.
			removeAvatarPreview();
			// ⚠ THE RELATIONSHIP MAP BOARD COMES OUT BEFORE THE BODY IS REPLACED, and goes back in
			// at the foot of this method. It is the SAME element across a re-render, carried over
			// with its pan, its zoom and its listeners, because rebuilding it would throw away the
			// corner of the map the reader was looking at every time anything wrote to this steading.
			detachRelmapTab(this);
			// Same for the timeline, and for the same reason: a re-render would rebuild the spine and
			// throw away where the reader had scrolled to in it.
			detachTimelineTab(this);
			await super._render(force, options);
			stampLayoutClass(this, "steading");
			// Strip any PBTA-injected playbook controls and FoundryVTT chrome from the window header
			const header = this.element[0]?.querySelector(".window-header");
			if (header) {
				header.querySelectorAll(".pbta-playbook, .sheet-playbook, [class*='playbook']").forEach(el => el.remove());
				header.querySelectorAll("select, input[name*='playbook']").forEach(el => el.remove());
				header.querySelectorAll(".document-id-link").forEach(el => el.remove());
			}
			this._injectHeaderToggle();
			// ⚠ THE MAP BOARD GOES BACK IN HERE AND NOT IN `activateListeners`, WHICH IS TOO EARLY.
			// Whether the board is wanted depends on which tab is showing, and a sheet reopened
			// after a reload does not know that yet at listener time: utils/window-restore.js puts
			// the reader back on the tab they left from the RENDER hook, which core fires after
			// `activateListeners` has already run. Wired there, a GM who reloads with the sheet open
			// on the map would be handed an empty tab until they clicked away and back.
			//
			// Off the frame rather than the form, because that is what this method has to hand, and
			// the form is inside it. Cheap and idempotent on every other render: a board already
			// mounted is simply moved into the tab this render built, and one that was never opened
			// is not built now either.
			syncRelmapTab(this, this.element?.[0]);
			syncTimelineTab(this, this.element?.[0]);
		}

		/**
		 * ⚠ `super` FIRST AND NOTHING ELSE ABOUT SIZE. Core's own `_onChangeTab` is kept so this
		 * sheet behaves exactly as it did; what is added is the one thing a tab change can mean
		 * here, which is a reader arriving on the relationship map for the first time. The board
		 * is built THEN rather than on every render: it costs a walk of every person and line on
		 * the map, five global hooks, and (once) the writes that seat the party and the village.
		 * None of that should happen because somebody opened the sheet to look at the harvest.
		 *
		 * Nothing here resizes the sheet, and nothing here may: moving between tabs never changes
		 * a window's size in this system (tests/actors/tabbed-sheet-height.test.js).
		 */
		_onChangeTab(event, tabs, active) {
			super._onChangeTab(event, tabs, active);
			if (active === STEADING_RELMAP_TAB) syncRelmapTab(this, this.element?.[0]);
			if (active === TIMELINE_TAB) syncTimelineTab(this, this.element?.[0]);
		}

		_injectHeaderToggle() {
			// Master edit toggle: when on, every section is editable. Each section also has its
			// own hover pencil for editing it in isolation. Shared with the character, NPC and
			// monster sheets — see utils/sheet-chrome.js.
			injectHeaderToggle(this, "Steading", {
				// Locking the sheet resets any per-section pencils back to read-only.
				onChange: (on) => {
					if (on) return;
					this._editingSections.clear();
					this._clearAllSectionDoneTimers();
				},
			});
		}

		_getHeaderButtons() {
			const buttons = super._getHeaderButtons().filter(b => b.class !== "configure-sheet");
			const tokenIdx = buttons.findIndex(b => b.class?.includes("token"));
			buttons.splice(tokenIdx >= 0 ? tokenIdx : 0, 0, {
				label:   "Ledger",
				class:   "stonetop-ledger-button",
				icon:    "fas fa-scroll",
				onclick: () => this._openLedgerDialog(),
			});
			return buttons;
		}

		_openLedgerDialog() {
			openLedgerDialog(this.actor, SteadingLedger);
		}

		// Section-editing hooks: entering edit cancels any lingering "done" check;
		// leaving edit starts the fade-out check (see _markSectionDone).
		_onSectionEditOpened(section) { this._clearSectionDone(section); }
		_onSectionEditClosed(section) { this._markSectionDone(section); }

		// Show a section's "done" check for a beat after leaving edit, then fade it
		// out (CSS) and re-render so the section reverts to its hover pencil.
		_markSectionDone(section) {
			this._clearSectionDone(section);
			this._recentlyEditedSections.add(section);
			const timer = setTimeout(() => {
				this._recentlyEditedSections.delete(section);
				this._recentlyEditedTimers.delete(section);
				if (this.rendered) this.render(false);
			}, 1000);
			this._recentlyEditedTimers.set(section, timer);
		}

		_clearSectionDone(section) {
			this._recentlyEditedSections.delete(section);
			const timer = this._recentlyEditedTimers.get(section);
			if (timer) {
				clearTimeout(timer);
				this._recentlyEditedTimers.delete(section);
			}
		}

		_clearAllSectionDoneTimers() {
			for (const timer of this._recentlyEditedTimers.values()) clearTimeout(timer);
			this._recentlyEditedTimers.clear();
			this._recentlyEditedSections.clear();
		}

		async close(options) {
			this._clearAllSectionDoneTimers();
			// ⚠ THE MAP BOARD REGISTERS FIVE GLOBAL JOURNAL HOOKS AND ONLY ITS OWN `close` TAKES
			// THEM OFF. Left registered they fire on every journal write at the table for the rest
			// of the session, holding a whole board and its portraits alive behind them, once for
			// every steading sheet anybody ever opened on that tab.
			closeRelmapTab(this);
			// The timeline registers three of its own, with the same consequence. See timeline-tab.js.
			closeTimelineTab(this);
			// The avatar hover preview lives on document.body, so it survives the sheet's own
			// DOM being torn down — clear it here or it orphans if the sheet closes (e.g. Escape)
			// while the cursor is still over an avatar and no mouseleave ever fires.
			removeAvatarPreview();
			// Same for the classic layout's move hover panel, which is also a document.body
			// singleton. activateListeners clears it on each render, but a sheet that is closed
			// rather than re-rendered never reaches that — so it has to be dropped here too.
			removeHoverPanels(this);
			return super.close(options);
		}

		async getData() {
			const context = await super.getData();
			context.stonetop = await this._stonetopSteading.buildSnapshot();
			// The click target is resolved HERE, once, rather than branched in each template.
			// The modern card and the classic row differ in their wrapper, their name element and
			// where the description goes, but they agree exactly on what a click means — and the
			// delegated handler below reads one set of `li.dataset` keys from both. Resolving it
			// in the view model is what keeps those two shapes from drifting apart: a move with a
			// walkthrough carries its slug, one that only rolls carries its name and stat, and a
			// move this steading cannot make carries neither (the handler's own guard covers the
			// empty pair, so the templates emit the attributes unconditionally).
			context.stonetop.moves = STEADING_MOVES.filter(move => !move.requires || this._hasImprovement(move.requires)).map(move => ({
				...move,
				statChipLabel: STEADING_STAT_CHIP_LABELS[move.statLabel] ?? move.statLabel,
				moveSlug: move.interactive ? move.slug : "",
				moveName: !move.interactive && move.rollable ? move.label : "",
				unowned: !move.rollable && !move.interactive,
			}));
			context.stonetop.rollMode = this._sheetRollMode();
			context.stonetop.showRollStatChips = getRollStatChipsSetting();
			// Whether either shape of the sticky Roll Modifier is drawn — the classic sidebar's
			// radios or the modern heading's pill. Off means the pre-roll window is asking instead
			// (RollDialog.js), and a control that answers a question nobody is being asked is a
			// control that quietly changes rolls.
			context.stonetop.showRollModeControl = !getAskRollModeEachRollSetting();
			context.stonetop.enrichedNotes = await foundry.applications.ux.TextEditor.enrichHTML(context.stonetop.notes ?? "");
			context.stonetop.editMode = this._editMode;
			context.stonetop.canEdit = this.isEditable;
			// Which layout this user reads this sheet in: the pre-rail one (stat band above the
			// tabs, Homefront Moves as a right-hand sidebar) or today's. Client-scoped and per
			// sheet type — see isClassicLayout in module/settings.js.
			context.stonetop.classicLayout = isClassicLayout("steading");
			// The GM's world switches for the Relationship Map and Timeline tabs (module/settings.js).
			// Off takes the tab out of the rail, and its panel goes with it (utils/mounted-panel-slot.js).
			context.stonetop.relmapShown = isRelationshipMapShown();
			context.stonetop.timelineShown = isTimelineShown();
			// A sheet left on either tab when it goes (its switch, or the classic layout) would
			// otherwise re-render with `active` naming a tab that is not drawn, and Tabs.activate
			// shows no body at all. Clamp before the paint, as the NPC sheet does for its own tabs.
			const drawn = { relmap: context.stonetop.relmapShown, timeline: context.stonetop.timelineShown };
			const activeTab = this._tabs?.[0]?.active;
			if (activeTab in drawn && !(drawn[activeTab] && !context.stonetop.classicLayout)) {
				this._tabs[0].active = "overview";
			}
			// Whether the classic moves sidebar is collapsed (defaults to expanded), persisted
			// per-actor, per-user. Unread by the modern layout, which has no sidebar. The
			// backing setting is still called `characterSidebarCollapsed`: the name predates the
			// steading sharing it, and renaming the key would drop everyone's stored state.
			context.stonetop.sidebarCollapsed = getSidebarCollapsed(this.actor?.id);
			// Per-section edit flags: a section is editable when the global header
			// wrench is on OR its own pencil is toggled.
			const sectionEdit = section => this.isSectionEditable(section);
			context.stonetop.edit = Object.fromEntries(
				STEADING_EDIT_SECTIONS.map(section => [section, sectionEdit(section)])
			);
			// Other Settlements: how this steading stands with the communities beyond it
			// (module/data/settlements.js), on the same 1-5 hearts the NPC and character
			// sheets use. Rows are the static roster, keyed by slug rather than actor id —
			// the shared row builder only ever reads .id/.name/.img, so a plain object does.
			// Nothing is stored until a heart moves, so the whole roster reads as neutral
			// on a fresh steading. Under the pencil every settlement lists with a show/hide
			// box; in play the unticked ones drop out.
			const settlementsEditing = context.stonetop.edit.settlements;
			const settlementRows = SETTLEMENTS.map(s => ({
				...relationshipRow(this.actor, { id: s.slug, name: s.name, img: null }, { defaultShown: true }),
				icon:    s.icon,
				tooltip: `${s.name}: ${s.blurb}`,
			}));
			context.stonetop.settlements    = settlementsEditing ? settlementRows : settlementRows.filter(r => r.shown);
			context.stonetop.hasSettlements = context.stonetop.settlements.length > 0;
			// Table or standings board, remembered per table in localStorage beside this
			// table's column widths and sort order.
			context.stonetop.settlementsRel = relationshipViewContext("steadingSettlements", context.stonetop.settlements);
			context.stonetop.recentlyEdited = Object.fromEntries(
				STEADING_EDIT_SECTIONS.map(section => [section, this._recentlyEditedSections.has(section)])
			);
			context.stonetop.hideUnearnedImprovements = this.actor.getFlag(STONETOP_SCOPE, "hideUnearnedImprovements") ?? false;
			context.stonetop.improvementCategories = IMPROVEMENT_CATEGORIES.map(cat => ({
				...cat,
				active: this._improvementCategory === cat.key,
			}));
			// Re-apply the user's expanded cards and lit category chips so both survive the
			// re-render that ticking a requirement triggers. `filtered` is stamped here rather
			// than left to the click handler alone so a re-render can't flash the hidden cards
			// back in before the handler re-runs.
			for (const imp of context.stonetop.improvements ?? []) {
				imp.isOpen = this._openImprovements.has(imp.slug);
				imp.filtered = this._isImprovementFiltered(imp.category);
				// The id the card's toggle button (aria-controls) and complete box (aria-describedby)
				// point at. Per window, since two steading sheets can be open side by side.
				imp.domId = `${this.id}-imp-${String(imp.slug).replace(/[^\w-]/g, "_")}`;
			}
			context.stonetop.isGM = game.user?.isGM ?? false;
			// The clock beside the sheet's title: the season the table is playing in and the
			// year it belongs to, stamped by the Seasons Change move. The un-stamped case falls
			// back to the picker's year so the header still names a year on a world that hasn't
			// turned a season since this shipped (see module/seasons/current-season.js).
			context.stonetop.currentSeason = currentSeasonView(readCurrentSeason(this.actor), this._seasonsCurrentYear());
			// And what the sky is doing, shown as a glyph to the left of that clock. Set by the
			// Weather picker when the GM posts a result; fine weather until they do (see
			// module/seasons/current-weather.js).
			context.stonetop.currentWeather = currentWeatherView(readCurrentWeather(this.actor));
			// And between the title and that clock, what the steading is still owed or still
			// owes: one glyph per unresolved thing, empty when there is nothing outstanding
			// (see module/actors/steading/steading-holds.js for what qualifies and why).
			// A row is a BUTTON only when it has somewhere to go and the viewer may go there;
			// for everyone else it is the same glyph as a plain readout, so a player still sees
			// what the steading owes without being handed a control that would refuse them.
			context.stonetop.holds = this._stonetopSteading.holdsView()
				.map(h => ({ ...h, interactive: !!h.action && context.stonetop.isGM }));
			// The Relationship Map tab needs nothing from this actor: the board is a JournalEntry
			// owned by the whole table, and it mounts itself (see steading-relmap-tab.js). All the
			// template wants to know is whether the world has a map at all, and if not, whether
			// this reader is one of the people who may make the first one.
			context.stonetop.relmap = relmapTabContext();
			return context;
		}

		activateListeners(html) {
			super.activateListeners(html);
			// Hang the tab rail off the window's right edge (module/utils/tab-rail.js).
			mountTabRail(this, html);
			// Frost the seam under the pinned header while the tab is scrolled — after the
			// rail is on the frame, since that is where the tab-change watcher binds.
			mountScrollFrost(this, html);
			wrapStonetopGlyphsInEl(html[0]);

			// The invitation shown on a world that has no relationship map yet. The BOARD is not
			// wired here; see the tail of `_render` for why it cannot be.
			html[0].querySelector("[data-steading-relmap-make]")
				?.addEventListener("click", () => makeFirstRelationshipMap(this));

			// Residents / Neighbors filters (see utils/tab-search.js). Each is scoped to its own
			// section so it only hides that section's rows; a row matches on the text of every
			// cell input (name, occupation, traits, relations, notes, home).
			//
			// `searchTerms` lives on the SHEET, not in the DOM, so a live filter survives the
			// re-render that follows any write and the reader keeps their place (see
			// utils/tab-search.js). One slot per box, so the two resident sections stay apart.
			const searchTerms = (this._tabSearchTerms ??= {});
			const residentRowText = row => [...row.querySelectorAll(".steading-resident-input")].map(i => i.value).join(" ");
			for (const sec of [".steading-residents-section--residents", ".steading-residents-section--neighbors"]) {
				wireTabSearch(html[0].querySelector(sec), {
					itemSel: ".steading-residents-row",
					textFor: residentRowText,
					memory: searchTerms, key: sec,
				});
			}

			// Improvements filter. Scoped to the whole `.tab.improvements` so the `.is-searching`
			// class lands on the same element that carries `.hide-unearned-improvements`, letting the
			// CSS reveal matched-but-un-earned cards while a term is active. A card matches on all of
			// its text (title, flavor, requirements, effect), so the collapsed body is searchable too.
			wireTabSearch(html[0].querySelector(".tab.improvements"), {
				itemSel: ".steading-improvement",
				textFor: card => card.textContent,
				memory: searchTerms, key: "improvements",
			});

			// Category chips beside that search box. One lights at a time, and clicking the
			// lit one clears back to showing everything. Filtering happens in place instead of
			// via a re-render so expanded cards stay expanded and the tab keeps its scroll
			// position; getData stamps the same classes so the state also survives a re-render
			// from elsewhere.
			this._wireImprovementCategoryFilter(html[0].querySelector(".tab.improvements"));

			// Drag a Place of Interest's lettered disc onto the canvas to drop a map
			// note (handled by the dropCanvasData hook). Read-only viewers may drag too;
			// note creation is separately gated by the core NOTE_CREATE permission. The
			// name is read live from the sibling input so it's current even mid-edit.
			html[0].addEventListener("dragstart", (ev) => {
				const badge = ev.target.closest?.(".steading-place-letter[draggable='true']");
				if (!badge) return;
				const item = badge.closest(".steading-place-item");
				const letter = item?.dataset.letter ?? badge.textContent.trim();
				const name = item?.querySelector(".steading-place-name")?.value?.trim() ?? "";
				if (!name) { ev.preventDefault(); return; }
				ev.dataTransfer.setData("text/plain", JSON.stringify({
					type: PLACE_OF_INTEREST_DRAG_TYPE,
					letter,
					name,
				}));
				ev.dataTransfer.effectAllowed = "copy";
			});

			// Drag a Player Character / Resident / Neighbor avatar out of the sheet as a
			// standard Actor drop: the rows are backed by actors, so emitting the core
			// {type:"Actor",uuid} payload lets them drop onto a scene (place a token), into
			// the combat tracker, onto another sheet, etc. — exactly like dragging the actor
			// from the sidebar. Read-only viewers may drag too; what a drop is allowed to do
			// is gated by the core permissions on the target (token/combatant creation),
			// not by us.
			html[0].addEventListener("dragstart", (ev) => {
				// The contract is what the handle IS, not which of the row kinds it belongs to: a
				// draggable element carrying an actor pointer. Both the portrait and the name link
				// of every row kind are marked that way (the templates only add `draggable` where
				// there is a uuid to add beside it), so a row can be dragged by grabbing either
				// one, and a fifth kind of actor-backed row is draggable the day it is written
				// rather than the day somebody remembers to extend a list here.
				const handle = ev.target.closest?.("[draggable='true'][data-actor-uuid]");
				if (!handle) return;
				const uuid = handle.dataset.actorUuid;
				if (!uuid) { ev.preventDefault(); return; }
				ev.stopPropagation();
				ev.dataTransfer.setData("text/plain", JSON.stringify({ type: "Actor", uuid }));
				ev.dataTransfer.effectAllowed = "copy";
			});

			// Swap the resident/neighbor fields' native <datalist> popups (occupation,
			// traits, home) for our scrollable one — Chromium's native popup has no
			// scrollbar for long lists. See utils/autocomplete.js.
			StonetopAutocomplete.upgradeAll(html);

			applyLabelTooltips(html, {
				selector: ".steading-stat-label[data-steading-stat], .steading-section-label[data-steading-stat]", datasetKey: "steadingStat",
				table: STEADING_STAT_TOOLTIPS, settingKey: "hoverDescriptionsSteadingStats", direction: "UP",
			});

			// Homefront moves — ONE click target per move, in both layouts: its NAME, plus the
			// "+STAT" chip beside it. There is no dice button any more; the name always forwarded
			// to it, so the icon was a second door onto the same room, and both shapes now carry
			// what the move is on the `<li>` instead (see steading-tab-moves.hbs).
			//
			// Which of the two things a move does is the DATA's answer, not the click's: a move
			// with a walkthrough carries `data-move-slug`, a move that only rolls carries
			// `data-move-name`/`data-stat`, and a move that does neither carries nothing and is
			// inert — the `move-unowned` row. Every move the system ships is interactive today,
			// so the roll-only branch is the one that keeps a bare rollable move working.
			//
			// Bound for editable and read-only alike: rolling a homefront move is play, open to a
			// player who cannot edit the steading. Hence the position, above the isEditable guard.
			//
			// The prompt comes BEFORE the roll; WHAT it asks for is the "Ask How to Roll Each
			// Time" setting's business rather than this handler's, and when it has nothing to ask
			// it opens no window at all. A mode it does not answer falls back to the sticky
			// selector wired below. Shift-click rolls straight through either way — which is why
			// the click's own `shiftKey` is read here rather than re-dispatched through anything.
			html[0].addEventListener("click", async ev => {
				// An improvement card's own move button (Aurochs Hunting, Heroic Reputation): the
				// same window its Homefront list entry opens, and as open to a read-only viewer.
				const improvementMove = ev.target.closest(".steading-improvement-move-btn");
				if (improvementMove && HOMESTEAD_MOVE_FLOWS[improvementMove.dataset.move]) {
					ev.stopPropagation();
					this._onHomesteadMove(improvementMove.dataset.move);
					return;
				}
				const opener = ev.target.closest(".stonetop-steading-move-open, .stonetop-move-roll-chip");
				if (!opener) return;
				const li = opener.closest("li");
				if (!li) return;
				const { moveSlug, moveName, stat } = li.dataset;
				if (!moveSlug && !moveName) return; // a move this steading cannot make
				ev.stopPropagation();

				if (moveSlug) {
					if (moveSlug === "meetWithDisaster") this._onMeetWithDisaster();
					else if (moveSlug === "requisition") this._onRequisitionWalkthrough();
					else if (moveSlug === "returnTriumphant") this._onReturnTriumphant();
					else if (moveSlug === "seasonsChange") this._onSeasonsChange();
					else if (HOMESTEAD_MOVE_FLOWS[moveSlug]) this._onHomesteadMove(moveSlug);
					return;
				}

				const prompted = await promptRoll({ title: moveName || "Roll", shiftKey: ev.shiftKey });
				if (!prompted) return;
				await this._onSteadingRoll(moveName, stat, prompted);
			}, true);

			// The sticky Roll Modifier, in BOTH its shapes — the modern layout's segmented pill on
			// the Homefront Moves heading (buttons, see roll-mode-picker.hbs) and the classic
			// sidebar's stacked radio list (roll-mode-radios.hbs). One layout renders at a time, so
			// only one of these ever has anything to match, but both have to be bound: which one is
			// live is a per-user setting read at render, not something known here. Binding only the
			// pill's is the silent failure the classic layout hit — the radios render, highlight
			// correctly off the server-stamped `checked`, and write nothing at all.
			//
			// Wired here, above the isEditable guard, for the same reason the roll buttons are: a
			// player who can roll the moves has to be able to say how. Unguarded by the setting
			// too — neither shape is DRAWN while the window is asking, so this matches nothing.
			//
			// Neither renders explicitly: setFlag is a document update, and `updateActor` already
			// re-renders every sheet on this actor. A second one here is a whole extra rebuild of
			// six tabs (re-enriched notes, three relationship tables, the rail and frost remounts)
			// and it flickers the tab the user is reading.
			onCapture(html[0], "click", ".stonetop-roll-mode-btn", async btn => {
				const mode = normalizeRollMode(btn.dataset.rollMode);
				if (mode === this._sheetRollMode()) return; // already on it — nothing to write
				await this.actor.setFlag(STONETOP_SCOPE, "rollMode", mode);
			});

			// The season/year clock beside the title. Runs the MOVE, the same thing the hotbar
			// macro and the Seasons Change move card run — the clock is the most obvious thing
			// on the sheet to click when the seasons turn, and it used to open the
			// correct-the-clock window instead, which quietly wrote a flag and made no move.
			// Correcting the clock is now a door at the bottom of that window (see
			// _onSeasonsChange's `altAction`), which is the right way round: the move happens
			// four times a year and the correction about once a campaign.
			//
			// Only a GM gets a button here (the template renders a plain div for everyone
			// else), so this binds nothing for players.
			html.find("[data-action='set-current-season']").on("click", () => this._onSeasonsChange());

			// The weather glyph left of the clock opens the Weather picker — the window that
			// decides what that glyph shows, so the readout is the way back to what set it.
			// Through `game.stonetop.openWeather` rather than the class, which is what the hotbar
			// macro and the time banner's weather part both call: one entry point, so
			// `openOrFocus` in there can keep it to one window however it was reached.
			//
			// GM-only, like the clock: the template renders a plain span for everyone else, so
			// this binds nothing for a player.
			html.find("[data-action='set-current-weather']").on("click", () => game.stonetop?.openWeather?.());

			// A real radio group, so `change` rather than a delegated click: the browser owns the
			// deselection, and change only fires on the one that became checked.
			html.find(".stonetop-roll-mode-input").on("change", async ev => {
				await this.actor.setFlag(STONETOP_SCOPE, "rollMode", normalizeRollMode(ev.currentTarget.value));
			});

			// Collapse / expand the whole moves sidebar (CLASSIC layout only; the modern layout
			// has no sidebar, so this simply matches nothing). Shared with the character sheet
			// and the expedition walkthrough's rail (utils/sidebar-toggle.js); the state is
			// persisted per actor, so the sidebar reopens the way it was left.
			wireSidebarToggle(html, {
				expandLabel:   "Expand moves sidebar",
				collapseLabel: "Collapse moves sidebar",
				persist:       collapsed => setSidebarCollapsed(this.actor?.id, collapsed),
			});

			// NO SECOND HANDLER FOR THE MOVE NAME. It used to re-dispatch a MouseEvent at the
			// dice icon beside it (carrying the Shift state by hand, because a bare `.click()`
			// reports `shiftKey: false` and would sit through the prompt Shift exists to skip).
			// With the icon gone the name is the handler's own target, above, and the Shift state
			// is the real click's.

			// Hover panel for the CLASSIC sidebar's one-line move rows: the row shows only a
			// name, so its text has to come from somewhere. Gated on the ROWS EXISTING, not on
			// the setting alone — the modern layout renders move cards that carry their own
			// text, and building this on document.body for a layout that never shows it just
			// leaks a div. The panel itself is the character sheet's (utils/move-hover.js).
			removeHoverPanels(this);
			if (html[0].querySelector(".steading-move-row") && getHoverDescriptionSetting("hoverDescriptionsBasicMoves")) {
				wireBasicMoveHoverPanel(this, html[0], ".steading-move-row");
			}

			// Improvement card expand/collapse. The open state is mirrored into
			// _openImprovements so it persists across re-renders (see getData). A click anywhere on
			// the header toggles it; the keyboard's way in is the header's toggle BUTTON, whose
			// Enter/Space arrives here as a click on it, and whose aria-expanded follows the card.
			html[0].addEventListener("click", ev => {
				const hdr = ev.target.closest(".steading-improvement-header");
				if (!hdr) return;
				if (ev.target.closest(".steading-improvement-complete-label")) return;
				// The card's own controls sit inside the header; clicking one is not a click
				// on the header, or every edit and removal would also toggle the card.
				if (ev.target.closest(".steading-improvement-remove")) return;
				if (ev.target.closest(".steading-improvement-edit")) return;
				const card = hdr.closest(".steading-improvement");
				if (!card) return;
				const open = card.classList.toggle("is-open");
				card.querySelector(".steading-improvement-toggle")?.setAttribute("aria-expanded", open ? "true" : "false");
				const slug = card.dataset.slug;
				if (slug) open ? this._openImprovements.add(slug) : this._openImprovements.delete(slug);
			}, true);

			onCapture(html[0], "change", ".steading-hide-unearned-improvements-check", cb => {
				this.actor.setFlag(STONETOP_SCOPE, "hideUnearnedImprovements", cb.checked)
					.catch(err => console.error("Stonetop | could not save the improvements filter", err));
			});

			// Per-section edit toggle (pencil/check at each section's corner) flips
			// just that section's edit state, independent of the global wrench. The
			// fade-out "done" check is driven by the _onSectionEdit* hooks above.
			this._wireSectionEditToggle(html, ".steading-section-edit-toggle");

			// The fold caret beside that pencil. Each section folds to its own heading:
			// a card's h3, a stat card's label row, or the sidebar's title. A card's
			// caret sits in the corner beside the pencil rather than inside the heading,
			// so the walker looks forward from it to find the heading — see
			// _sectionFoldTargets. Wired before the isEditable guard below: a player who
			// can only read the sheet still gets to tidy it.
			this._wireSectionCollapse(html,
				".steading-list-heading, .steading-residents-heading, .steading-stat-label-row, .stonetop-move-group-title");

			// Add resident / neighbor — allowed even outside edit mode. Any other list's add button
			// is left unclaimed, for the edit-mode handler below.
			onCapture(html[0], "click", ".steading-list-add",
				btn => this._onListItemAdd(btn.dataset.list),
				btn => PEOPLE_LISTS.includes(btn.dataset.list));

			// Drag-resizable columns on the player/resident/neighbor tables — useful in both edit and read-only modes.
			// This loop also covers the Other Settlements relations table (it carries the same
			// classes); wireRelationshipTable below would wire it too, but both column utils
			// are idempotent, so whichever gets there first wins and the other is a no-op.
			html[0].querySelectorAll(".steading-residents-table[data-resize-key]").forEach(table => {
				makeColumnsResizable(table, table.dataset.resizeKey);
				makeColumnsSortable(table, table.dataset.resizeKey);
			});

			// Other Settlements: hearts + notes + the show/hide boxes. Interactive in play
			// mode too — a steading's standing shifts at the table, like the sheet's other
			// live trackers.
			wireRelationshipTable(html[0], this.actor, { editable: this.isEditable });
			wireRelationshipBoard(html[0], this.actor, { editable: this.isEditable });
			// No wireRelationshipLinks here: Other Settlements is keyed by slug, so no row
			// carries a uuid or a portrait and neither handler would ever fire. Add the call
			// if this sheet ever grows an actor-backed roster.

			// Residents / Neighbors faces, through the same shared preview the relationships
			// component uses — a face previews identically wherever it appears.
			// The inner image, not the box: the surface class now sits on a clipping span that
			// the art-less placeholder wears too, so only the `-img` class identifies an element
			// that actually has a picture to enlarge.
			wireAvatarPreview(html[0], ".steading-member-avatar-img");
			// Player Characters sit in the same tab, directly above the residents, so their
			// portraits enlarge the same way.
			wireAvatarPreview(html[0], ".steading-player-portrait-img");
			onCapture(html[0], "click", ".steading-member-avatar", avatar => this._openMemberAvatarImage(avatar));

			// Drop a "Steading Improvement" card (dragged from a journal) onto the Improvements tab
			// to add it as a tracked custom improvement. Wired above the editable guard so a
			// player who cannot edit the steading is told why nothing happened, by the handler,
			// rather than the card falling through to core's own drop.
			wireCardDropZone(html[0].querySelector(".tab.improvements"),
				STEADING_IMPROVEMENT_DRAG_TYPE, (data) => this._onDropSteadingImprovement(data.improvement));

			if (!this.isEditable) return;

			// Stat tracks use custom radio markup, so persist them explicitly.
			html[0].addEventListener("change", ev => {
				const input = ev.target;
				if (input.type !== "radio" || !input.name || !input.closest(".steading-track-option")) return;
				ev.stopPropagation();
				this._onSteadingTrackChange(input.name, Number(input.value));
			}, true);

			// Surplus is in the custom stat bar, so persist it explicitly: on every keystroke and
			// on the commit, through the one handler.
			const onSurplusInput = input =>
				this._onSteadingTrackChange(input.name, Math.max(0, parseInt(input.value, 10) || 0));
			onCapture(html[0], "input", ".steading-surplus-input", onSurplusInput);
			onCapture(html[0], "change", ".steading-surplus-input", onSurplusInput);

			// Debilities live in the same custom bar and need the same legacy-safe persistence.
			onCapture(html[0], "change", ".steading-debility-check",
				input => this._onSteadingTrackChange(input.name, input.checked));

			// List item checked toggle (resources, fortifications, assets)
			onCapture(html[0], "change", ".steading-list-check", cb => {
				const { list, index } = cb.dataset;
				this._onListItemCheck(list, parseInt(index, 10), cb.checked);
			});

			// Click a requisitioned ("taken") asset to return it to the steading.
			onCapture(html[0], "click", ".steading-asset-taken",
				taken => this._onReturnAsset(parseInt(taken.dataset.index, 10)));

			// Add list item (residents/neighbors are handled above, regardless of edit mode)
			onCapture(html[0], "click", ".steading-list-add",
				btn => this._onListItemAdd(btn.dataset.list),
				btn => !PEOPLE_LISTS.includes(btn.dataset.list));

			// Delete list item
			onCapture(html[0], "click", ".steading-list-delete", btn => {
				const { list, index } = btn.dataset;
				this._onListItemDelete(list, parseInt(index, 10));
			});

			// Rows that name an actor: the Player Characters table opens a PC, a
			// Resident/Neighbor row opens its NPC, and the notes pencil opens that NPC's
			// notes instead. All three resolve the row's uuid/id the same way — see
			// module/utils/actor-link.js.
			for (const [selector, missing, use] of [
				[".steading-player-open",       ACTOR_LINK_MISSING.character, null],
				[".steading-member-open",       ACTOR_LINK_MISSING.npc,       null],
				// The pop-up and the NPC sheet share system.notes, so a change here shows on
				// the sheet and vice versa (two-way), both keeping rich text + @UUID links.
				[".steading-member-notes-edit", ACTOR_LINK_MISSING.npc,       openNpcNotesDialog],
			]) {
				// Click only, as before: these are anchors, so Enter already arrives as a click.
				onCapture(html[0], "click", selector, async (link, ev) => {
					ev.preventDefault();
					if (use) await withLinkedActor(link, use, missing);
					else await openLinkedActorSheet(link, missing);
				});
			}

			// Places of interest names
			onCapture(html[0], "change", ".steading-place-name",
				inp => this._onPlaceChange(parseInt(inp.dataset.index, 10), inp.value));

			// Resident / neighbor / player details
			onCapture(html[0], "change", ".steading-resident-input", inp => {
				const { index, field } = inp.dataset;
				// Players and neighbors tag their inputs with data-list; residents omit it and
				// are the default, so a missing data-list means "residents" (never undefined,
				// which would make personFieldPath bail and silently drop the edit).
				const list = inp.dataset.list || "residents";
				if (list === "players") {
					this._onPlayerFieldChange(parseInt(index, 10), field, inp.value);
				} else {
					// list is "residents" or "neighbors" — both go through the shared handler.
					this._onPersonFieldChange(list, parseInt(index, 10), field, inp.value);
				}
			});

			// Notes
			onCapture(html[0], "change", "prose-mirror.steading-notes-editor", pm => this._onNotesChange(pm.value));

			// Size radio
			onCapture(html[0], "change", ".steading-size-radio",
				radio => this._stonetopSteading.setFlags({ size: radio.value }));

			// Currency
			onCapture(html[0], "change", ".steading-currency-input", inp => {
				const { currency, field } = inp.dataset;
				this._onCurrencyChange(currency, field, parseInt(inp.value, 10) || 0);
			});

			// Improvement complete checkbox
			onCapture(html[0], "change", ".steading-improvement-complete",
				cb => this._onImprovementComplete(cb.dataset.slug, cb.checked));

			// Improvement requirement checkbox
			onCapture(html[0], "change", ".steading-improvement-req", cb => {
				const { slug, index } = cb.dataset;
				this._onImprovementReq(slug, parseInt(index, 10), cb.checked);
			});

			// A built improvement's condition ("As long as you trade aetherium..."): its stat follows the box.
			onCapture(html[0], "change", ".steading-improvement-condition", async cb => {
				const result = await this._stonetopSteading.setImprovementCondition(cb.dataset.slug, cb.checked);
				if (result?.summary?.length) ui.notifications.info(`${result.label}: ${result.summary.join("; ")}.`);
			});

			// Herd of Horses tracker: +/- steppers and direct number entry per age tier.
			onCapture(html[0], "click", ".steading-herd-step",
				btn => this._onHerdStep(btn.dataset.tier, parseInt(btn.dataset.delta, 10) || 0));
			onCapture(html[0], "change", ".steading-herd-input",
				inp => this._onHerdInput(inp.dataset.tier, inp.value));

			// The five things a header hold glyph can be clicked to settle. ONE listener over a
			// map rather than five byte-identical ones, and the keys are exactly the `action`
			// values HOLD_DEFS declares (steading-holds.js) — so the wiring is tied back to that
			// table instead of to five loose literals that nothing checks against it.
			//
			// inn-gathering: the Inn's once-per-season gathering, also reachable from its
			//   improvement card at the other end of the sheet — the same act, either way in.
			// stand-down-muster: the header is the only place the muster's state is visible, and
			//   so the only sensible place to end it.
			// settle-winter-debt: unlike the other seasonal dues this one outlives the Seasons
			//   Change window it was rolled in, so the glyph is the only way back to it
			//   (see module/actors/steading/winter-debt.js).
			// roll-harvest: autumn's harvest is rolled when it is complete, at the season's end,
			//   long after the Seasons Change window that opened autumn was shut.
			// meet-disaster-owed: a Meet with Disaster pick at Fortunes −1 whose window was shut
			//   unpicked, after the write that caused it had already landed.
			const holdActions = {
				"inn-gathering":      () => this._openInnGathering(),
				"stand-down-muster":  () => this._standDownMuster(),
				"settle-winter-debt": () => openWinterDebtDialog(this._stonetopSteading, { onApplied: () => this.render(false) }),
				"roll-harvest":       () => this._rollHarvestFromHeader(),
				"meet-disaster-owed": () => openOwedDisasterPicker(this._stonetopSteading, { onApplied: () => this.render(false) }),
			};
			// Any other `data-action` (or a disabled glyph) is left unclaimed.
			onCapture(html[0], "click", "[data-action]",
				btn => holdActions[btn.dataset.action](),
				btn => !btn.disabled && Object.hasOwn(holdActions, btn.dataset.action));

			// Drag-and-drop for adding player characters to the Neighbors tab.
			const neighborsTab = html[0].querySelector(".steading-neighbors-tab");
			const playersSection = html[0].querySelector(".steading-players-section");
			if (neighborsTab) {
				neighborsTab.addEventListener("dragover", (ev) => {
					ev.preventDefault();
					ev.stopPropagation();
					ev.dataTransfer.dropEffect = "copy";
					playersSection?.classList.add("drag-over");
				}, true);

				neighborsTab.addEventListener("dragleave", (ev) => {
					ev.preventDefault();
					ev.stopPropagation();
					if (!neighborsTab.contains(ev.relatedTarget)) playersSection?.classList.remove("drag-over");
				}, true);

				neighborsTab.addEventListener("drop", async (ev) => {
					ev.preventDefault();
					ev.stopPropagation();
					playersSection?.classList.remove("drag-over");
					const data = getDragEventData(ev);
					if (data?.type !== "Actor" || !data.uuid) return;
					const actor = await fromUuid(data.uuid);
					if (!actor) return;
					if (actor.type === "character") {
						await this._onDropPlayerCharacter(actor);
					} else if (actor.type === "npc") {
						// Route an NPC to whichever people section it was dropped over
						// (Residents vs Neighbors); default to Residents.
						const list = ev.target.closest(".steading-residents-section--neighbors") ? "neighbors" : "residents";
						await this._onDropPersonNpc(list, actor);
					}
				}, true);
			}

			// Edit or remove a custom (journal-sourced) improvement.
			html[0].addEventListener("click", (ev) => {
				const remove = ev.target.closest(".steading-improvement-remove");
				if (remove) { ev.stopPropagation(); this._onRemoveCustomImprovement(remove.dataset.slug); return; }
				const edit = ev.target.closest(".steading-improvement-edit");
				if (edit) { ev.stopPropagation(); this._onEditCustomImprovement(edit.dataset.slug); }
			}, true);

			// Name (or rename) the built Inn from its card: the later chance the build-time
			// window's "Not yet" promises.
			onCapture(html[0], "click", ".steading-inn-name-btn",
				btn => this._onNameInn(btn.dataset.current ?? ""),
				btn => !btn.disabled);

			// Create a custom improvement from a small form (the button counterpart to
			// dropping a journal card onto the tab).
			html.find(".steading-improvement-add-btn").on("click", () => this._onCreateImprovementOpen());
		}

		// `box` is the clipping span: it carries the row's data-list / data-index / data-name,
		// while the src lives on the image inside it.
		_openMemberAvatarImage(box) {
			removeAvatarPreview();
			// With this list's pencil open, a tap is a request to CHANGE the portrait, so it goes
			// straight to the gallery rather than making the user open the picture and then find
			// "Edit Photo" in its title bar. Reading the roster, the same tap enlarges the face.
			// Same split the follower cards and every sheet portrait use.
			const list = box?.dataset?.list;
			const index = Number.parseInt(box?.dataset?.index ?? "", 10);
			if (this.isEditable && Number.isInteger(index) && this.isSectionEditable(list)) {
				const imgEl = box.querySelector(".steading-member-avatar-img");
				this._onMemberAvatarPickImage({ list, index, current: imgEl?.getAttribute("src") ?? "" });
				return;
			}
			if (!box?.querySelector?.(".steading-member-avatar-img")?.getAttribute("src")) return;
			const popout = this._createEditableMemberImagePopout(box);
			popout?.render(true);
			this._scheduleMemberImageHeaderControl(popout);
		}

		_createEditableMemberImagePopout(box) {
			const anchor = box?.querySelector?.(".steading-member-avatar-img") ?? box;
			const list = box?.dataset?.list;
			const index = Number.parseInt(box?.dataset?.index ?? "", 10);
			const canEdit = this.isEditable && ["residents", "neighbors"].includes(list) && Number.isInteger(index);
			// Read the ATTRIBUTE, not `.src`: the DOM resolves the latter to an absolute URL, which
			// a query string or hash could hide the filename the swap has to recognise.
			const stored  = anchor.getAttribute?.("src") || anchor.src;
			const display = memberPhotoDisplaySrc(stored);
			// No size: this used to ask for 560x620, which core has been discarding since v13 —
			// ImagePopout measures the picture and sizes its own window (see foundry-compat.js).
			const popout = imagePopout({ src: display, title: anchor.dataset.name ?? "" });
			// The window is the same either way; only a row this user may edit gets the Edit Photo
			// bookkeeping and the binding that keeps it in step with its NPC.
			if (popout && canEdit) {
				popout._stonetopMemberImageEdit = { sheet: this, list, index, current: stored };
				this._bindMemberImagePopoutToActor(popout, list, index);
			}
			return popout;
		}

		// One Residents/Neighbors row as it is STORED, falling back to the defaults a world that
		// has never written the list still shows. Reading only the flag looks right and is wrong
		// for exactly that case — see legacyRowFrameHandle, which makes the same fallback.
		_personRow(list, index) {
			const stored = this._stonetopSteading?._flags?.[list];
			const rows = Array.isArray(stored) ? stored : STEADING_DEFAULTS[list];
			return Array.isArray(rows) ? rows[index] ?? null : null;
		}

		// Keep an open member-image window in sync with its backing NPC. The Edit Photo
		// button patches the popout's `<img>` directly, but that only covers changes made
		// through the popout itself. Watching the actor's `img` instead means the window
		// re-syncs no matter how the portrait changed — the popout's Edit Photo, the
		// People gallery, or the GM editing the portrait on the NPC's own sheet while this
		// window is open. The hook is torn down when the popout closes so it doesn't leak.
		//
		// The same binding the sheet headers' portrait window uses (utils/actor-portrait-picker.js
		// bindImagePopoutToActor); the actor is resolved through the roster's own lookup, so this
		// watches the document the row actually renders rather than trusting `row.id`. The roster
		// hands it its own refresh, which additionally keeps the popout's `current` (the STORED
		// path, which the next Edit Photo reads) in step and re-hangs the header controls if the
		// window had to re-render.
		_bindMemberImagePopoutToActor(popout, list, index) {
			const row = this._personRow(list, index);
			if (!row) return;
			bindImagePopoutToActor(popout, personRowActor(row), {
				onChange: (img) => this._refreshMemberImagePopout(popout, img),
			});
		}

		_scheduleMemberImageHeaderControl(popout) {
			const edit = popout?._stonetopMemberImageEdit;
			if (!edit) return;
			addPopoutHeaderControl(popout, {
				key: "stonetop-edit-member-photo",
				icon: "fa-camera",
				// The same string the sheet portraits' own Edit Photo uses, so the control that
				// opens this gallery cannot come to read two ways depending on where it is met.
				label: localize("stonetop.portraitPicker.popout"),
				onClick: () => this._onMemberAvatarPickImage({
					list: edit.list,
					index: edit.index,
					// `current` is the STORED path — what the member actually wears — and is kept
					// in step by _refreshMemberImagePopout on every change, however it was made.
					// `options.src` is the fallback because it is the DISPLAYED path, which for a
					// gallery portrait is the whole illustration rather than the square on the
					// document; the gallery normalises either, but the stored one is the truth.
					current: edit.current ?? popout.options?.src,
					popout,
				}),
			});

			// Framing is gated on the ROW's document, not the steading's editability: roster NPCs
			// are seeded at OBSERVER, so a player who may edit the steading would otherwise be
			// offered a control whose save the server refuses. personFrameHandle answers that for
			// both row kinds, and returns null when there is nothing writable behind the row.
			// Named from the POPOUT's title, not from a document: a legacy roster row is plain
			// text and has no actor to ask.
			const memberHandle = personFrameHandle(this._stonetopSteading, edit.list, edit.index, { editable: this.isEditable });
			// Before the framing control so it lands to its LEFT, matching the pips on a sheet
			// header. Silently absent for a legacy text row, which has no actor to tokenize.
			addTokenizerControl(popout, memberHandle, { key: "stonetop-tokenize-member-photo" });
			addPortraitFrameControl(
				popout,
				memberHandle,
				{
					key: "stonetop-frame-member-photo",
					// Through the compat reader: v13 moved the window title to
					// `options.window.title`, so a bare `options.title` silently yields "Face"
					// for every member instead of naming the one being framed.
					name: imagePopoutTitle(popout) || "Face",
					// A frame write touches neither `img` nor `options.src`, so the popout's own
					// updateActor binding will not fire and nothing re-renders on its own.
					onSaved: () => this.render(false),
				},
			);
		}

		_onMemberAvatarPickImage({ list, index, current, popout }) {
			// Apply a chosen path (a gallery pick, a browsed file, or "" for the default), keep the
			// open photo popout in sync, and re-render the sheet. Shared by all three routes.
			const applyPath = async (path, pick = null) => {
				await this._onMemberAvatarImageChange(list, index, path, pick);
				if (popout) this._refreshMemberImagePopout(popout, path);
				this.render(false);
			};
			// "Use default" removes the custom photo; the member falls back to the default avatar.
			// Close the (now-stale) photo popout rather than refreshing it: there is no image to
			// show, and _refreshMemberImagePopout no-ops on an empty path, so leaving it open would
			// keep displaying the removed portrait AND feed its stale src back as `current` on the
			// next Edit Photo (wrongly highlighting a portrait the member no longer uses).
			const clearToDefault = async () => {
				await this._onMemberAvatarImageChange(list, index, "");
				if (popout) await popout.close?.();
				this.render(false);
			};
			// Primary path: the "People of Stonetop" gallery of imported book portraits. "Browse
			// files…" falls back to the FilePicker for a custom image; "Use default" clears it.
			// Portraits somebody already wears, so the gallery can mark them and offer to hide
			// them. Two scans, because a face can be taken in two kinds of place: every actor in
			// the world (which reaches a player character and an NPC nobody has put on this
			// roster yet — both of which can now pick from this gallery on their own sheet), and
			// this steading's own legacy text rows, which are not documents at all. The steading
			// goes on top so a roster member's name wins the label. Each scan leaves out the row
			// being edited — by index here, by document there — so this member's own portrait
			// reads as selected rather than as taken.
			openPeoplePortraitPicker({
				current,
				used: {
					...usedActorPortraits(personRowActor(this._personRow(list, index))),
					...usedPersonPortraits(this.actor, { list, index }),
				},
				onPick: applyPath,
				onClear: clearToDefault,
				// A browsed file is the one case with no hand-cut square behind it, so offer the
				// framer straight away rather than making the user find it afterwards. Gallery
				// picks are deliberately not chained: that art is already framed.
				onFrame: () => {
					const handle = personFrameHandle(this._stonetopSteading, list, index, { editable: this.isEditable });
					if (!handle?.canWrite) return;
					openPortraitFrameEditor({ handle, img: handle.img, onSaved: () => this.render(false) });
				},
			});
		}

		// Point an open photo window at a newly chosen portrait, patching it in place so the
		// window keeps its position and size rather than re-rendering under the player.
		_refreshMemberImagePopout(popout, path) {
			if (!popout || !path) return;

			// `path` is what the member now WEARS; the window shows the illustration behind it.
			// The patching itself is the shared one (utils/actor-portrait-picker.js), which also
			// keeps `options.src` — what a re-render and the header's Share Image control both
			// read — in step, and reports whether it had to fall back to a re-render.
			const patched = pointImagePopoutAt(popout, memberPhotoDisplaySrc(path));

			// The next Edit Photo pass reads `current` instead of `options.src`, because it wants
			// the STORED path rather than the illustration on screen.
			if (popout._stonetopMemberImageEdit) popout._stonetopMemberImageEdit.current = path;

			// A re-render builds a fresh window header, so the controls have to be hung again.
			if (!patched) this._scheduleMemberImageHeaderControl(popout);
		}

		// `pick` is what the gallery tile carried alongside the path — `{frame, square}` — because
		// the picture, the square it crops to and the file the map draws are one choice. Null for
		// a browsed file and for "Use default", both of which correctly leave no frame behind.
		async _onMemberAvatarImageChange(list, index, value, pick = null) {
			if (!["residents", "neighbors"].includes(list) || !Number.isInteger(index)) return;
			const f = this._stonetopSteading._flags;
			const rows = f[list] ?? STEADING_DEFAULTS[list];
			const row = rows[index];
			// Actor-backed row: the portrait is the NPC actor's own image, and it is a real
			// document with a prototype token — so this is the same three-field write the sheet
			// header's own picker makes. See actorPortraitPickUpdate.
			if (row && isActorRow(row)) {
				const actor = (row.id ? game.actors?.get(row.id) : null)
					|| (row.uuid ? await fromUuid(row.uuid).catch(() => null) : null);
				// Clearing a portrait returns the person to the people silhouette, which is what
				// the roster draws for an un-portraited member anyway — so the cleared row looks
				// the same here as one that never had art, rather than reverting to mystery-man.
				if (actor) {
					await actor.update(actorPortraitPickUpdate(actor, value || PERSON_DEFAULT_IMG, pick ?? {}));
				}
				return;
			}
			// A legacy text row keeps its frame on the row object itself, beside the img — so both
			// move in ONE write, because they are one choice. saveLegacyPersonRow owns how this
			// list is stored (the whole array back, which is what lets a plain `delete` land) and
			// refuses an actor-backed row, which the branch above has already taken anyway.
			await saveLegacyPersonRow(this._stonetopSteading, list, index, (r) => {
				r.img = value;
				const frame = normalizeFrame(pick?.frame);
				if (frame) r.portraitFrame = frame;
				else delete r.portraitFrame;
			});
		}

		/**
		 * A homefront move's dialog: what the move says, what its tiers do, and the button that
		 * rolls it. The only controls it ever shows are the two Trade & Barter's dice actually
		 * read (Value, winter) plus its special-item picker — everything a player would have
		 * typed into it went nowhere, and every list it used to make them tick before the roll
		 * now rides the result card, under the tier that calls for it.
		 */
		_onHomesteadMove(moveSlug) {
			const flow = HOMESTEAD_MOVE_FLOWS[moveSlug];
			if (!flow) return;

			// What the steading has built, asked about where it could change this roll, and said
			// where it always does (improvement-rolls.js).
			const rules = this._improvementRules();
			// The Marshal's Logistics is asked (ticked) once any character has it learned, and the
			// Ranger's Pathfinder (unticked) the same.
			const questions = improvementQuestions(flow.label, flow.stat, {
				rules, tactics: this._militiaTactics(), logistics: worldLogisticsNames(), pathfinder: worldLearnedHolderNames(PATHFINDER),
				herd: this._herdForQuestions(),
			});
			// Tor's blessing and the Size asked here as settleSteadingRoll asks them, so the window
			// names what the card will add. With no answers yet, `notes` holds nothing that waits on one.
			const standing = rollAdjustments({
				moveName: flow.label, statKey: flow.stat, rules,
				torsBlessing: !!this._stonetopSteading.torsBlessingActive?.(),
				size: this._stonetopSteading.steadingSize?.() ?? "",
			});
			const questionHtml = questions.map(improvementQuestionHtml).join("");
			const improvementNotes = [
				...standing.adv.map(source => `${source}: advantage on this roll.`),
				...standing.dis.filter(source => source !== "Diminished").map(source => `${source}: disadvantage on this roll.`),
				...standing.notes.map(note => `${note} on this roll.`),
				...this._aurochsWarnings(flow),
			];

			const clockSeason = readCurrentSeason(this.actor)?.season ?? "";
			const fieldHtml = (flow.fields ?? []).map(field => {
				if (field.type === "checkbox") {
					const checked = !!field.checkedInSeason && field.checkedInSeason === clockSeason;
					return `<label class="stonetop-homestead-field stonetop-homestead-field--check">
						<input type="checkbox" class="stonetop-check" name="${_esc(field.name)}" value="yes"${checked ? " checked" : ""}>
						<span>${_esc(field.label)}</span>
					</label>`;
				}
				return `<label class="stonetop-homestead-field">
					<span>${_esc(field.label)}</span>
					<input type="number" name="${_esc(field.name)}" placeholder="${_esc(field.placeholder)}" min="${field.min ?? 0}" value="${field.value ?? ""}">
				</label>`;
			}).join("");

			// Trade & Barter is how special items are acquired — let the player pick one from the
			// handout list. The pick fills the Value field for the roll, adds the item to a
			// character's inventory, and names itself in the chip beside the button (which is a
			// readout, not an input: nothing reads it back).
			const specialItemHtml = flow.specialItems
				? `<div class="stonetop-tb-special">
					<button type="button" class="stonetop-tb-special-btn"><i class="fas fa-gem"></i> Choose a special item…</button>
					<span class="stonetop-tb-special-chosen" data-tb-chosen hidden="hidden"></span>
				</div>`
				: "";

			new Dialog({
				title: flow.label,
				content: `<form class="stonetop-homestead-dialog">
					<p class="stonetop-homestead-trigger"><em>${_esc(flow.trigger)}</em></p>
					${fieldHtml || questionHtml ? `<div class="stonetop-homestead-fields">${fieldHtml}${questionHtml}</div>` : ""}
					${specialItemHtml}
					${_resultsLegendHtml(flow.results)}
					${improvementNotes.map(note => `<p class="stonetop-homestead-note">${_esc(note)}</p>`).join("")}
					${flow.note ? `<p class="stonetop-homestead-note">${_esc(flow.note)}</p>` : ""}
				</form>`,
				buttons: {
					cancel: { label: "Cancel" },
					roll: {
						label: `Roll +${flow.statLabel}`,
						// The prompt comes first, ahead of the move's own before-the-roll costs, so
						// backing out of it is a clean abort: nothing spent, nothing posted.
						// `_homesteadRollOptions` spreads AFTER the prompt because the one mode it
						// carries is a rule, not a preference — Trade & Barter in winter is at
						// disadvantage whatever was picked.
						callback: async html => {
							const prompted = await promptRoll({ title: flow.label });
							if (!prompted) return;
							await this._applyHomesteadBeforeRoll(flow);
							const data = this._formDataFromDialog(html);
							await this._onSteadingRoll(flow.label, flow.stat, {
								...prompted, ...this._homesteadRollOptions(flow, html),
								improvementAnswers: Object.fromEntries(questions.map(q => [q.name, data[q.name] ?? ""])),
							});
						},
					},
				},
				default: "roll",
				render: (html) => {
					html[0].querySelector(".stonetop-tb-special-btn")?.addEventListener("click", () => this._onPickSpecialItem(html));
				},
			}, {
				width: 520,
				classes: ["dialog", "stonetop", "stonetop-homestead-move-dialog"],
			}).render(true);
		}

		// Trade & Barter: open the Special Items picker. Picking an item sets the move's Value
		// (the modifier the roll subtracts), names itself in the chip beside the button, and
		// adds itself to a chosen character's inventory.
		_onPickSpecialItem(dialogHtml) {
			const picker = new SpecialItemPickerDialog(SPECIAL_ITEM_CATALOG, async (slug) => {
				const item = SPECIAL_ITEM_CATALOG.flatMap(g => g.items).find(i => i.slug === slug);
				if (!item) return;
				const valueField = dialogHtml[0].querySelector('[name="value"]');
				if (valueField) valueField.value = parseInt(item.value, 10) || 0;
				const chosen = dialogHtml[0].querySelector("[data-tb-chosen]");
				if (chosen) {
					chosen.textContent = item.traits ? `${item.name} (${item.traits})` : item.name;
					chosen.removeAttribute("hidden");
				}

				const character = await this._promptSpecialItemCharacter();
				if (character) {
					await new CharacterInventory(new StonetopFlags(character, "inventory")).addSpecial(slug);
					ui.notifications.info(`${item.name} added to ${character.name}.`);
				}
				picker.close();
			});
			picker.render(true);
		}

		_promptSpecialItemCharacter() {
			const chars = game.actors.filter(a => a.type === "character" && a.isOwner);
			if (!chars.length) {
				ui.notifications.warn("No editable character to add the item to.");
				return Promise.resolve(null);
			}
			return new Promise(resolve => {
				new Dialog({
					title: "Add to which character?",
					content: `<form class="stonetop-tb-char-pick"><label>Character
						<select name="char">${chars.map(c => `<option value="${c.id}">${_esc(c.name)}</option>`).join("")}</select></label></form>`,
					buttons: {
						cancel: { label: "Cancel", callback: () => resolve(null) },
						add:    { label: "Add", callback: html => resolve(game.actors.get(html[0].querySelector('[name="char"]').value)) },
					},
					default: "add",
					close: () => resolve(null),
				}, { classes: ["dialog", "stonetop", "stonetop-tb-char-pick-dialog"] }).render(true);
			});
		}

		_formDataFromDialog(html) {
			const form = html[0]?.querySelector(".stonetop-homestead-dialog");
			return form ? Object.fromEntries(new FormData(form)) : {};
		}

		async _applyHomesteadBeforeRoll(flow) {
			if (flow.beforeRoll !== "musterCost") return;
			const fortunes = this._stonetopSteading.getStatValue("fortunes");
			await this._stonetopSteading.setSystemValue("stats.fortunes.value", Math.max(fortunes - 1, -1));
			this.render(false);
			ui.notifications.info(`Muster cost applied: Fortunes ${ sign(fortunes) } -> ${ sign(Math.max(fortunes - 1, -1)) }.`);
		}

		// What the dialog adds to the roll. Every flow's tier text, legend, pick pools and tier
		// actions come off the flow itself in _onSteadingRoll — shared with the bare roll button
		// on the Moves tab, which has no dialog to read — so all that is left here is the one
		// move whose dialog holds controls: Trade & Barter's Value and its winter disadvantage.
		_homesteadRollOptions(flow, html) {
			if (!flow.rollFields) return {};
			const data = this._formDataFromDialog(html);
			const value = Math.max(0, parseInt(data.value, 10) || 0);
			return {
				modifier: value ? -value : 0,
				// A SOURCE of disadvantage, not the mode: _onSteadingRoll nets it against any
				// advantage (a Township's), since the two cancel out.
				winter: !!data.winter,
			};
		}

		/**
		 * What the Aurochs Hunt's window warns about before the roll: a hunt out of season, and a
		 * herd that a hunt last spring left weak ("if you hunt next year they'll be wiped out").
		 */
		_aurochsWarnings(flow) {
			if (flow?.requires !== "aurochsHunting") return [];
			const warnings = [];
			const season = readCurrentSeason(this.actor);
			if (season && season.season !== "spring") warnings.push("The hunt is led in spring, and the season clock says it is not spring.");
			// "The herd is weak and if you hunt NEXT YEAR they'll be wiped out": a warning for the
			// spring after, and none once a spring has passed without a hunt.
			const weak = this._stonetopSteading.aurochsWeakYear();
			const year = season?.year ?? this._seasonsCurrentYear();
			if (weak && year === weak + 1) warnings.push("Last spring's hunt left the herd weak: hunt it this year and it will be wiped out.");
			else if (weak && year === weak) warnings.push("This spring's hunt has left the herd weak: hunt it next year and it will be wiped out.");
			return warnings;
		}

		async _onMeetWithDisaster() {
			const fortunes = this._stonetopSteading.getStatValue("fortunes");
			const { fortunes: newFortunes, disaster } = disasterFortunes(fortunes);

			if (!disaster) {
				new Dialog({
					title: "Meet with Disaster",
					content: `<div class="stonetop-disaster-dialog">
						<p><em>Calamity befalls the steading or panic spreads.</em></p>
						<p>Fortunes: <strong>${sign(fortunes)}</strong> → <strong>${sign(newFortunes)}</strong></p>
					</div>`,
					buttons: {
						cancel: { label: "Cancel" },
						apply: {
							label: "Apply",
							// Through the one helper every other disaster takes, so the ledger names the
							// move and the floor is re-read at the click rather than when this opened.
							callback: async () => {
								await meetWithDisaster(this._stonetopSteading, { onApplied: () => this.render(false) });
								this.render(false);
							},
						},
					},
					default: "apply",
				}, { classes: ["dialog", "stonetop", "stonetop-disaster-move-dialog"] }).render(true);
				return;
			}

			// Fortunes is at -1 — would drop further; GM picks a consequence instead. The same
			// window a winter shortfall opens at the floor (./steading-debilities.js).
			openDisasterPicker(this._stonetopSteading, {
				buttons: { cancel: { label: "Cancel" } },
				onApplied: () => this.render(false),
			});
		}

		// Return Triumphant: clear one marked steading debility, or raise Fortunes by 1 when
		// none are marked. The walkthrough itself lives in ./return-triumphant.js, because the
		// last step of the Run an Expedition guide offers the same move — that is where a table
		// is when it comes up — and two copies would eventually disagree about what it does.
		async _onReturnTriumphant() {
			openReturnTriumphant(this._stonetopSteading, { onApplied: () => this.render(false) });
		}

		async _onRequisitionWalkthrough() {
			const fortunes = this._stonetopSteading.getStatValue("fortunes");
			const newFortunes = Math.max(fortunes - 1, -1);
			const availableAssets = this._stonetopSteading.getAvailableAssets();
			const assetOptions = availableAssets
				.map(asset => `<option value="${escHtml(asset.name)}">${escHtml(asset.name)}</option>`)
				.join("");
			// Single source for the three outcome lines; both the dialog reference block
			// and the chat card's legend + per-tier text derive from it (see the season flows).
			const requisitionResults = [
				RESULT.strong("go ahead, but bring it back safely."),
				RESULT.weak("you will need to do some convincing."),
				RESULT.miss("do not mark XP; you can take the asset, but if you do, reduce Fortunes by 1."),
			];
			// Herd of Horses: "When you Requisition half the herd or less, treat a 6- as a 7-9."
			// And the Marshal's Logistics, ticked, once any character has it learned.
			const questions = improvementQuestions(STEADING_MOVE.REQUISITION, "fortunes", {
				rules: this._improvementRules(), logistics: worldLogisticsNames(), herd: this._herdForQuestions(),
			});
			const questionHtml = questions.map(improvementQuestionHtml).join("");

			const dialog = new Dialog({
				title: "Requisition",
				content: `<form class="stonetop-homestead-dialog">
					<p class="stonetop-homestead-trigger"><em>When you borrow some of the steading's assets for an expedition or otherwise put them at risk, roll +Fortunes.</em></p>
					<div class="stonetop-homestead-fields">
						<label class="stonetop-homestead-field">
							<span>Asset</span>
							<select class="stonetop-requisition-asset-select" data-requisition-asset-select>
								${assetOptions}
								<option value="${CUSTOM_ASSET_VALUE}">Something else...</option>
							</select>
							<input type="text" class="stonetop-requisition-custom-input" data-requisition-custom-asset placeholder="Enter an asset or item" disabled hidden>
							<input type="hidden" name="asset" data-requisition-asset-value value="${availableAssets[0]?.name ? escHtml(availableAssets[0].name) : ""}">
						</label>
						${questionHtml}
					</div>
					${_resultsLegendHtml(requisitionResults)}
				</form>`,
				buttons: {
					cancel: { label: "Cancel" },
					roll: {
						label: "Roll +Fortunes",
						// The asset is the one thing a homefront dialog still says out loud, because
						// it is the one thing a homefront dialog still chooses — the whole move is
						// "I am borrowing THIS", and the miss-cost button on the card below is about
						// keeping it. Posted after the prompt, so cancelling leaves no card behind.
						callback: async html => {
							const prompted = await promptRoll({ title: "Requisition" });
							if (!prompted) return;
							const data = this._formDataFromDialog(html);
							const asset = String(data.asset ?? "").trim();
							if (asset) postMoveToChat(this.actor, "Requisition", [{ label: "Asset", value: asset }]);
							await this._onSteadingRoll("Requisition", "fortunes", {
								...prompted,
								improvementAnswers: Object.fromEntries(questions.map(q => [q.name, data[q.name] ?? ""])),
								moveResults: _moveResultsFromRows(requisitionResults),
								resultLegend: _resultsLegendHtml(requisitionResults),
								tierActions: {
									failure: `<button type="button" class="stonetop-requisition-miss-cost" data-action="requisition-miss-cost">
										<i class="fas fa-arrow-down"></i> Take it on a miss: Fortunes ${sign(fortunes)} -> ${sign(newFortunes)}
									</button>`,
								},
							});
						},
					},
				},
				default: "roll",
				render: html => {
					const root = html[0];
					wireCustomAssetSelect({
						select: root.querySelector("[data-requisition-asset-select]"),
						customInput: root.querySelector("[data-requisition-custom-asset]"),
						valueInput: root.querySelector("[data-requisition-asset-value]"),
					});
				},
			}, { width: 520, classes: ["dialog", "stonetop", "stonetop-homestead-move-dialog"] });
			dialog.render(true);
		}

		// The campaign year the Seasons Change flow is currently on (a steading flag,
		// starting at 1). Advanced by one each time a Winter is completed (see
		// seasons-change-dialog.js#recordSeason), so the season picker defaults to the latest year.
		_seasonsCurrentYear() {
			return readCurrentYear(this.actor);
		}

		// Set the header's clock by hand, without running the Seasons Change move — the move
		// applies seasonal gains, resets Fortunes and writes a journal entry, none of which a
		// GM wants when they're only correcting what the header says. Needed by any table that
		// was already mid-campaign when the readout shipped (their clock has never been
		// stamped) and by the mis-clicked season. GM-only; only a GM can reach it at all.
		//
		// NOT what the header's clock opens. Correcting the clock happens about once in a
		// campaign, where the move happens four times a year, and the clock is the most
		// obvious thing on the sheet to click when the seasons turn — so the header runs the
		// MOVE, and this is one click further in, off the door at the bottom of that window.
		//
		// Deliberately the same cards-and-year-field shape as the move's own picker, so the two
		// read as the same question. The clock can be set to any year, including one ahead of
		// anything played — picking it carries `seasonsCurrentYear` along, or the move's picker
		// would still default a year behind.
		//
		// @param {number} [openOn]  The year to open on, handed over by the move's picker so a
		//   GM who has already dialled one in does not type it twice to change which question
		//   they are answering. Falls back to the stamp, then to the campaign's current year.
		async _onSetCurrentSeason(openOn) {
			if (!game.user?.isGM) return;
			const stamped  = readCurrentSeason(this.actor);
			const pickYear = openOn ?? stamped?.year ?? this._seasonsCurrentYear();
			openSeasonPicker({
				title:  "Set the Current Season",
				prompt: "Which season is Stonetop in?",
				note:   "Only changes what the sheet says. It doesn't make the Seasons Change move.",
				selected: stamped?.season ?? null,
				selectedYear: pickYear,
				// The high-water mark, for the picker's hint alone — not a ceiling. Both halves
				// of the clock are candidates because they move independently: `seasonsCurrentYear`
				// runs a year ahead of the stamp for the whole of a completed Winter.
				latestYear: Math.max(this._seasonsCurrentYear(), stamped?.year ?? 1),
				// One write for both halves of the clock. The move's picker defaults to
				// `seasonsCurrentYear`, so setting the clock ahead has to carry it; `pickerYear`
				// defaults to the stamped year, and the never-rewind guard lives in
				// recordCurrentSeason.
				onPick: (season, year) => recordCurrentSeason(this.actor, season, year),
			});
		}

		// The move itself, and what all three ways in reach: the hotbar macro, the Seasons
		// Change move card, and the header's clock. Picks a season and a year, then opens the
		// move's own dialog — the rules, the seasonal gains, the Fortunes roll, Done.
		async _onSeasonsChange() {
			// Opens on the current year (Winter completion bumps it), which is also the
			// high-water mark the picker's hint is measured against — a table catching the
			// sheet up mid-campaign can type past it. The chosen year rides through to
			// recordSeasonsChange, which files the season into that year's Chronicle page.
			const currentYear = this._seasonsCurrentYear();
			openSeasonPicker({
				title:  "Seasons Change",
				prompt: "Which season is beginning?",
				selectedYear: currentYear,
				latestYear:   currentYear,
				// Openable from a hotbar macro, away from the sheet, so this one offers the jump.
				headerShortcut: true,
				// The door to the other flow. This picker is what the header's clock opens, and
				// a GM who clicked it meaning to fix a mis-typed season has to be able to get
				// there from here — the two windows ask nearly the same question and are told
				// apart by intent alone, so the one you land in owes you the other. GM-only,
				// like the flow it opens, and the header only offers the clock to a GM anyway.
				altAction: game.user?.isGM ? {
					ask:   "Only correcting what the sheet says?",
					label: "Set the season without making the move.",
					onRun: (year) => this._onSetCurrentSeason(year),
				} : null,
				// Winter picked again after it was recorded reopens THAT winter, not next year's.
				onPick: (season, year) => this._showSeasonDialog(season,
					pickedSeasonYear(readCurrentSeason(this.actor), season, year)),
			});
		}

		// The move's own window, walked step by step (seasons-change-dialog.js). Also opened by
		// the time banner's "the seasons have turned" prompt (hooks/Ready.js).
		_showSeasonDialog(seasonId, year = this._seasonsCurrentYear()) {
			return openSeasonsChangeDialog(this, seasonId, year);
		}

		/** The season's +Fortunes roll from that window, off the move's ladder for the season. */
		_rollSeasonsChangeFortunes(seasonId, rollOptions = {}, { winterAgain } = {}) {
			return this._onSteadingRoll("Seasons Change", "fortunes", {
				...rollOptions, ..._seasonRollOptions(seasonId, { winterAgain }),
			});
		}

		async _onSteadingRoll(moveName, statKey, rollOptions = {}) {
			if (!statKey) return;
			const diminished = this._stonetopSteading.getSystemValue("attributes.debilities.options.diminished.value", false);
			const lacking = this._stonetopSteading.getSystemValue("attributes.debilities.options.lacking.value", false);
			// Everything the flow itself decides about the card — its tier text and legend, the
			// list each tier chooses from, and any button a tier offers. Read from the flow here
			// rather than passed in, so the bare roll button on the Moves tab produces the same
			// card as the move's dialog does; the dialog only adds what its own controls answered.
			const flow = Object.values(HOMESTEAD_MOVE_FLOWS).find(f => f.label === moveName);
			const defaultRollOptions = flow
				? {
					moveResults: _moveResultsFromRows(flow.results),
					resultLegend: _resultsLegendHtml(flow.results),
					...(flow.pickPools  ? { pickOptions: flow.pickPools }  : {}),
					...(flow.tierActions ? { tierActions: flow.tierActions } : {}),
				}
				: {};
			// `situational` is the one-off modifier from the pre-roll prompt; it lands on top of
			// whatever the move itself already charges (Trade & Barter's declared value), and the
			// roll engine surfaces the sum as a Situational pill. `improvementAnswers` is what the
			// move's window asked about the steading's improvements, and is absent for a roll made
			// without one (the Moves tab's roll chip).
			const { situational = 0, improvementAnswers, winter = false, ...rest } = rollOptions;
			// Every rule's advantage and disadvantage, netted against the player's mode, and a
			// sacrifice's held +Fortunes advantage (Rites of the Land) applied, because this is the
			// roll it was promised to (./steading-roll.js). Spent just before the dice, below. The player's mode is the caller's when
			// it has one (the prompt's answer), and the sheet's sticky selector when it does not.
			// `??`, not `||`: the prompt omits the key entirely when it did not ask.
			const adjusted = await settleSteadingRoll(this._stonetopSteading, {
				moveName, statKey,
				chosenMode: rest.rollMode ?? this._sheetRollMode(),
				answers: improvementAnswers ?? {},
				tactics: this._militiaTactics(),
				winter,
				canSpend: !!this.actor.isOwner,
			});
			const options = {
				...defaultRollOptions,
				...rest,
				moveName,
				rollMode: adjusted.rollMode,
				// `adjusted.bonus`: a rule's plus to the roll itself (Tor's blessing on Pull Together),
				// named on the card by its condition pill.
				modifier: (rest.modifier ?? 0) + situational + (adjusted.bonus ?? 0),
				statValue: this._stonetopSteading.getStatValue(statKey),
			};
			if (rollOptions.statValue !== undefined) options.statValue = rollOptions.statValue;
			// "Treat Defenses as 1 higher": the stat itself, not a modifier, so the card's stat
			// line reads the Defenses the roll actually used.
			options.statValue += adjusted.statBonus;
			if (diminished && DIMINISHED_MOVES.has(moveName)) {
				options.stonetopDebility = "Diminished";
				options.stonetopDebilityTooltip = "Disadvantage to Deploy, Muster, or Pull Together.";
			}
			if (lacking && statKey === "prosperity") {
				options.statValue -= 1;
				options.stonetopDebility = "Lacking";
				options.stonetopDebilityTooltip = "Treat Prosperity as 1 lower.";
			}
			if (adjusted.conditionNotes.length) options.conditionNotes = [...(rest.conditionNotes ?? []), ...adjusted.conditionNotes];
			// Deploy's 7-9 names who picks the consequence, once the window has asked.
			if (moveName === STEADING_MOVE.DEPLOY && improvementAnswers) {
				const results = deployResults(adjusted.strength);
				options.moveResults = _moveResultsFromRows(results);
				options.resultLegend = _resultsLegendHtml(results);
			}
			if (adjusted.missAsPartial) options.missCountsAsPartial = adjusted.missAsPartial;
			await adjusted.spend();
			if (adjusted.held) this.render(false);
			await rollStat(statKey, this.actor, {
				...options,
			});
		}

		// The sticky mode, off the actor's own flag: the Roll Modifier selector writes it, and
		// every steading roll that was not told otherwise reads it. Shared by both layouts.
		_sheetRollMode() {
			return normalizeRollMode(this.actor.getFlag(STONETOP_SCOPE, "rollMode"));
		}

		async _onSteadingTrackChange(path, value) {
			await this._stonetopSteading.setSystemValue(path.replace(/^system\./, ""), value);
		}

		// The three list writes below go through editList, in the steading's turn with the list
		// read inside it: copied from the cache before the turn, a tick inside a completion's
		// round trip wrote back the list as it was and took the completion's entry off it.
		async _onListItemCheck(list, index, checked) {
			await this._stonetopSteading.editList(list, arr => {
				if (!arr[index]) return false;
				arr[index].checked = checked;
			});
		}

		async _onReturnAsset(index) {
			const name = this._stonetopSteading._flags.assets?.[index]?.name ?? "Asset";
			await this._stonetopSteading.returnAsset(index);
			this.render(false);
			ui.notifications.info(`${name} returned to ${this.actor.name}.`);
		}

		async _onListItemAdd(list) {
			if (list === "residents" || list === "neighbors") {
				const kind = list === "neighbors" ? "neighbor" : "resident";
				const data = await new AddSteadingMemberDialog(kind).promise();
				if (!data) return;
				await this._addPersonRow(list, data);
				this.render(false);
				return;
			}
			const labels = { resources: "resource", fortifications: "fortification", assets: "asset" };
			const label = labels[list] ?? list;
			const input = `<div style="margin-bottom:4px"><input type="text" name="entry-name" placeholder="Name…" style="width:100%"></div>`;
			new Dialog({
				title: `Add ${label.charAt(0).toUpperCase() + label.slice(1)}`,
				content: input,
				buttons: {
					add: {
						label: "Add",
						callback: async (html) => {
							const name = html.find("[name=entry-name]").val()?.trim();
							if (!name) return;
							await this._stonetopSteading.editList(list, arr => { arr.push({ name, checked: false }); });
							this.render(false);
						},
					},
					cancel: { label: "Cancel" },
				},
				default: "add",
				render: (html) => html.find("[name=entry-name]").focus(),
			}, { classes: ["dialog", "stonetop", "stonetop-steading-add-dialog"] }).render(true);
		}

		async _onListItemDelete(list, index) {
			await this._stonetopSteading.editList(list, arr => {
				if (!arr[index]) return false;
				arr.splice(index, 1);
			});
			this.render(false);
		}

		async _onPlaceChange(index, value) {
			const f = this._stonetopSteading._flags;
			const places = foundry.utils.deepClone(f.places ?? STEADING_DEFAULTS.places);
			places[index].name = value;
			await this._stonetopSteading.setFlags({ places });
		}

		/**
		 * Persist an inline Residents/Neighbors cell edit. An actor-backed row (post-
		 * migration) writes straight to its linked NPC actor's field — the actor is the
		 * source of truth; a legacy plain-text row keeps writing to the steading flag
		 * array (until migration converts it). `name` renames the NPC document; the rest
		 * map to NPC system fields via personFieldPath.
		 */
		async _onPersonFieldChange(list, index, field, value) {
			const path = personFieldPath(list, field);
			if (!path) return;
			const f = this._stonetopSteading._flags;
			const rows = f[list] ?? STEADING_DEFAULTS[list];
			const row = rows[index];
			if (row && isActorRow(row)) {
				// The rich `notes` field is edited via the pop-up ProseMirror editor, never
				// as an inline plain-text cell — so a stray inline write can't flatten its
				// HTML. (Actor rows render no notes input; this is belt-and-suspenders.)
				if (field === "notes") return;
				const actor = (row.id ? game.actors?.get(row.id) : null)
					|| (row.uuid ? await fromUuid(row.uuid).catch(() => null) : null);
				if (!actor) return;
				await actor.update({ [path]: value ?? "" });
				// Keep the row's cached name in sync so a deleted-actor fallback stays useful.
				if (field === "name") {
					const arr = foundry.utils.deepClone(rows);
					arr[index] = { ...arr[index], name: value ?? "" };
					await this._stonetopSteading.setFlags({ [list]: arr });
				}
				return;
			}
			// Legacy plain-text row.
			const arr = foundry.utils.deepClone(rows);
			if (!arr[index]) arr[index] = { name: "", home: "", occupation: "", traits: "", relations: "", notes: "", checked: false };
			arr[index][field] = value;
			await this._stonetopSteading.setFlags({ [list]: arr });
		}

		async _onPlayerFieldChange(index, field, value) {
			if (!["occupation", "traits", "relations", "notes"].includes(field)) return;
			const f = this._stonetopSteading._flags;
			const players = foundry.utils.deepClone(f.players ?? STEADING_DEFAULTS.players);
			if (!players[index]) return;
			players[index][field] = value;
			await this._stonetopSteading.setFlags({ players });
		}

		/**
		 * Create a new NPC actor for a Residents/Neighbors entry (from the Add Member
		 * dialog's field data) and append a {uuid, id, name} pointer row. The NPC is the
		 * row's source of truth from here on.
		 */
		async _addPersonRow(list, data) {
			// Shared with the sidebar "Create Actor" picker, which adds residents and
			// neighbors without this sheet being open (see steading-people.js).
			await addPersonToSteading(list, data, this.actor);
		}

		/**
		 * Link an existing NPC actor (dragged onto the Residents/Neighbors section) as a
		 * row, if it isn't already listed. Only "npc" actors link here — characters go to
		 * the Player Characters list via _onDropPlayerCharacter.
		 */
		async _onDropPersonNpc(list, actor) {
			if (actor?.type !== "npc") return;
			const f = this._stonetopSteading._flags;
			const arr = foundry.utils.deepClone(f[list] ?? STEADING_DEFAULTS[list]);
			const uuid = actor.uuid ?? "";
			const id   = actor.id ?? "";
			if (arr.some(r => (uuid && r.uuid === uuid) || (id && r.id === id))) {
				ui.notifications?.info?.(`${actor.name} is already listed.`);
				return;
			}
			arr.push({ uuid, id, name: actor.name, checked: false });
			await this._stonetopSteading.setFlags({ [list]: arr });
			// Residents live in Stonetop — seed a blank Home so the NPC sheet reflects it
			// (a specific home already on the NPC is left untouched).
			if (list === "residents" && !String(actor.system?.home ?? "").trim()) {
				try { await actor.update({ "system.home": HOME_STONETOP }); }
				catch (err) { console.warn("Stonetop | Could not set resident Home for", actor?.name, err); }
			}
			this.render(false);
			ui.notifications?.info?.(`Linked ${actor.name}.`);
		}

		// Link a dragged player character onto the Players roster. The row shape and the
		// duplicate check live on the model (StonetopSteading#addPlayerRow), shared with the
		// automatic filing a character gets at the end of creation, so a drag and a finished
		// creation can't produce two different rows for the same person.
		async _onDropPlayerCharacter(actor) {
			const added = await this._stonetopSteading.addPlayerRow(actor);
			this.render(false);
			ui.notifications?.info?.(added
				? `Added ${actor.name} to players.`
				: `${actor.name} is already in the players list.`);
		}

		async _onNotesChange(value) {
			await this._stonetopSteading.setFlags({ notes: value });
		}

		async _onCurrencyChange(currency, field, value) {
			const f = this._stonetopSteading._flags;
			const cur = foundry.utils.deepClone(f[currency] ?? STEADING_DEFAULTS[currency]);
			cur[field] = value;
			await this._stonetopSteading.setFlags({ [currency]: cur });
		}

		async _onImprovementComplete(slug, checked) {
			// Marking complete while the requirements aren't all met: rather than block
			// it, offer to check off every required step at once and earn the improvement
			// now. Unchecking is always allowed so a mistaken completion can be undone.
			let forceR;
			if (checked) {
				const def = this._stonetopSteading.improvementDef(slug);
				const stored = this._stonetopSteading._flags.improvements?.[slug] ?? {};
				if (def && !improvementRequirementsMet(def, stored.r ?? [])) {
					// The FEWEST ticks that meet the requirements, never every box: both sides of an
					// either/or, or a choice with a cost of its own (Additional Housing's fields, a
					// third militia tactic), are not something "earn it now" decides. See
					// forceCompleteTicks.
					const ticks = forceCompleteTicks(def, stored.r ?? []);
					const confirmed = await this._confirmForceCompleteImprovement(def, { slug, ticks, before: stored.r ?? [] });
					if (!confirmed) {
						this.render(false); // revert the just-tapped checkbox
						return;
					}
					forceR = ticks;
				}
			}
			// Toggling completion also auto-applies (or reverses) the improvement's
			// one-time mechanical grants — stat bumps, Resources/Fortifications entries,
			// etc. — in the same actor update. See StonetopSteading.setImprovementCompleted.
			const result = await this._stonetopSteading.setImprovementCompleted(slug, checked, { forceR });
			if (result?.summary?.length) {
				const verb = result.reverted ? "Reverted" : "Applied";
				ui.notifications.info(`${verb} ${result.label}: ${result.summary.join("; ")}.`);
			}
			if (!checked) return;
			// What the book asks of the table the moment it is built, which the sheet cannot do for
			// them. Permanent, so it waits to be read rather than fading while they name the inn.
			const note = this._stonetopSteading.improvementCompletionNote?.(slug) ?? "";
			if (note) ui.notifications.info(`${result?.label ?? "Improvement"} built. ${note}`, { permanent: true });
			if (slug === "inn") await this._onNameInn();
		}

		/** Ask for the Inn's name and write it (nameInn). `current` is the name it already has, if any. */
		async _onNameInn(current = "") {
			const name = await this._askInnName(current);
			const label = name ? await this._stonetopSteading.nameInn(name) : null;
			if (label) {
				this.render(false);
				ui.notifications.info(`The inn is on the Resources list as ${label}.`);
			}
		}

		/**
		 * "Name the inn": asked when the Inn is built, and again whenever its card's "Name the inn"
		 * button is pressed, which is what keeps "Not yet" truthful. Resolves the name, or null.
		 */
		_askInnName(current = "") {
			return new Promise(resolve => {
				new Dialog({
					title: current ? "Rename the inn" : "Name the inn",
					content: `<form class="stonetop-homestead-dialog">
						<label class="stonetop-homestead-field">
							<span>What is the inn called?</span>
							<input type="text" name="innName" placeholder="The Wisent's Rest" value="${_esc(current)}">
						</label>
						<p class="stonetop-rites-note">${current ? "Leave it as it is" : "Not yet"} keeps ${current ? "its name" : "it unnamed"}; the Inn's card on the Improvements tab can ${current ? "rename" : "name"} it any time.</p>
					</form>`,
					buttons: {
						name: { label: current ? "Rename it" : "Name it", callback: html => resolve(html[0].querySelector('[name="innName"]')?.value?.trim() || null) },
						later: { label: current ? "Leave it as it is" : "Not yet", callback: () => resolve(null) },
					},
					default: "name",
					close: () => resolve(null),
				}, { classes: ["dialog", "stonetop", "stonetop-inn-name-dialog"] }).render(true);
			});
		}

		// Confirm marking the missing requirements of a not-yet-earned improvement done so it can
		// be earned immediately, saying which boxes that ticks and, in the remove dialog's "What
		// changes" shape, what completing it will apply. Resolves true when accepted.
		_confirmForceCompleteImprovement(def, { slug = def?.slug, ticks = [], before = [] } = {}) {
			const steps = flatRequirementItems(def);
			const marking = steps.filter((_, i) => ticks[i] && !before[i]).map(step => stripHtmlToText(step));
			const applies = this._stonetopSteading.improvementCompletionPreview?.(slug, { forceR: ticks }) ?? [];
			return confirmOutcome({
				title: "Earn this improvement?",
				content: `<div class="stonetop-improvement-force-complete">
					<p>Stonetop hasn't met all the requirements for <strong>${_esc(def.label)}</strong> yet.</p>
					<p>Mark the missing ones done and earn it now?</p>
					<div class="stonetop-muster-change">
						<span class="stonetop-muster-change-head">What changes</span>
						${applies.length
							? `<span class="stonetop-muster-change-row">${_esc(applies.join("; "))}</span>
								<span class="stonetop-muster-change-why">Completing it applies these.</span>`
							: `<span class="stonetop-muster-change-row">Nothing else on the sheet.</span>
								<span class="stonetop-muster-change-why">It has no effect the sheet applies by itself; its card says what it does.</span>`}
						${marking.length ? `<span class="stonetop-muster-change-why">Marked done: ${_esc(marking.join("; "))}.</span>` : ""}
					</div>
				</div>`,
				yes:     { label: "Mark the rest done and earn it", icon: "fa-check-double" },
				no:      { label: "Not yet" },
				classes: ["stonetop-improvement-force-complete-dialog"],
			});
		}

		/**
		 * Pick a category chip: one at a time, so choosing a second drops the first, and
		 * choosing the lit one again clears back to unfiltered. That second behaviour is
		 * what makes "show everything" reachable without a fourth "All" chip.
		 * @returns {string} the category now lit, or "" for unfiltered.
		 */
		_toggleImprovementCategory(key) {
			this._improvementCategory = this._improvementCategory === key ? "" : key;
			return this._improvementCategory;
		}

		/**
		 * Whether a card in `category` is hidden by the current chip. No chip lit is the
		 * unfiltered state, and an improvement with no category at all (a dropped journal
		 * card, or a custom one authored without picking one) is never hidden — a filter
		 * over data that predates the filter should not make that data disappear.
		 */
		_isImprovementFiltered(category) {
			if (!this._improvementCategory) return false;
			if (!category) return false;
			return category !== this._improvementCategory;
		}

		/** Wire the Improvements tab's category chips. See getData for the render side. */
		_wireImprovementCategoryFilter(tab) {
			if (!tab) return;
			const chips = [...tab.querySelectorAll(".steading-improvement-filter")];
			const apply = () => {
				// Every chip is restyled, not just the clicked one: picking a new category has
				// to unlight whichever one was lit before.
				for (const chip of chips) {
					const on = chip.dataset.category === this._improvementCategory;
					chip.classList.toggle("is-active", on);
					chip.setAttribute("aria-pressed", on ? "true" : "false");
				}
				for (const card of tab.querySelectorAll(".steading-improvement")) {
					card.classList.toggle("steading-improvement-filtered",
						this._isImprovementFiltered(card.dataset.category ?? ""));
				}
			};
			tab.addEventListener("click", ev => {
				const btn = ev.target.closest(".steading-improvement-filter");
				if (!btn) return;
				// Stops the BUBBLE-phase handlers above this one, so a chip click is only ever a
				// chip click. It does NOT stop the sheet root's capture-phase expand/collapse
				// handler: that one runs on the way down and has already fired by the time this
				// listener sees the event. What keeps it harmless is its own guard — a chip is not
				// inside a card header, and it bails on anything that isn't. Any capture-phase
				// click handler added to the tab or the sheet root will likewise see chip clicks
				// and needs to exclude them itself; nothing here can do it for them.
				ev.preventDefault();
				ev.stopPropagation();
				if (!btn.dataset.category) return;
				this._toggleImprovementCategory(btn.dataset.category);
				apply();
			});
		}

		/**
		 * Tick a requirement box. On a built improvement that can move a stat (the militia's
		 * tactics, a Market's requirements), and the notice says which and why.
		 */
		async _onImprovementReq(slug, index, checked, { seasonStep } = {}) {
			const result = await this._stonetopSteading.setImprovementRequirement(slug, index, checked, { seasonStep });
			if (result?.summary?.length) ui.notifications.info(`${result.label}: ${result.summary.join("; ")}.`);
			return result;
		}

		/** True once the named improvement is built, which is what gates its seasonal upkeep. */
		_hasImprovement(slug) {
			return this._stonetopSteading.improvementCompleted(slug);
		}

		/** The tracked herd for Requisition's "how many from the herd" question, or null without one. */
		_herdForQuestions() {
			return this._hasImprovement("herdOfHorses") ? this._stonetopSteading.getHerd() : null;
		}

		/** The militia's currently-trained tactics, as {index, label} rows the summer window can
		 *  offer for the losing. Index is into the improvement's requirement array.
		 *
		 *  Definition and requirement state both come off the MODEL: `improvementDef` resolves a
		 *  custom improvement as well as a built-in, which a bare IMPROVEMENT_DEFINITIONS.find
		 *  here did not, and it is where the sibling views already live. */
		_militiaTactics() {
			const steading = this._stonetopSteading;
			return militiaTactics(
				steading.improvementDef("wellTrainedMilitia"),
				steading.improvementRequirements("wellTrainedMilitia"));
		}

		/** Whether Additional Housing was built on the fields, which is what docks the harvest. */
		_builtOnTheFields() {
			const steading = this._stonetopSteading;
			return builtOnTheFields(
				steading.improvementDef("additionalHousing"),
				steading.improvementRequirements("additionalHousing"));
		}

		/** This steading's harvest roll, for every door that rolls it (the window, the header's
		 *  sheaf, winter's catch-up). Additional Housing's penalty turns on WHICH of the two ways
		 *  it was built, which is a rule and so lives in season-effects.js beside the militia's:
		 *  see builtOnTheFields there for why it is read off the requirement box by its text. */
		_harvestRoll(rules = this._improvementRules()) {
			return autumnHarvest({ rules, builtOnTheFields: this._builtOnTheFields() });
		}

		/** The improvements in force and their grants (improvement-rules.js): what every rule reads. */
		_improvementRules() {
			return this._stonetopSteading.improvementRules();
		}

		/**
		 * Stand the muster down, giving back the Defenses it borrowed.
		 *
		 * Confirmed rather than immediate: the glyph is small, it sits in a header people click
		 * around, and the write is not trivially undoable (it moves a stat).
		 *
		 * NOT `Dialog.confirm`, because its buttons are hard-wired to Yes/No and a bare "Yes"
		 * under a paragraph about horses and Defenses does not say what it is agreeing TO. The
		 * two buttons here name the two outcomes, so the window can be read from its footer up.
		 * The body follows the shape the Inn's and winter's windows use: the quoted trigger
		 * first, then what pressing it does, then a `<before> &rarr; <after>` block for the one
		 * number that moves. That last part used to read "Defenses: +1 to 0", which parses as an
		 * instruction to ADD +1 rather than as a transition away from it.
		 */
		async _standDownMuster() {
			if (!this.isEditable) return;
			const held = this._stonetopSteading.musterHold();
			if (!held) return;
			const defenses = this._stonetopSteading.getStatValue("defenses");
			new Dialog({
				title: "Stand Down the Muster",
				content: `<div class="stonetop-disaster-dialog stonetop-muster-body">
					<p class="stonetop-inn-trigger"><em>A muster holds until the threat passes, the Seasons Change, or whoever called it stops overseeing it.</em></p>
					<p>Standing it down ends it now: folks go back to their own work, and the steading is no longer alert and ready for action.</p>
					<div class="stonetop-muster-change">
						<span class="stonetop-muster-change-head">What changes</span>
						${held.defenses
							? `<span class="stonetop-muster-change-row">Defenses <strong>${sign(defenses)} &rarr; ${sign(defenses - 1)}</strong></span>
								<span class="stonetop-muster-change-why">The muster was worth +1 Defenses while it held. Standing down gives that +1 back.</span>`
							: `<span class="stonetop-muster-change-row">Nothing on the sheet.</span>
								<span class="stonetop-muster-change-why">This muster never took the +1 Defenses, so there is nothing to give back.</span>`}
					</div>
					<!-- Careful not to say the Fortunes comes back OR that it was spent: one of
					     Muster's own 7+ picks is "don't reduce Fortunes after all", so whether it
					     cost anything is not knowable from here. -->
					<p class="stonetop-rites-note">Nothing else is returned; standing down only ends the muster. Raising a fresh one means rolling Muster again.</p>
				</div>`,
				buttons: {
					// Affirmative LEFT, as everywhere else. Both labels name an OUTCOME rather
					// than an answer, so neither depends on having read the paragraph above it.
					yes: {
						icon:  '<i class="fas fa-person-walking-arrow-right"></i>',
						label: "Stand the muster down",
						callback: () => this._applyStandDownMuster(held, defenses),
					},
					no: {
						icon:  '<i class="fas fa-shield-halved"></i>',
						label: "No, keep it mustered",
					},
				},
				default: "yes",
			}, { classes: ["dialog", "stonetop", "stonetop-disaster-move-dialog"] }).render(true);
		}

		/** The write behind the confirm, split out so the button is a one-liner. */
		async _applyStandDownMuster(held, defenses) {
			await this._stonetopSteading.standDownMuster();
			this.render(false);
			ui.notifications.info(held.defenses
				? `The muster stands down. Defenses back to ${sign(defenses - 1)}.`
				: "The muster stands down.");
		}

		/**
		 * The Inn's seasonal gathering. Reads the season clock at OPEN time rather than
		 * trusting the sheet-data snapshot: the card behind this may have been rendered
		 * before a Seasons Change moved the clock on.
		 */
		_openInnGathering() {
			if (!this.isEditable) return;
			// The STAMP's season and year, matching what `_innGatheringView` reads the marker
			// back with — see seasonStampParts.
			const { seasonId, year } = seasonStampParts(this.actor);
			openInnGathering({
				steading: this._stonetopSteading,
				year,
				seasonId,
				onApplied: () => this.render(false),
			});
		}

		async _onHerdStep(tier, delta) {
			if (!["grown", "yearlings", "foals"].includes(tier) || !delta) return;
			const herd = this._stonetopSteading.getHerd();
			await this._stonetopSteading.setHerd({ ...herd, [tier]: Math.max(0, herd[tier] + delta) });
		}

		async _onHerdInput(tier, value) {
			if (!["grown", "yearlings", "foals"].includes(tier)) return;
			const herd = this._stonetopSteading.getHerd();
			await this._stonetopSteading.setHerd({ ...herd, [tier]: Math.max(0, Math.trunc(Number(value) || 0)) });
		}

		/**
		 * A season's Surplus roll, asked and made: summer's 1d4-1, or autumn's harvest from the
		 * Seasons Change window, the header's sheaf, or winter's catch-up step. ONE method for the
		 * three doors, so the harvest cannot be rolled one way from the window and another from the
		 * header.
		 *
		 * Asks first (promptSurplusRoll): advantage, disadvantage and a modifier, because the book
		 * and Book II all adjust these rolls, and for the harvest whether it failed outright ("they
		 * don't get any Surplus (and they Meet With Disaster)", Book I p. 516).
		 *
		 * Writes the Surplus and the season's SURPLUS_SEASON_STEP marker in ONE update, added to the
		 * LIVE Surplus rather than a figure captured earlier: the watch is fed before this and the
		 * herd after, both in the same window.
		 *
		 * The marker is re-read HERE, when a door is pressed, not trusted to the button that was
		 * pressed: the header's sheaf and winter's catch-up step can both be showing at once, and
		 * each was only checked when it was drawn. A roll already under way (its prompt open, its
		 * dice in the air) holds every door shut until it lands, so two quick presses on either
		 * cannot both get past the marker before it is written.
		 *
		 * @returns {Promise<boolean>} false when nothing happened and the door may be pressed again
		 */
		async _rollSeasonSurplus({ seasonId, year, formula, label, harvest = false, shiftKey = false }) {
			const steading = this._stonetopSteading;
			if (steading.seasonStepApplied(SURPLUS_SEASON_STEP, year, seasonId)) {
				ui.notifications.info(harvest ? "The harvest has already been rolled." : "This season's Surplus has already been rolled.");
				return true;
			}
			const key = `${year}:${seasonId}`;
			this._surplusRolling ??= new Set();
			if (this._surplusRolling.has(key)) return false;
			this._surplusRolling.add(key);
			try {
				return await this._rollSeasonSurplusOnce({ seasonId, year, formula, label, harvest, shiftKey });
			} finally {
				this._surplusRolling.delete(key);
			}
		}

		/** {@link _rollSeasonSurplus}'s roll itself, once its guards have let it through. */
		async _rollSeasonSurplusOnce({ seasonId, year, formula, label, harvest, shiftKey }) {
			const answer = await promptSurplusRoll({
				title: harvest ? "The Harvest" : `Seasons Change: ${label}`,
				formula, harvest, shiftKey,
			});
			if (!answer) return false;
			const steading = this._stonetopSteading;
			const seasonsMove = { stonetopMove: "Seasons Change" };
			// Built at each write, never before an await: seasonStepFlags copies the WHOLE
			// seasonSteps map, so a copy taken before the dice flew would write back the old stamp
			// of any step closed while they were in the air (the watch fed mid-roll would reopen).
			const marker = () => steading.seasonStepFlags(SURPLUS_SEASON_STEP, year, seasonId);

			if (answer.failed) {
				await ChatMessage.create({
					speaker: SEASONS_SPEAKER,
					content: stonetopChatCard(["The Harvest", label], `<div class="card-content"><p><strong>The harvest failed.</strong> The steading gets no Surplus from it, and Meets with Disaster.</p></div>`),
				});
				const { fortunes, disaster } = await meetWithDisaster(steading, {
					...seasonsMove,
					cause: "a failed harvest",
					introHtml: `<p><em>The harvest failed and the steading Meets with Disaster, but Fortunes cannot drop below −1.</em> The GM picks 1 instead:</p>`,
					onApplied: () => this.render(false),
					alsoFlags: marker(),
				});
				this.render(false);
				ui.notifications.info(disaster
					? "The harvest failed. Fortunes is already −1, so the steading Meets with Disaster."
					: `The harvest failed: no Surplus, and Fortunes drops to ${sign(fortunes)}.`);
				return true;
			}

			const roll = await new Roll(surplusRollFormula(formula, answer)).evaluate();
			await roll.toMessage({ speaker: SEASONS_SPEAKER, flavor: rolledTotalCard(roll, [harvest ? "The Harvest" : "Surplus Generation", label], "Surplus gained") });
			// The Golden Sapling's "when the steading generates Surplus, even just 1, it generates +1
			// Surplus" (a `surplusBonus` grant): added once the roll has come to at least 1.
			const bonus = withSurplusBonus(roll.total, this._improvementRules());
			const gain = bonus.gain;
			const total = steading.getStatValue("surplus") + gain;
			await steading.applyChanges({
				system: { "attributes.surplus.value": total },
				flags: marker(),
			}, seasonsMove);
			this.render(false);
			ui.notifications.info(`Generated ${gain} Surplus${surplusBonusNote(bonus)}. New total: ${total}.`);
			return true;
		}

		/** The header sheaf: this autumn's harvest, rolled once it is complete. */
		async _rollHarvestFromHeader() {
			const { seasonId, year } = seasonStampParts(this.actor);
			if (!this._stonetopSteading.harvestOwed(year, seasonId)) {
				ui.notifications.info("There is no harvest waiting to be rolled.");
				return;
			}
			const { formula } = this._harvestRoll();
			await this._rollSeasonSurplus({ seasonId, year, formula, label: seasonLabel(seasonId), harvest: true });
		}

		async _onDropSteadingImprovement(improvement) {
			if (!improvement?.name) return;
			if (!this.isEditable) {
				globalThis.ui?.notifications?.warn?.(`You can't add improvements to ${this.actor?.name ?? "this steading"}: you don't have permission to edit it.`);
				return;
			}
			let result;
			try {
				result = await this._stonetopSteading.addCustomImprovement(improvement);
			} catch (err) {
				console.warn("Stonetop | Could not add a dropped steading improvement:", err);
				globalThis.ui?.notifications?.warn?.(`Could not add ${improvement.name} to ${this.actor?.name ?? "the steading"}.`);
				return;
			}
			if (result.ok) {
				globalThis.ui?.notifications?.info?.(`Added steading improvement: ${result.label}.`);
				this.render(false);
			} else if (result.reason === "duplicate") {
				globalThis.ui?.notifications?.warn?.(`${result.label} is already a steading improvement.`);
			}
		}

		// Author a custom improvement and add it as a tracked one — the same path a dropped
		// journal card takes, and the same window the reusable-card flow opens
		// (ImprovementBuilderDialog), so an improvement jotted down here can carry the
		// requirement groups and automatic effects the book's own improvements have.
		async _onCreateImprovementOpen() {
			const saver = steadingImprovementSaver(this._stonetopSteading, () => this.render(false));
			new ImprovementBuilderDialog(saver).render(true);
		}

		/**
		 * Rewrite an added improvement in place: the same builder window, opened on it, saving
		 * back over it. Not confirmed, unlike removal: nothing is lost that Cancel does not
		 * keep, and the write moves no stats (see updateCustomImprovement).
		 */
		_onEditCustomImprovement(slug) {
			if (!slug || !this.isEditable) return;
			const saver = improvementEditSaver(this._stonetopSteading, slug, () => this.render(false));
			if (!saver.editing) return;
			new ImprovementBuilderDialog(saver).render(true);
		}

		/**
		 * Remove an added improvement, after asking.
		 *
		 * Confirmed rather than immediate, on the same grounds as standing down the muster: the
		 * control is a small glyph on a card people click around, the authored definition and
		 * its ticked steps go with it and cannot be got back, and if it was ever completed the
		 * write MOVES STATS, since removing it gives back what completing it applied. The two
		 * buttons name the two outcomes, and the body says which of those three things this
		 * particular improvement will actually do.
		 */
		async _onRemoveCustomImprovement(slug) {
			if (!slug || !this.isEditable) return;
			const steading = this._stonetopSteading;
			const def = steading.improvementDef(slug);
			if (!def) return;

			const completed = steading.improvementCompleted(slug);
			const ticked = steading.improvementRequirements(slug).filter(Boolean).length;
			// ⚠ WHAT WAS APPLIED, not what the definition grants. Completing writes down only what
			// it actually changed, so a grant of a Resource this steading already listed gave
			// nothing and gives nothing back — and this window would have named it anyway, under a
			// sentence promising it back. See StonetopSteading#improvementGivesBack.
			const gives = completed ? steading.improvementGivesBack(slug) : [];

			new Dialog({
				title: "Remove Improvement",
				content: `<div class="stonetop-disaster-dialog">
					<p>Remove <strong>${escHtml(def.label)}</strong> from this steading. Its requirements, its effect and everything written on it go with it, and there is no undo.</p>
					<div class="stonetop-muster-change">
						<span class="stonetop-muster-change-head">What changes</span>
						${gives.length
							? `<span class="stonetop-muster-change-row">${escHtml(gives.join("; "))}</span>
								<span class="stonetop-muster-change-why">Completing it applied these, so removing it gives them back.</span>`
							: `<span class="stonetop-muster-change-row">Nothing else on the sheet.</span>
								<span class="stonetop-muster-change-why">${completed
									? "It is complete, but nothing was applied automatically."
									: "It was never completed, so nothing was applied to give back."}</span>`}
						${ticked ? `<span class="stonetop-muster-change-why">${ticked} ticked requirement${ticked === 1 ? "" : "s"} will be forgotten.</span>` : ""}
					</div>
					<p class="stonetop-rites-note">A homebrew card in the journal is a separate copy and is not touched; this only removes it from this steading.</p>
				</div>`,
				buttons: {
					yes: {
						icon: '<i class="fas fa-trash"></i>',
						// Core's Dialog renders a button label as HTML: the label is the author's.
						label: `Remove ${escHtml(def.label)}`,
						callback: () => this._applyRemoveCustomImprovement(slug),
					},
					no: {
						icon: '<i class="fas fa-screwdriver-wrench"></i>',
						label: "Keep it on the steading",
					},
				},
				default: "no",
			}, { classes: ["dialog", "stonetop", "stonetop-disaster-move-dialog"] }).render(true);
		}

		/** The write behind the confirm, split out so the button is a one-liner. */
		async _applyRemoveCustomImprovement(slug) {
			const result = await this._stonetopSteading.removeCustomImprovement(slug);
			if (!result) return;
			this.render(false);
			// "Reverted" rather than "Given back", matching what un-completing an improvement
			// says: the summary lists what completing it APPLIED, so any other verb in front of
			// "Fortunes +1" reads as though Fortunes had just gone up.
			ui.notifications?.info?.(result.reverted.length
				? `Removed ${result.label}. Reverted: ${result.reverted.join("; ")}.`
				: `Removed ${result.label}.`);
		}
	};
}
