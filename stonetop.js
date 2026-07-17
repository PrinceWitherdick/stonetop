import { registerSettings, getSetting, applyMoveDescriptionBodyClass } from "./module/settings.js";
import { createStonetopActorClass } from "./module/actors/StonetopActor.js";
import { createStonetopItemClass } from "./module/item/StonetopItem.js";
import { createStonetopArcanumSheetClass } from "./module/item/StonetopArcanumSheet.js";
import { createStonetopCharacterSheetClass } from "./module/actors/character/StonetopCharacterSheet.js";
import { createStonetopSteadingSheetClass } from "./module/actors/steading/StonetopSteadingSheet.js";
import { createStonetopMonsterSheetClass } from "./module/actors/monster/StonetopMonsterSheet.js";
import { BestiaryPageModel } from "./module/journal/BestiaryPageModel.js";
import { LocationPageModel } from "./module/journal/LocationPageModel.js";
import { CharacterModel } from "./module/data-models/CharacterModel.js";
import { SteadingModel } from "./module/data-models/SteadingModel.js";
import { MonsterModel } from "./module/data-models/MonsterModel.js";
import { MoveModel } from "./module/data-models/MoveModel.js";
import { PlaybookModel } from "./module/data-models/PlaybookModel.js";
import { NpcMoveModel } from "./module/data-models/NpcMoveModel.js";
import { MonsterMoveModel } from "./module/data-models/MonsterMoveModel.js";
import { createStonetopBestiaryPageSheetClass } from "./module/journal/StonetopBestiaryPageSheet.js";
import { createStonetopLocationPageSheetClass } from "./module/journal/StonetopLocationPageSheet.js";
import { ThreatPageModel } from "./module/journal/ThreatPageModel.js";
import { createStonetopThreatPageSheetClass } from "./module/journal/StonetopThreatPageSheet.js";
import { HazardPageModel } from "./module/journal/HazardPageModel.js";
import { createStonetopHazardPageSheetClass } from "./module/journal/StonetopHazardPageSheet.js";
import { ThreatBoard } from "./module/threats/threat-board.js";
import { onReady } from "./module/hooks/Ready.js";
import { handleImportedJournalArt } from "./module/book2-art/reapply.js";
import { onRenderActorSheet } from "./module/hooks/RenderActorSheet.js";
import { onHotbarDrop } from "./module/hooks/HotbarDrop.js";
import { onDropPlaceOfInterest } from "./module/hooks/PlaceOfInterestDrop.js";
import { onPreCreateThreatNote } from "./module/hooks/ThreatNotePins.js";
import { onDrawStonetopNote } from "./module/hooks/StonetopNoteLabels.js";
import { invalidateMonsterRefIndex } from "./module/bestiary/monster-ref-index.js";
import { ensureLocationSummaryIndex, applyLocationTooltips } from "./module/locations/location-tooltips.js";
import { restrictContentLinks } from "./module/journal/restrict-content-links.js";
import { addJournalShareButton } from "./module/journal/share-journal.js";
import { patchJournalImagePopoutTitles } from "./module/journal/journal-image-titles.js";
import { onRenderPause } from "./module/hooks/RenderPause.js";
import { registerStonetopSingletonHooks } from "./module/hooks/StonetopSingleton.js";
import { info } from "./module/utils/logger.js";
import { boldMissText } from "./module/utils/strings.js";
import { rollSeasonsCard, sign, SPRING_SEASONS_RESULT } from "./module/utils/roll-engine.js";
import { formatOutcomeDetail } from "./module/utils/strings.js";
import { wireAttackConfirm, wireApplyDamage, wireSufferAttack } from "./module/combat/attack-flow.js";
import { markQuestionBullets } from "./module/utils/question-bullets.js";
import { wrapStonetopGlyphsInEl } from "./module/utils/glyphs.js";
import { applyJournalSpiralBullets, resolveEntry } from "./module/utils/journal-spiral-bullets.js";
import { applyTreasureDrops } from "./module/utils/treasure-drops.js";
import { applyGearTermTooltips } from "./module/utils/gear-term-tooltips.js";
import { SETTING_OVERVIEW_JOURNAL } from "./module/utils/seeded-journals.js";
import { applyJournalCheckboxes } from "./module/utils/journal-checkboxes.js";
import { applyJournalRollTables } from "./module/utils/journal-roll-tables.js";
import { bindSteadingImprovementDrag } from "./module/journal/steading-improvement-cards.js";
import { bindThreatSeedDrag } from "./module/threats/threat-seed-cards.js";
import { maybeAnnounceBecameHero } from "./module/actors/character/WouldBeHeroAsterisk.js";
import { StonetopSteading } from "./module/actors/steading/StonetopSteading.js";
import { makeDialogsResizable, enableAutoHeightVerticalResize } from "./module/utils/resizable-dialogs.js";
import { registerStonetopWindowTheme } from "./module/utils/window-theme.js";
import { installWindowRestore } from "./module/utils/window-restore.js";

