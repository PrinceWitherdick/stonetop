import { runStartupMigrations } from "./PbtaSheetConfig.js";
import { theGmToolkit, createGmToolkit, isGmToolkitData, GM_TOOLKIT_DEFAULT_IMG } from "../actors/gmtoolkit/gm-toolkit-actor.js";
import { maybeOfferMigration } from "../migration/announce.js";
import { finishSystemIdMigration } from "../migration/finish-run.js";
import { maybeRescueStrandedWorld } from "../migration/rescue.js";
import { settleOwnArcanumBoxLayouts } from "../migration/tulpa-move-boxes.js";
import { ensureStonetopSingleton } from "./StonetopSingleton.js";
import { runWorldSetup, pendingSetupWork } from "./WorldSetup.js";
import { runPrimaryGmSweeps } from "./world-sweeps.js";
import { ensureSystemMacros, ensurePlayerHotbarMacros } from "./system-macros.js";
import { postStartupCards } from "./startup-cards.js";
import { registerStonetopApi } from "./stonetop-api.js";
import { bestEffort } from "../utils/best-effort.js";
import { stampWorldLayoutBaseline } from "../utils/sheet-layout.js";
import { applySheetFont, applySheetFontScale, applyEditPencilRevealDelay, applyReduceMotion, applySheetContrast, splitLegacyHighContrast, watchFoundryTheme, applySheetTexture, applySheetTextureFade, applyNoItalics, getTimelineKindColours, getSetting, setSetting, getSettingOverviewShown, markSettingOverviewShown, migrateFlatSettingOverviewShown, adoptClassicLayoutScope } from "../settings.js";
import { applyTimelineKindColours } from "../timeline/timeline-colours.js";
import { IntroductionsDialog } from "../dialogs/IntroductionsDialog.js";
import { pastWelcomeGuide, reopenOpenWalkthroughs, openThenRendered } from "../dialogs/walkthrough-resume.js";
import { reopenOpenBookReaders } from "../books/reader-resume.js";
import { WelcomeDialog } from "../dialogs/WelcomeDialog.js";
import { CharacterCreationDialog } from "../actors/character/dialogs/CharacterCreationDialog.js";
import { creationFlowOpen, holdCreationFlow, registerCreationFlowCleanup } from "../actors/character/creation-flow.js";
import { isMidCreation, progressFor } from "../actors/character/onboarding-progress.js";
import { readOnboardingResume, clearOnboardingResume } from "../actors/character/onboarding-resume.js";
import { assignedToAnother, playbookSlug } from "../utils/playbook-actors.js";
import { findVisibleJournal, SETTING_OVERVIEW_JOURNAL } from "../utils/seeded-journals.js";
import { STONETOP_SCOPE } from "../actors/character/StonetopFlags.js";
import { isPrimaryGM } from "../utils/primary-gm.js";
import { isDefaultImg } from "../utils/strings.js";

