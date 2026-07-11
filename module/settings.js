export function registerSettings() {
	// -- WORLD SETTINGS ------------------------------------------

	// Tracks the last loaded module version.
	// Used to detect when migrations need to run.
	game.settings.register("stonetop_pwd", "moduleVersion", {
		name: "Module Version",
		scope: "world",
		config: false,
		type: String,
		default: ""
	});

	// Whether the one-time import of the JournalEntry compendiums into the world
	// has run (see hooks/SeedCompendiums.js). Set true after the first GM load so
	// the gazetteer is seeded exactly once and never re-duplicated.
	game.settings.register("stonetop_pwd", "seedingComplete", {
		name: "Compendium Seeding Complete",
		scope: "world",
		config: false,
		type: Boolean,
		default: false
	});

	// Whether this world has had the system's new-world core setting defaults applied.
	// Used to seed Foundry's Automatic Token Rotation world setting off only during a
	// fresh world's first GM load, without surprising already-established worlds.
	game.settings.register("stonetop_pwd", "coreSettingDefaultsApplied", {
		name: "Core Setting Defaults Applied",
		scope: "world",
		config: false,
		type: Boolean,
		default: false
	});

	// The system version whose shipped journal content was last rolled into the
	// world's seeded copies (see hooks/SeedCompendiums.js). When this trails the
	// running version, the update pass refreshes pristine (un-edited) seeded
	// journals and records the new version here.
	game.settings.register("stonetop_pwd", "journalSyncVersion", {
		name: "Journal Sync Version",
		scope: "world",
		config: false,
		type: String,
		default: ""
	});

	// Whether the GM wants the automatic start-of-session chat reminders (currently
	// the Destined "+Omens" roll, see hooks/StonetopSingleton.js remindDestinedOmenRoll).
	// World-scoped: showing the table its session-start upkeep is a per-world decision,
	// and only the GM posts the card, so a per-browser client toggle would never match
	// who actually fires it. Defaults on; GMs who don't want the nudge can untick it.
	game.settings.register("stonetop_pwd", "startOfSessionReminders", {
		name: "stonetop.settings.startOfSessionReminders.name",
		hint: "stonetop.settings.startOfSessionReminders.hint",
		scope: "world",
		config: true,
		type: Boolean,
		default: true,
	});

	// Adds the "Shift Up" / "Shift Down" buttons to move roll cards in chat, letting the
	// GM bump a roll's result to a higher or lower tier (see _chatWireRollShifting /
	// _onRollShift in stonetop.js). Only the GM ever sees them. Off by default — it's a
	// niche GM tool most tables never reach for, and the buttons add a row to every roll
	// card. World-scoped: whether the table uses tier-shifting is a per-world call, and
	// only the GM acts on it.
	game.settings.register("stonetop_pwd", "chatShiftButtons", {
		name: "stonetop.settings.chatShiftButtons.name",
		hint: "stonetop.settings.chatShiftButtons.hint",
		scope: "world",
		config: true,
		type: Boolean,
		default: false,
	});

	// When on (the default), only the GM may author custom moves — players don't see
	// the "+ Custom Move" button or the edit pencils, and the create/edit handlers are
	// no-ops for them. Existing custom moves still display and roll for everyone; this
	// only gates AUTHORING. Off lets any player author on their own character.
	game.settings.register("stonetop_pwd", "customMovesGmOnly", {
		name: "stonetop.settings.customMovesGmOnly.name",
		hint: "stonetop.settings.customMovesGmOnly.hint",
		scope: "world",
		config: true,
		type: Boolean,
		default: true,
	});

	// As customMovesGmOnly, but for homebrew arcana (minor & major) and the
	// inspiration wizard. When on (the default), only the GM sees the "Create
	// arcanum" bar and the inspiration wizard on the arcana tab; existing arcana
	// still render and the editor still opens for whoever owns the card. Kept
	// independent of customMovesGmOnly so a GM can permit one and not the other.
	game.settings.register("stonetop_pwd", "arcanaCreationGmOnly", {
		name: "stonetop.settings.arcanaCreationGmOnly.name",
		hint: "stonetop.settings.arcanaCreationGmOnly.hint",
		scope: "world",
		config: true,
		type: Boolean,
		default: true,
	});

	// When on (the default), creating a blank Monster from "Create Actor" opens the
	// guided worksheet (Book I "Dangers") that computes HP/armor/damage from tag
	// picks. Off drops straight to a blank stat block. Imports, compendium drops,
	// and duplicates are never intercepted, only manual blank creates.
	game.settings.register("stonetop_pwd", "monsterBuilderEnabled", {
		name: "stonetop.settings.monsterBuilderEnabled.name",
		hint: "stonetop.settings.monsterBuilderEnabled.hint",
		scope: "world",
		config: true,
		type: Boolean,
		default: true,
	});

	// Whether players may PEEK at a card's BACK before unlocking it. A card's OWNER always
	// sees its back once unlocked (every spot filled), regardless of this setting —
	// unlocking is their own achievement. This switch is the separate peek: on (the
	// default) lets players open the back of a not-yet-unlocked card; off keeps an
	// un-unlocked back hidden until the GM clicks "Reveal back to player" on it. The GM
	// always sees both sides. See the per-card visibility model in
	// StonetopCharacterSheet.getData / CharacterArcana.
	game.settings.register("stonetop_pwd", "arcanaPlayersSeeBothSides", {
		name: "stonetop.settings.arcanaPlayersSeeBothSides.name",
		hint: "stonetop.settings.arcanaPlayersSeeBothSides.hint",
		scope: "world",
		config: true,
		type: Boolean,
		default: true,
	});

	// The flagship "threats on the map" option. When on, each threat pin also draws its
	// full book card on the canvas, anchored to the pin and panning/zooming with the
	// scene, with a live doom track the GM ticks right there. Off by default: the safe
	// path is a pin that opens the card in a window (works everywhere, no canvas overlay).
	game.settings.register("stonetop_pwd", "threatOnCanvasCards", {
		name: "stonetop.settings.threatOnCanvasCards.name",
		hint: "stonetop.settings.threatOnCanvasCards.hint",
		scope: "world",
		config: true,
		type: Boolean,
		default: false,
		onChange: () => game.stonetop?.threatBoard?.refresh?.(),
	});

	game.settings.register("stonetop_pwd", "startupWelcomeShown", {
		name: "Startup Welcome Shown",
		scope: "world",
		config: false,
		type: Boolean,
		default: false
	});

	// Whether the "(TEST ONLY) Populate World" dev macro has been seeded into the
	// world's Macro Directory (see hooks/Ready.js _ensureTestPopulateMacro). Set true
	// after the first GM load so it's added exactly once — a GM who later deletes it
	// keeps it gone rather than having it reappear every reload.
	game.settings.register("stonetop_pwd", "testPopulateMacroSeeded", {
		name: "Test Populate Macro Seeded",
		scope: "world",
		config: false,
		type: Boolean,
		default: false
	});

	// Whether the GM has dismissed the "first session" Welcome guide's automatic
	// pop-up (see dialogs/WelcomeDialog.js). While false, the guide opens for the
	// GM on every world load; ticking "Don't show this automatically" sets it true.
	game.settings.register("stonetop_pwd", "gmWelcomeShown", {
		name: "GM Welcome Guide Dismissed",
		scope: "world",
		config: false,
		type: Boolean,
		default: false
	});

	// Which session-zero walkthroughs THIS world has finished (Character Introductions
	// and Let Spring Burst Forth). Set when a walkthrough's final button is pressed;
	// once both are true the Welcome guide stops auto-opening (sessionZeroComplete in
	// dialogs/walkthrough-resume.js). World-scoped on purpose: "has this world finished
	// its first session" is world state, so a fresh world starts over — unlike the
	// client-scoped `walkthroughResume` below, which would leak completion across every
	// world opened in the same browser. Shape: { introductions: <bool>, springBurst: <bool> }.
	game.settings.register("stonetop_pwd", "sessionZeroDone", {
		name: "Session Zero Walkthroughs Complete",
		scope: "world",
		config: false,
		type: Object,
		default: {}
	});

	// Answers the GM records in the "Let spring burst forth" walkthrough (see
	// dialogs/SpringBurstDialog.js) — the first-session notes that have no document
	// of their own (who's most hopeful, the season's chosen gain/hook, and what
	// excites each player about their PC). Shape: { hopeful, gain, excites: { <actorId>: text } }.
	game.settings.register("stonetop_pwd", "springBurstAnswers", {
		name: "Let Spring Burst Forth Answers",
		scope: "world",
		config: false,
		type: Object,
		default: {}
	});

	// Answers recorded in the guided Character Introductions (see
	// dialogs/IntroductionsDialog.js) — what each PC established about themselves and
	// Stonetop. GM-written (only a GM can write a world setting): the GM types the
	// narration rounds and HARVESTS each player's own `flags.stonetop_pwd.intro` flag
	// (the player-driven answer/ask steps) into here for the Chronicle. Compiled into the
	// shared "Chronicle" journal (utils/chronicle.js). Shape, keyed by actor id:
	//   { <actorId>: {
	//       r1, r2, r3: "<text>",                    // narration rounds (GM-typed)
	//       step4: { answers: [ { q: <questionIndex>, a: "<text>" }, … ], passed: <bool> },
	//       step6: { answers: [ { q, a }, … ], passed: <bool> },   // ask step
	//       r4..r7: { q, a }                          // LEGACY single-answer rounds, read-only
	//   } }
	// step4 folds the old r4/r5 "answer" rounds into one looping step (up to 4 answers,
	// one per playbook question); step6 folds r6/r7. The compiler reads both the step
	// lists and the legacy r4–r7 keys, so already-run worlds keep compiling unchanged.
	game.settings.register("stonetop_pwd", "introductionsAnswers", {
		name: "Character Introductions Answers",
		scope: "world",
		config: false,
		type: Object,
		default: {}
	});

	// GM-driven session cursor for the guided Character Introductions — whose turn it is
	// and which step (see dialogs/IntroductionsDialog.js). Only the PRIMARY GM writes it;
	// every client reacts through this registered onChange (which fires on all clients, GM
	// and player, on the first write too — unlike Hooks.on("updateSetting")) to open/focus/
	// close the dialog on the active player's screen. `nonce` bumps on every write so a
	// Back-to-the-same-step still fires onChange (Foundry suppresses equal-value writes).
	// `pcOrder` is the GM-authored turn order (actor ids) so players seed their roster from
	// the cursor rather than their own scene-scoped game.combat. Shape:
	//   { active: <bool>, phase: <0-6>, activeActorId: "<id>",
	//     activeUserId: "<owning player's user id>", pcOrder: [ "<id>", … ], nonce: <int> }.
	game.settings.register("stonetop_pwd", "introCursor", {
		name: "Character Introductions Cursor",
		scope: "world",
		config: false,
		type: Object,
		default: { active: false, phase: 0, activeActorId: "", activeUserId: "", pcOrder: [], nonce: 0 },
		onChange: value => game.stonetop?.onIntroCursor?.(value),
	});

	// Notes the GM records in the Expedition walkthrough (see dialogs/ExpeditionDialog.js).
	// Expeditions recur, so this is a growing log of trips, each compiled into its own
	// "Expedition: …" page in the shared Chronicle (utils/chronicle-core.js). Shape:
	//   { currentId: "<id>",                     // the trip the dialog is editing
	//     list: [ { id, title, createdAt,
	//               chart: { route, checks: { warmClothes: true }, notes },
	//               outfit, requisition, prep, running,   // single-text step notes
	//               home: { checks, notes } }, … ] }      // oldest trip first
	game.settings.register("stonetop_pwd", "expeditionAnswers", {
		name: "Expedition Walkthrough Notes",
		scope: "world",
		config: false,
		type: Object,
		default: {}
	});

	// The system-macro hotbar layout version this client has been snapped to (see
	// hooks/Ready.js _SYSTEM_MACROS / _reorderSystemMacros). Bumping _HOTBAR_LAYOUT_VERSION
	// re-snaps the system macros into their new canonical slots once, then leaves the
	// GM's own arrangement alone again. Per-client because the hotbar is per-user;
	// starts at 0 so a fresh world (and any pre-versioning world) arranges on first load.
	game.settings.register("stonetop_pwd", "systemHotbarLayoutVersion", {
		name: "System Hotbar Layout Version",
		scope: "client",
		config: false,
		type: Number,
		default: 0
	});

	// The season last picked in the Weather roll dialog (see dialogs/WeatherDialog.js),
	// so it reopens to where the GM left off. Client-scoped — it's a GM convenience,
	// not shared world state. Holds a WEATHER_SEASONS key (or "" before first use).
	game.settings.register("stonetop_pwd", "weatherSeason", {
		name: "Weather Roll Season",
		scope: "client",
		config: false,
		type: String,
		default: ""
	});

	// Reload-resume state for the session-zero walkthroughs — Character Introductions
	// and Let Spring Burst Forth (see dialogs/walkthrough-resume.js). The dialogs don't
	// survive a browser refresh, so each records where it is and whether it's open, and
	// hooks/Ready.js reopens any that were still open at the page they were on. Client-
	// scoped because this is per-user, local UI state (which browser had a dialog open).
	// Completion lives in the world-scoped `sessionZeroDone` setting above instead, so it
	// doesn't leak across worlds. Shape:
	//   { introductions: { open: <bool>, phase: <0-8>, pcIndex: <int> },
	//     springBurst:   { open: <bool>, step: <int>, delegated: <bool> } }
	game.settings.register("stonetop_pwd", "walkthroughResume", {
		name: "Walkthrough Resume State",
		scope: "client",
		config: false,
		type: Object,
		default: {}
	});

	// -- CLIENT SPECIFIC SETTINGS --------------------------------

	// Whether this user has had the Setting Overview journal auto-opened once (see
	// hooks/Ready.js). Per-client so each player gets the fresh-start orientation
	// the first time they connect, GM included, without re-popping every load.
	game.settings.register("stonetop_pwd", "settingOverviewShown", {
		name: "Setting Overview Shown",
		scope: "client",
		config: false,
		type: Boolean,
		default: false
	});

	game.settings.register("stonetop_pwd", "sheetFont", {
		name: "stonetop.settings.sheetFont.name",
		hint: "stonetop.settings.sheetFont.hint",
		scope: "client",
		config: true,
		type: String,
		choices: {
			"libre-caslon":   "stonetop.settings.sheetFont.libreCaslon",
			"im-fell-english": "stonetop.settings.sheetFont.imFellEnglish",
			"signika":         "stonetop.settings.sheetFont.signika",
		},
		default: "signika",
		onChange: value => applySheetFont(value),
	});

	game.settings.register("stonetop_pwd", "sheetFontScale", {
		name: "stonetop.settings.sheetFontScale.name",
		hint: "stonetop.settings.sheetFontScale.hint",
		scope: "client",
		config: true,
		type: String,
		choices: {
			"0.9":  "stonetop.settings.sheetFontScale.smaller",
			"1":    "stonetop.settings.sheetFontScale.normal",
			"1.1":  "stonetop.settings.sheetFontScale.large",
			"1.25": "stonetop.settings.sheetFontScale.larger",
			"1.4":  "stonetop.settings.sheetFontScale.largest",
		},
		default: "1",
		onChange: value => applySheetFontScale(value),
	});

	// How long you must hover a section before its edit pencil fades in (seconds).
	// Drives the --st-edit-reveal-delay CSS variable. The pencils stay clickable
	// while still invisible, so this only affects when they become visible.
	game.settings.register("stonetop_pwd", "editPencilRevealDelay", {
		name: "stonetop.settings.editPencilRevealDelay.name",
		hint: "stonetop.settings.editPencilRevealDelay.hint",
		scope: "client",
		config: true,
		type: Number,
		range: { min: 0, max: 3, step: 0.1 },
		default: 1,
		onChange: value => applyEditPencilRevealDelay(value),
	});

	// Hide the decorative dice (rollable) icon that marks rollable moves and stats.
	// Rolling still works without it — clicking the move name or stat row fires the
	// same roll. Drives the `stonetop-hide-rollable-icon` root class.
	game.settings.register("stonetop_pwd", "hideRollableIcon", {
		name: "stonetop.settings.hideRollableIcon.name",
		hint: "stonetop.settings.hideRollableIcon.hint",
		scope: "client",
		config: true,
		type: Boolean,
		default: false,
		onChange: value => applyHideRollableIcon(value),
	});

	// Prompt for a one-off situational modifier before each 2d6 move/stat roll on
	// the character sheet (a held bonus, a GM-granted +1, etc.). Read at roll time
	// (StonetopCharacterSheet); Shift-clicking the roll skips the prompt.
	game.settings.register("stonetop_pwd", "promptRollModifier", {
		name: "stonetop.settings.promptRollModifier.name",
		hint: "stonetop.settings.promptRollModifier.hint",
		scope: "client",
		config: true,
		type: Boolean,
		default: false,
	});

	// Open actor sheets (character / steading / monster) in Edit mode instead of
	// Play mode. Read once when the sheet is constructed; the header wrench still
	// toggles modes per-sheet afterward.
	game.settings.register("stonetop_pwd", "openSheetsInEditMode", {
		name: "stonetop.settings.openSheetsInEditMode.name",
		hint: "stonetop.settings.openSheetsInEditMode.hint",
		scope: "client",
		config: true,
		type: Boolean,
		default: false,
	});

	// Strip the decorative animations, transitions, and hover-zoom image popups
	// from Stonetop UI for users who find them distracting or are motion-sensitive.
	// Drives the `stonetop-reduce-motion` root class.
	// Reopen the document sheets (characters, steadings, monsters, items, journals)
	// this user had open when they reload, at the same position and size. Per-client
	// because window layout is personal, not shared world state. Defaults on. The
	// live tracking + restore lives in utils/window-restore.js.
	game.settings.register("stonetop_pwd", "restoreWindowsOnReload", {
		name: "stonetop.settings.restoreWindowsOnReload.name",
		hint: "stonetop.settings.restoreWindowsOnReload.hint",
		scope: "client",
		config: true,
		type: Boolean,
		default: true,
	});

	// Snapshot of the sheets this user had open at last reload, keyed by document
	// uuid -> { left, top, width, height, minimized } (see utils/window-restore.js).
	// Internal (not shown in the settings menu); rewritten continuously as windows
	// open, close, and move.
	game.settings.register("stonetop_pwd", "openWindowsState", {
		scope: "client",
		config: false,
		type: Object,
		default: {},
	});

	game.settings.register("stonetop_pwd", "reduceMotion", {
		name: "stonetop.settings.reduceMotion.name",
		hint: "stonetop.settings.reduceMotion.hint",
		scope: "client",
		config: true,
		type: Boolean,
		default: false,
		onChange: value => applyReduceMotion(value),
	});

	// Remembers each character (playbook) sheet's width so it reopens at the size
	// the user last left it. Per-user (client) and per-actor: a map of actor id
	// -> width. Internal (not shown in the settings menu).
	game.settings.register("stonetop_pwd", "characterSheetWidths", {
		scope: "client",
		config: false,
		type: Object,
		default: {},
	});

	// Remembers which collapsible crew follower sections (Inventory / Roster /
	// Group Fight) each character left expanded, so the sheet reopens in the same
	// state. Per-user (client) and per-actor: a map of actor id -> array of open
	// section ids. Internal (not shown in the settings menu).
	game.settings.register("stonetop_pwd", "crewSectionsOpen", {
		scope: "client",
		config: false,
		type: Object,
		default: {},
	});

	// Remembers which sidebar move groups (Basic Moves / Expedition Moves) each
	// character left collapsed, so the sheet reopens in the same state. These
	// default to expanded, so we store the *collapsed* ids (absence = open).
	// Per-user (client) and per-actor: a map of actor id -> array of collapsed
	// section ids. Internal (not shown in the settings menu).
	game.settings.register("stonetop_pwd", "movesSectionsCollapsed", {
		scope: "client",
		config: false,
		type: Object,
		default: {},
	});

	// Remembers which Arcana sections (Major / Minor arcanum) each character left
	// collapsed, so the sheet reopens in the same state. These default to expanded,
	// so we store the *collapsed* ids (absence = open). Per-user (client) and
	// per-actor: a map of actor id -> array of collapsed section ids. Internal.
	game.settings.register("stonetop_pwd", "arcanaSectionsCollapsed", {
		scope: "client",
		config: false,
		type: Object,
		default: {},
	});

	// Remembers which reverse-side arcanum content sections (e.g. "Consequences") each
	// character left EXPANDED. Unlike the Major / Minor sections above, these default to
	// COLLAPSED — they're long, secondary reference — so we store the *expanded* ids
	// (absence = collapsed). Per-user (client) and per-actor: a map of actor id -> array
	// of expanded section ids. Internal (not shown in the settings menu).
	game.settings.register("stonetop_pwd", "arcanaContentExpanded", {
		scope: "client",
		config: false,
		type: Object,
		default: {},
	});

	// Remembers which individual arcanum CARDS each character left collapsed (clamped to
	// just their title bar). Like the Major / Minor sections, cards default to EXPANDED, so
	// a card id (its slug) present here means that card should reopen collapsed. Per-user
	// (client) and per-actor: a map of actor id -> array of collapsed card slugs. Internal.
	game.settings.register("stonetop_pwd", "arcanaCardsCollapsed", {
		scope: "client",
		config: false,
		type: Object,
		default: {},
	});

	// Remembers whether each character left the whole moves sidebar (Roll Modifier
	// + Basic / Expedition move lists) collapsed, so the sheet reopens the same way.
	// The sidebar defaults to expanded. Per-user (client) and per-actor: a map of
	// actor id -> boolean. Internal (not shown in the settings menu).
	game.settings.register("stonetop_pwd", "characterSidebarCollapsed", {
		scope: "client",
		config: false,
		type: Object,
		default: {},
	});

	game.settings.register("stonetop_pwd", "showRollStatChips", {
		name: "stonetop.settings.showRollStatChips.name",
		hint: "stonetop.settings.showRollStatChips.hint",
		scope: "client",
		config: true,
		type: Boolean,
		default: true,
		onChange: () => _rerenderActorSheets(),
	});

	game.settings.register("stonetop_pwd", "showMoveDescriptionsInChat", {
		name: "stonetop.settings.showMoveDescriptionsInChat.name",
		hint: "stonetop.settings.showMoveDescriptionsInChat.hint",
		scope: "client",
		config: true,
		type: Boolean,
		default: true,
		onChange: value => applyMoveDescriptionBodyClass(value),
	});

	game.settings.register("stonetop_pwd", "hoverDescriptionsEnabled", {
		name: "stonetop.settings.hoverDescriptionsEnabled.name",
		hint: "stonetop.settings.hoverDescriptionsEnabled.hint",
		scope: "client",
		config: false,
		type: Boolean,
		default: true,
	});

	for (const key of HOVER_DESCRIPTION_SETTING_KEYS) {
		game.settings.register("stonetop_pwd", key, {
			name: `stonetop.settings.${key}.name`,
			hint: `stonetop.settings.${key}.hint`,
			scope: "client",
			config: false,
			type: Boolean,
			default: true,
		});
	}

	game.settings.registerMenu("stonetop_pwd", "hoverDescriptionSettings", {
		name: "stonetop.settings.hoverDescriptionSettings.name",
		label: "stonetop.settings.hoverDescriptionSettings.label",
		hint: "stonetop.settings.hoverDescriptionSettings.hint",
		icon: "fas fa-info-circle",
		type: _createHoverDescriptionSettingsApp(),
		restricted: false,
	});
}

