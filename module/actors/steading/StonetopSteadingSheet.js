import { StonetopSteading, IMPROVEMENT_DEFINITIONS, STEADING_DEFAULTS, improvementRequirementsMet, improvementRequirementCount, HERD_SURPLUS_PER } from "./StonetopSteading.js";
import {rollStat, sign, postSeasonsRollPrompt, resultsLegendHtml} from "../../utils/roll-engine.js";
import {SteadingLedger} from "./SteadingLedger.js";
import {ledgerNounOptionsHtml, wireLedgerFilters} from "../../utils/ledger-filter.js";
import {escHtml} from "../../utils/strings.js";
import {CUSTOM_ASSET_VALUE, wireCustomAssetSelect} from "../../utils/requisition-asset.js";
import {postMoveToChat} from "../../utils/chat.js";
import {AddSteadingMemberDialog} from "../../dialogs/AddSteadingMemberDialog.js";
import {STONETOP_SCOPE, StonetopFlags} from "../character/StonetopFlags.js";
import {SpecialItemPickerDialog} from "../character/dialogs/SpecialItemPickerDialog.js";
import {CharacterInventory} from "../character/CharacterInventory.js";
import {SPECIAL_ITEM_CATALOG} from "../../data/special-items.js";
import {getHoverDescriptionSetting, getRollStatChipsSetting, getSidebarCollapsed, setSidebarCollapsed, getOpenSheetsInEditMode} from "../../settings.js";
import {applyLabelTooltips} from "../../utils/label-tooltips.js";
import {wrapStonetopGlyphsInEl} from "../../utils/glyphs.js";
import {StonetopAutocomplete} from "../../utils/autocomplete.js";
import {makeColumnsResizable} from "../../utils/resizable-columns.js";
import {keepScrollAcrossTab} from "../../utils/tab-scroll.js";
import {withSectionEditing} from "../../utils/section-editing.js";
import {STEADING_IMPROVEMENT_DRAG_TYPE} from "../../journal/steading-improvement-cards.js";
import {PLACE_OF_INTEREST_DRAG_TYPE} from "../../hooks/PlaceOfInterestDrop.js";
import {getDragEventData} from "../../utils/foundry-compat.js";
import {postSeasonsChangeReminder, seasonIconSrc, seasonLabel, SEASON_IDS} from "../../seasons/seasons-change-reminders.js";
import {recordSeasonsChange, ordinalWord} from "../../seasons/seasons-chronicle.js";
import {SEASONAL_GAINS} from "../../dialogs/spring-burst-data.js";
import {addStonetopSteadingButton} from "../../utils/world.js";
import {listThreatPages, createThreat, deleteThreat, isThreatRevealed} from "../../threats/threat-store.js";
import {buildThreatCardVM, wireThreatDoomChange, handleThreatRevealClick, wireThreatCardDrag} from "../../threats/threat-view.js";
import {THREAT_PROXIMITIES} from "../../threats/threat-types.js";
import {CreateThreatDialog} from "../../threats/create-threat-dialog.js";
import {ThreatEditorDialog} from "../../threats/threat-editor-dialog.js";


function _normalizeSheetRollMode(rollMode) {
	return ["adv", "dis"].includes(rollMode) ? rollMode : "normal";
}

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
  <div><strong>Spring</strong> — The <em>most hopeful</em> rolls +Fortunes. <strong>10+:</strong> pick 1 seasonal gain. <strong>7–9:</strong> pick 1 gain, but a threat makes itself known. <strong>6−:</strong> threats abound; don't mark XP. Reset Fortunes to +1.</div>

  <img src="systems/stonetop_pwd/assets/icons/seasons/summer_icon.svg" class="stonetop-season-row-icon" alt="Summer">
  <div><strong>Summer</strong> — The <em>most content</em> rolls +Fortunes. <strong>10+:</strong> pick 2 seasonal gains. <strong>7–9:</strong> pick 1. <strong>6−:</strong> a threat makes itself known; don't mark XP. The steading generates 1d4−1 Surplus. Reset Fortunes to +1.</div>

  <img src="systems/stonetop_pwd/assets/icons/seasons/fall_icon.svg" class="stonetop-season-row-icon" alt="Autumn">
  <div><strong>Autumn</strong> — The <em>most determined</em> rolls +Fortunes. <strong>10+:</strong> pick 1 seasonal gain. <strong>7–9:</strong> pick 1 gain, but a threat makes itself known. <strong>6−:</strong> threats abound; don't mark XP. The steading generates 1d4 Surplus at harvest. Reset Fortunes to +1.</div>

  <img src="systems/stonetop_pwd/assets/icons/seasons/winter_icon.svg" class="stonetop-season-row-icon" alt="Winter">
  <div><strong>Winter</strong> — The <em>weariest</em> rolls 1d4+Population (min 0); the steading consumes that much Surplus. If there isn't enough: Surplus → 0, Fortunes −1, pick 1 consequence. Then roll +Fortunes. Reset Fortunes to +1.</div>
</div>
<p class="stonetop-seasons-cta">Click <i class="fas fa-dice-d6"></i> to walk through the current season step by step.</p>`,
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
		description: `<p>When <strong>Stonetop's militia goes into action</strong>, say what they're doing and roll <strong>+Defenses</strong>.</p>
<p><strong>On a 7+:</strong> it gets done. On a 10+, choose 2; on a 7-9, choose 1.</p>
<ul>
  <li>It's more effective than expected</li>
  <li>It's quick, over soon</li>
  <li>It causes little collateral damage, expense, or blowback</li>
  <li>Someone involved distinguishes themselves</li>
</ul>
<p><strong>On a 6-:</strong> don't mark XP, and the GM chooses 2: it's less effective than expected; injuries abound and the steading marks diminished; or a named NPC involved dies.</p>
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
];
const STEADING_MOVES = [..._STEADING_MOVES_RAW].sort((a, b) => a.label.localeCompare(b.label));
const DIMINISHED_MOVES = new Set(["Deploy", "Muster", "Pull Together"]);
const STEADING_STAT_CHIP_LABELS = {
	Defenses: "DEF",
	Fortunes: "FOR",
	Population: "POP",
	Prosperity: "PRO",
};

// Hover tooltips for the steading stat labels, keyed by data-steading-stat
// (Book I "Homefront"). Gated by hoverDescriptionsSteadingStats.
const STEADING_STAT_TOOLTIPS = {
	surplus:    "Stores of food and trade goods. A resource you accumulate, spend, and consume — not rolled. Generated in summer and autumn, eaten through in winter.",
	fortunes:   "The steading's morale, social cohesion, and the favor of the gods — “how things are going.” Roll +Fortunes to Requisition and when the Seasons Change; resets to +1 each season.",
	size:       "How big the steading is: hamlet (under 50 people), village (150–350), town (500–1500), city (2500+). Mostly descriptive, but it affects winter Surplus consumption and the Muster, Pull Together, and Trade & Barter moves.",
	population: "The number of able bodies living here, relative to its Size. Roll +Population to Muster or Pull Together; higher Population also eats more Surplus each winter.",
	prosperity: "The goods in circulation, the variety of tradesfolk, and merchant traffic. Roll +Prosperity to Trade & Barter; it also sets the value of “x piercing” and what gear is available.",
	defenses:   "The steading's martial readiness — trained, armed residents and veteran warriors. Roll +Defenses to Deploy its people against a threat.",
	debilities: "Ongoing afflictions that drag the steading down: diminished (injury, sickness, or doubt), lacking (shortages, hoarding, or distrust), and malcontent (fear, anger, or despair). Check any that apply; each imposes its own penalty until it's cleared.",
};
const _esc = escHtml;

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
	return {
		success: { value: collect("success") },
		partial: { value: collect("partial") },
		failure: { value: collect("failure") },
	};
}