// The `ready` hook. Each step it runs lives in its own module and says there why it sits where it
// does; what this function owns is the ORDER, which matters more than it looks:
//
//   1. this client's sheet preferences, before anything renders;
//   2. the primary GM's world sweeps (hooks/world-sweeps.js) and the system-id migration, before
//      any sheet renders, since they repair what sheets read;
//   3. `game.stonetop` (hooks/stonetop-api.js), once the sheet partials are registered;
//   4. the GM's new-world defaults and GM Toolkit, their world setup, then their macros
//      (hooks/system-macros.js) and chat cards (hooks/startup-cards.js); a player's share of
//      the macros;
//   5. the windows: the Setting Overview, the Welcome guide and whatever was open at reload.
export async function onReady() {
	const isGM = game.user.isGM;

	applySheetFont(getSetting("sheetFont"));
	applySheetFontScale(getSetting("sheetFontScale"));
	applyEditPencilRevealDelay(getSetting("editPencilRevealDelay"));
	applyReduceMotion(getSetting("reduceMotion"));
	// The three accessibility skins. Applied here with the rest rather than left to their own
	// `onChange`, because that only fires when somebody CHANGES the setting — a client that
	// stored high contrast last session would otherwise load every sheet in the palette it could
	// not read, until it touched the control again. (The page and the `highContrast` checkbox
	// both: applySheetContrast reads the checkbox itself.) A page stored as "dark-high" and the
	// like is first split into the page plus the High Contrast checkbox, so nothing reads it after.
	await bestEffort("high-contrast split", splitLegacyHighContrast);
	applySheetContrast(getSetting("sheetContrast"));
	// "Follow Foundry" re-resolves whenever Foundry's own theme, or the OS's, changes.
	watchFoundryTheme();
	applySheetTexture(getSetting("sheetTexture"));
	applySheetTextureFade(getSetting("sheetTextureFade"));
	applyNoItalics(getSetting("noItalics"));
	// The GM's timeline colours, for the same reason: `onChange` repaints only on a change.
	applyTimelineKindColours(getTimelineKindColours());
	// Fold the pre-world-keying Setting Overview gate under this world, so every OTHER
	// world stops reading it as already-shown (see settings.js).
	await migrateFlatSettingOverviewShown();
	// Before any sheet renders: carry a GM's pre-move choice for the three classic-layout boxes
	// out of browser localStorage and into the world scope they now live in. Without it an
	// upgraded world silently reverts to the classic layout. See adoptClassicLayoutScope.
	await bestEffort("classic-layout scope adoption", adoptClassicLayoutScope);

	// Self-gated to the primary GM; see hooks/world-sweeps.js for what runs and in what order.
	await runPrimaryGmSweeps();
	await runStartupMigrations();
	// If the renamed system has been installed alongside this one, offer to move this
	// world onto it. No-ops entirely until that system is present. See module/migration/.
	// Deliberately NOT awaited: the probe is an uncacheable request that 404s on every
	// load for every GM who has not installed the target yet, and nothing below reads its
	// result — the assistant is a modal the GM acts on whenever it arrives.
	maybeOfferMigration().catch(err => console.error("Stonetop | system-id migration offer failed", err));
	// Phase 1 of a system-id rename, run late: a world re-pointed at this system by hand,
	// which is the only way to do it on a hosted Foundry, arrives with its campaign still
	// filed under the old id and every sheet blank apart from its defaults. Copies it across
	// and no-ops in a world that came over properly. Must precede the sweep below, which is
	// what corrects the asset paths inside the bag it copies. See module/migration/rescue.js.
	await bestEffort("system-id rescue", maybeRescueStrandedWorld);
	// Phase 3 of a system-id rename: the once-per-world sweep that rewrites asset paths,
	// compendiumSource stamps and sheet-class ids onto the active id. No-ops in a world
	// that has nothing stale. Awaited, because the sheet defaults it repairs are read at
	// init and everything below renders sheets.
	await bestEffort("system-id migration finish", finishSystemIdMigration);
	await ensureStonetopSingleton();

	// The sheet-partial preload was kicked off in the init hook (core doesn't await init
	// hooks, so awaiting it there orders nothing). Await it here — before the auto-opening
	// sheet / walkthrough renders below — so every partial is registered first, closing the
	// "partial could not be found" race. Guarded: a single bad partial path must not abort
	// the rest of onReady (API wiring, dialogs, gazetteer) — a missing partial is at worst
	// a cosmetic "could not be found" later, not a dead ready flow.
	await bestEffort("sheet partial preload", async () => { await game.stonetop?.templatesReady; });

	registerStonetopApi();

	// A player settles their own characters' arcana marks on load rather than waiting for the GM's
	// sweep (migration/tulpa-move-boxes.js), so the first client to show a moved card shows it
	// right. Background: it is a flag read per character, and a write only the once.
	if (!isGM) {
		settleOwnArcanumBoxLayouts().catch(err => console.error("Stonetop | arcanum box layout settle failed", err));
	}
	_registerCharacterAutoOpen();
	_registerGmToolkitAdopt();
	// Close any half-finished creation whose character is deleted out from under it — the
	// GM minting a replacement is a delete first. Every client, since the player who loses
	// the character is rarely the one who pressed the button. See creation-flow.js.
	registerCreationFlowCleanup();

	if (isGM) {
		// These two read `seedingComplete` to tell a fresh world from an established one, so
		// both MUST stay above runWorldSetup() (which is what sets it). See their own comments.
		await stampWorldLayoutBaseline();
		await _applyCoreSettingDefaultsForNewWorld();
		await _ensurePlayerActorCreationGrant();
		// The world HAVING a toolkit and this GM being pointed at one are two questions, and only the
		// second is answered once per user. _assignGmToolkitToGm returns on its latch before it reaches
		// the mint, so a world whose gamemasters have all been assigned already would never re-check —
		// which is how a world that reached zero (emptied before the delete guard shipped, or by a
		// macro passing noHook) would stay empty, and how a toolkit still wearing Foundry's mystery-man
		// would never pick up the portrait. Asking here, unlatched, is what makes both self-correcting.
		await _ensureGmToolkit();
		await _assignGmToolkitToGm();
	}

	// Set this world up: the durable-art re-apply, the gazetteer seed, the bestiary and the
	// treasure library — narrated by the setup progress window when there is actually a wait
	// to explain (see hooks/WorldSetup.js). Everything runs in the BACKGROUND so it never
	// holds up the ready sequence or the Welcome guide.
	//
	// `runWorldSetup()` settles when the art re-apply and the whole journal chain are done.
	// An established world's chain is a handful of guarded no-ops that return in a tick, so
	// it is awaited inline as before, which is what keeps the Setting Overview / walkthrough
	// ordering below reading off journals that are already there. A FRESH world imports ~160
	// entries, so it isn't: we pop the Welcome guide right away and surface the seeded
	// orientation material once the import lands (see the `wasFreshWorld` handling below).
	//
	// One thing an established world no longer waits for: the every-load world-only art
	// self-heal, which used to be awaited right here and now runs in runWorldSetup's finishing
	// pass. It has to browse all six durable art directories before it can find out there is
	// nothing to do, and that round trip is exactly what should not sit in front of the first
	// window the GM sees. So the Setting Overview can open a beat before art lands on it —
	// which is fine, since a document update re-renders an open sheet — but nothing below may
	// assume the journals have their final artwork.
	const wasFreshWorld = isGM && pendingSetupWork().journals;
	let seeding = Promise.resolve();
	if (isGM) {
		seeding = runWorldSetup();
		if (!wasFreshWorld) await seeding;
		// Caught, like the rest of what follows them: neither is worth the GM's Welcome guide.
		await bestEffort("system macro pass", ensureSystemMacros);
		await bestEffort("startup chat cards", postStartupCards);
	} else {
		// A player's share of the same pass: the Die of Fate belongs on everyone's bar.
		await bestEffort("player hotbar macro placement", ensurePlayerHotbarMacros);
	}

	// Established worlds have their journals already; open the orientation material now,
	// before the Welcome guide, so a resumed walkthrough can still land on top. Fresh
	// worlds defer this until the background seed finishes (below), since the Setting
	// Overview journal doesn't exist yet.
	if (!wasFreshWorld) await _openSettingOverview();

	// Reopen any GM walkthrough — session-zero (Introductions / Let Spring Burst Forth)
	// or Run an Expedition — that was open when this client last reloaded, at the page it
	// was on. Per-client, so it only fires for whoever actually had one open. See
	// walkthrough-resume.js.
	//
	// The GM Welcome guide auto-opens here too, until the GM ticks "Don't show this
	// automatically" or finishes both session-zero walkthroughs (pastWelcomeGuide). Its getData
	// awaits a pack index, so it renders a beat later and would bury a resumed walkthrough — so
	// when it's opening, reopen only once it's up. openThenRendered gives up waiting after a few
	// seconds, so a failed or absent Welcome render can't strand the resume.
	//
	// `welcomeDrawn` resolves to the guide (or null) once that wait is over.
	let welcomeDrawn = Promise.resolve(null);
	if (isGM && !pastWelcomeGuide()) {
		let welcome = null;
		welcomeDrawn = openThenRendered(() => (welcome = WelcomeDialog.open()), "renderWelcomeDialog")
			.then(() => welcome);
		welcomeDrawn
			.then(() => reopenOpenWalkthroughs())
			.catch(err => console.error("Stonetop | walkthrough resume failed", err));
	} else {
		reopenOpenWalkthroughs();
	}

	// Same idea, same evidence, for the rulebook readers: a plain Application does not survive a
	// refresh and a reload never runs its `close`, so a book still recorded as open was open when
	// the page went away (module/books/reader-resume.js). Per-client, and unconditional rather
	// than sequenced behind the Welcome guide the way the walkthroughs are: a book is reference
	// the reader parked beside their sheet, so it belongs UNDER whatever opens after it rather
	// than needing to land on top.
	reopenOpenBookReaders();

	// A player logging in / reloading mid-introductions: rejoin the running session by
	// opening the dialog whenever the GM has it open (following read-only until it's their
	// turn). The onChange handler covers live changes; this covers the no-event initial
	// load. No-op for the GM.
	IntroductionsDialog.openForActiveSession();

	// Fresh world: the gazetteer is still importing in the background. Once it lands, pop
	// the orientation Setting Overview and refresh the (already-open) Welcome guide so its
	// premise upgrades from the built-in fallback to the seeded journal's prose, bringing
	// the guide back above the Overview so it stays the GM's focus.
	if (wasFreshWorld) {
		seeding
			.then(() => _showOrientationAfterSeed(welcomeDrawn))
			.catch(err => console.error("Stonetop | Deferred orientation after journal seed failed:", err));
	}
}