export const HOVER_DESCRIPTION_SETTING_KEYS = [
	"hoverDescriptionsStats",
	"hoverDescriptionsBasicMoves",
	"hoverDescriptionsPlaybookMoves",
	"hoverDescriptionsTraits",
	"hoverDescriptionsGearTags",
	"hoverDescriptionsMonsterRefs",
	"hoverDescriptionsInvocations",
	"hoverDescriptionsVitals",
	"hoverDescriptionsMonsterTags",
	"hoverDescriptionsSteadingStats",
	"hoverDescriptionsValues",
	"hoverDescriptionsDebilities",
];

function _createHoverDescriptionSettingsApp() {
	return class HoverDescriptionSettingsApp extends FormApplication {
		static get defaultOptions() {
			return foundry.utils.mergeObject(super.defaultOptions, {
				id: "stonetop-hover-description-settings",
				title: game.i18n.localize("stonetop.settings.hoverDescriptionSettings.title"),
				template: "systems/stonetop_pwd/templates/settings/hover-descriptions.hbs",
				width: 520,
				height: "auto",
				resizable: true,
				closeOnSubmit: true,
			});
		}

		async getData() {
			const settings = HOVER_DESCRIPTION_SETTING_KEYS.map(key => ({
				key,
				name: game.i18n.localize(`stonetop.settings.${key}.name`),
				hint: game.i18n.localize(`stonetop.settings.${key}.hint`),
				enabled: getHoverDescriptionSetting(key, { ignoreMaster: true }),
			}));
			return {
				enabled: getSetting("hoverDescriptionsEnabled"),
				settings,
			};
		}

		async _updateObject(_event, formData) {
			await setSetting("hoverDescriptionsEnabled", !!formData.hoverDescriptionsEnabled);
			for (const key of HOVER_DESCRIPTION_SETTING_KEYS) {
				await setSetting(key, !!formData[key]);
			}
			_rerenderActorSheets();
		}
	};
}