// -- INIT ------------------------------------------------------
Hooks.once("init", () => {
	info("Initializing");

	registerSettings();
	registerStonetopSingletonHooks();

	// Every window and modal in the system is drag-resizable; the ad-hoc
	// Dialog popups we spawn from sheets default to resizable too. The companion
	// patch lets auto-height windows (most of our modals) be dragged taller/shorter,
	// which core otherwise blocks by refitting auto-height windows to their content.
	makeDialogsResizable();
	enableAutoHeightVerticalResize();

	// Title the click-to-enlarge image popout with the JournalEntry's name (e.g.
	// "Huffel Peaks") instead of the blank fallback core uses for art embedded in
	// page content. See module/journal/journal-image-titles.js.
	patchJournalImagePopoutTitles();

	// Skin a curated allowlist of core Foundry windows (e.g. User Configuration)
	// to match our sheets/modals; scoped to a marker class so nothing else moves.
	registerStonetopWindowTheme();

	// Track open document sheets + their geometry and reopen them at the same spot on
	// the next reload (per-client; toggled by the "Restore Open Windows on Reload"
	// setting). Registers its own render/close tracking hooks and a ready-time restore.
	installWindowRestore();

	Handlebars.registerHelper("format", (key, options) => game.i18n.format(String(key), options.hash));
	Handlebars.registerHelper("boldMissText", value => boldMissText(value));
	Handlebars.registerHelper("eq", (a, b) => a === b);
	Handlebars.registerHelper("or", (...args) => args.slice(0, -1).some(Boolean));
	Handlebars.registerHelper("and", (...args) => args.slice(0, -1).every(Boolean));
	Handlebars.registerHelper("not", value => !value);

	const _STAT_LABEL_KEYS = {
		str: "stonetop.character.stats.strength",
		dex: "stonetop.character.stats.dexterity",
		int: "stonetop.character.stats.intelligence",
		wis: "stonetop.character.stats.wisdom",
		con: "stonetop.character.stats.constitution",
		cha: "stonetop.character.stats.charisma",
	};
	Handlebars.registerHelper("statLabel", key => game.i18n.localize(_STAT_LABEL_KEYS[String(key)] ?? String(key)));

	Handlebars.registerHelper("resourceChecks", resource => {
		if (!resource) return [];
		const { current, max, labels } = resource;
		return Array.from({ length: max }, (_, i) => ({ checked: i < current, label: labels[i] || null }));
	});

	// Same circles as resourceChecks, but chunked into fixed-size groups (default 5)
	// so a long track (e.g. a fully-upgraded sacred pouch's Stock) reads in fives.
	// Each item keeps its absolute index; groups stay atomic so they never split
	// across a wrapped row and every wrapped row aligns under the first circle.
	Handlebars.registerHelper("resourceGroups", (resource, size) => {
		if (!resource) return [];
		const { current, max } = resource;
		const labels = resource.labels || [];
		const n = Number(size) > 0 ? Number(size) : 5;
		const items = Array.from({ length: max }, (_, i) => ({ checked: i < current, label: labels[i] || null, index: i }));
		const groups = [];
		for (let i = 0; i < items.length; i += n) groups.push(items.slice(i, i + n));
		return groups;
	});

	const _flatPoolItems = pool => {
		if (!pool) return [];
		const total = pool.max ?? 9;
		return Array.from({ length: total }, (_, i) => ({ checked: i < pool.current, index: i }));
	};

	Handlebars.registerHelper("poolItems", _flatPoolItems);

	Handlebars.registerHelper("poolGroups", pool => {
		const items = _flatPoolItems(pool);
		const groups = [];
		for (let i = 0; i < items.length; i += 3) groups.push(items.slice(i, i + 3));
		return groups;
	});

	Handlebars.registerHelper("times", n => Array.from({ length: n ?? 0 }, (_, i) => i));

	Handlebars.registerHelper("repeatChecks", move => {
		if (!move?.repeat) return [];
		const { max, current } = move.repeat;
		const lastOwnedId = move.ownedIds[move.ownedIds.length - 1] ?? null;
		return Array.from({ length: max }, (_, i) => ({
			checked:  i < current,
			ownedId:  i < current ? lastOwnedId : null,
			disabled: move.isStarting || move.locked || (!(i < current) && i !== current),
		}));
	});

	Handlebars.registerHelper("steadingTrack", (currentValue, defaultValue = 0) => {
		const raw = currentValue?.value ?? currentValue;
		const current = Number(raw ?? defaultValue);
		return Array.from({ length: 5 }, (_, i) => {
			const val = i - 1;
			return { val, label: (val >= 0 ? "+" : "") + val, checked: val === current };
		});
	});

	Handlebars.registerHelper("steadingDefenseTrack", (currentValue, defaultValue = 0) => {
		const raw = currentValue?.value ?? currentValue;
		const current = Number(raw ?? defaultValue);
		const sublabels = ["feeble", "mediocre", "strong", "formidable", "legendary"];
		return Array.from({ length: 5 }, (_, i) => {
			const val = i - 1;
			return { val, label: (val >= 0 ? "+" : "") + val, sublabel: sublabels[i], checked: val === current };
		});
	});

	CONFIG.Actor.documentClass = createStonetopActorClass(CONFIG.Actor.documentClass);
	CONFIG.Item.documentClass  = createStonetopItemClass(CONFIG.Item.documentClass);

	// System data models for each Actor/Item subtype (replaces template.json).
	CONFIG.Actor.dataModels ??= {};
	CONFIG.Item.dataModels  ??= {};
	CONFIG.Actor.dataModels.character = CharacterModel;
	CONFIG.Actor.dataModels.stonetop  = SteadingModel;
	CONFIG.Actor.dataModels.monster   = MonsterModel;
	CONFIG.Item.dataModels.move        = MoveModel;
	CONFIG.Item.dataModels.playbook    = PlaybookModel;
	CONFIG.Item.dataModels.npcMove     = NpcMoveModel;
	CONFIG.Item.dataModels.monsterMove = MonsterMoveModel;

	const StonetopCharacterSheet = createStonetopCharacterSheetClass(ActorSheet);
	Actors.registerSheet("stonetop_pwd", StonetopCharacterSheet, {
		types:       ["character"],
		makeDefault: true,
		label:       "Stonetop Character Sheet",
	});

	const StonetopSteadingSheet = createStonetopSteadingSheetClass(ActorSheet);
	Actors.registerSheet("stonetop_pwd", StonetopSteadingSheet, {
		types:       ["stonetop"],
		makeDefault: true,
		label:       "Stonetop Steading Sheet",
	});

	const StonetopMonsterSheet = createStonetopMonsterSheetClass(ActorSheet);
	Actors.registerSheet("stonetop_pwd", StonetopMonsterSheet, {
		types:       ["monster"],
		makeDefault: true,
		label:       "Stonetop Monster Sheet",
	});

	// Bestiary entry as a custom JournalEntryPage subtype.
	CONFIG.JournalEntryPage.dataModels ??= {};
	CONFIG.JournalEntryPage.dataModels["bestiary"] = BestiaryPageModel;
	const JournalPageSheetV1 = foundry.appv1?.sheets?.JournalPageSheet ?? globalThis.JournalPageSheet;
	const StonetopBestiaryPageSheet = createStonetopBestiaryPageSheetClass(JournalPageSheetV1);
	foundry.applications.apps.DocumentSheetConfig.registerSheet(JournalEntryPage, "stonetop_pwd", StonetopBestiaryPageSheet, {
		types:       ["bestiary"],
		makeDefault: true,
		label:       "Stonetop Bestiary Page",
	});

	// Gazetteer places as a structured JournalEntryPage subtype (sectioned, with
	// per-section inline editing) — mirrors the bestiary page above.
	CONFIG.JournalEntryPage.dataModels["location"] = LocationPageModel;
	const StonetopLocationPageSheet = createStonetopLocationPageSheetClass(JournalPageSheetV1);
	foundry.applications.apps.DocumentSheetConfig.registerSheet(JournalEntryPage, "stonetop_pwd", StonetopLocationPageSheet, {
		types:       ["location"],
		makeDefault: true,
		label:       "Stonetop Location Page",
	});

	// The Chronicle (session-zero record) reuses the same sectioned page model + sheet,
	// so its Bonds / Asked-of-the-others Q&A is inline-editable like a location's "In
	// Play" questions. Chronicle pages set every section's group to "glance", so no act
	// banners render. See utils/chronicle.js.
	CONFIG.JournalEntryPage.dataModels["chronicle"] = LocationPageModel;
	foundry.applications.apps.DocumentSheetConfig.registerSheet(JournalEntryPage, "stonetop_pwd", StonetopLocationPageSheet, {
		types:       ["chronicle"],
		makeDefault: true,
		label:       "Stonetop Chronicle Page",
	});

	// Threats: GM-prep pages (Book I "Threats"). Each threat is a `threat` page inside a
	// GM-only per-steading Threats entry; the sheet is the book-styled interactive card
	// (live doom track + reveal), dropped onto scenes as a linked Note. See module/threats/.
	CONFIG.JournalEntryPage.dataModels["threat"] = ThreatPageModel;
	const StonetopThreatPageSheet = createStonetopThreatPageSheetClass(JournalPageSheetV1);
	foundry.applications.apps.DocumentSheetConfig.registerSheet(JournalEntryPage, "stonetop_pwd", StonetopThreatPageSheet, {
		types:       ["threat"],
		makeDefault: true,
		label:       "Stonetop Threat Page",
	});

	// Hazards: the environmental half of Book I "Dangers" (pp. 381-389), threats'
	// sibling GM-prep page type. Same one-entry-per-page storage/visibility
	// architecture; authored via the Make-a-Hazard walkthrough. See module/hazards/.
	CONFIG.JournalEntryPage.dataModels["hazard"] = HazardPageModel;
	const StonetopHazardPageSheet = createStonetopHazardPageSheetClass(JournalPageSheetV1);
	foundry.applications.apps.DocumentSheetConfig.registerSheet(JournalEntryPage, "stonetop_pwd", StonetopHazardPageSheet, {
		types:       ["hazard"],
		makeDefault: true,
		label:       "Stonetop Hazard Page",
	});

	const StonetopArcanumSheet = createStonetopArcanumSheetClass(ItemSheet);
	Items.registerSheet("stonetop_pwd", StonetopArcanumSheet, {
		types:       ["move"],
		makeDefault: false,
		label:       "Stonetop Arcanum",
	});

	// Kick off the sheet-partial preload now so the fetches run in parallel during init.
	// Core does NOT await init-hook callbacks (Hooks.callAll discards the returned promise),
	// so awaiting here would order nothing — instead we stash the promise and onReady awaits
	// it before any auto-opening sheet/walkthrough render, which is where a "partial could
	// not be found" race would actually bite.
	game.stonetop ??= {};
	game.stonetop.templatesReady = loadTemplates({
		"stonetop.arcanum-sheet":      "systems/stonetop_pwd/templates/item/arcanum-sheet.hbs",
		"stonetop.arcanum-sheet-edit": "systems/stonetop_pwd/templates/item/arcanum-sheet-edit.hbs",
		"stonetop.actor-header":     "systems/stonetop_pwd/templates/actor/partials/actor-header.hbs",
		"stonetop.actor-stats":      "systems/stonetop_pwd/templates/actor/partials/actor-stats.hbs",
		"stonetop.actor-vitals":     "systems/stonetop_pwd/templates/actor/partials/actor-vitals.hbs",
		"stonetop.tab-details":      "systems/stonetop_pwd/templates/actor/partials/tab-details.hbs",
		"stonetop.tab-moves":        "systems/stonetop_pwd/templates/actor/partials/tab-moves.hbs",
		"stonetop.tab-equipment":    "systems/stonetop_pwd/templates/actor/partials/tab-equipment.hbs",
		"stonetop.tab-invocations":  "systems/stonetop_pwd/templates/actor/partials/tab-invocations.hbs",
		"stonetop.tab-followers":    "systems/stonetop_pwd/templates/actor/partials/tab-followers.hbs",
		"stonetop.tab-arcana":       "systems/stonetop_pwd/templates/actor/partials/tab-arcana.hbs",
		"stonetop.tab-post-death":      "systems/stonetop_pwd/templates/actor/partials/tab-post-death.hbs",
		"stonetop.tab-special-moves":   "systems/stonetop_pwd/templates/actor/partials/tab-special-moves.hbs",
		"stonetop.move-group":           "systems/stonetop_pwd/templates/actor/partials/move-group.hbs",
		"stonetop.tab-search-control":   "systems/stonetop_pwd/templates/actor/partials/tab-search-control.hbs",
		"stonetop.move-mark-level":      "systems/stonetop_pwd/templates/actor/partials/move-mark-level.hbs",
		"stonetop.sidebar-move-list":    "systems/stonetop_pwd/templates/actor/partials/sidebar-move-list.hbs",
		"stonetop.lore-section":          "systems/stonetop_pwd/templates/actor/partials/lore-section.hbs",
		"stonetop.lore-options-edit":     "systems/stonetop_pwd/templates/actor/partials/lore-options-edit.hbs",
		"stonetop.lore-options-readonly": "systems/stonetop_pwd/templates/actor/partials/lore-options-readonly.hbs",
		"stonetop.lore-arcana-image":     "systems/stonetop_pwd/templates/actor/partials/lore-arcana-image.hbs",
		"stonetop.section-heading":  "systems/stonetop_pwd/templates/actor/partials/section-heading.hbs",
		"stonetop.section-edit-toggle": "systems/stonetop_pwd/templates/actor/partials/section-edit-toggle.hbs",
		"stonetop.details-section-edit-toggle": "systems/stonetop_pwd/templates/actor/partials/details-section-edit-toggle.hbs",
		"stonetop.follower-section-edit": "systems/stonetop_pwd/templates/actor/partials/follower-section-edit.hbs",
		"stonetop.resource-track":   "systems/stonetop_pwd/templates/actor/partials/resource-track.hbs",
		"stonetop.inv-note":         "systems/stonetop_pwd/templates/actor/partials/inv-note.hbs",
		"stonetop.inv-item-regular": "systems/stonetop_pwd/templates/actor/partials/inv-item-regular.hbs",
		"stonetop.inv-item-small":   "systems/stonetop_pwd/templates/actor/partials/inv-item-small.hbs",
		"stonetop.steading-section-toggle":   "systems/stonetop_pwd/templates/actor/partials/steading-section-toggle.hbs",
		"stonetop.steading-tab-overview":     "systems/stonetop_pwd/templates/actor/partials/steading-tab-overview.hbs",
		"stonetop.steading-tab-neighbors":    "systems/stonetop_pwd/templates/actor/partials/steading-tab-neighbors.hbs",
		"stonetop.steading-tab-improvements": "systems/stonetop_pwd/templates/actor/partials/steading-tab-improvements.hbs",
		"stonetop.steading-tab-moves":        "systems/stonetop_pwd/templates/actor/partials/steading-tab-moves.hbs",
		"stonetop.steading-tab-notes":        "systems/stonetop_pwd/templates/actor/partials/steading-tab-notes.hbs",
		"stonetop.monster-sheet":             "systems/stonetop_pwd/templates/actor/monster.hbs",
		"stonetop.bestiary-line-list":        "systems/stonetop_pwd/templates/actor/partials/bestiary-line-list.hbs",
		"stonetop.bestiary-page":             "systems/stonetop_pwd/templates/journal/bestiary.hbs",
		"stonetop.location-page":             "systems/stonetop_pwd/templates/journal/location.hbs",
		"stonetop.threat-page":               "systems/stonetop_pwd/templates/journal/threat-page.hbs",
		"stonetop.threat-card":               "systems/stonetop_pwd/templates/journal/partials/threat-card.hbs",
		"stonetop.hazard-page":               "systems/stonetop_pwd/templates/journal/hazard-page.hbs",
		"stonetop.hazard-card":               "systems/stonetop_pwd/templates/journal/partials/hazard-card.hbs",
		"stonetop.steading-tab-threats":      "systems/stonetop_pwd/templates/actor/partials/steading-tab-threats.hbs",
		"stonetop.bestiary-section-head":     "systems/stonetop_pwd/templates/journal/partials/bestiary-section-head.hbs",
		"stonetop.bestiary-group-section":    "systems/stonetop_pwd/templates/journal/partials/bestiary-group-section.hbs",
		"stonetop.introductions-dialog":      "systems/stonetop_pwd/templates/dialogs/introductions.hbs",
		"stonetop.guide-toc":                 "systems/stonetop_pwd/templates/dialogs/partials/guide-toc.hbs",
		"stonetop.threat-string-list":        "systems/stonetop_pwd/templates/dialogs/partials/threat-string-list.hbs",
		"stonetop.card-doom-track":           "systems/stonetop_pwd/templates/journal/partials/card-doom-track.hbs",
		"stonetop.card-gm-moves":             "systems/stonetop_pwd/templates/journal/partials/card-gm-moves.hbs",
		"stonetop.card-player-moves":         "systems/stonetop_pwd/templates/journal/partials/card-player-moves.hbs",
	});
});