async function _applyCoreSettingDefaultsForNewWorld() {
	if (getSetting("coreSettingDefaultsApplied")) return;

	// These core defaults were added after some worlds already existed. If the
	// Stonetop journals have already been seeded, treat the world as established
	// and mark the migration complete without changing the GM's current preferences.
	if (getSetting("seedingComplete")) {
		await setSetting("coreSettingDefaultsApplied", true);
		return;
	}

	// Best-effort: a failure here must not strand the flag (which would re-run every
	// load). Logs and moves on, then we record that this world's defaults have been
	// applied. NOTE: the player actor-creation grant is deliberately NOT here — it
	// runs from its own gate (_ensurePlayerActorCreationGrant) so ESTABLISHED worlds,
	// which return early above, still get it. The actor-backed steading roster needs
	// players to be able to create the NPC actors it links.
	await _defaultDisableAutomaticTokenRotation();

	await setSetting("coreSettingDefaultsApplied", true);
}

// Grant players the ACTOR_CREATE permission once per world, independent of world age.
// The new-world defaults above short-circuit on established worlds (seedingComplete),
// which meant a world that predates the actor-backed steading roster never got this
// grant — so players hit "you don't have permission" when adding a Resident/Neighbor,
// which creates an NPC actor. This gate has its own world flag so it runs exactly once
// on ANY world (fresh or established) that hasn't been granted yet; a GM who later
// revokes the permission under Configure Permissions keeps it revoked (never re-runs).
async function _ensurePlayerActorCreationGrant() {
	if (getSetting("playerActorCreationGranted")) return;
	await _defaultAllowPlayerActorCreation();
	await setSetting("playerActorCreationGranted", true);
}