const _FONT_MAP = {
	"libre-caslon":    '"Libre Caslon Text", serif',
	"im-fell-english": '"IM Fell English", serif',
	"signika":         "Signika, sans-serif",
};

export function applySheetFont(value) {
	const font = _FONT_MAP[value] ?? _FONT_MAP["libre-caslon"];
	document.documentElement.style.setProperty("--font-stonetop", font);
}

export function applySheetFontScale(value) {
	const scale = Number(value);
	const safe  = Number.isFinite(scale) && scale > 0 ? scale : 1;
	document.documentElement.style.setProperty("--stonetop-font-scale", String(safe));
}

export function applyEditPencilRevealDelay(value) {
	const seconds = Number(value);
	const safe    = Number.isFinite(seconds) && seconds >= 0 ? seconds : 1;
	document.documentElement.style.setProperty("--st-edit-reveal-delay", `${safe}s`);
}

export function applyHideRollableIcon(value) {
	document.documentElement.classList.toggle("stonetop-hide-rollable-icon", !!value);
}

export function applyReduceMotion(value) {
	document.documentElement.classList.toggle("stonetop-reduce-motion", !!value);
}

// Whether to prompt for a one-off situational modifier before a move/stat roll.
export function getPromptRollModifierSetting() {
	return globalThis.game?.settings?.get?.("stonetop_pwd", "promptRollModifier") ?? false;
}