// -- RENDER PAUSE ----------------------------------------------
// "renderPause" (v11) was renamed in v12+; cover all known variants and
// pauseGame so the text override fires whenever pause state changes.
Hooks.on("renderPause", onRenderPause);
Hooks.on("renderPauseBanner", onRenderPause);
Hooks.on("pauseGame", (paused) => paused && onRenderPause());

// -- READY -----------------------------------------------------
Hooks.once("ready", onReady);
Hooks.once("ready", () => applyMoveDescriptionBodyClass(getSetting("showMoveDescriptionsInChat")));

// -- THREAT BOARD (opt-in on-canvas threat cards) --------------
Hooks.once("ready", () => {
	game.stonetop ??= {};
	game.stonetop.threatBoard = new ThreatBoard();
	game.stonetop.threatBoard.install();
	if (globalThis.canvas?.ready) game.stonetop.threatBoard.refresh();
});

// -- RENDER ACTOR SHEET ----------------------------------------
Hooks.on("renderActorSheet", onRenderActorSheet);

// -- HOTBAR DROP -----------------------------------------------
// Turn a learned move dragged from a character sheet onto the macro hotbar into a
// script macro that re-rolls it (game.stonetop.rollMoveMacro, wired in Ready.js).
Hooks.on("hotbarDrop", onHotbarDrop);