// The world's GM Toolkit: find it, or make it. ONE per world, like the steading, and enforced
// the same way — hooks/StonetopSingleton.js vetoes a second create and refuses to delete the
// last, so the primary GM mints it and every GM after that finds it.
//
// One is the right number because nothing on the sheet is per-GM: the Moves and Core Loop tabs
// are reference transcribed from the playbook, the Threats and Sites tabs read their storage off
// the STEADING, and the "I wonder..." list on `system.wonders` is the world's open questions
// rather than any one gamemaster's. What genuinely varies between
// gamemasters is which sheet their "C" key opens, and that is a per-user flag on the User
// document (see _assignGmToolkitToGm below), not a second Actor.
//
// Plain find-or-mint, with NO once-per-user latch, and the delete guard is what pays for that:
// with deletion refused, "no toolkit in this world" can only mean "never made one". There is no
// don't-resurrect-what-somebody-threw-away case left to remember, and no flag that could jam the
// gate shut by conflating "already minted" with "could not mint".
//
// The toolkit is stamped `ownership.default = NONE` by StonetopActor#_preCreate, so it never
// appears in a player's Actors sidebar. GM-only caller.
export async function _ensureGmToolkit() {
	const existing = theGmToolkit();
	if (existing) {
		await _adoptGmToolkitPortrait(existing);
		return existing;
	}

	// Minting is a shared-world write, so exactly ONE client may do it (utils/primary-gm.js).
	// The preCreateActor veto cannot cover this on its own: it counts the INITIATING client's
	// `game.actors`, so two GMs whose `ready` lands inside the same broadcast window both read
	// zero and both pass, and the world gets two toolkits with the "I wonder..." list split
	// across them. The steading has been gated this way all along (ensureStonetopSingleton); the
	// toolkit missed it only because its mint rides inside a per-user function that must run on
	// every GM client. A non-primary GM returns empty-handed and is handed the toolkit the moment
	// the primary's create broadcasts (_registerGmToolkitAdopt), or failing that, next load.
	if (!isPrimaryGM()) return null;

	// Silent: this runs before anyone has asked for anything, so a world whose launch predates
	// the subtype should say nothing and try again next load rather than greet the GM with a
	// warning about a sheet they have not gone looking for. Returns null on any failure, and the
	// next load simply asks again.
	return await createGmToolkit({ warn: false });
}

