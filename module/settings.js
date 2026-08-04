import { DEFAULT_ROOT as DEFAULT_BOOK2_ART_ROOT } from "./book2-art/art-root.js";

export function registerSettings() {
	// -- WORLD SETTINGS ------------------------------------------

	// NB: there is no general "moduleVersion" stamp. Each versioned pass owns the version
	// it last ran for — `journalSyncVersion` (seeded journal refresh), `book2ArtSyncVersion`
	// (durable art re-apply), `idMigrationFinishedFor` (the id sweep) — so one pass shipping
	// a new version can't silently mark the others as already done for it.

	// Whether the one-time import of the JournalEntry compendiums into the world
	// has run (see hooks/SeedCompendiums.js). Set true after the first GM load so
	// the gazetteer is seeded exactly once and never re-duplicated.
	game.settings.register("stonetop-pwd", "seedingComplete", {
		name: "Compendium Seeding Complete",
		scope: "world",
		config: false,
		type: Boolean,
		default: false
	});

	// Which system id the Phase 3 id-migration sweep last completed for. Stores the id
	// rather than a boolean so a future rename re-runs it, and so a brand-new world (which
	// has nothing to sweep) can be stamped without pretending a migration happened.
	game.settings.register("stonetop-pwd", "idMigrationFinishedFor", {
		name: "System ID Migration Completed For",
		scope: "world",
		config: false,
		type: String,
		default: ""
	});

	// Whether the one-time import of the Monsters (stonetop-bestiary) actor compendium
	// into the world's Actors sidebar has run (see hooks/SeedActors.js). Independent of
	// `seedingComplete` (which covers the JournalEntry packs) so an established world whose
	// journals were seeded long ago still imports the monster sheets on the first load
	// after this shipped. Set true after the first GM load so the bestiary is seeded once.
	game.settings.register("stonetop-pwd", "bestiaryActorsSeeded", {
		name: "Bestiary Actors Seeded",
		scope: "world",
		config: false,
		type: Boolean,
		default: false
	});

	// Whether this world has had the retired "The World" wrapper folder un-nested (see
	// hooks/SeedCompendiums.unnestSeededWorldRootOnce). Older seeds grouped the four
	// gazetteer trees under a single "The World" folder, which pushed the deep Bestiary
	// codex past Foundry's folder-render depth; the migration lifts the trees to the
	// sidebar root and deletes the wrapper. Set true once it has run (no-op on fresh worlds).
	game.settings.register("stonetop-pwd", "worldRootUnnested", {
		name: "World Root Un-nested",
		scope: "world",
		config: false,
		type: Boolean,
		default: false
	});

	// Whether the seeded world Bestiary's actor subfolders have been collapsed (see
	// hooks/SeedActors.collapseBestiaryActorSubfoldersOnce). The tree was seeded
	// Bestiary > section > region > creature > actor; that depth hid the deepest monsters
	// past Foundry's folder-render limit, so the migration flattens it to Bestiary > section
	// > actor. Set true once it has run (no-op on worlds seeded from the collapsed compendium).
	game.settings.register("stonetop-pwd", "bestiaryActorFoldersCollapsed", {
		name: "Bestiary Actor Folders Collapsed",
		scope: "world",
		config: false,
		type: Boolean,
		default: false
	});

	// Whether the one-time import of the Book II "Treasures & Wonders" items from the
	// stonetop-items compendium into the world's Items sidebar has run (see
	// hooks/SeedItems.js). Independent of the journal/bestiary seeds so an established
	// world still gets the treasure library on the first load after this shipped. Set
	// true after the first GM load so the treasures are seeded once and never duplicated.
	game.settings.register("stonetop-pwd", "treasureItemsSeeded", {
		name: "Treasure Items Seeded",
		scope: "world",
		config: false,
		type: Boolean,
		default: false
	});

	// Whether this world has had the system's new-world core setting defaults applied.
	// Used to seed Foundry's Automatic Token Rotation world setting off only during a
	// fresh world's first GM load, without surprising already-established worlds.
	game.settings.register("stonetop-pwd", "coreSettingDefaultsApplied", {
		name: "Core Setting Defaults Applied",
		scope: "world",
		config: false,
		type: Boolean,
		default: false
	});

	// Whether this world has had players granted Foundry's ACTOR_CREATE permission
	// (see hooks/Ready.js _ensurePlayerActorCreationGrant). Independent of the fresh-
	// world gate above so ESTABLISHED worlds — which skip the new-world defaults —
	// still get the grant the actor-backed steading roster depends on. One-time: once
	// set, a GM who later revokes the permission keeps it revoked.
	game.settings.register("stonetop-pwd", "playerActorCreationGranted", {
		name: "Player Actor Creation Granted",
		scope: "world",
		config: false,
		type: Boolean,
		default: false
	});

	// The system version whose shipped journal content was last rolled into the
	// world's seeded copies (see hooks/SeedCompendiums.js). When this trails the
	// running version, the update pass refreshes pristine (un-edited) seeded
	// journals and records the new version here.
	game.settings.register("stonetop-pwd", "journalSyncVersion", {
		name: "Journal Sync Version",
		scope: "world",
		config: false,
		type: String,
		default: ""
	});

	// Fingerprint of the seeded gazetteer folder colour scheme last applied in this
	// world (see hooks/SeedCompendiums.syncSeededFolderColors). When it trails the
	// current scheme — a fresh install, or a system update that added/retinted a
	// category — the sync recolours any still-default folders and records the new
	// signature. A content signature rather than a one-shot flag so later colour
	// changes propagate; the sync recolours folders at the default or still holding a colour
	// from the previous scheme, so re-running can't fight a GM's own tint.
	game.settings.register("stonetop-pwd", "seededFolderColorsSignature", {
		name: "Seeded Folder Colours Signature",
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
	game.settings.register("stonetop-pwd", "startOfSessionReminders", {
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
	game.settings.register("stonetop-pwd", "chatShiftButtons", {
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
	game.settings.register("stonetop-pwd", "customMovesGmOnly", {
		name: "stonetop.settings.customMovesGmOnly.name",
		hint: "stonetop.settings.customMovesGmOnly.hint",
		scope: "world",
		config: true,
		type: Boolean,
		default: true,
	});

	// As customMovesGmOnly, but for homebrew arcana (minor & major). When on (the
	// default), only the GM sees the per-tier "Create arcanum" buttons at the foot
	// of the arcana tab's Major / Minor sections; existing arcana still render and
	// the editor still opens for whoever owns the card. (The Artifact Creation
	// inspiration wizard now lives in the sidebar "Create Item → Arcanum" chooser,
	// which is GM-side.) Kept independent of customMovesGmOnly so a GM can permit
	// one and not the other.
	game.settings.register("stonetop-pwd", "arcanaCreationGmOnly", {
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
	game.settings.register("stonetop-pwd", "monsterBuilderEnabled", {
		name: "stonetop.settings.monsterBuilderEnabled.name",
		hint: "stonetop.settings.monsterBuilderEnabled.hint",
		scope: "world",
		config: true,
		type: Boolean,
		default: true,
	});

	// Whether players may PEEK at a card's BACK before unlocking it. A card's OWNER always
	// sees its back once unlocked (every spot filled), regardless of this setting —
	// unlocking is their own achievement. This switch is the separate peek: on lets
	// players open the back of a not-yet-unlocked card; off (the default) keeps an
	// un-unlocked back hidden until the GM clicks "Reveal back to player" on it. The GM
	// always sees both sides. See the per-card visibility model in
	// StonetopCharacterSheet.getData / CharacterArcana.
	game.settings.register("stonetop-pwd", "arcanaPlayersSeeBothSides", {
		name: "stonetop.settings.arcanaPlayersSeeBothSides.name",
		hint: "stonetop.settings.arcanaPlayersSeeBothSides.hint",
		scope: "world",
		config: true,
		type: Boolean,
		default: false,
	});

	// The flagship "threats on the map" option. When on, each threat pin also draws its
	// full book card on the canvas, anchored to the pin and panning/zooming with the
	// scene, with a live doom track the GM ticks right there. Off by default: the safe
	// path is a pin that opens the card in a window (works everywhere, no canvas overlay).
	game.settings.register("stonetop-pwd", "threatOnCanvasCards", {
		name: "stonetop.settings.threatOnCanvasCards.name",
		hint: "stonetop.settings.threatOnCanvasCards.hint",
		scope: "world",
		config: true,
		type: Boolean,
		default: false,
		onChange: () => game.stonetop?.threatBoard?.refresh?.(),
	});

	// Whether the one-time "Welcome to Stonetop" fresh-start CHAT card has been posted in
	// this world (hooks/Ready.js _postStartupWelcomeMessageOnce). Distinct from
	// `gmWelcomeShown` above despite the similar name: that one records that the GM
	// dismissed the Welcome GUIDE's auto-pop-up, this one that the orientation card has
	// been posted to chat. World-scoped — the card is public, and only the GM posts it.
	game.settings.register("stonetop-pwd", "startupWelcomeShown", {
		name: "Startup Welcome Chat Card Posted",
		scope: "world",
		config: false,
		type: Boolean,
		default: false
	});

	// Whether the "(TEST ONLY) Populate World" dev macro has been seeded into the
	// world's Macro Directory (see hooks/Ready.js _ensureTestPopulateMacro). Set true
	// after the first GM load so it's added exactly once — a GM who later deletes it
	// keeps it gone rather than having it reappear every reload.
	game.settings.register("stonetop-pwd", "testPopulateMacroSeeded", {
		name: "Test Populate Macro Seeded",
		scope: "world",
		config: false,
		type: Boolean,
		default: false
	});

	// Whether the "Import Book II Art" macro has been seeded into the world's Macro
	// Directory (see hooks/Ready.js _ensureBook2ArtMacro). Set true after the first
	// GM load so it's added exactly once — a GM who later deletes it keeps it gone.
	game.settings.register("stonetop-pwd", "book2ArtMacroSeeded", {
		name: "Book II Art Macro Seeded",
		scope: "world",
		config: false,
		type: Boolean,
		default: false
	});

	// Whether the one-time "you can import your book art" chat reminder has been posted
	// (see hooks/Ready.js _postBook2ArtReminderOnce). Resolved exactly once for a GM who
	// is past the first-session Welcome guide (finished session zero or ticked "Don't show
	// this again"): the card is whispered if no art is on disk yet, otherwise it's simply
	// marked done. World-scoped — "has this world been nudged" is world state, and only the
	// GM posts/acts on it.
	game.settings.register("stonetop-pwd", "book2ArtReminderShown", {
		name: "Book Art Import Reminder Shown",
		scope: "world",
		config: false,
		type: Boolean,
		default: false
	});

	// RETIRED KEY: "peopleCropRebuildOffered". Superseded by peopleArtRebuildOffered below and
	// no longer registered — nothing reads it, and Foundry simply ignores a stored value whose
	// key it does not know, so leaving it registered bought nothing. Named here so the key is
	// not reused: a world upgraded from an older build still HOLDS a `true` under it, and a new
	// setting reusing the name would silently start out latched shut in exactly those worlds.

	// Whether the one-time "this portrait art can be rebuilt from pictures you already have"
	// offer has been made (hooks/Ready.js _offerPeopleArtRebuildOnce). World-scoped: it is a
	// property of this world's art folder, not of whoever happens to be logged in.
	//
	// A NEW key rather than reusing the one above, deliberately. That flag was set the moment a
	// world was offered the DETAIL-portrait rebuild, months before square faces existed — so
	// every world that already said yes to crops would have been latched shut against an offer
	// that did not exist yet, and the squares would silently never be cut. Re-asking costs one
	// card in the worlds that have new work; staying latched costs the feature entirely.
	//
	// Safe to re-ask: findWork returns falsy when there is nothing left to cut, so a world that
	// is already complete stays silent and never sets this at all.
	game.settings.register("stonetop-pwd", "peopleArtRebuildOffered", {
		name: "People Portrait Rebuild Offered",
		scope: "world",
		config: false,
		type: Boolean,
		default: false
	});

	// Whether the one-time "you already have these poster maps — want them as Scenes?" offer
	// has been made in this world (hooks/WorldSetup.js offerPosterMapScenesOnce). The map
	// images live in the durable art folder, which outlives the world they were imported in,
	// so a brand-new world can find them waiting and rebuild the Scenes without a second PDF
	// import. World-scoped, and only set once the offer has ACTUALLY been made, so a GM who
	// supplies maps later still gets asked.
	game.settings.register("stonetop-pwd", "posterMapScenesOffered", {
		name: "Poster Map Scenes Offered",
		scope: "world",
		config: false,
		type: Boolean,
		default: false
	});

	// The durable folder (a top-level data path, OUTSIDE the system folder) the "Import
	// Book Art" macro writes extracted illustrations to. Living outside systems/stonetop-pwd
	// is what keeps the art across a system update or reinstall; the runtime re-apply
	// (hooks/Ready.js -> book2-art/reapply.js) re-points documents at it after an update.
	game.settings.register("stonetop-pwd", "book2ArtRoot", {
		name: "Book II Art Folder",
		scope: "world",
		config: false,
		type: String,
		// Shared with book2ArtRoot()'s fallback, so a world that never set this and a world
		// whose setting can't be read resolve art to the same folder.
		default: DEFAULT_BOOK2_ART_ROOT
	});

	// Which Book II treasures have their illustration on disk under `book2ArtRoot`, as a
	// { catalog slug -> path within the art folder } map (module/data/treasure-catalog.js).
	// Unlike every other kind of book art, a treasure is not a document: its Item is built
	// the moment a player drags the line off a journal, so there is nothing to write art
	// onto ahead of time. This index is the answer to "does this world have art for that
	// treasure, and where?" — the GM-side passes (the Import Book Art macro and
	// book2-art/reapply.js) browse the folder and publish it here, and treasure-drops.js
	// reads it synchronously when building the drop. World-scoped so players (who cannot
	// browse files) get it broadcast like any setting.
	game.settings.register("stonetop-pwd", "treasureArt", {
		name: "Treasure Art On Disk",
		scope: "world",
		config: false,
		type: Object,
		default: {}
	});

	// Which "People of Stonetop" portraits have their illustration on disk under `book2ArtRoot`,
	// as a { manifest out path -> display name } map. Like a treasure, a resident/neighbor
	// portrait points at no document: the steading sheet's image gallery reads this broadcast
	// index so even players (who cannot browse files) can pick from it. The GM-side passes (the
	// Import Book Art macro and book2-art/reapply.js) browse the folder and publish it here.
	// World-scoped so it reaches every client like any setting.
	game.settings.register("stonetop-pwd", "peopleArt", {
		name: "People Art On Disk",
		scope: "world",
		config: false,
		type: Object,
		default: {}
	});

	// Which of those portraits also have their hand-authored SQUARE face on disk, as a
	// { illustration out path -> square out path } map. A SECOND index rather than richer values
	// in `peopleArt`, deliberately: that setting's shape is `{ out -> name }` in every world that
	// already has one, and consumers join the two by `out`, so nothing needs migrating and a
	// world whose GM has not re-run the rebuild simply has no entries here and keeps offering the
	// whole illustration. Same publishers as `peopleArt`.
	game.settings.register("stonetop-pwd", "peoplePortraitArt", {
		name: "People Square Portraits On Disk",
		scope: "world",
		config: false,
		type: Object,
		default: {}
	});

	// The system version whose Book II art was last re-applied to the compendia. When
	// this trails the running version, the re-apply pass re-points documents at the
	// durable art on disk and records the new version here (see book2-art/reapply.js).
	game.settings.register("stonetop-pwd", "book2ArtSyncVersion", {
		name: "Book II Art Sync Version",
		scope: "world",
		config: false,
		type: String,
		default: ""
	});

	// Whether the GM has dismissed the "first session" Welcome guide's automatic
	// pop-up (see dialogs/WelcomeDialog.js). While false, the guide opens for the
	// GM on every world load; ticking "Don't show this automatically" sets it true.
	game.settings.register("stonetop-pwd", "gmWelcomeShown", {
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
	game.settings.register("stonetop-pwd", "sessionZeroDone", {
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
	game.settings.register("stonetop-pwd", "springBurstAnswers", {
		name: "Let Spring Burst Forth Answers",
		scope: "world",
		config: false,
		type: Object,
		default: {}
	});

	// Answers recorded in the guided Character Introductions (see
	// dialogs/IntroductionsDialog.js) — what each PC established about themselves and
	// Stonetop. GM-written (only a GM can write a world setting): the GM types the
	// narration rounds and HARVESTS each player's own `flags.stonetop-pwd.intro` flag
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
	game.settings.register("stonetop-pwd", "introductionsAnswers", {
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
	game.settings.register("stonetop-pwd", "introCursor", {
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
	game.settings.register("stonetop-pwd", "expeditionAnswers", {
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
	game.settings.register("stonetop-pwd", "systemHotbarLayoutVersion", {
		name: "System Hotbar Layout Version",
		scope: "client",
		config: false,
		type: Number,
		default: 0
	});

	// The season last picked in the Weather roll dialog (see dialogs/WeatherDialog.js),
	// so it reopens to where the GM left off. Client-scoped — it's a GM convenience,
	// not shared world state. Holds a WEATHER_SEASONS key (or "" before first use).
	game.settings.register("stonetop-pwd", "weatherSeason", {
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
	// doesn't leak across worlds. Records are keyed by world id (this client blob would
	// otherwise reopen an open dialog in every world opened in this browser; see
	// walkthrough-resume.js). Shape:
	//   { "<worldId>": {
	//       introductions: { open: <bool>, phase: <0-8>, pcIndex: <int> },
	//       springBurst:   { open: <bool>, step: <int>, delegated: <bool> } } }
	game.settings.register("stonetop-pwd", "walkthroughResume", {
		name: "Walkthrough Resume State",
		scope: "client",
		config: false,
		type: Object,
		default: {}
	});

	// -- CLIENT SPECIFIC SETTINGS --------------------------------

	// Which worlds this user has had the Setting Overview journal auto-opened in (see
	// hooks/Ready.js). Per-client so each player gets the fresh-start orientation the first
	// time they connect, GM included, without re-popping every load.
	//
	// Keyed by world id, NOT a bare boolean. Client settings live in browser localStorage
	// under namespace.key alone, so a flat `true` leaked across worlds: open a second world
	// in the same browser and the gate read already-set, and nobody who had seen the
	// Overview once ever got their new world's orientation. Same fix, and same reason, as
	// the world-keyed `walkthroughResume` below. Shape: { "<worldId>": true }.
	// A legacy flat `true` is folded under the current world by migrateFlatSettingOverviewShown.
	game.settings.register("stonetop-pwd", "settingOverviewShown", {
		name: "Setting Overview Shown",
		scope: "client",
		config: false,
		type: Object,
		default: {}
	});

	// NB: the GM-steading auto-assignment once-gate is NOT a setting — it's a per-user
	// WORLD flag on the GM's own User document (see hooks/Ready.js
	// _assignSteadingToUnassignedGm). It used to be a client-scoped setting here, but those
	// live in browser localStorage keyed only by namespace.key, so the flag leaked across
	// worlds and a fresh world read it already-set — silently skipping the assignment.

	game.settings.register("stonetop-pwd", "sheetFont", {
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
		// Shared with applySheetFont's fallback (see _DEFAULT_FONT) so "the default font"
		// means one thing.
		default: _DEFAULT_FONT,
		onChange: value => applySheetFont(value),
	});

	game.settings.register("stonetop-pwd", "sheetFontScale", {
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

	// CLASSIC vs MODERN sheet layout: the table's answer, one person's override of it, and
	// one toggle per sheet.
	//
	// MODERN is what ships: the vertical icon tab rail hung off the window's edge, the
	// character's stat block at the head of its Moves tab, the steading's stat band at the
	// head of Overview with its homefront moves on a tab of their own, and the NPC's quick
	// facts inside Details. CLASSIC is the layout before that: a horizontal text tab strip
	// inside the sheet body, with each of those blocks pinned above it.
	//
	// `worldSheetLayout` is the table's answer, and the one the chat card's buttons flip. It
	// defaults to MODERN, which is what a world created on this release gets. A world that
	// already existed when the redesign landed is stamped CLASSIC on its first load instead,
	// so nobody's sheets rearrange themselves under them mid-campaign — see
	// utils/sheet-layout.js, which also whispers the GM the offer to try the new one.
	//
	// `sheetLayout` is one person's override of that, defaulting to "world" (follow the
	// table). It has to be a tri-state rather than a checkbox, because a client setting lives
	// in browser localStorage keyed only by namespace.key and so is SHARED by every world on
	// this browser (the same trap settingOverviewShown documents above). A boolean here would
	// mean a GM running an old campaign and a new one on one browser could not have classic
	// in the first and modern in the second: whichever world they opened last would win. Only
	// an explicit override lives per browser; the real answer lives per world.
	//
	// Effective classic for a sheet is then `<resolved master> && classicLayout<Sheet>` (see
	// isClassicLayout below). A modern master is modern everywhere however the children are
	// set; a classic master is classic on every sheet whose own box is still ticked. That is
	// why the children default TRUE: one flip brings the whole old layout back, and nothing
	// moves for anyone who never opens the settings window.
	//
	// The Monster sheet has no tabs and never took part in the redesign, so it gets no toggle.
	game.settings.register("stonetop-pwd", "worldSheetLayout", {
		name: "stonetop.settings.worldSheetLayout.name",
		hint: "stonetop.settings.worldSheetLayout.hint",
		scope: "world",
		config: true,
		type: String,
		choices: {
			"modern":  "stonetop.settings.worldSheetLayout.modern",
			"classic": "stonetop.settings.worldSheetLayout.classic",
		},
		default: "modern",
		onChange: () => _rerenderActorSheets(),
	});

	// Whether this world's layout has been answered once (see stampWorldLayoutBaseline).
	// Stamped on the first GM load after the redesign shipped, fresh world or not, so the
	// stamp never runs twice and can never overwrite a choice the GM has since made.
	game.settings.register("stonetop-pwd", "worldSheetLayoutChosen", {
		name: "World Sheet Layout Chosen",
		scope: "world",
		config: false,
		type: Boolean,
		default: false
	});

	// Whether the "your sheets stayed classic, here is how to try the new ones" card has been
	// whispered to this world's GMs. Its own flag rather than riding on the stamp above: chat
	// is not always up that early in a load, and that card is the only notice an upgraded
	// table ever gets that the modern layout exists, so a lost one has to be re-offered.
	game.settings.register("stonetop-pwd", "classicLayoutNoticeShown", {
		name: "Classic Layout Notice Shown",
		scope: "world",
		config: false,
		type: Boolean,
		default: false
	});

	// The id of that card, so every later flip EDITS it instead of posting another one. There is
	// exactly one layout card in a world's chat log at a time and it always shows the layout
	// currently in force; flipping back and forth would otherwise leave a trail of cards, most
	// of them describing a state the table left. Empty until the card is first posted, and
	// re-filled if it is ever deleted. See utils/sheet-layout.js showLayoutCard.
	game.settings.register("stonetop-pwd", "layoutCardId", {
		name: "Sheet Layout Card Message Id",
		scope: "world",
		config: false,
		type: String,
		default: ""
	});

	// RETIRED KEY: "classicLayout". This is the same switch, re-registered as the tri-state
	// described above rather than the boolean it started as. It never shipped, so no world is
	// carrying a value that needs migrating, but a browser that ran a pre-release build still
	// holds one in localStorage (client settings outlive their registration there) — so the
	// name is named here rather than reused, and _classicMaster reads any unrecognized value
	// as "follow the world".
	game.settings.register("stonetop-pwd", "sheetLayout", {
		name: "stonetop.settings.sheetLayout.name",
		hint: "stonetop.settings.sheetLayout.hint",
		scope: "client",
		config: true,
		type: String,
		choices: {
			"world":   "stonetop.settings.sheetLayout.world",
			"modern":  "stonetop.settings.sheetLayout.modern",
			"classic": "stonetop.settings.sheetLayout.classic",
		},
		default: "world",
		onChange: () => _rerenderActorSheets(),
	});

	game.settings.register("stonetop-pwd", "classicLayoutCharacter", {
		name: "stonetop.settings.classicLayoutCharacter.name",
		hint: "stonetop.settings.classicLayoutCharacter.hint",
		scope: "client",
		config: true,
		type: Boolean,
		default: true,
		onChange: () => _rerenderActorSheets(),
	});

	game.settings.register("stonetop-pwd", "classicLayoutSteading", {
		name: "stonetop.settings.classicLayoutSteading.name",
		hint: "stonetop.settings.classicLayoutSteading.hint",
		scope: "client",
		config: true,
		type: Boolean,
		default: true,
		onChange: () => _rerenderActorSheets(),
	});

	game.settings.register("stonetop-pwd", "classicLayoutNpc", {
		name: "stonetop.settings.classicLayoutNpc.name",
		hint: "stonetop.settings.classicLayoutNpc.hint",
		scope: "client",
		config: true,
		type: Boolean,
		default: true,
		onChange: () => _rerenderActorSheets(),
	});

	// How long you must hover a section before its edit pencil fades in (seconds).
	// Drives the --st-edit-reveal-delay CSS variable. The pencils stay clickable
	// while still invisible, so this only affects when they become visible.
	game.settings.register("stonetop-pwd", "editPencilRevealDelay", {
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
	game.settings.register("stonetop-pwd", "hideRollableIcon", {
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
	game.settings.register("stonetop-pwd", "promptRollModifier", {
		name: "stonetop.settings.promptRollModifier.name",
		hint: "stonetop.settings.promptRollModifier.hint",
		scope: "client",
		config: true,
		type: Boolean,
		default: false,
	});

	// Open actor sheets (character / steading / monster / NPC) in Edit mode instead of
	// Play mode. Read once when the sheet is constructed; the header wrench still
	// toggles modes per-sheet afterward. The NPC sheet additionally requires ownership
	// (a non-owner has nothing to edit), so it opens in Play mode for everyone else.
	game.settings.register("stonetop-pwd", "openSheetsInEditMode", {
		name: "stonetop.settings.openSheetsInEditMode.name",
		hint: "stonetop.settings.openSheetsInEditMode.hint",
		scope: "client",
		config: true,
		type: Boolean,
		default: false,
	});

	// Reopen the document sheets (characters, steadings, monsters, NPCs, items, journals)
	// this user had open when they reload, at the same position and size. Per-client
	// because window layout is personal, not shared world state. Defaults on. The
	// live tracking + restore lives in utils/window-restore.js.
	game.settings.register("stonetop-pwd", "restoreWindowsOnReload", {
		name: "stonetop.settings.restoreWindowsOnReload.name",
		hint: "stonetop.settings.restoreWindowsOnReload.hint",
		scope: "client",
		config: true,
		type: Boolean,
		default: true,
	});

	// Snapshot of the sheets this user had open at last reload, keyed by document
	// uuid -> { left, top, width, height, minimized, tabs, editMode } (see
	// utils/window-restore.js).
	// Internal (not shown in the settings menu); rewritten continuously as windows
	// open, close, and move.
	game.settings.register("stonetop-pwd", "openWindowsState", {
		scope: "client",
		config: false,
		type: Object,
		default: {},
	});

	// Strip the decorative animations, transitions, and hover-zoom image popups
	// from Stonetop UI for users who find them distracting or are motion-sensitive.
	// Drives the `stonetop-reduce-motion` root class.
	game.settings.register("stonetop-pwd", "reduceMotion", {
		name: "stonetop.settings.reduceMotion.name",
		hint: "stonetop.settings.reduceMotion.hint",
		scope: "client",
		config: true,
		type: Boolean,
		default: false,
		onChange: value => applyReduceMotion(value),
	});

	// Superseded by "sheetSizes" below, which remembers height as well and covers every
	// actor sheet rather than just the character. Still registered, and still READ as a
	// fallback, so a user who had a width remembered here keeps it — the value moves over
	// the first time they resize. Nothing writes to it any more.
	game.settings.register("stonetop-pwd", "characterSheetWidths", {
		scope: "client",
		config: false,
		type: Object,
		default: {},
	});

	// Remembers each actor sheet's SIZE so it reopens as the user last left it — character,
	// steading, monster and NPC alike. Per-user (client) and per-actor: a map of actor id ->
	// {width, height}. Actor ids are unique across types, so one map serves them all.
	// Internal (not shown in the settings menu).
	game.settings.register("stonetop-pwd", "sheetSizes", {
		scope: "client",
		config: false,
		type: Object,
		default: {},
	});

	// Remembers which collapsible crew follower sections (Inventory / Roster /
	// Group Fight) each character left expanded, so the sheet reopens in the same
	// state. Per-user (client) and per-actor: a map of actor id -> array of open
	// section ids. Internal (not shown in the settings menu).
	game.settings.register("stonetop-pwd", "crewSectionsOpen", {
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
	game.settings.register("stonetop-pwd", "movesSectionsCollapsed", {
		scope: "client",
		config: false,
		type: Object,
		default: {},
	});

	// Remembers which Arcana sections (Major / Minor arcanum) each character left
	// collapsed, so the sheet reopens in the same state. These default to expanded,
	// so we store the *collapsed* ids (absence = open). Per-user (client) and
	// per-actor: a map of actor id -> array of collapsed section ids. Internal.
	game.settings.register("stonetop-pwd", "arcanaSectionsCollapsed", {
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
	game.settings.register("stonetop-pwd", "arcanaContentExpanded", {
		scope: "client",
		config: false,
		type: Object,
		default: {},
	});

	// Remembers which individual arcanum CARDS each character left collapsed (clamped to
	// just their title bar). Like the Major / Minor sections, cards default to EXPANDED, so
	// a card id (its slug) present here means that card should reopen collapsed. Per-user
	// (client) and per-actor: a map of actor id -> array of collapsed card slugs. Internal.
	game.settings.register("stonetop-pwd", "arcanaCardsCollapsed", {
		scope: "client",
		config: false,
		type: Object,
		default: {},
	});

	// Remembers which sheet sections each actor's viewer folded shut with the heading
	// caret (the one beside the section edit pencil) — character AND steading, keyed by
	// the caret's own collapse id rather than the edit-section id, since two groups can
	// share one edit section. Sections default to expanded, so we store the *collapsed*
	// ids (absence = open). Per-user (client) and per-actor: a map of actor id -> array
	// of collapsed section ids. Internal (not shown in the settings menu).
	game.settings.register("stonetop-pwd", "sheetSectionsCollapsed", {
		scope: "client",
		config: false,
		type: Object,
		default: {},
	});

	// Remembers whether each character left the whole moves sidebar (Roll Modifier
	// + Basic / Expedition move lists) collapsed, so the sheet reopens the same way.
	// The sidebar defaults to expanded. Per-user (client) and per-actor: a map of
	// actor id -> boolean. Internal (not shown in the settings menu).
	game.settings.register("stonetop-pwd", "characterSidebarCollapsed", {
		scope: "client",
		config: false,
		type: Object,
		default: {},
	});

	game.settings.register("stonetop-pwd", "showRollStatChips", {
		name: "stonetop.settings.showRollStatChips.name",
		hint: "stonetop.settings.showRollStatChips.hint",
		scope: "client",
		config: true,
		type: Boolean,
		default: true,
		onChange: () => _rerenderActorSheets(),
	});

	game.settings.register("stonetop-pwd", "showMoveDescriptionsInChat", {
		name: "stonetop.settings.showMoveDescriptionsInChat.name",
		hint: "stonetop.settings.showMoveDescriptionsInChat.hint",
		scope: "client",
		config: true,
		type: Boolean,
		default: true,
		onChange: value => applyMoveDescriptionBodyClass(value),
	});

	game.settings.register("stonetop-pwd", "hoverDescriptionsEnabled", {
		name: "stonetop.settings.hoverDescriptionsEnabled.name",
		hint: "stonetop.settings.hoverDescriptionsEnabled.hint",
		scope: "client",
		config: false,
		type: Boolean,
		default: true,
	});

	for (const key of HOVER_DESCRIPTION_SETTING_KEYS) {
		game.settings.register("stonetop-pwd", key, {
			name: `stonetop.settings.${key}.name`,
			hint: `stonetop.settings.${key}.hint`,
			scope: "client",
			config: false,
			type: Boolean,
			default: true,
		});
	}

	game.settings.registerMenu("stonetop-pwd", "hoverDescriptionSettings", {
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
	// The two below are what make `hoverDescriptionsEnabled` a true master switch. Both
	// were previously ungated, so turning every listed toggle off still left cross-link
	// summaries hovering in journals, on sheets and in the session-zero dialogs.
	"hoverDescriptionsJournalLinks",
	"hoverDescriptionsLoreTerms",
];

function _createHoverDescriptionSettingsApp() {
	return class HoverDescriptionSettingsApp extends FormApplication {
		static get defaultOptions() {
			return foundry.utils.mergeObject(super.defaultOptions, {
				id: "stonetop-hover-description-settings",
				title: game.i18n.localize("stonetop.settings.hoverDescriptionSettings.title"),
				template: "systems/stonetop-pwd/templates/settings/hover-descriptions.hbs",
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

// The registered default for `sheetFont`. Shared with the fallback below so an
// unreadable/unrecognized value lands on the same font a fresh client gets, rather
// than a second, different "default" only the fallback path can produce.
const _DEFAULT_FONT = "signika";

export function applySheetFont(value) {
	const font = _FONT_MAP[value] ?? _FONT_MAP[_DEFAULT_FONT];
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
	return globalThis.game?.settings?.get?.("stonetop-pwd", "promptRollModifier") ?? false;
}

// Whether actor sheets should open in Edit mode rather than Play mode.
export function getOpenSheetsInEditMode() {
	return globalThis.game?.settings?.get?.("stonetop-pwd", "openSheetsInEditMode") ?? false;
}

/**
 * Which sheets have a CLASSIC toggle, and what each one's setting is called.
 *
 * Spelled out rather than built from the argument: the settings suite proves every
 * registered key is read by searching the source for the quoted key, so a key assembled
 * at runtime is invisible to it and the setting fails the build as dead.
 * See tests/utils/settings-registration.test.js.
 */
const CLASSIC_LAYOUT_KEYS = {
	character: "classicLayoutCharacter",
	steading:  "classicLayoutSteading",
	npc:       "classicLayoutNpc",
};

/**
 * The resolved master switch: is this client's sheet layout CLASSIC?
 *
 * The personal `sheetLayout` override wins whenever it names a layout; "world" (its default)
 * defers to the table's `worldSheetLayout`, which is what makes a fresh world modern and an
 * upgraded one classic on a browser that opens both. Any OTHER stored value is read as
 * "follow the world" rather than guessed at, so a value left behind by a build that kept a
 * boolean under this key resolves to the world's answer instead of pinning a layout nobody
 * chose.
 *
 * Throws if either key is unregistered; its one caller owns the try/catch. See isClassicLayout.
 */
function _classicMaster(settings) {
	const mine = settings.get("stonetop-pwd", "sheetLayout");
	if (mine === "classic") return true;
	if (mine === "modern")  return false;
	return settings.get("stonetop-pwd", "worldSheetLayout") === "classic";
}

/**
 * Should this sheet render the CLASSIC layout - a horizontal text tab strip with the stat
 * block / stat band / quick facts pinned above it - rather than the MODERN one, where the
 * tabs are an icon rail off the window's edge and those blocks live on a tab?
 *
 * Two switches, ANDed: the resolved master (above) and the sheet's own toggle. A modern
 * master is modern everywhere, whatever the children say.
 *
 * Answers false for an unrecognized sheet and for a game whose settings are not registered:
 * a sheet class is constructible in a unit test, and MODERN is what ships, so "modern" is
 * the right answer when there is nothing to read.
 *
 * The try/catch is what actually delivers that second promise, and `??` cannot stand in for
 * it: core's `ClientSettings#get` THROWS on a key it has no registration for rather than
 * returning undefined. `layoutClasses` is called from the static `defaultOptions` getter of all
 * three sheet classes — i.e. at construction — so any sheet built before `registerSettings()`
 * has finished (a module erroring inside its own `init` hook, a partially failed system init)
 * would otherwise throw on open instead of quietly rendering modern.
 *
 * @param {"character"|"steading"|"npc"} sheet
 * @returns {boolean}
 */
export function isClassicLayout(sheet) {
	const key = CLASSIC_LAYOUT_KEYS[sheet];
	if (!key) return false;
	const settings = globalThis.game?.settings;
	if (typeof settings?.get !== "function") return false;
	try {
		if (!_classicMaster(settings)) return false;
		return !!settings.get("stonetop-pwd", key);
	} catch {
		return false;
	}
}

/**
 * The frame marker the conditional CSS hangs off, ready to spread into a sheet's
 * `defaultOptions.classes`. Empty in the modern layout.
 *
 * Every classic CSS rule COMPOUNDS this with the sheet's own frame classes
 * (`.stonetop-layout-classic.pbta.sheet.actor.character`), never descends from it - the
 * marker lands on the same element as those classes, not on an ancestor.
 */
export function layoutClasses(sheet) {
	return isClassicLayout(sheet) ? ["stonetop-layout-classic"] : [];
}

/**
 * Re-stamp that same marker on a rendered sheet's frame. The other half of the pair, and the
 * load-bearing one: `layoutClasses` seeds `defaultOptions` at construction, but `_replaceHTML`
 * only replaces the contents of `.window-content` and never rebuilds the frame's class list —
 * so without this, flipping the setting on an open sheet re-renders classic markup under modern
 * CSS (or the reverse) until it is closed and reopened.
 *
 * Call from `_render`, after `super._render`.
 *
 * @param {Application} app
 * @param {"character"|"steading"|"npc"} sheet
 */
export function stampLayoutClass(app, sheet) {
	app?.element?.[0]?.classList.toggle("stonetop-layout-classic", isClassicLayout(sheet));
}

// Whether the rollable dice icon is hidden; when it is, rolls fire from the move
// name / stat row instead of the (now absent) icon.
export function getHideRollableIconSetting() {
	return globalThis.game?.settings?.get?.("stonetop-pwd", "hideRollableIcon") ?? false;
}

export function getSetting(key) {
	return game.settings.get("stonetop-pwd", key);
}

/**
 * A plain-object setting, read tolerantly: `{}` rather than a throw when the key is not
 * registered in this world (an older build, or a unit test that never called registerSettings),
 * and `{}` rather than a surprise when the stored value is a scalar or an array.
 *
 * The broadcast art indexes (`treasureArt`, `peopleArt`, `peoplePortraitArt`) are all read this
 * way, from several unrelated consumers — the People gallery, the portrait re-point pass — each
 * of which had grown its own copy of this try/catch and its own shape guard.
 */
export function getObjectSetting(key) {
	try {
		const value = globalThis.game?.settings?.get?.("stonetop-pwd", key);
		return value && typeof value === "object" && !Array.isArray(value) ? value : {};
	} catch (_) {
		return {};
	}
}

/**
 * The key a world-keyed setting stores its records under.
 *
 * Client settings live in browser localStorage under `namespace.key` alone, with no world in
 * the path — so any client-scoped "have they seen this yet?" flag leaks across every world
 * opened in the same browser unless it nests its records by world itself. Two settings do
 * exactly that (`walkthroughResume`, `settingOverviewShown`), and they have to agree on what
 * the key IS, so it is defined once here.
 */
export function worldKey() {
	return globalThis.game?.world?.id ?? "";
}

// ── Setting Overview once-gate (per client, per world) ─────────────────────────
// Stored world-keyed so seeing the Overview in one world can't suppress it in the
// next (see the registration above).

function _settingOverviewStore() {
	return globalThis.game?.settings?.get?.("stonetop-pwd", "settingOverviewShown");
}

/** The stored world map, or null when the value is absent or still the legacy shape. */
function _settingOverviewMap(stored) {
	return stored?.constructor === Object ? stored : null;
}

/**
 * Is `stored` the pre-world-keying value — a bare `true` that applied to every world?
 *
 * Not simply `stored === true`. The setting is now declared `type: Object`, and Foundry
 * casts a stored value to its declared type by CONSTRUCTING it (Setting#_castType falls
 * through to `new Object(value)` for any non-primitive type), so a legacy boolean comes
 * back as a Boolean WRAPPER object, not a boolean. It answers to valueOf() either way.
 */
function _settingOverviewLegacyShown(stored) {
	if (stored === null || stored === undefined) return false;
	if (_settingOverviewMap(stored)) return false;
	return !!stored.valueOf?.();
}

/** Has this client already been shown the Overview in THIS world? */
export function getSettingOverviewShown() {
	const stored = _settingOverviewStore();
	// A legacy value still answers for every world until the migration below has run, so
	// an upgrade mid-session can't re-pop the Overview on the very next load.
	if (_settingOverviewLegacyShown(stored)) return true;
	return !!_settingOverviewMap(stored)?.[worldKey()];
}

export function markSettingOverviewShown() {
	const map = { ..._settingOverviewMap(_settingOverviewStore()) };
	map[worldKey()] = true;
	return setSetting("settingOverviewShown", map);
}

/**
 * One-time migration of the pre-world-keying flat shape. It carried no world attribution,
 * so — as with migrateFlatWalkthroughResume — attribute it to the world this browser is in
 * now, which is where it was most likely written. Every OTHER world then correctly
 * re-offers the Overview once, which is the whole point of the fix. Idempotent: after it
 * runs the value is a world map and this is a no-op.
 */
export function migrateFlatSettingOverviewShown() {
	if (!_settingOverviewLegacyShown(_settingOverviewStore())) return;
	return markSettingOverviewShown();
}

/** A positive, whole pixel count, or null for anything that isn't one. */
function _px(v) {
	const n = Math.round(Number(v));
	return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Last-used size for a given actor sheet as `{width, height}`, either of which may be null
 * if nothing usable is stored. Never returns null itself, so callers can destructure.
 *
 * Falls back to the retired "characterSheetWidths" map for the width, so upgrading doesn't
 * throw away a width the user had already established. Height has no legacy source — a
 * sheet that only ever stored a width reopens at its default height, once. That map only
 * ever held characters; other actor types simply never match it.
 */
export function getSheetSize(actorId) {
	if (!actorId) return { width: null, height: null };
	const size = globalThis.game?.settings?.get?.("stonetop-pwd", "sheetSizes")?.[actorId];
	const legacy = globalThis.game?.settings?.get?.("stonetop-pwd", "characterSheetWidths")?.[actorId];
	return {
		width: _px(size?.width) ?? _px(legacy),
		height: _px(size?.height),
	};
}

/**
 * Store an actor sheet's size. Each dimension is validated and kept independently, so a
 * caller that only knows one of them (or whose window is mid-animation and reports a junk
 * value for the other) can't wipe the good one.
 */
export function setSheetSize(actorId, { width, height } = {}) {
	if (!actorId) return;
	const w = _px(width), h = _px(height);
	if (w === null && h === null) return;

	const current = getSheetSize(actorId);
	const next = { width: w ?? current.width, height: h ?? current.height };
	// Avoid redundant writes: settings.set round-trips through the server for the
	// client store and this is called off a debounce on every resize frame.
	if (next.width === current.width && next.height === current.height) return;

	const map = globalThis.game?.settings?.get?.("stonetop-pwd", "sheetSizes") ?? {};
	return game.settings.set("stonetop-pwd", "sheetSizes", { ...map, [actorId]: next });
}

// Per-actor, per-user list of collapsible section ids (sorted, de-duped), or []
// if nothing stored yet. Shared by the crew follower sections and the sidebar
// move groups, which differ only in the setting key they persist under.
function getSectionList(key, actorId) {
	if (!actorId) return [];
	const arr = globalThis.game?.settings?.get?.("stonetop-pwd", key)?.[actorId];
	return Array.isArray(arr) ? arr : [];
}

function setSectionList(key, actorId, sections) {
	if (!actorId) return;
	const next = Array.from(new Set(sections ?? [])).sort();
	const map  = globalThis.game?.settings?.get?.("stonetop-pwd", key) ?? {};
	const prev = Array.isArray(map[actorId]) ? [...map[actorId]].sort() : [];
	if (next.join("|") === prev.join("|")) return; // avoid redundant writes
	return game.settings.set("stonetop-pwd", key, { ...map, [actorId]: next });
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

// The sheet sections (character and steading alike) this user folded shut with the
// heading caret. They default to expanded, so an id present here means that section
// should reopen collapsed.
export function getSheetSectionsCollapsed(actorId) {
	return getSectionList("sheetSectionsCollapsed", actorId);
}

export function setSheetSectionsCollapsed(actorId, sections) {
	return setSectionList("sheetSectionsCollapsed", actorId, sections);
}

// Whether a character left the whole moves sidebar collapsed (defaults to false /
// expanded). Per-actor, per-user.
export function getSidebarCollapsed(actorId) {
	if (!actorId) return false;
	const map = globalThis.game?.settings?.get?.("stonetop-pwd", "characterSidebarCollapsed");
	return !!map?.[actorId];
}

export function setSidebarCollapsed(actorId, collapsed) {
	if (!actorId) return;
	const next = !!collapsed;
	const map  = globalThis.game?.settings?.get?.("stonetop-pwd", "characterSidebarCollapsed") ?? {};
	if (next === !!map[actorId]) return; // avoid redundant writes
	return game.settings.set("stonetop-pwd", "characterSidebarCollapsed", { ...map, [actorId]: next });
}

export function getHoverDescriptionSetting(key, { ignoreMaster = false } = {}) {
	const settings = globalThis.game?.settings;
	const masterEnabled = ignoreMaster ? true : settings?.get?.("stonetop-pwd", "hoverDescriptionsEnabled") ?? true;
	const settingEnabled = settings?.get?.("stonetop-pwd", key) ?? true;
	return masterEnabled && settingEnabled;
}

export function getRollStatChipsSetting() {
	return globalThis.game?.settings?.get?.("stonetop-pwd", "showRollStatChips") ?? true;
}

export function applyMoveDescriptionBodyClass(show) {
	document.body.classList.toggle("stonetop-hide-roll-descriptions", !show);
}

export function setSetting(key, value) {
	return game.settings.set("stonetop-pwd", key, value);
}

/**
 * Write a setting that MAY be world-scoped, from a place a non-GM could reach.
 *
 * Only a GM may write a world setting: core rejects a player-side call outright rather than
 * quietly no-opping, so every dialog that persists GM-prep answers had grown its own
 * `if (!game.user?.isGM) return` beside its own `setSetting`. Four copies of one rule is four
 * places for the fifth caller not to look — and forgetting it does not degrade, it throws.
 *
 * The scope is read off the registration rather than assumed, so this is safe to use for any
 * key: a client-scoped one is written normally whoever is asking.
 *
 * Silent by design. These are autosave paths on prep tools a player has no business writing;
 * the console line is for whoever is debugging why a write did not land.
 */
export function setWorldSetting(key, value) {
	const scope = globalThis.game?.settings?.settings?.get?.(`stonetop-pwd.${key}`)?.scope;
	if (scope === "world" && !globalThis.game?.user?.isGM) {
		console.debug(`Stonetop | skipped world-setting write to "${key}" — not a GM.`);
		return Promise.resolve();
	}
	return setSetting(key, value);
}

function _rerenderActorSheets() {
	for (const app of Object.values(globalThis.ui?.windows ?? {})) {
		if (app?.actor) app.render(false);
	}
}