// -- PLACE OF INTEREST → SCENE NOTE ----------------------------
// Drag a "Places of Interest" disc from the steading Overview tab onto the canvas to
// drop a lettered map note whose label (the place name) shows on hover.
Hooks.on("dropCanvasData", onDropPlaceOfInterest);

// -- BOOK II ART ON JOURNAL IMPORT -----------------------------
// A GM dragging one of our journals in from the compendium mid-version would get an
// art-less world copy (the once-per-version re-apply won't fire again). Embed its Book II
// art right away from the durable folder. Debounced + idempotent (see book2-art/reapply.js),
// so a folder-import burst — and the fresh-world seed's own create storm — collapse to one pass.
Hooks.on("createJournalEntry", handleImportedJournalArt);

// -- THREAT SCENE PINS -----------------------------------------
// A threat card dragged onto a scene drops a native page-linked Note; give that
// pin the torn-note icon, the threat's name, and global (fog-ignoring) visibility.
Hooks.on("preCreateNote", onPreCreateThreatNote);

// Give our lettered Place-of-Interest discs and threat/hazard pins a thick paper text
// halo so their labels stay legible over the illustrated Stonetop maps.
Hooks.on("drawNote", onDrawStonetopNote);

// -- LOCATION CROSS-LINK TOOLTIPS ------------------------------
// Give cross-links into the Locations pack a useful hover summary instead of the
// default "Journal Entry". Covers the journal sheet/page render hooks across
// Foundry v12–v14; the index warms on ready so the first hover is instant.
Hooks.once("ready", () => ensureLocationSummaryIndex());
const _onJournalRender = (app, html) => {
	// Give cross-links their hover summary FIRST, then neuter any a player can't
	// follow. Order matters: restrictContentLinks carries the just-stamped
	// data-tooltip onto the de-linked span, so a player still gets the description
	// on hover for Locations & Lore — while the GM-only bestiary codex is flattened
	// to plain text with no tooltip. No-op for GMs (they keep every link). The
	// tooltip index is async, so chain the restriction after it resolves.
	applyLocationTooltips(html).then(() => restrictContentLinks(html));
	// Spiral bullets / question-spirals for this system's prose journals.
	applyJournalSpiralBullets(app, html);
	// Gear/weapon-tag hover tooltips for the curated Setting Overview prose (the
	// Character Creation FAQ's "various tags," the Gear: Terms & Value page). Scoped
	// to that one journal — other prose's em-emphasis on common words like
	// "near"/"close"/"far" would draw spurious range tooltips. Mirrors what
	// SettingOverviewDialog does when it renders the same pages outside a journal.
	if (resolveEntry(app)?.name === SETTING_OVERVIEW_JOURNAL) {
		const root = html?.jquery ? html[0] : html;
		root?.querySelectorAll?.(".journal-page-content").forEach(applyGearTermTooltips);
	}
	// Tick-off the requirement check-lists in view mode (state stored on the page).
	applyJournalCheckboxes(app, html);
	// Roll the random tables straight from their "Roll" header.
	applyJournalRollTables(app, html);
	// Make baked steading-improvement cards draggable onto the Stonetop sheet.
	bindSteadingImprovementDrag(html);
	// Make homebrew threat cards draggable onto the steading Threats tab.
	bindThreatSeedDrag(html);
	// Make Book II treasures draggable inventory items (and restore their ◇/○ badges),
	// for any treasure journal that renders through the generic page sheet rather than
	// the custom location page sheet.
	applyTreasureDrops(html, resolveEntry(app)?.name);
};
for (const hook of ["renderJournalSheet", "renderJournalEntrySheet", "renderJournalPageSheet", "renderJournalEntryPageSheet"]) {
	Hooks.on(hook, _onJournalRender);
}