// Put the toolkit's own mark on a toolkit that predates it, and ONLY over a stock default.
//
// The portrait shipped after the subtype did, so worlds already hold toolkits wearing Foundry's
// mystery-man. That is not a portrait anybody chose — it is the absence of one, and on this sheet
// it actively misleads, since it reads as "a person nobody has found a picture for". So this is a
// self-heal rather than a migration, in the shape StonetopActor#_preCreate already uses for an
// art-less NPC: `isDefaultImg` gates it, so a GM who set their own picture keeps it for good.
//
// Deliberately narrower than the steading's equivalent (_ensureStartingValues, which re-asserts
// ownership on every load): once this has run the image is no longer a default, so it never runs
// again and cannot fight a later choice.
//
// Primary GM only. Every GM client reaches _ensureGmToolkit, and this is a shared-world write.
async function _adoptGmToolkitPortrait(toolkit) {
	if (!isPrimaryGM() || !isDefaultImg(toolkit.img)) return;
	try {
		await toolkit.update({
			img: GM_TOOLKIT_DEFAULT_IMG,
			"prototypeToken.texture.src": GM_TOOLKIT_DEFAULT_IMG,
		});
	} catch (err) {
		// Cosmetic, so a failure must never cost the GM their toolkit: the caller still returns it
		// and the next load simply tries again.
		console.warn("Stonetop | Could not set the GM Toolkit portrait.", err);
	}
}

// Give a GM who has no assigned character their GM Toolkit as their default character, once.
// Foundry's `User#character` only references an actor id (it needn't be a `character`-type
// actor), so the toolkit rides in the GM's player-list entry and their "toggle character
// sheet" hotkey (core binds C → game.toggleCharacterSheet, which opens game.user.character
// when no token is controlled) opens it in a click.
//
// It used to be the STEADING behind that key, from before the GM had a sheet of their own.
// The toolkit is the better answer now: it holds the GM moves and, since they moved off the
// steading, the Threats and Sites prep. A GM who is still on the steading from an earlier run
// is moved across — that assignment was ours to begin with, and the `gmSteadingAssigned` flag
// is how we know it was. A GM who chose something else is left alone.
//
// The once-gate is a per-USER WORLD flag on the GM's own User document — NOT a client
// setting. A client-scoped setting lives in the browser's localStorage keyed only by
// namespace.key, so it leaks across every world on this browser+server and a "fresh world"
// reads it already-set — which silently skipped this assignment (nothing became the GM's
// character, so C did nothing). A User flag resets per world (new world = new User docs) and
// is still per-user, so it gates correctly:
//   • a GM who already runs their own PC is left untouched — we record the flag and never
//     re-check; and
//   • a GM who later clears the assignment stays cleared — we never re-assign.
// If the toolkit could not be minted, we return WITHOUT setting the flag so the next load
// tries again. GM-only caller.
export async function _assignGmToolkitToGm() {
	if (game.user.getFlag(STONETOP_SCOPE, "gmToolkitAssigned")) return;

	const toolkit = await _ensureGmToolkit();
	const current = game.user.character;

	// Somebody else's choice: their own PC, or anything we did not put there. Respect it and
	// stop checking. The one assignment we WILL move is the steading we assigned ourselves in
	// an earlier version, which `gmSteadingAssigned` records.
	if (current) {
		const oursToMove = current.type === "stonetop"
			&& !!game.user.getFlag(STONETOP_SCOPE, "gmSteadingAssigned");
		if (!oursToMove) {
			await game.user.setFlag(STONETOP_SCOPE, "gmToolkitAssigned", true);
			return;
		}
	}

	if (!toolkit) return; // not minted yet — retry next load, flag left unset

	// The assignment and its latch in ONE write, rather than an update followed by a setFlag.
	// Two writes to the same User document is one round trip more than the job needs, and it is
	// the pairing that matters: if the second half fails, the next load re-assigns a character
	// that is already assigned. Together they land or neither does.
	try {
		await game.user.update({
			character: toolkit.id,
			flags: { [STONETOP_SCOPE]: { gmToolkitAssigned: true } },
		});
	} catch (err) {
		console.warn("Stonetop | Could not assign the GM Toolkit as the GM's character.", err);
		// Flag left unset so the next load tries again — which it now can, because
		// _ensureGmToolkit hands back the toolkit it already minted.
	}
}