// Whether actor sheets should open in Edit mode rather than Play mode.
export function getOpenSheetsInEditMode() {
	return globalThis.game?.settings?.get?.("stonetop_pwd", "openSheetsInEditMode") ?? false;
}

// Whether the rollable dice icon is hidden; when it is, rolls fire from the move
// name / stat row instead of the (now absent) icon.
export function getHideRollableIconSetting() {
	return globalThis.game?.settings?.get?.("stonetop_pwd", "hideRollableIcon") ?? false;
}

export function getSetting(key) {
	return game.settings.get("stonetop_pwd", key);
}

// Last-used width for a given character sheet, or null if none stored yet.
export function getCharacterSheetWidth(actorId) {
	if (!actorId) return null;
	const map = globalThis.game?.settings?.get?.("stonetop_pwd", "characterSheetWidths");
	const w = map?.[actorId];
	return Number.isFinite(w) && w > 0 ? w : null;
}

export function setCharacterSheetWidth(actorId, width) {
	if (!actorId) return;
	const w = Math.round(Number(width));
	if (!Number.isFinite(w) || w <= 0) return;
	if (w === getCharacterSheetWidth(actorId)) return; // avoid redundant writes
	const map = globalThis.game?.settings?.get?.("stonetop_pwd", "characterSheetWidths") ?? {};
	return game.settings.set("stonetop_pwd", "characterSheetWidths", { ...map, [actorId]: w });
}