function _seasonFortunesResultRows(seasonId) {
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
				RESULT.weak("the steading must consume 1d4+Population more Surplus before winter ends, or suffer the consequences again."),
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

function _seasonRollOptions(seasonId) {
	const results = _seasonFortunesResultRows(seasonId);
	return {
		moveResults: _moveResultsFromRows(results),
		resultLegend: _resultsLegendHtml(results),
	};
}

const HOMESTEAD_MOVE_FLOWS = {
	pullTogether: {
		label: "Pull Together",
		stat: "population",
		statLabel: "Population",
		trigger: "When you set a community to work on improvements, to secure new resources, or to make major repairs, spend whatever the GM says is required and roll +Population.",
		fields: [
			{ name: "project", label: "Project", type: "text", placeholder: "What are you trying to build, repair, clear, or prepare?" },
			{ name: "approach", label: "Approach", type: "textarea", placeholder: "Who is helping, and how are you organizing the work?" },
			{ name: "cost", label: "Required cost", type: "textarea", placeholder: "Time, materiel, Surplus, coin, labor, or other requirements" },
		],
		picksLabel: "On a 7-9, pick 1:",
		picks: [
			"It gets done, but other work does not; reduce Fortunes by 1.",
			"It gets done, but the work is shoddy or crude.",
			"It gets done, but there is a consequence.",
			"There is an unforeseen cost, requirement, or challenge; address it and the job gets done.",
		],
		results: [
			RESULT.strong("the job gets done."),
			RESULT.weak("the job gets done, but pick 1."),
			RESULT.miss("the GM says what happens; do not mark XP."),
		],
		note: "Diminished gives disadvantage on this roll.",
	},
	muster: {
		label: "Muster",
		stat: "population",
		statLabel: "Population",
		trigger: "When Stonetop needs mustering against a threat, reduce Fortunes by 1 and roll +Population.",
		beforeRoll: "musterCost",
		fields: [
			{ name: "threat", label: "Threat", type: "textarea", placeholder: "What is Stonetop mustering against?" },
			{ name: "overseer", label: "Who oversees the muster?", type: "text", placeholder: "A PC, NPC, council, or militia leader" },
			{ name: "orders", label: "Orders", type: "textarea", placeholder: "Where are they gathering, and what are they preparing to do?" },
		],
		picksLabel: "On a 10+, pick 2; on a 7-9, pick 1:",
		picks: [
			"Increase Defenses by 1 as long as the muster holds.",
			"Everyone is willing to pitch in; do not reduce Fortunes after all.",
			"The muster holds together even without your presence.",
			"1 or 2 individuals show real potential; ask the GM who and how.",
		],
		results: [
			RESULT.hit("the steading is alert and ready for action until the threat passes, the Seasons Change, or you cease to oversee the muster."),
			RESULT.strong("also pick 2."),
			RESULT.weak("also pick 1."),
			RESULT.miss("the GM says what happens; do not mark XP."),
		],
		note: "Diminished gives disadvantage on this roll.",
	},
	deploy: {
		label: "Deploy",
		stat: "defenses",
		statLabel: "Defenses",
		trigger: "When Stonetop's militia goes into action, say what they're doing and roll +Defenses.",
		fields: [
			{ name: "action", label: "Action", type: "textarea", placeholder: "What is the militia doing?" },
			{ name: "objective", label: "Objective", type: "text", placeholder: "Drive them off, hold the ford, protect evacuees..." },
			{ name: "support", label: "Support", type: "textarea", placeholder: "Which force, fortification, tactic, or leader matters here?" },
		],
		picksLabel: "On a 10+, choose 2; on a 7-9, choose 1:",
		picks: [
			"It is more effective than expected.",
			"It is quick, over soon.",
			"It causes little collateral damage, expense, or blowback.",
			"Someone involved distinguishes themselves.",
		],
		consequencesLabel: "On a 6-, the GM chooses 2:",
		consequences: [
			"It is less effective than expected.",
			"Injuries abound; the steading marks diminished.",
			"The GM picks a named NPC involved in the action; they die.",
		],
		results: [
			RESULT.hit("it gets done."),
			RESULT.strong("choose 2."),
			RESULT.weak("choose 1."),
			RESULT.miss("do not mark XP; the GM chooses 2 consequences."),
		],
		note: "Diminished gives disadvantage on this roll.",
	},
	tradeBarter: {
		label: "Trade & Barter",
		stat: "prosperity",
		statLabel: "Prosperity",
		trigger: "When you wish to acquire or sell a commonly available item, you can. When you seek to acquire or sell a special item, roll +Prosperity and subtract the item's Value. In winter, you have disadvantage.",
		fields: [
			{ name: "want", label: "What do you want to buy or sell?", type: "textarea", placeholder: "Item, service, animal, coin, Surplus, or trade goods" },
			{ name: "value", label: "Item Value", type: "number", placeholder: "0", min: 0 },
			{ name: "partner", label: "Trade partner", type: "text", placeholder: "Who are you dealing with?" },
			{ name: "offer", label: "Offer or price", type: "textarea", placeholder: "What is being offered, paid, or risked?" },
			{ name: "winter", label: "It is winter", type: "checkbox" },
		],
		results: [
			RESULT.info("Commonly available item", "you can acquire or sell it without rolling."),
			RESULT.strong("you can get it or sell it for a fair price."),
			RESULT.weak("the GM picks 1 (below).", "7-9 when buying"),
			RESULT.weak("you can sell it now, but you won't get its full worth.", "7-9 when selling"),
			RESULT.miss("don't mark XP. If you still want to acquire/sell it, you'll need to travel elsewhere or wait until next season.", "6- either way"),
		],
		picks: [
			"You can get it, but it'll cost more than usual",
			"Someone has it, but they aren't keen to give it up",
			"You can get something close, but not quite right",
		],
		picksLabel: "7-9 when buying — the GM picks 1:",
		note: "For unique or truly exceptional items, don't Trade & Barter — Make a Plan with the GM or wait for a trade opportunity when Seasons Change. Lacking treats Prosperity as 1 lower; subtract the item's Value as a modifier.",
	},
	persuade: {
		label: "Persuade",
		stat: "fortunes",
		statLabel: "Fortunes",
		trigger: "When you need to convince the residents of Stonetop to do something costly, dangerous, or against their interests, roll +Fortunes.",
		fields: [
			{ name: "audience", label: "Who needs convincing?", type: "text", placeholder: "A family, trade, faction, crowd, or named NPCs" },
			{ name: "request", label: "The ask", type: "textarea", placeholder: "What do you want them to do?" },
			{ name: "cost", label: "Why is it hard?", type: "textarea", placeholder: "What makes it costly, dangerous, or against their interests?" },
		],
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
	"players", "residents", "neighbors", "improvements", "threats",
];

export function createStonetopSteadingSheetClass(Base) {
	// Sections with their own heading pencil (Residents, Neighbors) track edit
	// state independently of the global header-wrench `_editMode` via the shared
	// section-editing mixin.
	return class StonetopSteadingSheet extends withSectionEditing(Base) {
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
		// Page uuids of threat cards the user has collapsed (clamped to title + Instinct).
		// Threats default EXPANDED, so a uuid present here means that card reopens collapsed.
		// Kept on the instance like _openImprovements so the state survives the re-render a
		// reveal / create / delete triggers; it resets when the sheet is closed.
		_collapsedThreats = new Set();

		constructor(...args) {
			super(...args);
			this._stonetopSteading = this.actor.typedActor;
			// Honor the "Open Sheets in Edit Mode" client setting on first open.
			this._editMode = getOpenSheetsInEditMode();
		}

		static get defaultOptions() {
			return foundry.utils.mergeObject(super.defaultOptions, {
				classes: ["pbta", "stonetop", "sheet", "actor", "steading"],
				width: 1080,
				minWidth: 800,
				height: 840,
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
			this._removeMemberAvatarPreview();
			await super._render(force, options);
			// Strip any PBTA-injected playbook controls and FoundryVTT chrome from the window header
			const header = this.element[0]?.querySelector(".window-header");
			if (header) {
				header.querySelectorAll(".pbta-playbook, .sheet-playbook, [class*='playbook']").forEach(el => el.remove());
				header.querySelectorAll("select, input[name*='playbook']").forEach(el => el.remove());
				header.querySelectorAll(".document-id-link").forEach(el => el.remove());
			}
			this._injectHeaderToggle();
		}

		// The whole sheet scrolls as one inside .window-content. Keep the reader's scroll
		// position across tab switches instead of letting the browser clamp it up to the
		// top when the incoming tab is shorter (which reads as a jump/bounce). See
		// keepScrollAcrossTab.
		_onChangeTab(event, tabs, active) {
			keepScrollAcrossTab(this.element, () => super._onChangeTab(event, tabs, active));
		}

		_injectHeaderToggle() {
			const header = this.element[0]?.querySelector(".window-header");
			if (!header || !this.isEditable) return;

			header.querySelector(".stonetop-header-toggle")?.remove();

			const label = document.createElement("label");
			label.className = "stonetop-edit-toggle stonetop-header-toggle";
			// Master edit toggle: when on, every section is editable. Each section
			// also has its own hover pencil for editing it in isolation.
			label.title = this._editMode ? "Lock Steading" : "Edit Steading";

			const checkbox = document.createElement("input");
			checkbox.type = "checkbox";
			checkbox.checked = this._editMode;
			checkbox.addEventListener("change", () => {
				this._editMode = checkbox.checked;
				// Locking the sheet resets any per-section pencils back to read-only.
				if (!this._editMode) {
					this._editingSections.clear();
					this._clearAllSectionDoneTimers();
				}
				this.render(false);
			});

			const track = document.createElement("span");
			track.className = "stonetop-toggle-track";
			const thumb = document.createElement("span");
			thumb.className = "stonetop-toggle-thumb";
			const icon = document.createElement("i");
			icon.className = "fas fa-wrench";
			thumb.appendChild(icon);
			track.appendChild(thumb);

			label.appendChild(checkbox);
			label.appendChild(track);

			const title = header.querySelector(".window-title");
			header.insertBefore(label, title);
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
			const entries = SteadingLedger.getEntries(this.actor);
			const ledgerDate = (timestamp) => {
				const date = timestamp ? new Date(timestamp) : null;
				if (!date || Number.isNaN(date.getTime())) return { key: "unknown", label: "Unknown date" };
				const key = [
					date.getFullYear(),
					String(date.getMonth() + 1).padStart(2, "0"),
					String(date.getDate()).padStart(2, "0"),
				].join("-");
				return {
					key,
					label: date.toLocaleDateString(undefined, {
						weekday: "long",
						year:    "numeric",
						month:   "long",
						day:     "numeric",
					}),
				};
			};
			const buildRows = (items) => items.length
				? items.map((entry, index, list) => {
					const date = ledgerDate(entry.timestamp);
					const previous = index > 0 ? ledgerDate(list[index - 1].timestamp).key : null;
					const header = date.key !== previous
						? `<li class="stonetop-ledger-date-header" data-date-key="${_esc(date.key)}">${_esc(date.label)}</li>`
						: "";
					return `${header}<li class="stonetop-ledger-entry" data-id="${_esc(entry.id)}" data-timestamp="${entry.timestamp ?? 0}" data-date-key="${_esc(date.key)}" data-date-label="${_esc(date.label)}">
						<input type="checkbox" class="stonetop-ledger-row-check">
						<div class="stonetop-ledger-entry-content">
							<div class="stonetop-ledger-entry-main">${_esc(entry.action)}${entry.move ? ` <span class="stonetop-ledger-entry-move">via ${_esc(entry.move)}</span>` : ""}</div>
							<div class="stonetop-ledger-entry-user">Changed by ${_esc(entry.userName)}</div>
							<div class="stonetop-ledger-entry-meta">
								<span>${_esc(entry.timestamp ? new Date(entry.timestamp).toLocaleString() : "")}</span>
							</div>
						</div>
					</li>`;
				}).join("")
				: `<li class="stonetop-ledger-empty">No ledger entries yet.</li>`;

			const nounOptions = ledgerNounOptionsHtml(entries);

			const content = `<div class="stonetop-ledger-container">
				<div class="stonetop-ledger-toolbar">
					<label class="stonetop-edit-toggle stonetop-ledger-edit-toggle" title="Edit entries">
						<input type="checkbox" class="stonetop-ledger-edit-check">
						<span class="stonetop-toggle-track">
							<span class="stonetop-toggle-thumb"><i class="fas fa-pen"></i></span>
						</span>
					</label>
					<label class="stonetop-ledger-select-all-label" title="Select all">
						<input type="checkbox" class="stonetop-ledger-select-all">
					</label>
					<button type="button" class="stonetop-ledger-delete-selected">
						<i class="fas fa-trash"></i> Delete
					</button>
					<input type="search" class="stonetop-ledger-search" placeholder="Filter entries…">
					<select class="stonetop-ledger-noun" title="Filter by subject">
						<option value="">All changes</option>
						${nounOptions}
					</select>
					<select class="stonetop-ledger-sort">
						<option value="desc">Newest first</option>
						<option value="asc">Oldest first</option>
					</select>
				</div>
				<section class="stonetop-ledger-dialog">
					<ol class="stonetop-ledger-list">${buildRows(entries)}</ol>
				</section>
			</div>`;

			new Dialog({
				title: `${this.actor.name}: Ledger`,
				content,
				buttons: {},
				render: (html) => {
					const container   = html.find(".stonetop-ledger-container")[0];
					const list = html.find(".stonetop-ledger-list")[0];
					const selectAllEl = html.find(".stonetop-ledger-select-all")[0];

					const createDateHeader = (dateKey, dateLabel) => {
						const header = document.createElement("li");
						header.className = "stonetop-ledger-date-header";
						header.dataset.dateKey = dateKey;
						header.textContent = dateLabel;
						return header;
					};

					const refreshDateHeaders = () => {
						list.querySelectorAll(".stonetop-ledger-date-header").forEach(el => el.remove());
						let previous = null;
						for (const entry of [...list.querySelectorAll(".stonetop-ledger-entry")]) {
							const dateKey = entry.dataset.dateKey ?? "unknown";
							if (dateKey === previous) continue;
							list.insertBefore(createDateHeader(dateKey, entry.dataset.dateLabel ?? "Unknown date"), entry);
							previous = dateKey;
						}
					};

					const syncDateHeaders = () => {
						for (const header of list.querySelectorAll(".stonetop-ledger-date-header")) {
							let sibling = header.nextElementSibling;
							let hasVisibleEntry = false;
							while (sibling && !sibling.classList.contains("stonetop-ledger-date-header")) {
								if (sibling.classList.contains("stonetop-ledger-entry") && !sibling.hidden) {
									hasVisibleEntry = true;
									break;
								}
								sibling = sibling.nextElementSibling;
							}
							header.hidden = !hasVisibleEntry;
						}
					};

					const syncSelectAll = () => {
						const visibleRows = html.find(".stonetop-ledger-entry:not([hidden]) .stonetop-ledger-row-check");
						const total   = visibleRows.length;
						const checked = visibleRows.filter(":checked").length;
						selectAllEl.checked       = checked === total && total > 0;
						selectAllEl.indeterminate = checked > 0 && checked < total;
					};

					html.find(".stonetop-ledger-edit-check").on("change", ev => {
						container.classList.toggle("stonetop-ledger-edit-mode", ev.currentTarget.checked);
						if (!ev.currentTarget.checked) {
							html.find(".stonetop-ledger-row-check").prop("checked", false);
							syncSelectAll();
						}
					});

					html.find(".stonetop-ledger-select-all").on("change", ev => {
						html.find(".stonetop-ledger-entry:not([hidden]) .stonetop-ledger-row-check")
							.prop("checked", ev.currentTarget.checked);
					});

					html[0].addEventListener("change", ev => {
						if (ev.target.closest(".stonetop-ledger-row-check")) syncSelectAll();
					});

					wireLedgerFilters(html, () => { syncDateHeaders(); syncSelectAll(); });

					html.find(".stonetop-ledger-sort").on("change", ev => {
						const asc  = ev.currentTarget.value === "asc";
						const tagged = [...list.querySelectorAll(".stonetop-ledger-entry")]
							.map(el => [el, Number(el.dataset.timestamp)]);
						tagged.sort(([, ta], [, tb]) => asc ? ta - tb : tb - ta);
						tagged.forEach(([el]) => list.appendChild(el));
						refreshDateHeaders();
						syncDateHeaders();
					});

					html.find(".stonetop-ledger-delete-selected").on("click", async () => {
						const checked = [...html.find(".stonetop-ledger-row-check:checked")];
						if (!checked.length) return;

						const doDelete = async () => {
							const ids = new Set(
								checked.map(el => el.closest(".stonetop-ledger-entry").dataset.id)
							);
							checked.forEach(el => el.closest(".stonetop-ledger-entry")?.remove());
							refreshDateHeaders();
							syncDateHeaders();
							syncSelectAll();
							await SteadingLedger.deleteEntries(this.actor, ids);
						};

						if (checked.length === 1) {
							await doDelete();
							return;
						}

						Dialog.confirm({
							title: "Delete Ledger Entries",
							content: `<p>You're about to delete ${checked.length} entries. Are you sure?</p>`,
							yes: doDelete,
						});
					});
				},
			}, {
				width: 560,
				height: 640,
				classes: ["dialog", "stonetop-ledger-window"],
			}).render(true);
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
			// The avatar hover preview lives on document.body, so it survives the sheet's own
			// DOM being torn down — clear it here or it orphans if the sheet closes (e.g. Escape)
			// while the cursor is still over an avatar and no mouseleave ever fires.
			this._removeMemberAvatarPreview();
			return super.close(options);
		}

		async getData() {
			const context = await super.getData();
			context.stonetop = await this._stonetopSteading.buildSnapshot();
			context.stonetop.moves = STEADING_MOVES.map(move => ({
				...move,
				statChipLabel: STEADING_STAT_CHIP_LABELS[move.statLabel] ?? move.statLabel,
			}));
			context.stonetop.rollMode = this._sheetRollMode();
			context.stonetop.showRollStatChips = getRollStatChipsSetting();
			// Whether the whole moves sidebar is collapsed (defaults to expanded),
			// persisted per-actor, per-user.
			context.stonetop.sidebarCollapsed = getSidebarCollapsed(this.actor?.id);
			context.stonetop.enrichedNotes = await foundry.applications.ux.TextEditor.enrichHTML(context.stonetop.notes ?? "");
			context.stonetop.editMode = this._editMode;
			context.stonetop.canEdit = this.isEditable;
			// Per-section edit flags: a section is editable when the global header
			// wrench is on OR its own pencil is toggled.
			const sectionEdit = section => this.isSectionEditable(section);
			context.stonetop.edit = Object.fromEntries(
				STEADING_EDIT_SECTIONS.map(section => [section, sectionEdit(section)])
			);
			context.stonetop.recentlyEdited = Object.fromEntries(
				STEADING_EDIT_SECTIONS.map(section => [section, this._recentlyEditedSections.has(section)])
			);
			context.stonetop.hideUnearnedImprovements = this.actor.getFlag("stonetop_pwd", "hideUnearnedImprovements") ?? false;
			// Re-apply the user's expanded cards so they survive re-renders.
			for (const imp of context.stonetop.improvements ?? []) {
				imp.isOpen = this._openImprovements.has(imp.slug);
			}
			const threatsCtx = await this._buildThreatsContext();
			context.stonetop.threatGroups = threatsCtx.threatGroups;
			context.stonetop.canSeeThreats = threatsCtx.canSeeThreats;
			context.stonetop.isGM = game.user?.isGM ?? false;
			return context;
		}

		/** Resolve the steading's threat cards visible to this user (GM sees all; a player
		 *  sees only revealed pages, which are the only ones on their client anyway). */
		async _buildThreatsContext() {
			const isGM = game.user?.isGM ?? false;
			// A player's client only holds revealed threat entries, so listThreatPages already
			// yields just those for them; the isThreatRevealed filter is belt-and-suspenders.
			const pages = listThreatPages(this.actor).filter(p => isGM || isThreatRevealed(p));
			// Enrich every card VM concurrently (each page is independent) rather than
			// serializing the enrichHTML calls, then decorate with host collapse chrome.
			const vms = await Promise.all(pages.map(page => buildThreatCardVM(page)));
			const threats = vms.map((vm, i) => {
				vm.canDrag = isGM && vm.isOwner;
				// On this tab each card can clamp to its title + Instinct. Seed the current
				// state from the per-instance set (default expanded).
				vm.collapsible = true;
				vm.collapsed = this._collapsedThreats.has(pages[i].uuid);
				return vm;
			});
			// Group by proximity (Homefront / Nearby / Distant, Book I p. 288) in book order,
			// mirroring the Residents tab's stacked Player/Residents/Neighbors sections. The GM
			// always sees all three headers (prep view); a player only sees groups that have a
			// revealed threat, so they never get a bare "Distant Threats" header with nothing under it.
			const threatGroups = THREAT_PROXIMITIES
				.map(p => ({
					id: p.id,
					label: p.label,
					lowerLabel: p.label.toLowerCase(),
					hint: p.hint,
					threats: threats.filter(t => t.proximity.id === p.id),
				}))
				.filter(g => isGM || g.threats.length > 0);
			return { threatGroups, canSeeThreats: isGM || threats.length > 0 };
		}

		/** Threats tab interactions: doom-track toggles, reveal, drag-to-scene, edit / remove /
		 *  create. Self-gated per action (page ownership / GM), so it's independent of the
		 *  section edit-mode gate; delegated on the sheet root. */
		_activateThreatsListeners(root) {
			if (!root) return;

			wireThreatDoomChange(root, chk => fromUuid(chk.closest(".threat-card")?.dataset.pageUuid ?? ""));

			root.addEventListener("click", async ev => {
				// Toggling reveal updates the parent entry's ownership, which the actor sheet
				// doesn't observe — re-render so the eye and revealed tint update.
				if (await handleThreatRevealClick(ev, r => fromUuid(r.dataset.pageUuid))) { this.render(false); return; }
				const edit = ev.target.closest?.(".steading-threats .threat-edit-open");
				if (edit) { ev.preventDefault(); const page = await fromUuid(edit.dataset.pageUuid); if (page) this._openThreatEditor(page); return; }
				const remove = ev.target.closest?.(".steading-threats .threat-remove");
				if (remove) { ev.preventDefault(); const page = await fromUuid(remove.dataset.pageUuid); if (page) this._onDeleteThreat(page); return; }
				const add = ev.target.closest?.(".steading-threats .threat-add-btn");
				if (add) { ev.preventDefault(); this._onCreateThreat(add.dataset.proximity); return; }

				// Collapse / expand a card down to its title + Instinct. Any header click toggles
				// it (mirrors the Improvements tab); the reveal eye is excluded (handled and
				// returned above). A drag suppresses the click, so grabbing the header to pin it
				// doesn't also collapse it. State lives in _collapsedThreats so it survives
				// re-renders; no re-render, just a class flip.
				const head = ev.target.closest?.(".steading-threats .threat-card__head--collapsible");
				if (head) {
					const card = head.closest(".threat-card");
					if (!card) return;
					const collapsed = card.classList.toggle("is-collapsed");
					card.querySelector(".threat-collapse-btn")?.setAttribute("aria-expanded", String(!collapsed));
					const uuid = card.dataset.pageUuid;
					if (uuid) collapsed ? this._collapsedThreats.add(uuid) : this._collapsedThreats.delete(uuid);
				}
			});

			// The whole card is the drag handle (no separate grip): grab it anywhere to drop
			// a pinned Note on a scene. A plain click still toggles collapse (a drag suppresses
			// the click), and interactive children (doom checks, reveal eye, tools) keep working.
			// Shares the one drag-wiring helper with the page sheet so the selector can't diverge.
			wireThreatCardDrag(root, { selector: ".steading-threats .threat-card[draggable='true']" });
		}

		/** Open a threat's editor (a proper movable dialog, not the page sheet standalone). */
		_openThreatEditor(page) {
			if (page) new ThreatEditorDialog(page).render(true);
		}

		async _onDeleteThreat(page) {
			const ok = await Dialog.confirm({
				title: "Delete Threat",
				content: `<p>Delete <strong>${escHtml(page.name)}</strong>? This removes its card and any pins placed on scenes.</p>`,
				options: { classes: ["dialog", "stonetop", "stonetop-delete-threat-dialog"] },
			});
			if (!ok) return;
			await deleteThreat(page);
			this.render(false);
		}

		async _onCreateThreat(defaultProximity) {
			const seed = await new CreateThreatDialog(this.actor, { defaultProximity }).promise();
			if (!seed) return;
			const page = await createThreat(this.actor, seed);
			this.render(false);
			if (page) this._openThreatEditor(page);
		}

		activateListeners(html) {
			super.activateListeners(html);
			wrapStonetopGlyphsInEl(html[0]);
			this._activateThreatsListeners(html[0]);

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

			// Swap the resident/neighbor fields' native <datalist> popups (occupation,
			// traits, home) for our scrollable one — Chromium's native popup has no
			// scrollbar for long lists. See utils/autocomplete.js.
			StonetopAutocomplete.upgradeAll(html);

			applyLabelTooltips(html, {
				selector: ".steading-stat-label[data-steading-stat], .steading-section-label[data-steading-stat]", datasetKey: "steadingStat",
				table: STEADING_STAT_TOOLTIPS, settingKey: "hoverDescriptionsSteadingStats", direction: "UP",
			});

			// Rollable move buttons (both editable and read-only)
			html[0].addEventListener("click", ev => {
				const btn = ev.target.closest(".steading-roll-btn");
				if (!btn) return;
				ev.stopPropagation();
				this._onSteadingRoll(btn.dataset.moveName, btn.dataset.stat);
			}, true);

			html.find(".stonetop-roll-mode-input").on("change", async (ev) => {
				await this.actor.setFlag(STONETOP_SCOPE, "rollMode", _normalizeSheetRollMode(ev.currentTarget.value));
				this.render(false);
			});

			// Collapse / expand the whole moves sidebar (Roll Modifier + Homefront Moves).
			// Toggling a class (rather than re-rendering) lets the tab content reclaim
			// the freed width without flicker; the state is persisted so the sidebar
			// reopens the same way.
			html.find(".stonetop-sidebar-toggle").on("click", ev => {
				const sidebar = ev.currentTarget.closest(".stonetop-moves-sidebar");
				if (!sidebar) return;
				const collapsed = sidebar.classList.toggle("is-collapsed");
				ev.currentTarget.setAttribute("aria-expanded", String(!collapsed));
				ev.currentTarget.setAttribute("aria-label", collapsed ? "Expand moves sidebar" : "Collapse moves sidebar");
				setSidebarCollapsed(this.actor?.id, collapsed);
			});

			// Clicking the move name or its "+STAT" chip rolls the same as tapping the dice icon beside it.
			html.find(".stonetop-steading-move-open, .stonetop-move-roll-chip").on("click", ev => {
				const li = ev.currentTarget.closest("li");
				const rollable = li?.querySelector(".steading-roll-btn, .steading-interactive-btn");
				if (rollable) rollable.click();
			});

			// Interactive move buttons (e.g. Meet with Disaster)
			html[0].addEventListener("click", ev => {
				const btn = ev.target.closest(".steading-interactive-btn");
				if (!btn) return;
				ev.stopPropagation();
				const { moveSlug } = btn.dataset;
				if (moveSlug === "meetWithDisaster") this._onMeetWithDisaster();
				else if (moveSlug === "requisition") this._onRequisitionWalkthrough();
				else if (moveSlug === "returnTriumphant") this._onReturnTriumphant();
				else if (moveSlug === "seasonsChange") this._onSeasonsChange();
				else if (HOMESTEAD_MOVE_FLOWS[moveSlug]) this._onHomesteadMove(moveSlug);
			}, true);

			this._movePanel?.remove();
			if (getHoverDescriptionSetting("hoverDescriptionsBasicMoves")) {
				const panel = document.createElement("div");
				this._movePanel = panel;
				panel.className = "stonetop-basic-move-panel";
				panel.hidden = true;
				document.body.appendChild(panel);

				html.find(".steading-move-row").on("mouseenter", ev => {
					const li = ev.currentTarget;
					const descEl = li.querySelector(".stonetop-basic-move-desc");
					if (!descEl) return;
					const nameText = li.querySelector(".stonetop-move-name")?.textContent?.trim() ?? "";
					const nameEl = document.createElement("strong");
					nameEl.className = "stonetop-basic-move-panel-name";
					nameEl.textContent = nameText;
					panel.replaceChildren(nameEl, ...Array.from(descEl.cloneNode(true).childNodes));
					panel.hidden = false;
					const rect = li.getBoundingClientRect();
					panel.style.top   = `${Math.max(4, Math.min(rect.top, window.innerHeight - panel.offsetHeight - 8))}px`;
					panel.style.right = `${window.innerWidth - rect.left + 8}px`;
				}).on("mouseleave", () => {
					panel.hidden = true;
				});
			}

			// Improvement card expand/collapse. The open state is mirrored into
			// _openImprovements so it persists across re-renders (see getData).
			html[0].addEventListener("click", ev => {
				const hdr = ev.target.closest(".steading-improvement-header");
				if (!hdr) return;
				if (ev.target.closest(".steading-improvement-complete-label")) return;
				if (ev.target.closest(".steading-improvement-remove")) return;
				const card = hdr.closest(".steading-improvement");
				if (!card) return;
				const open = card.classList.toggle("is-open");
				const slug = card.dataset.slug;
				if (slug) open ? this._openImprovements.add(slug) : this._openImprovements.delete(slug);
			}, true);

			html[0].addEventListener("change", ev => {
				const cb = ev.target.closest(".steading-hide-unearned-improvements-check");
				if (!cb) return;
				ev.stopPropagation();
				this.actor.setFlag("stonetop_pwd", "hideUnearnedImprovements", cb.checked);
			}, true);

			// Per-section edit toggle (pencil/check at each section's corner) flips
			// just that section's edit state, independent of the global wrench. The
			// fade-out "done" check is driven by the _onSectionEdit* hooks above.
			this._wireSectionEditToggle(html, ".steading-section-edit-toggle");

			// Add resident / neighbor — allowed even outside edit mode
			html[0].addEventListener("click", ev => {
				const btn = ev.target.closest(".steading-list-add");
				if (!btn) return;
				if (!["residents", "neighbors"].includes(btn.dataset.list)) return;
				ev.stopPropagation();
				this._onListItemAdd(btn.dataset.list);
			}, true);

			// Drag-resizable columns on the player/resident/neighbor tables — useful in both edit and read-only modes.
			html[0].querySelectorAll(".steading-residents-table[data-resize-key]").forEach(table => {
				makeColumnsResizable(table, table.dataset.resizeKey);
			});

			html[0].addEventListener("mouseenter", ev => {
				const avatar = ev.target.closest?.(".steading-member-avatar");
				if (!avatar) return;
				this._showMemberAvatarPreview(avatar);
			}, true);
			html[0].addEventListener("mouseleave", ev => {
				if (!ev.target.closest?.(".steading-member-avatar")) return;
				this._removeMemberAvatarPreview();
			}, true);
			html[0].addEventListener("click", ev => {
				const avatar = ev.target.closest(".steading-member-avatar");
				if (!avatar) return;
				ev.stopPropagation();
				this._openMemberAvatarImage(avatar);
			}, true);

			if (!this.isEditable) return;

			// Stat tracks use custom radio markup, so persist them explicitly.
			html[0].addEventListener("change", ev => {
				const input = ev.target;
				if (input.type !== "radio" || !input.name || !input.closest(".steading-track-option")) return;
				ev.stopPropagation();
				this._onSteadingTrackChange(input.name, Number(input.value));
			}, true);

			// Surplus is in the custom stat bar, so persist it explicitly.
			const onSurplusInput = ev => {
				const input = ev.target.closest(".steading-surplus-input");
				if (!input) return;
				ev.stopPropagation();
				this._onSteadingTrackChange(input.name, Math.max(0, parseInt(input.value) || 0));
			};
			html[0].addEventListener("input", onSurplusInput, true);
			html[0].addEventListener("change", onSurplusInput, true);

			// Debilities live in the same custom bar and need the same legacy-safe persistence.
			html[0].addEventListener("change", ev => {
				const input = ev.target.closest(".steading-debility-check");
				if (!input) return;
				ev.stopPropagation();
				this._onSteadingTrackChange(input.name, input.checked);
			}, true);

			// List item checked toggle (resources, fortifications, assets)
			html[0].addEventListener("change", ev => {
				const cb = ev.target.closest(".steading-list-check");
				if (!cb) return;
				ev.stopPropagation();
				const { list, index } = cb.dataset;
				this._onListItemCheck(list, parseInt(index), cb.checked);
			}, true);

			// Click a requisitioned ("taken") asset to return it to the steading.
			html[0].addEventListener("click", ev => {
				const taken = ev.target.closest(".steading-asset-taken");
				if (!taken) return;
				ev.stopPropagation();
				this._onReturnAsset(parseInt(taken.dataset.index));
			}, true);

			// Add list item (residents/neighbors are handled above, regardless of edit mode)
			html[0].addEventListener("click", ev => {
				const btn = ev.target.closest(".steading-list-add");
				if (!btn) return;
				if (["residents", "neighbors"].includes(btn.dataset.list)) return;
				ev.stopPropagation();
				this._onListItemAdd(btn.dataset.list);
			}, true);

			// Delete list item
			html[0].addEventListener("click", ev => {
				const btn = ev.target.closest(".steading-list-delete");
				if (!btn) return;
				ev.stopPropagation();
				const { list, index } = btn.dataset;
				this._onListItemDelete(btn.dataset.list, parseInt(index));
			}, true);

			// Places of interest names
			html[0].addEventListener("change", ev => {
				const inp = ev.target.closest(".steading-place-name");
				if (!inp) return;
				ev.stopPropagation();
				this._onPlaceChange(parseInt(inp.dataset.index), inp.value);
			}, true);

// Resident / neighbor / player details
		html[0].addEventListener("change", ev => {
			const inp = ev.target.closest(".steading-resident-input");
			if (!inp) return;
			ev.stopPropagation();
			const { index, field, list } = inp.dataset;
			if (list === "players") {
				this._onPlayerFieldChange(parseInt(index), field, inp.value);
			} else if (list === "neighbors") {
				this._onNeighborChange(parseInt(index), field, inp.value);
			} else {
				this._onResidentChange(parseInt(index), field, inp.value);
			}
			}, true);

			// Notes
			html[0].addEventListener("change", ev => {
				const pm = ev.target.closest("prose-mirror.steading-notes-editor");
				if (!pm) return;
				ev.stopPropagation();
				this._onNotesChange(pm.value);
			}, true);

			// Size radio
			html[0].addEventListener("change", ev => {
				const radio = ev.target.closest(".steading-size-radio");
				if (!radio) return;
				ev.stopPropagation();
				this._stonetopSteading.setFlags({ size: radio.value });
			}, true);

			// Currency
			html[0].addEventListener("change", ev => {
				const inp = ev.target.closest(".steading-currency-input");
				if (!inp) return;
				ev.stopPropagation();
				const { currency, field } = inp.dataset;
				this._onCurrencyChange(currency, field, parseInt(inp.value) || 0);
			}, true);

			// Improvement complete checkbox
			html[0].addEventListener("change", ev => {
				const cb = ev.target.closest(".steading-improvement-complete");
				if (!cb) return;
				ev.stopPropagation();
				this._onImprovementComplete(cb.dataset.slug, cb.checked);
			}, true);

			// Improvement requirement checkbox
			html[0].addEventListener("change", ev => {
				const cb = ev.target.closest(".steading-improvement-req");
				if (!cb) return;
				ev.stopPropagation();
				const { slug, index } = cb.dataset;
				this._onImprovementReq(slug, parseInt(index), cb.checked);
			}, true);

			// Herd of Horses tracker: +/- steppers and direct number entry per age tier.
			html[0].addEventListener("click", ev => {
				const btn = ev.target.closest(".steading-herd-step");
				if (!btn) return;
				ev.stopPropagation();
				this._onHerdStep(btn.dataset.tier, parseInt(btn.dataset.delta) || 0);
			}, true);
			html[0].addEventListener("change", ev => {
				const inp = ev.target.closest(".steading-herd-input");
				if (!inp) return;
				ev.stopPropagation();
				this._onHerdInput(inp.dataset.tier, inp.value);
			}, true);

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
					if (data?.type === "Actor" && data.uuid) {
						const actor = await fromUuid(data.uuid);
						if (actor && actor.type === "character") {
							await this._onDropPlayerCharacter(actor);
						}
					}
				}, true);
			}

			// Drop a "Steading Improvement" card (dragged from a journal) onto the
			// Improvements tab to add it as a tracked custom improvement.
			const improvementsTab = html[0].querySelector(".tab.improvements");
			if (improvementsTab) {
				const setDrag = on => improvementsTab.classList.toggle("steading-improvement-drag-over", on);
				improvementsTab.addEventListener("dragover", (ev) => {
					ev.preventDefault();
					ev.dataTransfer.dropEffect = "copy";
					setDrag(true);
				});
				improvementsTab.addEventListener("dragleave", (ev) => {
					if (!improvementsTab.contains(ev.relatedTarget)) setDrag(false);
				});
				improvementsTab.addEventListener("drop", async (ev) => {
					const data = getDragEventData(ev);
					if (data?.type !== STEADING_IMPROVEMENT_DRAG_TYPE) return;
					ev.preventDefault();
					ev.stopPropagation();
					setDrag(false);
					await this._onDropSteadingImprovement(data.improvement);
				});
			}

			// Remove a custom (journal-sourced) improvement.
			html[0].addEventListener("click", (ev) => {
				const btn = ev.target.closest(".steading-improvement-remove");
				if (!btn) return;
				ev.stopPropagation();
				this._onRemoveCustomImprovement(btn.dataset.slug);
			}, true);

			// Create a custom improvement from a small form (the button counterpart to
			// dropping a journal card onto the tab).
			html.find(".steading-improvement-add-btn").on("click", () => this._onCreateImprovementOpen());
		}

		_removeMemberAvatarPreview() {
			document.querySelector(".steading-member-avatar-preview")?.remove();
		}

		_showMemberAvatarPreview(anchor) {
			this._removeMemberAvatarPreview();
			if (!anchor?.src) return;
			const popup = document.createElement("div");
			popup.className = "steading-member-avatar-preview";
			const img = document.createElement("img");
			img.src = anchor.src;
			img.alt = "";
			popup.appendChild(img);
			const name = anchor.dataset.name?.trim();
			if (name) {
				const caption = document.createElement("strong");
				caption.textContent = name;
				popup.appendChild(caption);
			}
			document.body.appendChild(popup);

			const ar = anchor.getBoundingClientRect();
			const gap = 8;
			const pw = popup.offsetWidth;
			const ph = popup.offsetHeight;
			let top = ar.bottom + gap;
			if (top + ph > window.innerHeight - 8) top = ar.top - ph - gap;
			let left = ar.left + ar.width / 2 - pw / 2;
			top = Math.max(8, top);
			left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
			popup.style.top = `${top}px`;
			popup.style.left = `${left}px`;
			const z = parseInt(this.element?.[0]?.style?.zIndex || 0);
			popup.style.setProperty("z-index", String(Math.max(10000, z + 2)), "important");
		}

		_openMemberAvatarImage(anchor) {
			this._removeMemberAvatarPreview();
			if (!anchor?.src) return;
			const popout = this._createEditableMemberImagePopout(anchor);
			popout.render(true);
			this._scheduleMemberImageHeaderControl(popout);
		}

		_createEditableMemberImagePopout(anchor) {
			const list = anchor?.dataset?.list;
			const index = Number.parseInt(anchor?.dataset?.index ?? "", 10);
			const canEdit = this.isEditable && ["residents", "neighbors"].includes(list) && Number.isInteger(index);
			const sheet = this;
			const BaseImagePopout = globalThis.ImagePopout;
			if (!canEdit || !BaseImagePopout) {
				return new ImagePopout(anchor.src, {
					title:  anchor.dataset.name ?? "",
					width:  560,
					height: 620,
				});
			}
			const popout = new BaseImagePopout(anchor.src, {
				title:  anchor.dataset.name ?? "",
				width:  560,
				height: 620,
			});
			popout._stonetopMemberImageEdit = { sheet, list, index, current: anchor.src };
			return popout;
		}

		_scheduleMemberImageHeaderControl(popout) {
			if (!popout?._stonetopMemberImageEdit) return;
			const inject = () => this._injectMemberImageHeaderControl(popout);
			if (typeof requestAnimationFrame === "function") requestAnimationFrame(inject);
			setTimeout(inject, 0);
			setTimeout(inject, 100);
		}

		_injectMemberImageHeaderControl(popout) {
			const edit = popout?._stonetopMemberImageEdit;
			const root = popout?.element?.jquery ? popout.element[0] : popout?.element;
			const header = root?.querySelector?.(".window-header");
			if (!edit || !header) return;
			if (header.querySelector(".stonetop-edit-member-photo")) return;

			const isAppV1 = !!header.querySelector("a.header-button");
			const btn = document.createElement(isAppV1 ? "a" : "button");
			if (!isAppV1) {
				btn.type = "button";
				btn.className = "header-control icon stonetop-edit-member-photo fa-solid fa-camera";
			} else {
				btn.className = "header-button control stonetop-edit-member-photo";
				btn.innerHTML = `<i class="fas fa-camera"></i> Edit Photo`;
			}
			btn.setAttribute("data-tooltip", "Edit Photo");
			btn.setAttribute("aria-label", "Edit Photo");
			btn.addEventListener("click", ev => {
				ev.preventDefault();
				ev.stopPropagation();
				this._onMemberAvatarPickImage({
					list: edit.list,
					index: edit.index,
					current: popout.src ?? edit.current,
					popout,
				});
			});

			const firstControl = header.querySelector(isAppV1 ? "a.header-button" : "button.header-control");
			if (firstControl) header.insertBefore(btn, firstControl);
			else header.appendChild(btn);
		}

		_onMemberAvatarPickImage({ list, index, current, popout }) {
			const FilePickerClass = foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
			if (!FilePickerClass) return;
			new FilePickerClass({
				type: "image",
				current,
				callback: async path => {
					await this._onMemberAvatarImageChange(list, index, path);
					if (popout) {
						this._refreshMemberImagePopout(popout, path);
					}
					this.render(false);
				},
			}).render(true);
		}

		_refreshMemberImagePopout(popout, path) {
			if (!popout || !path) return;
			popout.src = path;
			if (popout.options) popout.options.src = path;
			if (popout.object) popout.object.src = path;
			if (popout._stonetopMemberImageEdit) popout._stonetopMemberImageEdit.current = path;

			const root = popout.element?.jquery ? popout.element[0] : popout.element;
			const img = root?.querySelector?.(".window-content img, img");
			if (img) {
				img.src = path;
				img.setAttribute?.("src", path);
				return;
			}

			popout.render?.(false);
			this._scheduleMemberImageHeaderControl(popout);
		}

		async _onMemberAvatarImageChange(list, index, value) {
			if (!["residents", "neighbors"].includes(list) || !Number.isInteger(index)) return;
			const f = this._stonetopSteading._flags;
			const arr = foundry.utils.deepClone(f[list] ?? STEADING_DEFAULTS[list]);
			if (!arr[index]) return;
			arr[index].img = value;
			await this._stonetopSteading.setFlags({ [list]: arr });
		}

		_onHomesteadMove(moveSlug) {
			const flow = HOMESTEAD_MOVE_FLOWS[moveSlug];
			if (!flow) return;

			const fieldHtml = flow.fields.map(field => {
				if (field.type === "checkbox") {
					return `<label class="stonetop-homestead-field stonetop-homestead-field--check">
						<input type="checkbox" class="stonetop-check" name="${_esc(field.name)}" value="yes">
						<span>${_esc(field.label)}</span>
					</label>`;
				}
				const common = `name="${_esc(field.name)}" placeholder="${_esc(field.placeholder)}"`;
				const control = field.type === "textarea"
					? `<textarea ${common} rows="2"></textarea>`
					: field.type === "number"
						? `<input type="number" ${common} min="${field.min ?? 0}" value="${field.value ?? ""}">`
						: `<input type="text" ${common}>`;
				return `<label class="stonetop-homestead-field">
					<span>${_esc(field.label)}</span>
					${control}
				</label>`;
			}).join("");

			const picksHtml = flow.picks?.length
				? `<div class="stonetop-homestead-reference">
					<strong>${_esc(flow.picksLabel ?? "Choose from:")}</strong>
					<div class="stonetop-homestead-choice-list">
						${flow.picks.map((item, index) => `<label class="stonetop-homestead-choice">
							<input type="checkbox" class="stonetop-check" name="pick.${index}" value="${_esc(item)}">
							<span>${_esc(item)}</span>
						</label>`).join("")}
					</div>
				</div>`
				: "";

			const consequencesHtml = flow.consequences?.length
				? `<div class="stonetop-homestead-reference">
					<strong>${_esc(flow.consequencesLabel ?? "Consequences")}</strong>
					<div class="stonetop-homestead-choice-list">
						${flow.consequences.map((item, index) => `<label class="stonetop-homestead-choice">
							<input type="checkbox" class="stonetop-check" name="consequence.${index}" value="${_esc(item)}">
							<span>${_esc(item)}</span>
						</label>`).join("")}
					</div>
					${flow.label === "Deploy" ? `<button type="button" class="stonetop-season-btn" data-action="mark-diminished"><i class="fas fa-band-aid"></i> Mark diminished</button>` : ""}
				</div>`
				: "";

			const resultsHtml = _resultsLegendHtml(flow.results);

			// Trade & Barter is how special items are acquired — let the player pick one
			// from the handout list (which fills the item + Value fields for the roll).
			const specialItemHtml = flow.label === "Trade & Barter"
				? `<button type="button" class="stonetop-tb-special-btn"><i class="fas fa-gem"></i> Choose a special item…</button>`
				: "";

			const dialog = new Dialog({
				title: flow.label,
				content: `<form class="stonetop-homestead-dialog">
					<p class="stonetop-homestead-trigger"><em>${_esc(flow.trigger)}</em></p>
					<div class="stonetop-homestead-fields">${fieldHtml}</div>
					${specialItemHtml}
					${resultsHtml}
					${picksHtml}
					${consequencesHtml}
					<p class="stonetop-homestead-note">${_esc(flow.note)}</p>
				</form>`,
				buttons: {
					cancel: { label: "Cancel" },
					roll: {
						label: `Roll +${flow.statLabel}`,
						callback: async html => {
							await this._postHomesteadMoveSummary(flow, html);
							await this._applyHomesteadBeforeRoll(flow);
							await this._onSteadingRoll(flow.label, flow.stat, this._homesteadRollOptions(flow, html));
						},
					},
				},
				default: "roll",
				render: (html) => {
					html[0].querySelector("[data-action='mark-diminished']")?.addEventListener("click", async () => {
						await this._stonetopSteading.setSystemValue("attributes.debilities.options.diminished.value", true);
						this.render(false);
						ui.notifications.info("Stonetop marked diminished.");
					});
					html[0].querySelector(".stonetop-tb-special-btn")?.addEventListener("click", () => this._onPickSpecialItem(html));
				},
			}, {
				width: 520,
				classes: ["dialog", "stonetop", "stonetop-homestead-move-dialog"],
			});
			dialog.render(true);
		}

		// Trade & Barter: open the Special Items picker. Picking an item fills the move's
		// item + Value fields and adds it to a chosen character's inventory.
		_onPickSpecialItem(dialogHtml) {
			const picker = new SpecialItemPickerDialog(SPECIAL_ITEM_CATALOG, async (slug) => {
				const item = SPECIAL_ITEM_CATALOG.flatMap(g => g.items).find(i => i.slug === slug);
				if (!item) return;
				const wantField  = dialogHtml[0].querySelector('[name="want"]');
				const valueField = dialogHtml[0].querySelector('[name="value"]');
				if (wantField)  wantField.value  = item.traits ? `${item.name} (${item.traits})` : item.name;
				if (valueField) valueField.value = parseInt(item.value, 10) || 0;

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

		_homesteadRollOptions(flow, html) {
			const options = {
				moveResults: _moveResultsFromRows(flow.results),
				resultLegend: _resultsLegendHtml(flow.results),
			};
			if (flow.label !== "Trade & Barter") return options;
			const data = this._formDataFromDialog(html);
			const value = Math.max(0, parseInt(data.value) || 0);
			return {
				...options,
				modifier: value ? -value : 0,
				rollMode: data.winter ? "dis" : undefined,
			};
		}

		async _postHomesteadMoveSummary(flow, html) {
			const data = this._formDataFromDialog(html);
			const rows = flow.fields
				.map(field => {
					const raw   = data[field.name];
					const value = field.type === "checkbox"
						? (raw ? "yes" : "")
						: String(raw ?? "").trim();
					return value ? { label: field.label, value } : null;
				})
				.filter(Boolean);

			const selectedPicks = Object.entries(data)
				.filter(([key]) => key.startsWith("pick.") || key.startsWith("consequence."))
				.map(([, value]) => String(value ?? "").trim())
				.filter(Boolean);
			if (selectedPicks.length) rows.push({ label: "Selected", value: selectedPicks.join("\n") });

			postMoveToChat(this.actor, flow.label, rows);
		}

		async _onMeetWithDisaster() {
			const fortunes = this._stonetopSteading.getStatValue("fortunes");
			const wouldDropBelow = fortunes <= -1;

			if (!wouldDropBelow) {
				const newFortunes = fortunes - 1;
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
							callback: async () => {
								await this._stonetopSteading.setSystemValue("stats.fortunes.value", newFortunes);
								this.render(false);
							},
						},
					},
					default: "apply",
				}, { classes: ["dialog", "stonetop", "stonetop-disaster-move-dialog"] }).render(true);
				return;
			}

			// Fortunes is at -1 — would drop further; GM picks a consequence instead.
			const choices = [
				{
					id: "diminished",
					label: "Diminished",
					detail: "from injuries/sickness/doubt — disadvantage to Deploy, Muster, Pull Together",
					action: () => this._stonetopSteading.setSystemValue("attributes.debilities.options.diminished.value", true),
				},
				{
					id: "lacking",
					label: "Lacking",
					detail: "due to shortages/hoarding/distrust — treat Prosperity as 1 lower",
					action: () => this._stonetopSteading.setSystemValue("attributes.debilities.options.lacking.value", true),
				},
				{
					id: "malcontent",
					label: "Malcontent",
					detail: "from fear/anger/despair — Fortunes reset to +0 each season; folks need Persuading more often",
					action: () => this._stonetopSteading.setSystemValue("attributes.debilities.options.malcontent.value", true),
				},
				{
					id: "population",
					label: "Folks start to leave",
					detail: "reduce Population by 1 (min −1)",
					action: () => {
						const pop = this._stonetopSteading.getStatValue("population");
						return this._stonetopSteading.setSystemValue("attributes.population.value", Math.max(pop - 1, -1));
					},
				},
			];

			const choicesHtml = choices.map(c => `
				<li class="stonetop-disaster-choice" data-choice="${c.id}">
					<span class="stonetop-disaster-choice-label">${c.label}</span>
					<span class="stonetop-disaster-choice-detail">${c.detail}</span>
				</li>`).join("");

			let dialog;
			dialog = new Dialog({
				title: "Meet with Disaster",
				content: `<div class="stonetop-disaster-dialog">
					<p><em>Fortunes cannot drop below −1.</em> The GM picks 1:</p>
					<ol class="stonetop-disaster-choices">${choicesHtml}</ol>
				</div>`,
				buttons: { cancel: { label: "Cancel" } },
				render: (html) => {
					html[0].querySelectorAll(".stonetop-disaster-choice").forEach(el => {
						el.addEventListener("click", async () => {
							const choice = choices.find(c => c.id === el.dataset.choice);
							if (!choice) return;
							await choice.action();
							this.render(false);
							dialog.close();
						});
					});
				},
			}, { classes: ["dialog", "stonetop", "stonetop-disaster-move-dialog"] });
			dialog.render(true);
		}

		// Return Triumphant: clear one marked steading debility. If none are marked,
		// increase Fortunes by 1 instead. Mirrors the Meet with Disaster walkthrough
		// (its inverse — that one marks debilities / drops Fortunes). Writes are
		// attributed to the move so the steading ledger reads "via Return Triumphant".
		async _onReturnTriumphant() {
			const DEBILITIES = [
				{ id: "diminished", label: "Diminished", detail: "disadvantage to Deploy, Muster, Pull Together" },
				{ id: "lacking",    label: "Lacking",    detail: "treat Prosperity as 1 lower" },
				{ id: "malcontent", label: "Malcontent", detail: "Fortunes reset to +0 each season; folks need Persuading more often" },
			];
			const marked = DEBILITIES.filter(d =>
				this._stonetopSteading.getSystemValue(`attributes.debilities.options.${d.id}.value`, false));

			// No debilities marked → the move raises Fortunes by 1 instead.
			if (marked.length === 0) {
				const fortunes = this._stonetopSteading.getStatValue("fortunes");
				const newFortunes = fortunes + 1;
				new Dialog({
					title: "Return Triumphant",
					content: `<div class="stonetop-disaster-dialog">
						<p><em>You return home in triumph, and the steading has no debilities marked.</em></p>
						<p>Fortunes: <strong>${sign(fortunes)}</strong> → <strong>${sign(newFortunes)}</strong></p>
					</div>`,
					buttons: {
						cancel: { label: "Cancel" },
						apply: {
							label: "Increase Fortunes",
							callback: async () => {
								await this._stonetopSteading.setSystemValue("stats.fortunes.value", newFortunes, { stonetopMove: "Return Triumphant" });
								this.render(false);
							},
						},
					},
					default: "apply",
				}, { classes: ["dialog", "stonetop", "stonetop-disaster-move-dialog"] }).render(true);
				return;
			}

			// One or more debilities marked → the GM clears 1.
			const choicesHtml = marked.map(d => `
				<li class="stonetop-disaster-choice" data-choice="${d.id}">
					<span class="stonetop-disaster-choice-label">${d.label}</span>
					<span class="stonetop-disaster-choice-detail">${d.detail}</span>
				</li>`).join("");

			let dialog;
			dialog = new Dialog({
				title: "Return Triumphant",
				content: `<div class="stonetop-disaster-dialog">
					<p><em>You return home in triumph.</em> Clear 1 of the steading's debilities:</p>
					<ol class="stonetop-disaster-choices">${choicesHtml}</ol>
				</div>`,
				buttons: { cancel: { label: "Cancel" } },
				render: (html) => {
					html[0].querySelectorAll(".stonetop-disaster-choice").forEach(el => {
						el.addEventListener("click", async () => {
							const choice = marked.find(d => d.id === el.dataset.choice);
							if (!choice) return;
							await this._stonetopSteading.setSystemValue(`attributes.debilities.options.${choice.id}.value`, false, { stonetopMove: "Return Triumphant" });
							this.render(false);
							dialog.close();
						});
					});
				},
			}, { classes: ["dialog", "stonetop", "stonetop-disaster-move-dialog"] });
			dialog.render(true);
		}

		async _onRequisitionWalkthrough() {
			const fortunes = this._stonetopSteading.getStatValue("fortunes");
			const newFortunes = Math.max(fortunes - 1, -1);
			const availableAssets = this._stonetopSteading.getAvailableAssets();
			const assetOptions = availableAssets
				.map(asset => `<option value="${escHtml(asset.name)}">${escHtml(asset.name)}</option>`)
				.join("");
			const requisitionFlow = {
				label: "Requisition",
				fields: [
					{ name: "asset", label: "Asset" },
					{ name: "risk", label: "Risk" },
					{ name: "convincing", label: "Who needs convincing?" },
				],
			};
			// Single source for the three outcome lines; both the dialog reference block
			// and the chat card's legend + per-tier text derive from it (see the season flows).
			const requisitionResults = [
				RESULT.strong("go ahead, but bring it back safely."),
				RESULT.weak("you will need to do some convincing."),
				RESULT.miss("do not mark XP; you can take the asset, but if you do, reduce Fortunes by 1."),
			];

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
						<label class="stonetop-homestead-field">
							<span>Risk</span>
							<textarea name="risk" rows="2" placeholder="Where is it going, and how might it be lost or damaged?"></textarea>
						</label>
						<label class="stonetop-homestead-field">
							<span>Who needs convincing?</span>
							<input type="text" name="convincing" placeholder="Owner, family, council, militia, publican...">
						</label>
					</div>
					${_resultsLegendHtml(requisitionResults)}
				</form>`,
				buttons: {
					cancel: { label: "Cancel" },
					roll: {
						label: "Roll +Fortunes",
						callback: async html => {
							await this._postHomesteadMoveSummary(requisitionFlow, html);
							await this._onSteadingRoll("Requisition", "fortunes", {
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
		// _saveSeasonChange), so the season picker defaults to the latest year.
		_seasonsCurrentYear() {
			return Math.max(1, Math.trunc(Number(this.actor.getFlag(STONETOP_SCOPE, "seasonsCurrentYear")) || 1));
		}

		async _onSeasonsChange() {
			// Ids + labels come from the shared season source, not a local copy.
			const SEASONS = SEASON_IDS.map(id => ({ id, label: seasonLabel(id) }));
			// Year dropdown under the season cards: every year up to the current one
			// (Winter completion bumps it), defaulting to the latest so the journal page
			// matches by default. The chosen year rides through to recordSeasonsChange.
			const currentYear  = this._seasonsCurrentYear();
			const yearOptions  = Array.from({ length: currentYear }, (_, i) => i + 1)
				.map(y => `<option value="${y}"${y === currentYear ? " selected" : ""}>${ordinalWord(y)} Year</option>`)
				.join("");
			let dialog;
			dialog = new Dialog({
				title: "Seasons Change",
				content: `<div class="stonetop-season-picker">
					<p><em>Which season is beginning?</em></p>
					<div class="stonetop-season-cards">
						${SEASONS.map(s => `
							<div class="stonetop-season-card" data-season="${s.id}">
								<img src="${seasonIconSrc(s.id)}" alt="${s.label}" class="stonetop-season-icon">
								<span class="stonetop-season-label">${s.label}</span>
							</div>`).join("")}
					</div>
					<div class="stonetop-season-year">
						<label class="stonetop-season-year-label" for="stonetop-season-year-select">Year</label>
						<select id="stonetop-season-year-select" class="stonetop-season-year-select">${yearOptions}</select>
					</div>
				</div>`,
				buttons: {},
				render: (html) => {
					addStonetopSteadingButton(html);
					const yearSelect = html[0].querySelector(".stonetop-season-year-select");
					html[0].querySelectorAll(".stonetop-season-card").forEach(el => {
						el.addEventListener("click", () => {
							const year = Math.trunc(Number(yearSelect?.value)) || currentYear;
							dialog.close();
							this._showSeasonDialog(el.dataset.season, year);
						});
					});
				},
			}, { classes: ["dialog", "stonetop", "stonetop-season-picker-dialog"] });
			dialog.render(true);
		}

		// Read the season dialog's ticked gains + notes off the DOM (Done), apply the two
		// gains with a mechanical effect (Population boom, Unexpected bounty), reset Fortunes
		// for the new season, record this season into the chosen `year`'s page of the
		// "Seasons Change" Chronicle journal (with the net Surplus change since the dialog
		// opened), then open it. Completing a Winter advances the steading's current year so
		// the next picker defaults to the new one. GM-only.
		async _saveSeasonChange(seasonId, html, fortunes, resetFortunes = 1, initialSurplus = null, year = this._seasonsCurrentYear()) {
			const root = html?.jquery ? html[0] : (html?.[0] ?? html);
			if (!root) return;
			const checkedKeys = Array.from(root.querySelectorAll(".stonetop-season-gain-check:checked"))
				.map(el => el.dataset.gainKey);
			const gainNames = checkedKeys
				.map(key => SEASONAL_GAINS.find(g => g.key === key)?.name)
				.filter(Boolean);

			// Apply the mechanical gains the GM ticked (the others are narrative-only) and
			// reset Fortunes in one update — all effects of the Seasons Change homefront
			// move, so the ledger names it; batching keeps it to a single ledger append and
			// one combined stat-change card. Notices are queued so they still read in the
			// Population → Bounty → Fortunes order.
			const updates = {};
			const notices = [];
			if (checkedKeys.includes("population")) {
				const newPopulation = Math.min(this._stonetopSteading.getStatValue("population") + 1, 3);
				updates["attributes.population.value"] = newPopulation;
				notices.push(`Population boom: Population increased to ${sign(newPopulation)}.`);
			}

			// Net Surplus change over the whole season flow (the harvest/bounty, or winter
			// consumption): the live value already reflects the season's surplus/consumption
			// buttons, plus the bounty we're about to add. Computed locally so it doesn't
			// depend on reading the value back after the write.
			const finalSurplus = this._stonetopSteading.getStatValue("surplus") + (checkedKeys.includes("bounty") ? 1 : 0);
			if (checkedKeys.includes("bounty")) {
				updates["attributes.surplus.value"] = finalSurplus;
				notices.push(`Unexpected bounty: Surplus increased to ${finalSurplus}.`);
			}

			updates["stats.fortunes.value"] = resetFortunes;
			notices.push(`Fortunes reset to ${sign(resetFortunes)}.`);

			await this._stonetopSteading.setSystemValues(updates, { stonetopMove: "Seasons Change" });
			for (const notice of notices) ui.notifications.info(notice);

			const surplusChange = Number.isFinite(initialSurplus) ? finalSurplus - initialSurplus : 0;

			const notes   = root.querySelector(".stonetop-season-notes")?.value ?? "";
			const journal = await recordSeasonsChange({ seasonId, year, gainNames, fortunes, surplusChange, notes });

			// Winter closes out the year: advance the steading's current year so the next
			// season picker offers (and defaults to) the new one. max() guards against
			// recording an out-of-order older Winter regressing the count.
			if (seasonId === "winter") {
				await this.actor.setFlag(STONETOP_SCOPE, "seasonsCurrentYear", Math.max(this._seasonsCurrentYear(), year + 1));
			}

			journal?.sheet?.render(true);
		}

		async _showSeasonDialog(seasonId, year = this._seasonsCurrentYear()) {
			// The seasons have turned: post a chat card reminding the table of any
			// character's seasonal move/possession upkeep (Rites of the Land, Collected
			// offerings, etc.).
			postSeasonsChangeReminder(seasonId);

			const fortunes   = this._stonetopSteading.getStatValue("fortunes");
			const surplus    = this._stonetopSteading.getStatValue("surplus");
			const population = this._stonetopSteading.getStatValue("population");
			const malcontent = this._stonetopSteading.getSystemValue("attributes.debilities.options.malcontent.value", false);
			const resetFortunes = malcontent ? 0 : 1;

			const label   = seasonLabel(seasonId);
			const iconSrc = seasonIconSrc(seasonId);

			const header = `<div class="stonetop-season-flow-header">
				<img src="${iconSrc}" alt="${label}" class="stonetop-season-icon-sm">
				<h3>${label}</h3>
			</div>`;

			const statsNote = `<p class="stonetop-season-note">Fortunes: <strong>${sign(fortunes)}</strong> &nbsp;·&nbsp; Surplus: <strong>${surplus}</strong> &nbsp;·&nbsp; Population: <strong>${sign(population)}</strong></p>`;

			// Spring hands the roll to the table (the most hopeful PC rolls in chat), so it
			// shows "Ask the most hopeful…" where the other seasons show "Roll +Fortunes".
			// "Whatever the result, reset Fortunes to +1" is the close-out of every season,
			// so it's folded into Done (see _saveSeasonChange) rather than a separate button.
			const rollOrAskBtn = seasonId === "spring"
				? `<button class="stonetop-season-btn" data-action="ask-hopeful">
					<i class="fas fa-comment-dots"></i> Ask the most hopeful to roll (in chat)
				</button>`
				: `<button class="stonetop-season-btn" data-action="roll-fortunes">
					<i class="fas fa-dice-d6"></i> Roll +Fortunes (current: ${sign(fortunes)})
				</button>`;
			const fortunesBtns = `<div class="stonetop-season-actions">
				${rollOrAskBtn}
			</div>`;

			// Seasonal gains as a checklist the GM ticks (recorded into the Seasons Change
			// journal on Done). The two with a mechanical effect — Population boom (+1
			// Population) and Unexpected bounty (+1 Surplus) — are applied on Done when
			// ticked rather than via their own buttons; the Done button relabels to say so.
			// Gain copy comes from the shared SEASONAL_GAINS so the dialog and Chronicle
			// stay in lockstep.
			const gainsRef = `<div class="stonetop-season-gains">
				<p class="stonetop-season-gains-label">Seasonal gains <span class="stonetop-season-gains-hint">&mdash; tick what they pick</span></p>
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
			</div>`;

			// Free-text notes recorded onto the season's Chronicle page on Done (the omen,
			// the threat that surfaced, the hook it opens).
			const notesBlock = `<div class="stonetop-season-notes-wrap">
				<label class="stonetop-season-notes-label"><i class="fas fa-feather"></i> Notes for the Chronicle</label>
				<textarea class="stonetop-season-notes" rows="2" placeholder="The omen, threat, or hook this season opens…"></textarea>
			</div>`;

			let content;
			if (seasonId === "spring") {
				content = `<div class="stonetop-season-flow">
					${header}
					<p>Whoever is the <strong>most hopeful</strong> rolls +Fortunes:</p>
					<ul>
						<li><strong>10+:</strong> Pick 1 seasonal gain.</li>
						<li><strong>7–9:</strong> Pick 1 seasonal gain, but a threat makes itself known or gets worse.</li>
						<li><strong>6−:</strong> Threats abound. Don't mark XP.</li>
					</ul>
					<p class="stonetop-season-note">Whatever the result, reset Fortunes to +1.</p>
					${statsNote}${gainsRef}${fortunesBtns}${notesBlock}
				</div>`;
			} else if (seasonId === "summer") {
				content = `<div class="stonetop-season-flow">
					${header}
					<p>Whoever is the <strong>most content</strong> rolls +Fortunes:</p>
					<ul>
						<li><strong>10+:</strong> Pick 2 seasonal gains.</li>
						<li><strong>7–9:</strong> Pick 1 seasonal gain.</li>
						<li><strong>6−:</strong> A threat makes itself known or gets worse. Don't mark XP.</li>
					</ul>
					<p class="stonetop-season-note">Whatever the result, the steading generates 1d4−1 Surplus, then Fortunes resets to +1.</p>
					${statsNote}${gainsRef}${fortunesBtns}
					<div class="stonetop-season-actions">
						<button class="stonetop-season-btn" data-action="roll-surplus">
							<i class="fas fa-dice-d4"></i> Roll 1d4−1 Surplus (add to steading)
						</button>
					</div>
					${this._hasHerd() ? `<div class="stonetop-season-actions">
						<button class="stonetop-season-btn" data-action="advance-herd">
							<i class="fas fa-horse"></i> Advance the herd (promote tiers, add foals)
						</button>
					</div>` : ""}
					${notesBlock}
				</div>`;
			} else if (seasonId === "autumn") {
				content = `<div class="stonetop-season-flow">
					${header}
					<p>Whoever is the <strong>most determined</strong> rolls +Fortunes:</p>
					<ul>
						<li><strong>10+:</strong> Pick 1 seasonal gain.</li>
						<li><strong>7–9:</strong> Pick 1 seasonal gain, but a threat makes itself known or gets worse.</li>
						<li><strong>6−:</strong> Threats abound. Don't mark XP.</li>
					</ul>
					<p class="stonetop-season-note">Whatever the result, reset Fortunes to +1. When harvest is complete, the steading generates 1d4 Surplus.</p>
					${statsNote}${gainsRef}${fortunesBtns}
					<div class="stonetop-season-actions">
						<button class="stonetop-season-btn" data-action="roll-surplus">
							<i class="fas fa-dice-d4"></i> Roll 1d4 Surplus (Harvest)
						</button>
					</div>
					${notesBlock}
				</div>`;
			} else {
				// Winter
				content = `<div class="stonetop-season-flow">
					${header}
					<p>Whoever is the <strong>weariest</strong> rolls 1d4+Population (min 0); the steading consumes that much Surplus.</p>
					${statsNote}
					<div id="stonetop-winter-step1" class="stonetop-season-actions">
						<button class="stonetop-season-btn" data-action="roll-consumption">
							<i class="fas fa-dice-d4"></i> Roll 1d4+Population for Surplus Consumption
						</button>
					</div>
					<div id="stonetop-winter-step2" hidden>
						<p id="stonetop-winter-result" class="stonetop-season-note"></p>
						<div id="stonetop-winter-ok" hidden>
							<div class="stonetop-season-actions">
								<button class="stonetop-season-btn" data-action="apply-consumption">Apply Surplus Consumption</button>
							</div>
						</div>
						<div id="stonetop-winter-shortfall" hidden>
							<p>⚠️ <strong>Not enough Surplus.</strong> Reduce Surplus to 0 and Fortunes by 1, then the GM picks 1:</p>
							<ol class="stonetop-disaster-choices">
								<li class="stonetop-disaster-choice" data-consequence="population">
									<span class="stonetop-disaster-choice-label">Population loss</span>
									<span class="stonetop-disaster-choice-detail">Reduce Population by 1 (min −1) due to death, decrepitude, and departure.</span>
								</li>
								<li class="stonetop-disaster-choice" data-consequence="resource">
									<span class="stonetop-disaster-choice-label">Important resource lost or damaged</span>
									<span class="stonetop-disaster-choice-detail">A horse, the cistern, etc. — lost or not maintained (narrative).</span>
								</li>
								<li class="stonetop-disaster-choice" data-consequence="npc">
									<span class="stonetop-disaster-choice-label">Important NPC dies</span>
									<span class="stonetop-disaster-choice-detail">Their role unfilled — a narrative consequence.</span>
								</li>
								<li class="stonetop-disaster-choice" data-consequence="pc">
									<span class="stonetop-disaster-choice-label">A PC dies, leaves, or retires</span>
									<span class="stonetop-disaster-choice-detail">A narrative consequence for the group to resolve.</span>
								</li>
							</ol>
						</div>
					</div>
					<div id="stonetop-winter-step3" hidden>
						<hr class="stonetop-season-divider">
						<p>Then, roll +Fortunes:</p>
						<ul>
							<li><strong>10+:</strong> Winter is relatively mild. Each player names a local NPC with whom their relationship improves.</li>
							<li><strong>7–9:</strong> The steading must consume 1d4+Population more Surplus before winter ends, or suffer the consequences again.</li>
							<li><strong>6−:</strong> As 7–9, plus threats abound. Don't mark XP.</li>
						</ul>
						<p class="stonetop-season-note">Whatever the result, reset Fortunes to +1.</p>
						${fortunesBtns}
					</div>
					${this._hasHerd() ? `<hr class="stonetop-season-divider">
					<p class="stonetop-season-note">The herd eats 1 Surplus per ${HERD_SURPLUS_PER} grown-or-yearling horses; each Surplus it goes short costs 1d6 horses.</p>
					<div class="stonetop-season-actions">
						<button class="stonetop-season-btn" data-action="feed-herd">
							<i class="fas fa-horse"></i> Feed the herd (consume Surplus, roll any losses)
						</button>
					</div>` : ""}
					${notesBlock}
				</div>`;
			}

			let dialog;
			dialog = new Dialog({
				title: `Seasons Change — ${label}`,
				content,
				// Done resets Fortunes (the season's close-out), applies any ticked mechanical
				// gains, then records this season into the year's "Seasons Change" Chronicle
				// page: the gains, the net Surplus change, the notes. `surplus` (captured at
				// open) is the baseline for that change.
				buttons: { done: { label: "Done", callback: (html) => this._saveSeasonChange(seasonId, html, fortunes, resetFortunes, surplus, year) } },
				render: (html) => {
					addStonetopSteadingButton(html);
					const root = html[0];
					// Every stat change in this walkthrough is an effect of the Seasons Change
					// homefront move, so the ledger attributes them to it.
					const seasonsMove = { stonetopMove: "Seasons Change" };

					root.querySelector("[data-action='roll-fortunes']")?.addEventListener("click", () => {
						this._onSteadingRoll("Seasons Change", "fortunes", _seasonRollOptions(seasonId));
					});

					// Spring only: hand the roll to the table — post a chat card asking the
					// most hopeful character's player to roll +Fortunes, with a button to do it.
					root.querySelector("[data-action='ask-hopeful']")?.addEventListener("click", () => {
						postSeasonsRollPrompt({ alias: `Seasons Change — ${label}`, fortunes });
					});

					// Done resets Fortunes for the new season (the move's guaranteed close-out)
					// and applies any ticked mechanical gains — Population boom (+1 Population)
					// and Unexpected bounty (+1 Surplus) — instead of those having their own
					// buttons. Relabel Done so the GM knows what the click will write to the
					// steading. The Dialog's footer button lives in `.dialog-buttons`, a SIBLING
					// of `root` (`.dialog-content`), so it's looked up off the dialog's outer
					// element.
					const refreshDoneLabel = () => {
						const appEl = dialog.element?.jquery ? dialog.element[0] : dialog.element;
						const doneBtn = appEl?.querySelector("button[data-button='done']");
						if (!doneBtn) return;
						const willApply = !!root.querySelector(".stonetop-season-gain-check[data-gain-key='population']:checked")
							|| !!root.querySelector(".stonetop-season-gain-check[data-gain-key='bounty']:checked");
						doneBtn.textContent = willApply
							? `Apply those Gains, reset Fortunes to ${sign(resetFortunes)} & Close`
							: `Reset Fortunes to ${sign(resetFortunes)} & Close`;
					};
					root.querySelectorAll(".stonetop-season-gain-check").forEach(cb =>
						cb.addEventListener("change", refreshDoneLabel));
					refreshDoneLabel();

					// Herd of Horses seasonal steps (only present when the herd is earned):
					// summer promotes the tiers + adds foals; winter feeds the herd off Surplus.
					// Disable on click before the (async) apply runs (the Seasons Change dialog stays
					// open and only the sheet behind it re-renders, so a second click would re-read the
					// just-advanced herd / just-spent Surplus and apply the season again), AND persist a
					// per-season marker so a close+reopen in the same season can't re-run it either.
					const advanceHerdBtn = root.querySelector("[data-action='advance-herd']");
					this._disableIfSeasonStepDone(advanceHerdBtn, "advanceHerd", year, seasonId);
					advanceHerdBtn?.addEventListener("click", async () => {
						if (advanceHerdBtn.disabled) return;
						advanceHerdBtn.disabled = true;
						try {
							await this._advanceHerdSummer();
							await this._stonetopSteading.setSeasonStepApplied("advanceHerd", year, seasonId);
						} catch (err) { advanceHerdBtn.disabled = false; throw err; }
					});
					const feedHerdBtn = root.querySelector("[data-action='feed-herd']");
					this._disableIfSeasonStepDone(feedHerdBtn, "feedHerd", year, seasonId);
					feedHerdBtn?.addEventListener("click", async () => {
						if (feedHerdBtn.disabled) return;
						feedHerdBtn.disabled = true;
						try {
							await this._feedHerdWinter();
							await this._stonetopSteading.setSeasonStepApplied("feedHerd", year, seasonId);
						} catch (err) { feedHerdBtn.disabled = false; throw err; }
					});

					const rollSurplusBtn = root.querySelector("[data-action='roll-surplus']");
					this._disableIfSeasonStepDone(rollSurplusBtn, "surplus", year, seasonId);
					rollSurplusBtn?.addEventListener("click", async () => {
						if (rollSurplusBtn.disabled) return;
						rollSurplusBtn.disabled = true;
						try {
							const formula = seasonId === "summer" ? "1d4 - 1" : "1d4";
							const roll = await new Roll(formula).evaluate();
							const gain = Math.max(0, roll.total);
							await roll.toMessage({ flavor: `Surplus Generation (${label})` });
							await this._stonetopSteading.setSystemValue("attributes.surplus.value", surplus + gain, seasonsMove);
							await this._stonetopSteading.setSeasonStepApplied("surplus", year, seasonId);
							this.render(false);
							ui.notifications.info(`Generated ${gain} Surplus. New total: ${surplus + gain}.`);
						} catch (err) { rollSurplusBtn.disabled = false; throw err; }
					});

					// Winter — consumption roll
					const rollConsumptionBtn = root.querySelector("[data-action='roll-consumption']");
					this._disableIfSeasonStepDone(rollConsumptionBtn, "consumption", year, seasonId);
					rollConsumptionBtn?.addEventListener("click", async () => {
						if (rollConsumptionBtn.disabled) return;
						// Close the double-click window synchronously (like the sibling steps): the
						// button stays visible through the whole await below, so without this a second
						// click posts a second roll and double-binds the apply listener, deducting
						// consumption from Surplus twice. Restored on error so a failed roll can retry.
						rollConsumptionBtn.disabled = true;
						let consumption, surplusNow;
						try {
							const popAbs = Math.abs(population);
							const formula = population >= 0 ? `1d4 + ${population}` : `1d4 - ${popAbs}`;
							const roll = await new Roll(formula).evaluate();
							consumption = Math.max(0, roll.total);
							await roll.toMessage({ flavor: "Winter Surplus Consumption" });

							// Read Surplus LIVE, not the value captured when the dialog opened: the
							// herd "Feed the herd" step in this same dialog may have already spent some,
							// and this.render() refreshes the sheet, not this Dialog's closure.
							surplusNow = this._stonetopSteading.getStatValue("surplus");
						} catch (err) { rollConsumptionBtn.disabled = false; throw err; }

						root.querySelector("#stonetop-winter-step1").hidden = true;
						root.querySelector("#stonetop-winter-step2").hidden = false;
						root.querySelector("#stonetop-winter-result").textContent =
							`Roll: ${consumption}. Surplus needed: ${consumption}, available: ${surplusNow}.`;

						if (surplusNow >= consumption) {
							root.querySelector("#stonetop-winter-ok").hidden = false;
							root.querySelector("[data-action='apply-consumption']").addEventListener("click", async () => {
								// Re-read at apply time so a herd feed between roll and apply can't be refunded.
								const live = this._stonetopSteading.getStatValue("surplus");
								const remaining = Math.max(0, live - consumption);
								await this._stonetopSteading.setSystemValue("attributes.surplus.value", remaining, seasonsMove);
								await this._stonetopSteading.setSeasonStepApplied("consumption", year, seasonId);
								this.render(false);
								root.querySelector("#stonetop-winter-ok").hidden = true;
								root.querySelector("#stonetop-winter-step3").hidden = false;
								ui.notifications.info(`Consumed ${Math.min(consumption, live)} Surplus. Remaining: ${remaining}.`);
							});
						} else {
							root.querySelector("#stonetop-winter-shortfall").hidden = false;
							root.querySelectorAll("[data-consequence]").forEach(el => {
								el.addEventListener("click", async () => {
									const newFortunes = Math.max(fortunes - 1, -1);
									await this._stonetopSteading.setSystemValue("attributes.surplus.value", 0, seasonsMove);
									await this._stonetopSteading.setSystemValue("stats.fortunes.value", newFortunes, seasonsMove);
									await this._stonetopSteading.setSeasonStepApplied("consumption", year, seasonId);
									if (el.dataset.consequence === "population") {
										const newPop = Math.max(population - 1, -1);
										await this._stonetopSteading.setSystemValue("attributes.population.value", newPop, seasonsMove);
										ui.notifications.info(`Shortfall: Surplus → 0, Fortunes → ${sign(newFortunes)}, Population → ${sign(newPop)}.`);
									} else {
										ui.notifications.info(`Shortfall: Surplus → 0, Fortunes → ${sign(newFortunes)}. Apply the narrative consequence.`);
									}
									this.render(false);
									root.querySelector("#stonetop-winter-step2").hidden = true;
									root.querySelector("#stonetop-winter-step3").hidden = false;
								});
							});
						}
					});
				},
			}, { classes: ["dialog", "stonetop", "stonetop-season-flow-dialog"] });
			dialog.render(true);
		}

		async _onSteadingRoll(moveName, statKey, rollOptions = {}) {
			if (!statKey) return;
			const diminished = this._stonetopSteading.getSystemValue("attributes.debilities.options.diminished.value", false);
			const lacking = this._stonetopSteading.getSystemValue("attributes.debilities.options.lacking.value", false);
			const flow = Object.values(HOMESTEAD_MOVE_FLOWS).find(f => f.label === moveName);
			const defaultRollOptions = flow
				? {
					moveResults: _moveResultsFromRows(flow.results),
					resultLegend: _resultsLegendHtml(flow.results),
				}
				: {};
			const options = {
				...defaultRollOptions,
				...rollOptions,
				moveName,
				rollMode: _normalizeSheetRollMode(rollOptions.rollMode ?? this._sheetRollMode()),
				statValue: this._stonetopSteading.getStatValue(statKey),
			};
			if (rollOptions.statValue !== undefined) options.statValue = rollOptions.statValue;
			if (diminished && DIMINISHED_MOVES.has(moveName)) {
				options.rollMode = "dis";
				options.stonetopDebility = "Diminished";
				options.stonetopDebilityTooltip = "Disadvantage to Deploy, Muster, or Pull Together.";
			}
			if (lacking && statKey === "prosperity") {
				options.statValue -= 1;
				options.stonetopDebility = "Lacking";
				options.stonetopDebilityTooltip = "Treat Prosperity as 1 lower.";
			}
			await rollStat(statKey, this.actor, {
				...options,
			});
		}

		_sheetRollMode() {
			return _normalizeSheetRollMode(this.actor.getFlag(STONETOP_SCOPE, "rollMode"));
		}

		async _onSteadingTrackChange(path, value) {
			await this._stonetopSteading.setSystemValue(path.replace(/^system\./, ""), value);
		}

		async _onListItemCheck(list, index, checked) {
			const f = this._stonetopSteading._flags;
			const arr = foundry.utils.deepClone(f[list] ?? STEADING_DEFAULTS[list]);
			if (!arr[index]) return;
			arr[index].checked = checked;
			await this._stonetopSteading.setFlags({ [list]: arr });
		}

		async _onReturnAsset(index) {
			const name = this._stonetopSteading._flags.assets?.[index]?.name ?? "Asset";
			await this._stonetopSteading.returnAsset(index);
			this.render(false);
			ui.notifications.info(`${name} returned to ${this.actor.name}.`);
		}

		async _onListItemAdd(list) {
			if (list === "residents") {
				new AddSteadingMemberDialog("resident", async (data) => {
					const f = this._stonetopSteading._flags;
					const arr = foundry.utils.deepClone(f.residents ?? STEADING_DEFAULTS.residents);
					arr.push({ ...data, checked: false });
					await this._stonetopSteading.setFlags({ residents: arr });
					this.render(false);
				}).render(true);
				return;
			}
			if (list === "neighbors") {
				new AddSteadingMemberDialog("neighbor", async (data) => {
					const f = this._stonetopSteading._flags;
					const arr = foundry.utils.deepClone(f.neighbors ?? STEADING_DEFAULTS.neighbors);
					arr.push({ ...data, checked: false });
					await this._stonetopSteading.setFlags({ neighbors: arr });
					this.render(false);
				}).render(true);
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
							const f = this._stonetopSteading._flags;
							const arr = foundry.utils.deepClone(f[list] ?? STEADING_DEFAULTS[list]);
							arr.push({ name, checked: false });
							await this._stonetopSteading.setFlags({ [list]: arr });
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
			const f = this._stonetopSteading._flags;
			const arr = foundry.utils.deepClone(f[list] ?? STEADING_DEFAULTS[list]);
			arr.splice(index, 1);
			await this._stonetopSteading.setFlags({ [list]: arr });
			this.render(false);
		}

		async _onPlaceChange(index, value) {
			const f = this._stonetopSteading._flags;
			const places = foundry.utils.deepClone(f.places ?? STEADING_DEFAULTS.places);
			places[index].name = value;
			await this._stonetopSteading.setFlags({ places });
		}

		async _onNeighborChange(index, field, value) {
			if (!["name", "home", "occupation", "traits", "relations", "notes"].includes(field)) return;
			const f = this._stonetopSteading._flags;
			const neighbors = foundry.utils.deepClone(f.neighbors ?? STEADING_DEFAULTS.neighbors);
			if (!neighbors[index]) neighbors[index] = { name: "", home: "", occupation: "", traits: "", relations: "", notes: "", checked: false };
			neighbors[index][field] = value;
			await this._stonetopSteading.setFlags({ neighbors });
		}

		async _onPlayerFieldChange(index, field, value) {
			if (!["occupation", "traits", "relations", "notes"].includes(field)) return;
			const f = this._stonetopSteading._flags;
			const players = foundry.utils.deepClone(f.players ?? STEADING_DEFAULTS.players);
			if (!players[index]) return;
			players[index][field] = value;
			await this._stonetopSteading.setFlags({ players });
		}

		async _onResidentChange(index, field, value) {
			if (!["name", "occupation", "traits", "relations", "notes"].includes(field)) return;
			const f = this._stonetopSteading._flags;
			const residents = foundry.utils.deepClone(f.residents ?? STEADING_DEFAULTS.residents);
			if (!residents[index]) residents[index] = { name: "", occupation: "", traits: "", relations: "", notes: "", checked: false };
			residents[index][field] = value;
			await this._stonetopSteading.setFlags({ residents });
		}

		async _onDropPlayerCharacter(actor) {
			const f = this._stonetopSteading._flags;
			const players = foundry.utils.deepClone(f.players ?? STEADING_DEFAULTS.players);
			const actorUuid = actor.uuid ?? "";
			const actorId = actor.id ?? actor._id ?? "";

			const existingIdx = players.findIndex(player =>
				(actorUuid && player.uuid === actorUuid) ||
				(actorId && player.id === actorId) ||
				player.name?.toLowerCase().trim() === actor.name?.toLowerCase().trim()
			);

			if (existingIdx >= 0) {
				ui.notifications?.info?.(`${actor.name} is already in the players list.`);
				this.render(false);
				return;
			}

			players.push({
				id: actorId,
				uuid: actorUuid,
				name: actor.name,
				img: actor.img ?? "",
				checked: true,
				traits: "",
				relations: "",
				notes: "",
			});

			await this._stonetopSteading.setFlags({ players });
			this.render(false);
			ui.notifications?.info?.(`Added ${actor.name} to players.`);
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
					const confirmed = await this._confirmForceCompleteImprovement(def);
					if (!confirmed) {
						this.render(false); // revert the just-tapped checkbox
						return;
					}
					forceR = Array.from({ length: improvementRequirementCount(def) }, () => true);
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
		}

		// Confirm marking every requirement of a not-yet-earned improvement complete so
		// it can be earned immediately. Resolves true when accepted, false/null otherwise.
		_confirmForceCompleteImprovement(def) {
			return Dialog.confirm({
				title: "Earn this improvement?",
				content: `<div class="stonetop-improvement-force-complete">
					<p>Stonetop hasn't met all the requirements for <strong>${_esc(def.label)}</strong> yet.</p>
					<p>Mark them all complete and earn this improvement?</p>
				</div>`,
				options: { classes: ["dialog", "stonetop", "stonetop-improvement-force-complete-dialog"] },
			});
		}

		async _onImprovementReq(slug, index, checked) {
			const f = this._stonetopSteading._flags;
			const improvements = foundry.utils.deepClone(f.improvements ?? {});
			if (!improvements[slug]) improvements[slug] = { completed: false, r: [] };
			if (!improvements[slug].r) improvements[slug].r = [];
			improvements[slug].r[index] = checked;
			await this._stonetopSteading.setFlags({ improvements });
		}

		/** Whether the Herd of Horses improvement is earned (so the herd tracker/season steps apply). */
		_hasHerd() {
			return !!this._stonetopSteading._flags.improvements?.herdOfHorses?.completed;
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
		 * Disable a once-per-season Seasons-Change button (and tooltip why) when its step has
		 * already been applied for this year+season, so closing and reopening the dialog can't
		 * re-run it. Returns true when it disabled the button.
		 */
		_disableIfSeasonStepDone(btn, step, year, seasonId) {
			if (!btn || !this._stonetopSteading.seasonStepApplied(step, year, seasonId)) return false;
			btn.disabled = true;
			btn.title = "Already done this season — reopening won't repeat it.";
			return true;
		}

		/**
		 * Summer: yearlings become grown horses, foals become yearlings, and the herd gains
		 * 1d4+Fortunes (min 0) new foals. Rolls the foals to chat, applies, and reports.
		 */
		async _advanceHerdSummer() {
			const before = this._stonetopSteading.getHerd();
			const fortunes = this._stonetopSteading.getStatValue("fortunes");
			// Roll Fortunes INTO the die so the chat card's total is the actual foals added
			// (1d4 + Fortunes), not a bare 1d4 that disagrees with the herd change / notification.
			const formula = fortunes >= 0 ? `1d4 + ${fortunes}` : `1d4 - ${Math.abs(fortunes)}`;
			const roll = await new Roll(formula).evaluate();
			await roll.toMessage({ flavor: `Herd — new foals (1d4 + Fortunes ${sign(fortunes)})` });
			const newFoals = Math.max(0, roll.total);
			const next = StonetopSteading.advanceHerdForSummer(before, newFoals);
			await this._stonetopSteading.setHerd(next, { stonetopMove: "Seasons Change" });
			this.render(false);
			const total = next.grown + next.yearlings + next.foals;
			ui.notifications.info(`Herd advanced: grown ${before.grown}→${next.grown}, yearlings ${before.yearlings}→${next.yearlings}, foals ${before.foals}→${next.foals} (+${newFoals}). Total ${before.total}→${total}.`);
		}

		/**
		 * Winter: the herd needs 1 Surplus per ${HERD_SURPLUS_PER} grown-or-yearling horses.
		 * Feed what Surplus is available; for each Surplus it goes short, roll 1d6 horses lost
		 * (taken from the oldest tiers first). Surplus and herd changes are attributed to
		 * Seasons Change in the ledger.
		 */
		async _feedHerdWinter() {
			const before = this._stonetopSteading.getHerd();
			const surplus = this._stonetopSteading.getStatValue("surplus");
			const cost = StonetopSteading.herdWinterCost(before);
			if (cost <= 0) {
				ui.notifications.info("The herd is small enough to forage — no Surplus needed this winter.");
				return;
			}
			const shortfall = Math.max(0, cost - Math.max(0, surplus));
			let losses = 0;
			if (shortfall > 0) {
				const roll = await new Roll(`${shortfall}d6`).evaluate();
				await roll.toMessage({ flavor: `Herd losses (${shortfall}× 1d6 — ${shortfall} Surplus short)` });
				losses = roll.total;
			}
			const result = StonetopSteading.feedHerdForWinter(before, surplus, losses);
			if (result.paid > 0) {
				await this._stonetopSteading.setSystemValue("attributes.surplus.value", surplus - result.paid, { stonetopMove: "Seasons Change" });
			}
			if (result.lost > 0) {
				await this._stonetopSteading.setHerd(result.herd, { stonetopMove: "Seasons Change" });
			}
			this.render(false);
			let msg = `Herd fed: needed ${result.cost} Surplus, paid ${result.paid} (Surplus ${surplus}→${surplus - result.paid}).`;
			if (result.shortfall > 0) {
				const newTotal = result.herd.grown + result.herd.yearlings + result.herd.foals;
				msg += ` ${result.shortfall} short → lost ${result.lost} horse${result.lost === 1 ? "" : "s"} (herd ${before.total}→${newTotal}).`;
			}
			ui.notifications.info(msg);
		}

		async _onDropSteadingImprovement(improvement) {
			if (!improvement?.name) return;
			const result = await this._stonetopSteading.addCustomImprovement(improvement);
			if (result.ok) {
				globalThis.ui?.notifications?.info?.(`Added steading improvement: ${result.label}.`);
				this.render(false);
			} else if (result.reason === "duplicate") {
				globalThis.ui?.notifications?.warn?.(`${result.label} is already a steading improvement.`);
			}
		}

		// Prompt for a custom improvement (name + optional flavor/effect) and add it as a
		// tracked custom improvement — the same path a dropped journal card takes.
		async _onCreateImprovementOpen() {
			let dialog;
			dialog = new Dialog({
				title: "Create Improvement",
				content: `<form class="stonetop-homestead-dialog">
					<p class="stonetop-homestead-trigger"><em>Add a custom improvement to track alongside the book's built-ins.</em></p>
					<div class="stonetop-homestead-fields">
						<label class="stonetop-homestead-field">
							<span>Name</span>
							<input type="text" name="name" placeholder="e.g. Roadbuilding" autofocus>
						</label>
						<label class="stonetop-homestead-field">
							<span>Flavor</span>
							<textarea name="flavor" rows="2" placeholder="A short description shown under the title (optional)."></textarea>
						</label>
						<label class="stonetop-homestead-field">
							<span>Effect</span>
							<textarea name="effect" rows="2" placeholder="What completing it does — new resources, defenses, etc. (optional)."></textarea>
						</label>
					</div>
				</form>`,
				buttons: {
					cancel: { label: "Cancel" },
					create: {
						label: "Create",
						callback: async (html) => {
							const form = html[0].querySelector("form");
							const val = n => form.querySelector(`[name="${n}"]`)?.value?.trim() ?? "";
							const name = val("name");
							if (!name) {
								globalThis.ui?.notifications?.warn?.("Enter a name for the improvement.");
								return;
							}
							const result = await this._stonetopSteading.addCustomImprovement({
								name,
								flavor: val("flavor"),
								effect: val("effect"),
							});
							if (result.ok) {
								globalThis.ui?.notifications?.info?.(`Added steading improvement: ${result.label}.`);
								this.render(false);
							} else if (result.reason === "duplicate") {
								globalThis.ui?.notifications?.warn?.(`${result.label} is already a steading improvement.`);
							}
						},
					},
				},
				default: "create",
			}, { classes: ["dialog", "stonetop", "stonetop-create-improvement-dialog"] });
			dialog.render(true);
		}

		async _onRemoveCustomImprovement(slug) {
			if (!slug) return;
			const removed = await this._stonetopSteading.removeCustomImprovement(slug);
			if (removed) this.render(false);
		}
	};
}