// Let players create actors: their own characters from Foundry's "Create Actor"
// dialog, and the NPC actors the steading Residents/Neighbors roster links. Core ships
// the ACTOR_CREATE permission as Assistant-GM-and-up only, so without this a player
// hits "you don't have permission" adding a resident (and never sees the sidebar's
// "Create Actor" button). Its caller (_ensurePlayerActorCreationGrant) adds the Player
// and Trusted Player roles exactly once per world, so the GM keeps full control
// afterward: revoking it under Configure Permissions sticks, because this never runs
// again. ACTOR_CREATE isn't per-type, so this also lets players create other actor
// types — the steading singleton and monster-builder preCreateActor hooks
// (StonetopSingleton.js) already guard those paths.
async function _defaultAllowPlayerActorCreation() {
	try {
		const R = CONST.USER_ROLES;
		const permissions = foundry.utils.deepClone(game.settings.get("core", "permissions") ?? {});
		// A missing key means core's computed default applies (every role at or above
		// the permission's defaultRole); mirror that so we EXTEND the real default
		// rather than clobber the other roles. See PermissionConfig#preparePermissions.
		const current = permissions.ACTOR_CREATE
			?? Array.fromRange(R.GAMEMASTER + 1).slice(CONST.USER_PERMISSIONS.ACTOR_CREATE.defaultRole);
		permissions.ACTOR_CREATE = Array.from(new Set([...current, R.PLAYER, R.TRUSTED])).sort((a, b) => a - b);
		await game.settings.set("core", "permissions", permissions);
	} catch (err) {
		console.warn("Stonetop | Could not grant players actor-creation permission for this new world.", err);
	}
}

async function _defaultDisableAutomaticTokenRotation() {
	const settingKey = _findAutomaticTokenRotationSettingKey();
	if (!settingKey) {
		console.warn("Stonetop | Could not find Foundry's Automatic Token Rotation setting; leaving it unchanged.");
		return;
	}

	try {
		if (game.settings.get("core", settingKey) !== false) {
			await game.settings.set("core", settingKey, false);
		}
	} catch (err) {
		console.warn("Stonetop | Could not disable Automatic Token Rotation for this new world.", err);
	}
}

function _findAutomaticTokenRotationSettingKey() {
	const registry = game.settings?.settings;
	if (!registry) return null;

	const candidates = [];
	for (const [id, config] of registry.entries()) {
		const namespace = config.namespace ?? id.split(".")[0];
		if (namespace !== "core") continue;

		const key = config.key ?? (id.startsWith("core.") ? id.slice("core.".length) : id);
		if (!key) continue;

		const name = _localizedSettingText(config.name);
		const hint = _localizedSettingText(config.hint);
		const haystack = `${key} ${config.name ?? ""} ${name} ${hint}`.toLowerCase();

		if (haystack.includes("automatic token rotation")) return key;
		if (haystack.includes("token") && haystack.includes("rotation") && haystack.includes("automatic")) candidates.push(key);
	}

	return candidates.length === 1 ? candidates[0] : null;
}

function _localizedSettingText(value) {
	if (!value) return "";
	const text = String(value);
	return String(game.i18n?.localize?.(text) ?? text);
}

// Auto-open a freshly-minted character on its owner's screen. The GM stamps the
// new actor with an `autoOpenFor` flag (see WelcomeDialog._onCreateCharacter);
// the owning client opens the sheet and clears the flag so it only ever pops
// once. This is race-free either way: a character created while the owner is
// online fires `createActor` on their client, and one created while they're
// offline is caught by the ready-time sweep when they next log in.
function _registerCharacterAutoOpen() {
	Hooks.on("createActor", actor => _maybeOpenCharacterCreation(actor));
	for (const actor of game.actors) _maybeOpenCharacterCreation(actor);
}