// Per-actor, per-user list of collapsible section ids (sorted, de-duped), or []
// if nothing stored yet. Shared by the crew follower sections and the sidebar
// move groups, which differ only in the setting key they persist under.
function getSectionList(key, actorId) {
	if (!actorId) return [];
	const arr = globalThis.game?.settings?.get?.("stonetop_pwd", key)?.[actorId];
	return Array.isArray(arr) ? arr : [];
}

function setSectionList(key, actorId, sections) {
	if (!actorId) return;
	const next = Array.from(new Set(sections ?? [])).sort();
	const map  = globalThis.game?.settings?.get?.("stonetop_pwd", key) ?? {};
	const prev = Array.isArray(map[actorId]) ? [...map[actorId]].sort() : [];
	if (next.join("|") === prev.join("|")) return; // avoid redundant writes
	return game.settings.set("stonetop_pwd", key, { ...map, [actorId]: next });
}

// The collapsible crew follower sections a character left expanded.
export function getCrewSectionsOpen(actorId) {
	return getSectionList("crewSectionsOpen", actorId);
}

export function setCrewSectionsOpen(actorId, sections) {
	return setSectionList("crewSectionsOpen", actorId, sections);
}

// The sidebar move groups a character left collapsed. Move groups default to
// expanded, so an id present here means that group should reopen collapsed.
export function getMovesSectionsCollapsed(actorId) {
	return getSectionList("movesSectionsCollapsed", actorId);
}