// -- JOURNAL SHARE BUTTON --------------------------------------
// Give the GM a one-click eye button on the journal entry's header bar to toggle
// whether players can see it (and at what access level). Scoped to the whole-entry
// sheet — v12 fires renderJournalSheet, v13+ renderJournalEntrySheet.
for (const hook of ["renderJournalSheet", "renderJournalEntrySheet"]) {
	Hooks.on(hook, addJournalShareButton);
}

// -- BESTIARY CROSS-LINK INDEX ---------------------------------
// Drop the cached creature name index when a world monster is added, removed,
// or renamed/re-conceived so cross-links stay accurate.
Hooks.on("createActor", (actor) => { if (actor?.type === "monster") invalidateMonsterRefIndex(); });
Hooks.on("deleteActor", (actor) => { if (actor?.type === "monster") invalidateMonsterRefIndex(); });
Hooks.on("updateActor", (actor, changes) => {
	if (actor?.type !== "monster") return;
	if ("name" in (changes ?? {}) || changes?.system?.concept !== undefined) invalidateMonsterRefIndex();
});

// -- CROSS-CLIENT RENDER SYNC ----------------------------------
// Arcana resource-track clicks persist with { render: false } so the masonry doesn't
// repack and jump the tab's scroll (the click handler patches the track's checkboxes in
// place). But Foundry broadcasts that option with the update, so it also suppresses the
// automatic re-render on OTHER clients — leaving a second open sheet of the same actor
// (e.g. the GM's) showing a stale track. Re-render those here: this fires on every client
// after the update, so on the non-initiating clients (the initiator already patched its own
// DOM) we repaint the actor's open sheets. Additive only — it never suppresses a render, so
// it can't reintroduce the scroll jump.
Hooks.on("updateActor", (actor, _changes, options, userId) => {
	if (options?.render !== false || userId === game.user?.id) return;
	for (const app of Object.values(actor.apps ?? {})) app?.render?.(false);
});

// -- RECOVER LOCK ----------------------------------------------
// The Recover special move can't be used again until the character takes more
// damage; clear its lock flag the moment HP drops.
Hooks.on("preUpdateActor", (actor, changes) => {
	if (actor?.type !== "character") return;
	const newHp = foundry.utils.getProperty(changes, "system.attributes.hp.value");
	if (newHp === undefined) return;
	const oldHp = actor.system?.attributes?.hp?.value ?? 0;
	if (newHp < oldHp && actor.getFlag("stonetop_pwd", "recover.spent")) {
		foundry.utils.setProperty(changes, "flags.stonetop_pwd.recover.spent", false);
	}
});

// -- CHAT SPEAKER ALIAS ----------------------------------------
Hooks.on("preCreateChatMessage", (message) => {
	const { token: tokenId, actor: actorId } = message.speaker ?? {};
	const actor = (tokenId ? canvas.tokens?.get(tokenId)?.actor : null)
		?? (actorId ? game.actors?.get(actorId) : null);
	if (!actor || actor.type !== "character") return;
	const playbookName = actor.system?.playbook?.name ?? "";
	if (!playbookName) return;
	message.updateSource({ "speaker.alias": `${actor.name} ${playbookName}` });
});

// -- BLIND / PRIVATE ROLLS -------------------------------------
// Our roll cards print the rolled total (and result tier) in the message flavor,
// which Foundry renders for everyone regardless of whether the roll's result is
// visible to them. So for a viewer who isn't allowed to see the result (blind GM
// rolls, private rolls), drop our card entirely: that lets the `:has(.stonetop-roll-card)`
// rule stop hiding Foundry's own native dice block, which renders as a "??? = ?"
// hidden-roll placeholder. Runs before the button-wiring hooks below so they no-op.
function _chatStripBlindRoll(message, html) {
	if (message.isContentVisible) return;
	html.querySelector(".stonetop-roll-card")?.remove();
}