// Hand a co-GM the toolkit the moment it appears, rather than making them reload.
//
// Only the primary GM mints one (_ensureGmToolkit), so a second GM whose `ready` ran first has
// nothing to be assigned and leaves `gmToolkitAssigned` unset to retry next load. That retry is
// the correctness story; this is the part that makes it invisible. `_assignGmToolkitToGm` is
// already idempotent — the flag is its first line — so firing it again costs a flag read.
//
// Ignores creates THIS client initiated: `createActor` fires from inside the create's response
// handling, before `Actor.create` resolves, so our own mint would re-enter
// _assignGmToolkitToGm while the outer call is still mid-flight and both halves would write the
// same User update.
export function _registerGmToolkitAdopt() {
	Hooks.on("createActor", (actor, _options, userId) => {
		if (!game.user?.isGM || userId === game.user.id) return;
		if (!isGmToolkitData(actor)) return;
		// Returned rather than dropped only so a test can await it — Foundry ignores whatever a
		// `createActor` handler hands back. The catch is what makes that safe: an assignment that
		// throws here has no caller to report to, and the next load retries anyway.
		return _assignGmToolkitToGm()
			.catch(err => console.warn("Stonetop | Could not adopt the GM Toolkit.", err));
	});
}

// Is this character one of MINE, for the purposes of the creation prompt below?
//
// Not `game.user.character` on its own. That field holds ONE id, and a player may run more than
// one character (see actors/character/create-character.js): a second one is added without taking
// the assignment, so an assignment test would never re-prompt it — reload mid-creation on your
// second sheet and the resume never fires, leaving you on a blank sheet with an hour of answers
// sitting in localStorage.
//
// Not `actor.isOwner` on its own either. That is also true of a sheet the whole table can edit
// through `ownership.default`, and a world set up that way would ask every player to go and
// finish somebody else's half-built character. The test is the ownership entry made out to me BY
// NAME — the same one charactersOwnedBy reads and the mint stamps, so "do you already have
// characters?" and "is this one of mine?" can never disagree.
//
// Finally, a character somebody ELSE has assigned is theirs, whoever else can edit it. That
// leaves two co-owners of an UNassigned character both being prompted, which is the right answer
// for a PC being built jointly, and is guarded per client by creationFlowOpen() regardless.
//
// GMs are excluded outright: a GM owns every actor in the world.
function _isMyCharacter(actor) {
	if (game.user.isGM || !actor?.id) return false;
	const mine = game.user.character?.id === actor.id
		|| (actor.ownership?.[game.user.id] ?? 0) >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
	if (!mine) return false;
	// The same test createCharacterForUser lists a player's characters by (charactersPlayedBy).
	return !assignedToAnother(actor, game.user.id);
}