export function setMovesSectionsCollapsed(actorId, sections) {
	return setSectionList("movesSectionsCollapsed", actorId, sections);
}

// The Arcana sections (Major / Minor) a character left collapsed. They default to
// expanded, so an id present here means that section should reopen collapsed.
export function getArcanaSectionsCollapsed(actorId) {
	return getSectionList("arcanaSectionsCollapsed", actorId);
}

export function setArcanaSectionsCollapsed(actorId, sections) {
	return setSectionList("arcanaSectionsCollapsed", actorId, sections);
}

// The reverse-side arcanum content sections (e.g. Consequences) a character left
// expanded. These default to collapsed, so an id present here means that section
// should reopen expanded.
export function getArcanaContentExpanded(actorId) {
	return getSectionList("arcanaContentExpanded", actorId);
}

export function setArcanaContentExpanded(actorId, sections) {
	return setSectionList("arcanaContentExpanded", actorId, sections);
}

// The individual arcanum cards a character left collapsed (clamped to their title
// bar). They default to expanded, so a card slug present here means that card should
// reopen collapsed.
export function getArcanaCardsCollapsed(actorId) {
	return getSectionList("arcanaCardsCollapsed", actorId);
}

export function setArcanaCardsCollapsed(actorId, slugs) {
	return setSectionList("arcanaCardsCollapsed", actorId, slugs);
}