// -- CHAT-CARD PROSE TREATMENT ---------------------------------
function _chatProseTreatment(message, html) {
	markQuestionBullets(html);
	// Swap inline ◇/◆/○/●/□ ASCII for this system's styled glyphs in our chat-card
	// prose — matching the sheets and journals. Scoped to the card description
	// containers so a literal glyph someone types in chat is left alone.
	html.querySelectorAll(".stonetop-chat-move-description, .stonetop-roll-card-description, .stonetop-arcanum-chat-card")
		.forEach(el => wrapStonetopGlyphsInEl(el));
}

// -- STARTUP CARD: OPEN WELCOME GUIDE --------------------------
// The new-install welcome card carries a button into the first-session guide.
// The card is visible to everyone, but the guide is a GM tool, so hide it for
// players and wire it up for the GM.
function _chatWireStartupWelcome(message, html) {
	const btn = html.querySelector(".stonetop-startup-open-welcome");
	if (!btn) return;
	if (!game.user.isGM) { btn.style.display = "none"; return; }
	btn.addEventListener("click", () => game.stonetop?.openWelcome?.());
}

// -- MOVE DESCRIPTION TOGGLE -----------------------------------
function _chatWireDescToggle(message, html) {
	const toggle = html.querySelector(".stonetop-roll-card-desc-toggle");
	if (!toggle) return;
	toggle.addEventListener("click", () => {
		toggle.closest(".stonetop-roll-card")?.classList.toggle("desc-revealed");
	});
}

// -- DEBILITY DISADVANTAGE ANNOTATION -------------------------
// When a roll was penalised by a debility, annotate the
// "Disadvantage" condition in the chat card with the debility name.
function _chatAnnotateDebility(message, html) {
	const opts = message.rolls?.[0]?.options ?? {};
	const { stonetopDebility: debility, stonetopDebilityTooltip: tooltip } = opts;
	if (!debility) return;
	const pill = html.querySelector(".stonetop-roll-card .stonetop-condition-disadvantage");
	if (pill) {
		const hint = tooltip
			? `<span class="stonetop-debility-hint" data-tooltip="${tooltip}" data-tooltip-direction="UP">${debility}</span>`
			: debility;
		pill.innerHTML = `Disadvantage (${hint})`;
	}
}

// -- ROLL RESULT SHIFTING --------------------------------------
function _chatWireRollShifting(message, html) {
	// Only actual roll results can be shifted (_onRollShift operates on message.rolls).
	// Skip roll-less cards that merely reuse the .stonetop-card-buttons row — the
	// "ask the most hopeful to roll" prompt and the Become-a-Hero prompt — so they
	// don't get dead Shift Up/Down buttons injected.
	if (!message.rolls?.length) return;
	const cardButtons = html.querySelector(".stonetop-roll-card .stonetop-card-buttons");
	if (!cardButtons) return;

	// Shift Up/Down is a GM-only tool for bumping a roll's tier, and off by default —
	// most tables never touch it. When disabled, don't inject or reveal the buttons, and
	// hide any the roll card pre-rendered; the shared .stonetop-card-buttons row is left
	// for Burn Brightly (wired next) to claim if the owner qualifies.
	const showShift = game.user.isGM && getSetting("chatShiftButtons");

	if (showShift && !cardButtons.querySelector("[data-action='shiftUp']")) {
		cardButtons.insertAdjacentHTML("afterbegin", `
			<button data-action="shiftUp">Shift Up</button>
			<button data-action="shiftDown">Shift Down</button>
		`);
	}

	for (const button of cardButtons.querySelectorAll("[data-action='shiftUp'], [data-action='shiftDown']")) {
		button.style.display = showShift ? "" : "none";
		if (showShift) button.addEventListener("click", ev => _onRollShift(ev, message));
	}
	cardButtons.style.display = showShift ? "flex" : "none";
}

// -- BURN BRIGHTLY ---------------------------------------------
const BURN_BRIGHTLY_TOOLTIP =
	"When you have enough XP to Level Up, " +
	"you may spend 2 XP after any roll you make to add +1 to that roll (max +1 per roll).";

function _chatWireBurnBrightly(message, html) {
	const cardButtons = html.querySelector(".stonetop-roll-card .stonetop-card-buttons");
	if (!cardButtons) return;

	const { token: tokenId, actor: actorId } = message.speaker ?? {};
	const actor = (tokenId ? canvas.tokens?.get(tokenId)?.actor : null)
		?? (actorId ? game.actors?.get(actorId) : null);

	if (!actor || actor.type !== "character" || !actor.isOwner) return;

	const alreadyBurned = message.getFlag("stonetop_pwd", "burnBrightly") ?? false;
	const xp    = actor.system?.attributes?.xp?.value    ?? 0;
	const level = actor.system?.attributes?.level?.value ?? 1;
	const canAfford = xp >= 6 + 2 * level;

	if (!canAfford && !alreadyBurned) return;

	const btn = document.createElement("button");
	btn.className = "stonetop-burn-brightly-btn";
	btn.innerHTML = `<span class="stonetop-burn-brightly-icon"></span> Burn brightly`;
	btn.dataset.tooltip = BURN_BRIGHTLY_TOOLTIP;
	btn.dataset.tooltipDirection = "UP";
	btn.disabled = alreadyBurned;

	cardButtons.appendChild(btn);
	cardButtons.style.display = "flex";

	if (alreadyBurned) return;

	btn.addEventListener("click", async () => {
		btn.disabled = true;
		const currentXp    = actor.system?.attributes?.xp?.value    ?? 0;
		const currentLevel = actor.system?.attributes?.level?.value ?? 1;
		if (currentXp < 6 + 2 * currentLevel) {
			ui.notifications.warn("You don't have enough XP to Burn Brightly.");
			btn.disabled = false;
			return;
		}
		try {
			const playbookName = actor.system?.playbook?.name ?? "";
			await actor.update({ "system.attributes.xp.value": currentXp - 2 });
			const newXp = currentXp - 2;
			const maxXp = 6 + 2 * currentLevel;
			ChatMessage.create({
				content: `-2 XP for Burning Brightly.<br>New XP: ${newXp} / ${maxXp}`,
				speaker: ChatMessage.getSpeaker({ actor }),
			});

			const rolls = message.rolls;
			const roll  = rolls.at(0);
			let opTerm  = roll.terms.find(t => t instanceof foundry.dice.terms.OperatorTerm && t.options.rollShifting);
			let numTerm = roll.terms.find(t => t instanceof foundry.dice.terms.NumericTerm  && t.options.rollShifting);
			const originalValue = opTerm && numTerm
				? Roll.safeEval(`${opTerm.operator}${numTerm.number}`)
				: 0;

			if (!numTerm) {
				roll.terms.push(
					opTerm  = new foundry.dice.terms.OperatorTerm({ operator: "+", options: { rollShifting: true } }),
					numTerm = new foundry.dice.terms.NumericTerm({ number: 1, options: { rollShifting: true } })
				);
			} else {
				numTerm.number = Math.abs(Roll.safeEval(`${opTerm.operator}${numTerm.number} + 1`));
			}
			if (numTerm.number === 1 && originalValue === 0 && opTerm.operator !== "+") opTerm.operator = "+";
			else if (numTerm.number === 0) opTerm.operator = "+";

			roll.resetFormula();
			await roll._evaluate();

			const speakerUpdate = playbookName ? { alias: `${actor.name} ${playbookName}` } : {};
			await message.update({
				rolls,
				// Regenerate the card so the readout, result label and per-tier outcome reflect the +1.
				flavor:  _shiftRollCardFlavor(message.flavor, roll.total, roll.formula),
				speaker: { ...message.speaker, ...speakerUpdate },
				flags:   { stonetop_pwd: { burnBrightly: true } },
			});
		} catch (err) {
			console.error("Stonetop | Error burning brightly:", err);
			btn.disabled = false;
		}
	});
}