// Greet a player with character creation, or resume an interrupted one:
//   • a freshly GM-minted character (the `autoOpenFor` flag names its owner) gets
//     the creation intro, once; and
//   • the player's OWN character that still has no playbook is re-prompted every load
//     until they actually pick one: with saved progress it resumes straight back into
//     onboarding at that page (a reload mid-creation drops them back in); with none it
//     re-pops the creation intro. Either way a player who reloaded before choosing a
//     playbook lands back in creation rather than on a blank sheet they'd have to start
//     onboarding from themselves.
// A character that already has a playbook is finished (or was explicitly saved):
// only a brand-new mint pops its sheet; a reload leaves a finished character alone.
export function _maybeOpenCharacterCreation(actor) {
	if (actor?.type !== "character") return;
	const mintedForMe = actor.getFlag?.(STONETOP_SCOPE, "autoOpenFor") === game.user.id;
	if (!mintedForMe && !_isMyCharacter(actor)) return;

	// Someone on this screen is already mid-creation — the intro, the playbook picker or
	// the onboarding walkthrough is up, for this character or another. Re-entering now
	// would bury the flow they are in and, if they clicked through, restart them at the
	// picker with their answers stranded behind it. Bail BEFORE clearing autoOpenFor: the
	// mint's one-shot greeting is preserved rather than burnt on a prompt nobody saw, so
	// it arrives on the next load instead.
	if (creationFlowOpen()) return;

	// Owner-only flag; drop it now so the mint greeting only ever fires once.
	if (mintedForMe) actor.unsetFlag(STONETOP_SCOPE, "autoOpenFor").catch(() => {});

	if (playbookSlug(actor)) {
		// A committed playbook — never re-enter creation. Clear any progress flag / resume
		// snapshot an edit pass left behind on a FINISHED character, so the GM roster reads
		// "Finished" rather than a stale "exited"/page note.
		//
		// NOT on one that was saved and closed part-way through (a playbook, no
		// `creationFinished`, a live progress flag: isMidCreation). That flag is the only record
		// the GM has that the character is half built, and what the replace warning reads.
		//
		// Only when there IS one: unsetFlag issues its update unconditionally, and this
		// runs once per character of mine on every load. With a player able to run several,
		// an unguarded call is a document write and a broadcast per finished sheet per
		// login, all of them deleting a key that is already gone.
		if (actor.getFlag?.(STONETOP_SCOPE, "onboardingProgress") && !isMidCreation(actor)) {
			actor.unsetFlag?.(STONETOP_SCOPE, "onboardingProgress").catch(() => {});
		}
		clearOnboardingResume(actor);
		if (mintedForMe) actor.sheet.render(true);
		return;
	}

	// No playbook yet. When there's a saved snapshot (picked playbook + selections,
	// autosaved client-side by _launchOnboarding), resume straight into onboarding at
	// that page; otherwise greet them with the creation intro — its "Create Character"
	// button walks them through the picker / onboarding and then opens their finished
	// sheet (see CharacterCreationDialog / _onNewCharacter's `openSheetWhenDone`). This
	// fires for both a fresh mint and the player's own assigned-but-unstarted character,
	// so reloading before picking a playbook re-prompts rather than stranding them.
	//
	// Both prompts below are HELD (holdCreationFlow) from the moment they start: each can await
	// before its window registers (the resume fetches its playbook, open() waits out a stale
	// greeting), and the ready-time sweep is synchronous. Unheld, a player with two half-built
	// characters got a second flow opened beside the first in that gap.
	const snap = readOnboardingResume(actor);
	if (snap?.playbookUuid && snap?.selections) {
		holdCreationFlow(actor.id, actor.sheet._onNewCharacter({ openSheetWhenDone: true, resume: true }))
			?.catch?.(err => console.error("Stonetop | failed to resume character creation", err));
	} else if (!mintedForMe && progressFor(actor).status === "exited") {
		// They have already been offered this and deliberately backed out, with nothing saved
		// to resume. Re-modalling them on every load is nagging, and the modal is the thing
		// they closed. Open the sheet instead: it carries its own "Create Character" button
		// and the amber incomplete banner, so the way back in is right there whenever they
		// want it — nobody is stranded, and nobody is pestered. A fresh mint always greets.
		actor.sheet.render(true);
	} else {
		// Fire-and-forget from a sync hook callback, so catch here: open() awaits a stale
		// dialog's close, and an unhandled rejection would surface as a bare console error
		// with no hint that a player simply never got greeted.
		holdCreationFlow(actor.id, CharacterCreationDialog.open(actor))
			.catch(err => console.error("Stonetop | failed to open character creation", err));
	}
}

// After a fresh world's background journal seed finishes, surface the orientation
// material the seed just created: pop the Setting Overview journal, then refresh the
// open Welcome guide so its premise (read from that journal) upgrades from the fallback
// and its cross-links resolve — and bring the guide back to the front so it sits above
// the Overview. `welcomeDrawn` resolves to the guide once its first render is in (or
// openThenRendered has given up on it), so a seed that beat that render waits for it.
// No-op if the GM already closed the guide, or it never opened.
async function _showOrientationAfterSeed(welcomeDrawn) {
	await _openSettingOverview();
	const welcomeDialog = await welcomeDrawn;
	if (welcomeDialog?.rendered) {
		await welcomeDialog.render(false);
		welcomeDialog.bringToTop();
	}
}

// Pop the Setting Overview journal open so a fresh-start user lands on the
// world's orientation material. Two cases:
//   • everyone (GM included) sees it once per client the first time they connect,
//     guarded by the client-scoped `settingOverviewShown` flag so it never
//     re-interrupts later sessions; and
//   • a player with no character assigned yet sees it every load regardless of
//     that flag — until the GM mints them a character, the Overview is the thing
//     for them to read, so we keep surfacing it (a player with an assigned
//     character instead gets character creation via _maybeOpenCharacterCreation).
// The GM seeds the journal; SeedCompendiums grants players read access.
async function _openSettingOverview() {
	const overview = findVisibleJournal(SETTING_OVERVIEW_JOURNAL);
	if (!overview) return; // not seeded yet (or not visible to this user) — try again next load

	const needsOrientation = !game.user.isGM && !game.user.character;
	if (!needsOrientation && getSettingOverviewShown()) return;

	overview.sheet.render(true);
	if (!getSettingOverviewShown()) await markSettingOverviewShown();
}