// Whether a character left the whole moves sidebar collapsed (defaults to false /
// expanded). Per-actor, per-user.
export function getSidebarCollapsed(actorId) {
	if (!actorId) return false;
	const map = globalThis.game?.settings?.get?.("stonetop_pwd", "characterSidebarCollapsed");
	return !!map?.[actorId];
}

export function setSidebarCollapsed(actorId, collapsed) {
	if (!actorId) return;
	const next = !!collapsed;
	const map  = globalThis.game?.settings?.get?.("stonetop_pwd", "characterSidebarCollapsed") ?? {};
	if (next === !!map[actorId]) return; // avoid redundant writes
	return game.settings.set("stonetop_pwd", "characterSidebarCollapsed", { ...map, [actorId]: next });
}

export function getHoverDescriptionSetting(key, { ignoreMaster = false } = {}) {
	const settings = globalThis.game?.settings;
	const masterEnabled = ignoreMaster ? true : settings?.get?.("stonetop_pwd", "hoverDescriptionsEnabled") ?? true;
	const settingEnabled = settings?.get?.("stonetop_pwd", key) ?? true;
	return masterEnabled && settingEnabled;
}

export function getRollStatChipsSetting() {
	return globalThis.game?.settings?.get?.("stonetop_pwd", "showRollStatChips") ?? true;
}

export function applyMoveDescriptionBodyClass(show) {
	document.body.classList.toggle("stonetop-hide-roll-descriptions", !show);
}

export function setSetting(key, value) {
	return game.settings.set("stonetop_pwd", key, value);
}

function _rerenderActorSheets() {
	for (const app of Object.values(globalThis.ui?.windows ?? {})) {
		if (app?.actor) app.render(false);
	}
}