// -- REQUISITION: apply miss cost from the roll card ------------
function _speakerActor(message) {
	const { token: tokenId, actor: actorId } = message.speaker ?? {};
	return (tokenId ? canvas.tokens?.get(tokenId)?.actor : null)
		?? (actorId ? game.actors?.get(actorId) : null);
}

function _chatWireRequisitionMissCost(message, html) {
	const btn = html.querySelector(".stonetop-requisition-miss-cost");
	if (!btn) return;

	if (message.getFlag("stonetop_pwd", "requisitionMissCostApplied")) {
		btn.disabled = true;
		btn.textContent = "Miss cost applied";
		return;
	}

	btn.addEventListener("click", async () => {
		btn.disabled = true;
		try {
			const actor = _speakerActor(message);
			if (!actor?.isOwner || actor.type !== "stonetop") {
				ui.notifications.warn("You need permission to update the steading's Fortunes.");
				btn.disabled = false;
				return;
			}

			// Go through StonetopSteading so the write lands in BOTH system.* and the
			// mirrored steading flag that getStatValue (and the sheet) actually read from —
			// a raw actor.update of system.* alone leaves the mirror stale and the reduction
			// invisible.
			const steading = new StonetopSteading(actor);
			const fortunes = steading.getStatValue("fortunes");
			const newFortunes = Math.max(fortunes - 1, -1);
			await steading.setSystemValue("stats.fortunes.value", newFortunes, { stonetopMove: "Requisition" });
			await message.setFlag("stonetop_pwd", "requisitionMissCostApplied", true);
			for (const sheet of Object.values(actor.apps ?? {})) sheet.render(false);
			ui.notifications.info(`Fortunes reduced to ${sign(newFortunes)}.`);
		} catch (err) {
			console.error("Stonetop | Error applying Requisition miss cost:", err);
			btn.disabled = false;
		}
	});
}

// -- LOVE LETTER PICK LIST -------------------------------------
// A love letter with a shared "choose from this list" pool renders its options as a
// checklist on the roll card (see rollStat's pickListHtml). Restore any saved ticks and
// wire the boxes so a click persists to the message flag (author/GM) and always toggles
// locally. The letter item itself is consumed on resolve, so the message is the only home
// the checked state has.
function _chatWireLoveLetterPicks(message, html) {
	const boxes = html.querySelectorAll(".stonetop-picklist-check");
	if (!boxes.length) return;

	const saved   = message.getFlag("stonetop_pwd", "pickChecked") ?? [];
	const canSave = message.canUserModify?.(game.user, "update") ?? game.user.isGM;

	for (const box of boxes) {
		const idx  = Number(box.dataset.index);
		const item = box.closest(".stonetop-picklist-item");
		const on   = !!saved[idx];
		box.checked = on;
		item?.classList.toggle("is-picked", on);

		box.addEventListener("change", async () => {
			item?.classList.toggle("is-picked", box.checked);
			if (!canSave) return;
			const arr = Array.from(boxes).map((b) => !!b.checked);
			try {
				await message.setFlag("stonetop_pwd", "pickChecked", arr);
			} catch (err) {
				console.error("Stonetop | Error saving love-letter picks:", err);
			}
		});
	}
}

// -- WOULD-BE HERO: BECOME A HERO ------------------------------
// The first time a Would-Be Hero gains a hero-making (asterisked) move, cross off
// "Would-be" and announce it once. The playbook header already derives "The Hero"
// from owning such a move, so this hook is purely the one-time announcement.
Hooks.on("createItem", (item, options, userId) => maybeAnnounceBecameHero(item, userId, options));

// One render hook drives all of the above, in this order: the blind-roll strip
// MUST run first (it removes our card so the button-wiring helpers below no-op
// for viewers who can't see the result), then prose treatment, then the button
// and annotation passes. A single dispatch beats nine separate hook registrations
// each re-scanning the same message DOM on every chat render.
Hooks.on("renderChatMessageHTML", (message, html) => {
	_chatStripBlindRoll(message, html);
	_chatProseTreatment(message, html);
	_chatWireStartupWelcome(message, html);
	_chatWireDescToggle(message, html);
	_chatAnnotateDebility(message, html);
	_chatWireRollShifting(message, html);
	_chatWireBurnBrightly(message, html);
	_chatWireRequisitionMissCost(message, html);
	_chatWireSeasonsRoll(message, html);
	_chatWireLoveLetterPicks(message, html);
	wireAttackConfirm(message, html);
	wireApplyDamage(message, html);
	wireSufferAttack(message, html);
});

// -- SEASONS CHANGE: "ask the most hopeful to roll" -----------
// Wire the roll button on a spring Seasons Change prompt card (postSeasonsRollPrompt):
// any player can click it to make the +Fortunes roll for the table. The result posts
// its own card; we just disable the button locally so a stray double-click can't fire
// two rolls.
function _chatWireSeasonsRoll(message, html) {
	const btn = html.querySelector(".stonetop-seasons-roll-btn");
	if (!btn) return;

	btn.addEventListener("click", async () => {
		btn.disabled = true;
		const fortunes = Number(btn.dataset.fortunes) || 0;
		// The carried name ("Seasons Change — <season>") heads the result card; the
		// speaker is left to default to whoever clicked (see rollSeasonsCard).
		const title    = btn.dataset.alias || "Seasons Change — Spring";
		const formula  = fortunes >= 0 ? `2d6 + ${fortunes}` : `2d6 - ${-fortunes}`;
		try {
			await rollSeasonsCard({ formula, title, resultTable: SPRING_SEASONS_RESULT });
		} catch (err) {
			console.error("Stonetop | Error rolling Seasons Change from chat:", err);
			btn.disabled = false;
		}
	});
}

async function _onRollShift(event, message) {
	event.preventDefault();
	const button = event.currentTarget;
	button.disabled = true;

	try {
		const roll = message.rolls?.at(0);
		if (!roll) return;

		const shift = button.dataset.action === "shiftUp" ? 1 : -1;
		await _shiftRoll(roll, shift);

		await message.update({
			rolls:  message.rolls,
			flavor: _shiftRollCardFlavor(message.flavor, roll.total, roll.formula),
		});
	} catch (err) {
		console.error("Stonetop | Error shifting roll result:", err);
	} finally {
		button.disabled = false;
	}
}

async function _shiftRoll(roll, shift) {
	const shiftMap = { 1: "+", "-1": "-" };
	let opTerm = roll.terms.find(term => term instanceof foundry.dice.terms.OperatorTerm && term.options.rollShifting);
	let numTerm = roll.terms.find(term => term instanceof foundry.dice.terms.NumericTerm && term.options.rollShifting);
	let originalValue = `${opTerm?.operator ?? ""}${numTerm?.number ?? ""}`;
	if (originalValue !== "" && !Number.isNaN(Number(originalValue))) originalValue = Number(originalValue);

	if (!numTerm) {
		roll.terms.push(
			opTerm = new foundry.dice.terms.OperatorTerm({ operator: shiftMap[shift], options: { rollShifting: true } }),
			numTerm = new foundry.dice.terms.NumericTerm({ number: 1, options: { rollShifting: true } })
		);
	} else {
		numTerm.number = Math.abs(Roll.safeEval(`${opTerm.operator}${numTerm.number} + ${shift}`));
	}

	if (numTerm.number === 1 && originalValue === 0 && opTerm.operator !== shiftMap[shift]) {
		opTerm.operator = shiftMap[shift];
	} else if (numTerm.number === 0) {
		opTerm.operator = "+";
	}

	roll.resetFormula();
	await roll._evaluate();
}

function _shiftRollCardFlavor(flavor, total, formula = null) {
	if (!flavor) return flavor;

	const wrapper = document.createElement("div");
	wrapper.innerHTML = flavor;

	// Keep our own total + formula (which stand in for Foundry's hidden dice block)
	// in sync with the shifted roll. This runs for every roll card, including damage
	// cards that have no result tier. (The die-faces tooltip is left as-is: a shift
	// only adjusts the rollShifting modifier term, never the rolled d6 faces.)
	const numberEl = wrapper.querySelector(".stonetop-roll-card .stonetop-roll-result-number");
	if (numberEl) numberEl.textContent = total;
	if (formula != null) {
		const formulaEl = wrapper.querySelector(".stonetop-roll-card .stonetop-roll-formula");
		if (formulaEl) formulaEl.textContent = formula;
	}

	const resultEl = wrapper.querySelector(".stonetop-roll-card .stonetop-roll-result");
	const resultLabel = resultEl?.querySelector(".stonetop-roll-result-label");
	let result = null;
	if (resultEl && resultLabel) {
		result = _classifyShiftedTotal(total);
		resultEl.classList.remove("success", "partial", "failure", "critical");
		resultEl.classList.add(result.key);
		resultLabel.textContent = result.label;

		// Keep the per-tier outcome line (if any) in sync with the shifted tier. The
		// three outcomes are stashed on the result block as data-outcome-* by _rollCard.
		const details = resultEl.querySelector(".stonetop-roll-result-details");
		if (details) {
			const tierKey = result.key === "critical" ? "success" : result.key;
			const outcome = {
				success: resultEl.dataset.outcomeSuccess,
				partial: resultEl.dataset.outcomePartial,
				failure: resultEl.dataset.outcomeFailure,
			}[tierKey];
			if (outcome !== undefined) details.innerHTML = formatOutcomeDetail(outcome);
		}
	}

	const tierActions = wrapper.querySelector(".stonetop-roll-card .stonetop-roll-tier-actions");
	if (tierActions && result) {
		const activeTier = result.key === "critical" ? "success" : result.key;
		tierActions.dataset.activeTier = activeTier;
		for (const action of tierActions.querySelectorAll(".stonetop-roll-tier-action")) {
			// Set the VALUED attribute, not the `.hidden` property: this innerHTML is written back
			// to the message's flavor (an HTMLField), and Foundry v14's sanitize-html strips
			// valueless boolean attributes — a bare/empty `hidden` would vanish and reveal every tier.
			if (action.dataset.tier === activeTier) action.removeAttribute("hidden");
			else action.setAttribute("hidden", "hidden");
		}
	}

	return wrapper.innerHTML;
}

function _classifyShiftedTotal(total) {
	if (total >= 12) return { key: "critical", label: "12+ Strong Hit" };
	if (total >= 10) return { key: "success", label: "Strong Hit" };
	if (total >= 7) return { key: "partial", label: "Weak Hit" };
	return { key: "failure", label: "Miss" };
}
