import { runStartupMigrations } from "./PbtaSheetConfig.js";
import { maybeOfferMigration } from "../migration/announce.js";
import { finishSystemIdMigration } from "../migration/finish-run.js";
import { maybeRescueStrandedWorld } from "../migration/rescue.js";
import { ensureStonetopSingleton, remindDestinedOmenRoll } from "./StonetopSingleton.js";
import { runWorldSetup, pendingSetupWork } from "./WorldSetup.js";
import { reapplyBook2Art, hasImportedBook2Art } from "../book2-art/reapply.js";
import { clearArtBrowseCache } from "../book2-art/browse.js";
import { BOOK2_ART_MACRO_NAME, findBook2ArtWorldMacro, loadBook2ArtMacroSource, runImportBookArtMacro } from "../book2-art/macro.js";
import { offerDurableArtOnce } from "../book2-art/offer-once.js";
import { openProgressNotification } from "../utils/progress-notification.js";
import { stonetopChatCard } from "../utils/chat.js";
import { applySheetFont, applySheetFontScale, applyEditPencilRevealDelay, applyHideRollableIcon, applyReduceMotion, getSetting, setSetting, getSettingOverviewShown, markSettingOverviewShown, migrateFlatSettingOverviewShown } from "../settings.js";
import { EndOfSessionDialog } from "../dialogs/EndOfSessionDialog.js";
import { IntroductionsDialog } from "../dialogs/IntroductionsDialog.js";
import { SpringBurstDialog } from "../dialogs/SpringBurstDialog.js";
import { reopenOpenWalkthroughs, sessionZeroComplete } from "../dialogs/walkthrough-resume.js";
import { writeChronicle } from "../utils/chronicle.js";
import { ExpeditionDialog } from "../dialogs/ExpeditionDialog.js";
import { WeatherDialog } from "../dialogs/WeatherDialog.js";
import { WelcomeDialog } from "../dialogs/WelcomeDialog.js";
import { FoundryBasicsDialog } from "../dialogs/FoundryBasicsDialog.js";
import { CharacterCreationDialog } from "../actors/character/dialogs/CharacterCreationDialog.js";
import { readOnboardingResume, clearOnboardingResume } from "../actors/character/onboarding-resume.js";
import { playbookSlug } from "../utils/playbook-actors.js";
import { rollDieOfFate } from "../utils/die-of-fate.js";
import { createArcanumItem } from "../item/createArcanum.js";
import { LoveLetterDialog } from "../dialogs/LoveLetterDialog.js";
import { StonetopArcanaInspireDialog } from "../item/StonetopArcanaInspireDialog.js";
import { findVisibleJournal, SETTING_OVERVIEW_JOURNAL } from "../utils/seeded-journals.js";
import { getStonetopSteadingActor, getStonetopSteadingActorOrWarn } from "../utils/world.js";
import { rollMoveFromUuid } from "./HotbarDrop.js";
import { ensureThreatsEntry } from "../threats/threat-store.js";
import { ensureHazardsEntry } from "../hazards/hazard-store.js";
import { STONETOP_SCOPE, resolvedFlagProperty } from "../actors/character/StonetopFlags.js";
import { deletionEntry } from "../utils/foundry-compat.js";
import { isPrimaryGM } from "../utils/primary-gm.js";
import { migrateAllSteadingPeople, ensurePeopleFolders, backfillAllResidentHomes } from "../actors/steading/steading-people.js";
import { PERSON_DEFAULT_IMG } from "../utils/person-portrait.js";
import { isDefaultImg } from "../utils/strings.js";

const _EOS_MACRO_NAME   = "End of Session";
const _EOS_MACRO_IMG    = "systems/stonetop-pwd/assets/icons/macros/truce.svg";
const _EOS_MACRO_SCRIPT = "game.stonetop?.openEndOfSession?.()";
const _EOS_HOTBAR_SLOT  = 10;

// The Chronicle hotbar macro (slot 9): compiles the recorded Introductions + Spring
// Burst answers and expedition log into the shared "The Chronicle" journal and opens it
// (GM-only — saveChronicle is seed-once, so re-running it preserves inline edits). Sits
// just before End of Session and, like it, is handled separately from the slots-1–5
// _SYSTEM_MACROS set and keyed on its command so it won't collide with a user macro of
// the same name.
const _CHRONICLE_MACRO_NAME   = "The Chronicle";
const _CHRONICLE_MACRO_IMG    = "systems/stonetop-pwd/assets/icons/macros/bookmarklet.svg";
const _CHRONICLE_MACRO_SCRIPT = "game.stonetop?.saveChronicle?.()";
const _CHRONICLE_HOTBAR_SLOT  = 9;

// The "(TEST ONLY) Populate World" dev macro, added to the Macro Directory but never
// the hotbar. Its body is the create-test-characters dev script — that file is the single
// source of truth, fetched at runtime (see _ensureTestPopulateMacro). It SHIPS: it is
// un-ignored in .gitignore and named explicitly in the release zip step, so released
// worlds get the macro too. A build that omits it still skips seeding, silently.
const _TEST_MACRO_NAME   = "(TEST ONLY) Populate World";
const _TEST_MACRO_SRC    = "systems/stonetop-pwd/scripts/local/create-test-characters.js";
const _TEST_MACRO_IMG    = "systems/stonetop-pwd/assets/icons/macros/hazard-sign.svg";
const _TEST_MACRO_FOLDER = "For Testing Purposes";

// Retired hotbar macro — the Introductions walkthrough now launches from the
// Welcome guide, so the standalone macro is deleted rather than slotted (see
// _retireIntroductionsMacro). Name + command identify the system-created one.
const _INTRO_MACRO_NAME   = "Character Introductions";
const _INTRO_MACRO_SCRIPT = `\
const w = Object.values(ui.windows).find(w => w.id === "stonetop-introductions");
if (w?.rendered) { w.bringToTop(); return; }
game.stonetop?.openIntroductions?.();`;

// The ordered system hotbar macros (slots 1–6), in their canonical order. The
// single source of truth for both _ensureHotbarMacro (places any that are missing)
// and _reorderSystemMacros (snaps them into this order). Chronicle (9) / End of Session
// (10) are handled separately below because they also key on their command. Seasons
// Change took the spring icon that Welcome used to carry; Welcome now uses the
// direction-signs. "Write a Love Letter" (slot 5) is GM prep (Book I p.568) — a GM-only
// block places these, so it never reaches a player's hotbar.
const _SYSTEM_MACROS = [
	{ name: "Welcome to Stonetop", img: "systems/stonetop-pwd/assets/icons/macros/direction-signs.svg", command: "game.stonetop?.openWelcome?.()",        slot: 1 },
	{ name: "Seasons Change",      img: "systems/stonetop-pwd/assets/icons/macros/spring.svg",           command: "game.stonetop?.openSeasonsChange?.()", slot: 2 },
	{ name: "Run an Expedition",   img: "systems/stonetop-pwd/assets/icons/macros/treasure-map.svg",     command: "game.stonetop?.openExpedition?.()",     slot: 3 },
	{ name: "Weather",             img: "systems/stonetop-pwd/assets/icons/macros/sun-cloud.svg",        command: "game.stonetop?.openWeather?.()",        slot: 4 },
	{ name: "Write a Love Letter", img: "systems/stonetop-pwd/assets/icons/macros/love-letter.svg",      command: "game.stonetop?.openLoveLetter?.()",     slot: 5 },
	{ name: "Die of Fate",         img: "systems/stonetop-pwd/assets/icons/macros/die-of-fate.svg",      command: "game.stonetop?.rollDieOfFate?.()",      slot: 6 },
];

// Bump to re-snap the system macros into their canonical slots once, on every client
// (the per-client `systemHotbarLayoutVersion` setting trails this until then). Bumped
// to 2 when Seasons Change was inserted at slot 2 and the rest shifted right; to 3 when
// Write a Love Letter took slot 5 and Die of Fate moved to slot 6.
const _HOTBAR_LAYOUT_VERSION = 3;

export async function onReady() {
	applySheetFont(getSetting("sheetFont"));
	applySheetFontScale(getSetting("sheetFontScale"));
	applyEditPencilRevealDelay(getSetting("editPencilRevealDelay"));
	applyHideRollableIcon(getSetting("hideRollableIcon"));
	applyReduceMotion(getSetting("reduceMotion"));
	// Fold the pre-world-keying Setting Overview gate under this world, so every OTHER
	// world stops reading it as already-shown (see settings.js).
	await migrateFlatSettingOverviewShown();
	await _migrateArmourToArmor();
	await _migrateGmPrepPagesToSingleJournal();
	// Convert each steading's plain-text Residents/Neighbors rows into linked NPC actors
	// (idempotent; primary-GM only so two connected GMs can't double-create). Swept every
	// load, not once per world: players can't create actors, so a background that seeds
	// neighbors during onboarding leaves text rows for the GM to pick up here.
	if (isPrimaryGM()) {
		try { await migrateAllSteadingPeople(); }
		catch (err) { console.error("Stonetop | Residents/Neighbors → NPC conversion failed", err); }
		// Give already-linked Residents of Stonetop a "Stonetop" Home if theirs is blank
		// (new residents get this at creation). One-time, idempotent, GM-only.
		try { await backfillAllResidentHomes(); }
		catch (err) { console.error("Stonetop | Resident Home backfill failed", err); }
		// Pre-create both people folders so a player adding the first member never has to
		// (folder creation is a GM-only right; ensurePeopleFolder returns null for them).
		try { await ensurePeopleFolders(); }
		catch (err) { console.error("Stonetop | ensurePeopleFolders failed", err); }
		try { await _migrateNpcTokenNameplates(); }
		catch (err) { console.error("Stonetop | NPC token-nameplate migration failed", err); }
		try { await _migrateNpcPlaceholderPortraits(); }
		catch (err) { console.error("Stonetop | NPC placeholder-portrait migration failed", err); }
		try { await _migrateTokenImagesToPortraits(); }
		catch (err) { console.error("Stonetop | token-image backfill failed", err); }
	}
	await runStartupMigrations();
	// If the renamed system has been installed alongside this one, offer to move this
	// world onto it. No-ops entirely until that system is present. See module/migration/.
	// Deliberately NOT awaited: the probe is an uncacheable request that 404s on every
	// load for every GM who has not installed the target yet, and nothing below reads its
	// result — the assistant is a modal the GM acts on whenever it arrives.
	maybeOfferMigration().catch(err => console.error("Stonetop | system-id migration offer failed", err));
	// Phase 3 of a system-id rename: the once-per-world sweep that rewrites asset paths,
	// compendiumSource stamps and sheet-class ids onto the active id. No-ops in a world
	// that has nothing stale. Awaited, because the sheet defaults it repairs are read at
	// init and everything below renders sheets.
	//
	// Phase 1, run late, comes FIRST: a world re-pointed at this system by hand, which is the
	// only way to do it on a hosted Foundry, arrives with its campaign still filed under the
	// old id and every sheet blank apart from its defaults. The sweep below is what corrects
	// the asset paths inside the bag it copies. See module/migration/rescue.js.
	try { await maybeRescueStrandedWorld(); }
	catch (err) { console.error("Stonetop | system-id rescue failed", err); }
	try { await finishSystemIdMigration(); }
	catch (err) { console.error("Stonetop | system-id migration finish failed", err); }
	await ensureStonetopSingleton();

	// The sheet-partial preload was kicked off in the init hook (core doesn't await init
	// hooks, so awaiting it there orders nothing). Await it here — before the auto-opening
	// sheet / walkthrough renders below — so every partial is registered first, closing the
	// "partial could not be found" race. Guarded: a single bad partial path must not abort
	// the rest of onReady (API wiring, dialogs, gazetteer) — a missing partial is at worst
	// a cosmetic "could not be found" later, not a dead ready flow.
	try { await game.stonetop?.templatesReady; }
	catch (err) { console.error("Stonetop | sheet partial preload failed", err); }

	game.stonetop ??= {};
	game.stonetop.openEndOfSession  = () => new EndOfSessionDialog().render(true);
	game.stonetop.openIntroductions = () => IntroductionsDialog.open();
	// Cursor onChange dispatcher (registered on the introCursor world setting): opens/
	// focuses/closes the Introductions dialog on the active player's client as the GM
	// drives the round-robin. See dialogs/IntroductionsDialog.js.
	game.stonetop.onIntroCursor     = cursor => IntroductionsDialog.handleIntroCursor(cursor);
	game.stonetop.openSpringBurst   = () => SpringBurstDialog.open();
	// Run the steading's Seasons Change homefront move from the hotbar: launch the
	// season-picker → roll flow (the same one the sheet's Seasons Change move uses)
	// WITHOUT opening the steading sheet — the dialog carries a "Stonetop" header
	// button to jump to the sheet if wanted. Warns if there's no steading yet.
	game.stonetop.openSeasonsChange = () => {
		getStonetopSteadingActorOrWarn()?.sheet._onSeasonsChange();
	};
	// Compile the recorded Introductions + Spring Burst answers into the shared
	// "Chronicle" journal and open it (GM-only). Callable from the Introductions
	// dialog's "Let spring break forth!" finish, the Expedition dialog, a macro, or
	// the console.
	game.stonetop.saveChronicle     = () => writeChronicle().then(j => j?.sheet?.render(true));
	game.stonetop.openExpedition    = () => ExpeditionDialog.open();
	game.stonetop.openWeather       = () => WeatherDialog.open();
	game.stonetop.openWelcome       = () => WelcomeDialog.open();
	game.stonetop.openFoundryBasics = () => FoundryBasicsDialog.open();
	// Preview/test the player-facing creation intro for any character on demand
	// (it normally only auto-pops on the owning player's client). Pass an actor, or
	// it falls back to the current user's assigned character:
	//   game.stonetop.openCharacterCreation()
	game.stonetop.openCharacterCreation = (actor = game.user.character) =>
		actor ? new CharacterCreationDialog(actor).render(true)
		      : ui.notifications.warn("No character to start creation for.");
	// Cut every portrait this world could have out of the book art already on disk — the detail
	// portraits, and the square faces the small round pictures use — then point NPCs already
	// holding a whole illustration at their close-up. GM-only (it writes files).
	//
	// The same work the one-time chat card offers, reachable on demand because that card latches
	// the moment it is posted: scrolled past, deleted, or landed on the other GM and it is gone
	// for good. Safe to run any number of times — every stage re-plans from what is on disk.
	game.stonetop.rebuildPortraits = async () => {
		if (!game.user.isGM) return ui.notifications.warn("Only a GM can rebuild portrait art.");
		const { runPeopleArtRebuild, countPeopleArtRebuilds, describeRebuild } =
			await import("../book2-art/run-rebuild.js");
		const todo = await countPeopleArtRebuilds();
		if (!todo) return ui.notifications.info("Every portrait this world can build is already on disk.");
		// The other two entry points are buttons, which count down in their own label. This one
		// has no button, and a toast that fades after five seconds while a 140-image job runs on
		// is the exact thing the notification bar exists for. No delay: the caller just asked.
		const bar = openProgressNotification(
			`Stonetop: rebuilding ${todo} portrait${todo === 1 ? "" : "s"}`, { delayMs: 0 });
		let res;
		try {
			res = await runPeopleArtRebuild({
				onProgress: (done, total) => bar.update({ fraction: done / total, detail: `${done} of ${total}` }),
			});
		} catch (err) {
			bar.abandon();   // a died-part-way run must not sign off with a full bar
			throw err;
		}
		bar.close();
		ui.notifications[res.failed ? "warn" : "info"](describeRebuild(res));
		return res;
	};
	game.stonetop.rollDieOfFate     = rollDieOfFate;
	// Open the love-letter authoring dialog (GM-only; Book I p.568). Wired to the
	// "Write a Love Letter" hotbar macro and callable from the console.
	game.stonetop.openLoveLetter    = () => LoveLetterDialog.open();
	// Roll a learned move from its uuid — the entry point the move hotbar macros call
	// (drag a move off a character sheet onto the hotbar; see hooks/HotbarDrop.js).
	game.stonetop.rollMoveMacro     = rollMoveFromUuid;
	// Create a blank homebrew arcanum world Item and open its editor. Minor by default;
	// pass { major: true } for a major. Callable from a macro/console/hotbar:
	//   game.stonetop.createArcanum({ name: "My Charm" })
	game.stonetop.createArcanum     = (opts = {}) => createArcanumItem(opts);
	// Open the Artifact Creation inspiration wizard; on finish it creates a standalone
	// homebrew arcanum world Item pre-filled with the rolled results and opens its editor.
	// Callable from a macro/console/hotbar:  game.stonetop.inspireArcanum()
	game.stonetop.inspireArcanum    = () => new StonetopArcanaInspireDialog({
		onCreate: ({ name, major, front }) => createArcanumItem({ name, major, front }),
	}).render(true);
	// Manually re-apply the durable Book II art to the compendium + world journals + world
	// actors, bypassing the once-per-version gate. The dev-loop entry point after
	// re-assigning art in the picker + regenerating the manifest (a world reload picks up
	// the new manifest.js; this then re-flows it without waiting for a version bump). Pass
	// { worldOnly: true } to only touch world journals. Returns the pass's stats.
	//   game.stonetop.reapplyBook2Art()
	//
	// Drops the directory-listing cache first (see book2-art/browse.js). This is the one entry
	// point whose whole purpose is "I have just changed what is on disk, go and look again" —
	// and it is reached by hand, from a console, typically right after dropping files in a way
	// nothing in the system can hook. A warm listing from earlier in the session would answer
	// with the state that prompted the call.
	game.stonetop.reapplyBook2Art   = (opts = {}) => { clearArtBrowseCache(); return reapplyBook2Art(opts); };
	// Launch the interactive bring-your-own-book "Import Book Art" extractor macro (NOT the
	// silent re-point pass above). The entry point the post-startup art-reminder chat button
	// and the Welcome guide's "Import Book Art" button both call. Callable from the console:
	//   game.stonetop.importBookArt()
	game.stonetop.importBookArt     = () => runImportBookArtMacro();

	_registerCharacterAutoOpen();

	if (game.user.isGM) await _applyCoreSettingDefaultsForNewWorld();
	if (game.user.isGM) await _ensurePlayerActorCreationGrant();
	if (game.user.isGM) await _assignSteadingToUnassignedGm();

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
	const isGM = game.user.isGM;
	const wasFreshWorld = isGM && pendingSetupWork().journals;
	let seeding = Promise.resolve();
	if (isGM) {
		seeding = runWorldSetup();
		if (!wasFreshWorld) await seeding;

		await _retireIntroductionsMacro();
		// Place any missing system macros at their default slots (existing placements
		// are left alone, so a manual rearrangement sticks). Their fixed starting order
		// — 1 Welcome · 2 Seasons Change · 3 Run an Expedition · 4 Weather · 5 Write a
		// Love Letter · 6 Die of Fate · 9 The Chronicle · 10 End of Session — is applied
		// for the slots-1–6 set per layout version by _reorderSystemMacros, below;
		// Chronicle and End of Session are placed (but not reordered) by their own
		// _ensureHotbarMacro calls.
		for (const macro of _SYSTEM_MACROS) await _ensureHotbarMacro(macro);
		await _ensureHotbarMacro({
			name: _CHRONICLE_MACRO_NAME, img: _CHRONICLE_MACRO_IMG, command: _CHRONICLE_MACRO_SCRIPT, slot: _CHRONICLE_HOTBAR_SLOT,
			match: m => m.command === _CHRONICLE_MACRO_SCRIPT && m.name === _CHRONICLE_MACRO_NAME,
		});
		await _ensureHotbarMacro({
			name: _EOS_MACRO_NAME, img: _EOS_MACRO_IMG, command: _EOS_MACRO_SCRIPT, slot: _EOS_HOTBAR_SLOT,
			match: m => m.command === _EOS_MACRO_SCRIPT && m.name === _EOS_MACRO_NAME,
		});
		await _reorderSystemMacros();
		await _ensureTestPopulateMacro();
		await _ensureBook2ArtMacro();
	}
	if (game.user.isGM) {
		await _postStartupWelcomeMessageOnce();
		await _postBook2ArtReminderOnce();
		// Background, like the seeds above. This one has to BROWSE the art folder before it
		// can tell there is nothing to offer, and it deliberately leaves its flag unset when
		// the plan is empty so a later import still gets the nudge — so for a GM who never
		// imports, an awaited call stalls the ready sequence on a server round-trip whose
		// answer is always "nothing", on every single load. Nothing below waits on it.
		_offerPeopleArtRebuildOnce()
			.catch(err => console.error("Stonetop | portrait rebuild offer failed:", err));
		await remindDestinedOmenRoll();
	}

	// Established worlds have their journals already; open the orientation material now,
	// before the Welcome guide, so a resumed walkthrough can still land on top. Fresh
	// worlds defer this until the background seed finishes (below), since the Setting
	// Overview journal doesn't exist yet.
	if (!wasFreshWorld) await _openSettingOverview();

	// Reopen any session-zero walkthrough (Introductions / Let Spring Burst Forth)
	// that was open when this client last reloaded, at the page it was on. Per-client,
	// so it only fires for whoever actually had one open. See walkthrough-resume.js.
	//
	// The GM Welcome guide auto-opens here too, but its getData awaits a pack index so
	// it renders a beat later and would bury a resumed walkthrough — so when it's
	// opening, reopen only once it's up (with a timeout fallback so a failed/absent
	// Welcome render can't strand the resume).
	let welcomeDialog = null;
	if (game.user.isGM && !getSetting("gmWelcomeShown") && !sessionZeroComplete()) {
		let resumed = false;
		const resume = () => { if (resumed) return; resumed = true; reopenOpenWalkthroughs(); };
		Hooks.once("renderWelcomeDialog", resume);
		setTimeout(resume, 2500);
		welcomeDialog = _openGmWelcomeGuide();
	} else {
		reopenOpenWalkthroughs();
	}

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
			.then(() => _showOrientationAfterSeed(welcomeDialog))
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

// Give a GM who has no assigned character the shared steading as their default character,
// once. Foundry's `User#character` only references an actor id (it needn't be a
// `character`-type actor), so the "Stonetop" steading rides in the GM's player-list entry
// and their "toggle character sheet" hotkey (core binds C → game.toggleCharacterSheet,
// which opens game.user.character when no token is controlled) opens it in a click.
//
// The once-gate is a per-USER WORLD flag on the GM's own User document — NOT a client
// setting. A client-scoped setting lives in the browser's localStorage keyed only by
// namespace.key, so it leaks across every world on this browser+server and a "fresh world"
// reads it already-set — which silently skipped this assignment (the steading never became
// the GM's character, so C did nothing). A User flag resets per world (new world = new
// User docs) and is still per-user, so it gates correctly:
//   • a GM who already runs their own PC (or previously accepted the steading) is left
//     untouched — we record the flag and never re-check; and
//   • a GM who later clears the assignment stays cleared — we never re-assign.
// If no steading exists yet (e.g. a secondary GM logging in before the primary GM minted
// it), we return WITHOUT setting the flag so the next load tries again. GM-only caller.
async function _assignSteadingToUnassignedGm() {
	if (game.user.getFlag(STONETOP_SCOPE, "gmSteadingAssigned")) return;

	// Already has a character (their own PC, or the steading from a prior run): respect it
	// and stop checking.
	if (game.user.character) {
		await game.user.setFlag(STONETOP_SCOPE, "gmSteadingAssigned", true);
		return;
	}

	const steading = getStonetopSteadingActor();
	if (!steading) return; // not minted yet — retry next load, flag left unset

	try {
		await game.user.update({ character: steading.id });
	} catch (err) {
		console.warn("Stonetop | Could not assign the steading as the GM's character.", err);
		return; // leave the flag unset so a transient failure retries next load
	}
	await game.user.setFlag(STONETOP_SCOPE, "gmSteadingAssigned", true);
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

// Greet a player with character creation, or resume an interrupted one:
//   • a freshly GM-minted character (the `autoOpenFor` flag names its owner) gets
//     the creation intro, once; and
//   • the player's own assigned character that still has no playbook is re-prompted
//     every load until they actually pick one: with saved progress it resumes
//     straight back into onboarding at that page (a reload mid-creation drops them
//     back in); with none it re-pops the creation intro. Either way a player who
//     reloaded before choosing a playbook lands back in creation rather than on a
//     blank sheet they'd have to start onboarding from themselves.
// A character that already has a playbook is finished (or was explicitly saved):
// only a brand-new mint pops its sheet; a reload leaves a finished character alone.
function _maybeOpenCharacterCreation(actor) {
	if (actor?.type !== "character") return;
	const mintedForMe  = actor.getFlag?.(STONETOP_SCOPE, "autoOpenFor") === game.user.id;
	const isMyAssigned = !game.user.isGM && game.user.character?.id === actor.id;
	if (!mintedForMe && !isMyAssigned) return;
	// Owner-only flag; drop it first so the mint greeting only ever fires once.
	if (mintedForMe) actor.unsetFlag(STONETOP_SCOPE, "autoOpenFor").catch(() => {});

	if (playbookSlug(actor)) {
		// Finished — never re-enter creation. Clear any progress flag / resume
		// snapshot a mid-creation "Save & close" (or an edit pass) left behind, so the
		// GM roster reads "Finished" rather than a stale "exited"/page note.
		actor.unsetFlag?.(STONETOP_SCOPE, "onboardingProgress").catch(() => {});
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
	const snap = readOnboardingResume(actor);
	if (snap?.playbookUuid && snap?.selections) {
		actor.sheet._onNewCharacter({ openSheetWhenDone: true, resume: true });
	} else {
		new CharacterCreationDialog(actor).render(true);
	}
}

// Pop the first-session Welcome guide for the GM until either they tick "Don't show
// this automatically" (which sets gmWelcomeShown) or they finish both session-zero
// walkthroughs — the guided Introductions and Let Spring Burst Forth (sessionZeroComplete).
// Until one of those, the guide keeps greeting the GM across the first few loads.
function _openGmWelcomeGuide() {
	if (getSetting("gmWelcomeShown") || sessionZeroComplete()) return null;
	return WelcomeDialog.open();
}

// After a fresh world's background journal seed finishes, surface the orientation
// material the seed just created: pop the Setting Overview journal, then refresh the
// open Welcome guide so its premise (read from that journal) upgrades from the fallback
// and its cross-links resolve — and bring the guide back to the front so it sits above
// the Overview. If the seed somehow beat the guide's first render, wait for that render
// before refreshing. No-op if the GM already closed the guide.
async function _showOrientationAfterSeed(welcomeDialog) {
	await _openSettingOverview();
	if (!welcomeDialog) return;
	if (!welcomeDialog.rendered) {
		await new Promise(resolve => Hooks.once("renderWelcomeDialog", resolve));
	}
	if (welcomeDialog.rendered) {
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

// Is a hotbar slot empty? The hotbar is a sparse map of slot → macro id, so an
// absent key means free. (`in` stringifies the slot, matching the string keys.)
function _isHotbarSlotFree(slot) {
	return !(slot in game.user.hotbar);
}

// The first empty hotbar slot at or after `from` (1–50, across all five pages), or
// null if the hotbar is somehow full. Lets us place a macro without evicting one
// the GM put in our default slot.
function _firstFreeHotbarSlot(from = 1) {
	for (let s = from; s <= 50; s++) if (_isHotbarSlotFree(s)) return s;
	return null;
}

// Find-or-create a global script macro and place it on the hotbar. Idempotent:
// refreshes the icon if it drifted, and only places the macro when it isn't already
// on the user's hotbar — so once it's placed, a manual rearrangement sticks. It
// takes its default `slot` only if that slot is free; otherwise it falls back to the
// first empty slot, so we never bump a macro the GM put there. The fixed system
// order is applied per layout version by _reorderSystemMacros. `match` overrides the
// default name-based lookup (the End of Session macro also keys on its command to
// avoid clashing with any user macro of the same name). Run these serially — each
// assignHotbarMacro writes the same user.hotbar document, so concurrent calls would
// clobber each other.
async function _ensureHotbarMacro({ name, img, command, slot, match }) {
	let macro = game.macros.find(match ?? (m => m.name === name));
	if (!macro) {
		macro = await Macro.create({ name, type: "script", img, command, scope: "global" });
	} else if (macro.img !== img) {
		await macro.update({ img });
	}

	const alreadySlotted = Object.values(game.user.hotbar).includes(macro.id);
	if (alreadySlotted) return;

	const target = _isHotbarSlotFree(slot) ? slot : _firstFreeHotbarSlot();
	if (target) await game.user.assignHotbarMacro(macro, target);
}

// Snap the system macros into their canonical order (1 Welcome · 2 Seasons Change ·
// 3 Run an Expedition · 4 Weather · 5 Write a Love Letter · 6 Die of Fate), then leave the arrangement alone
// so the GM is free to rearrange the hotbar. Guarded by a per-client layout version
// (the hotbar is per-user): it runs once per layout, so bumping _HOTBAR_LAYOUT_VERSION
// re-snaps everyone once (e.g. when Seasons Change was inserted) but later manual moves
// at the same version are left alone.
//
// Non-destructive: it never evicts a macro the GM placed in one of our slots. We
// first lift our own macros off the bar (freeing their slots), then re-place each at
// its canonical slot if free, else the first empty slot. So a personal macro sitting
// in slot 2 keeps its spot and ours flows around it.
async function _reorderSystemMacros() {
	if (getSetting("systemHotbarLayoutVersion") >= _HOTBAR_LAYOUT_VERSION) return;

	const macros = _SYSTEM_MACROS
		.map(o => ({ macro: game.macros.find(m => m.name === o.name && m.command === o.command), slot: o.slot }))
		.filter(o => o.macro);

	// Lift our macros off the hotbar so their canonical slots open up (a user macro
	// in one of those slots stays put). assignHotbarMacro(null, slot) clears a slot.
	for (const { macro } of macros) {
		const slot = Object.entries(game.user.hotbar).find(([, id]) => id === macro.id)?.[0];
		if (slot) await game.user.assignHotbarMacro(null, Number(slot));
	}

	// Re-place each at its canonical slot if free, else the first open slot.
	for (const { macro, slot } of macros) {
		const target = _isHotbarSlotFree(slot) ? slot : _firstFreeHotbarSlot();
		if (target) await game.user.assignHotbarMacro(macro, target);
	}

	await setSetting("systemHotbarLayoutVersion", _HOTBAR_LAYOUT_VERSION);
}

// Add the "(TEST ONLY) Populate World" script macro to the world's Macro Directory,
// inside a "For Testing Purposes" folder — but never to the hotbar (creating a Macro
// document doesn't slot it; only assignHotbarMacro does, which we deliberately skip).
// Its body is the create-test-characters dev script, fetched at runtime so that one file
// stays the single source of truth: a missing file (a build that omits scripts/) skips
// silently, leaving those worlds untouched. It ships in the release zip, so released
// worlds seed it as well. Seeded once — a GM who deletes it keeps it gone — but while it
// exists its command is re-synced so edits to the script propagate.
//
// GM-only twice over: the call site sits inside a game.user.isGM block, and the macro is
// created with default ownership NONE so it stays out of a player's Macro Directory even
// though Foundry lets players hold macros. Both matter now that it reaches real tables —
// running it seeds (and, on a re-run, DELETES) a roster of [TEST] fixtures.
async function _ensureTestPopulateMacro() {
	let command;
	try {
		const res = await fetch(_TEST_MACRO_SRC);
		if (!res.ok) return;
		command = await res.text();
	} catch { return; }
	if (!command?.trim()) return;

	// Find-or-create the "For Testing Purposes" Macro folder the macro lives in.
	let folder = game.folders.find(f => f.type === "Macro" && f.name === _TEST_MACRO_FOLDER);
	if (!folder) folder = await Folder.create({ name: _TEST_MACRO_FOLDER, type: "Macro" });

	const existing = game.macros.find(m => m.name === _TEST_MACRO_NAME);
	if (existing) {
		const update = {};
		if (existing.command !== command) update.command = command;
		if (existing.img !== _TEST_MACRO_IMG) update.img = _TEST_MACRO_IMG;
		if (folder && existing.folder?.id !== folder.id) update.folder = folder.id;
		if (Object.keys(update).length) await existing.update(update);
		return;
	}
	if (getSetting("testPopulateMacroSeeded")) return; // deleted on purpose — leave it gone

	await Macro.create({
		name: _TEST_MACRO_NAME, type: "script", img: _TEST_MACRO_IMG, command,
		scope: "global", folder: folder?.id ?? null,
		ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE },
	});
	await setSetting("testPopulateMacroSeeded", true);
}

// Add the "Import Book Art" macro to the world's Macro Directory — but never
// the hotbar. The shipped compendium doc is the single source of truth: its
// command/img are copied on first seed and re-synced while the world copy exists,
// so a system update refreshes it. Seeded once — a GM who deletes it keeps it
// gone. GM-only (called from the isGM block in onReady).
async function _ensureBook2ArtMacro() {
	const src = await loadBook2ArtMacroSource();
	if (!src?.command) return;

	const existing = findBook2ArtWorldMacro();
	if (existing) {
		const update = {};
		if (existing.name !== BOOK2_ART_MACRO_NAME) update.name = BOOK2_ART_MACRO_NAME;
		if (existing.command !== src.command) update.command = src.command;
		if (existing.img !== src.img) update.img = src.img;
		if (Object.keys(update).length) await existing.update(update);
		return;
	}
	if (getSetting("book2ArtMacroSeeded")) return; // deleted on purpose — leave it gone

	await Macro.create({ name: BOOK2_ART_MACRO_NAME, type: "script", img: src.img, command: src.command, scope: "global" });
	await setSetting("book2ArtMacroSeeded", true);
}

// Retire the standalone "Character Introductions" hotbar macro: its walkthrough
// now launches from the Welcome guide, so delete the system-created macro (which
// also clears its hotbar slot). No-op once done, so it's safe to run every load.
// (The Welcome macro re-homes itself: _ensureHotbarMacro now relocates any system
// macro that's pinned at the wrong slot.)
async function _retireIntroductionsMacro() {
	const intro = game.macros.find(m => m.name === _INTRO_MACRO_NAME && m.command === _INTRO_MACRO_SCRIPT);
	if (intro) await intro.delete();
}

// Bring existing NPC actors up to the "name shows on hover to anyone" token default that
// new NPCs now get at creation (StonetopActor#_preCreate). Only touches NPCs still at the
// untouched core default (displayName NONE), so a GM who deliberately set a different mode
// (hidden, always-on, owner-only) keeps it. Idempotent: once bumped, the actor no longer
// matches, so re-running every load is a cheap no-op needing no version flag. Primary-GM
// only (the caller gates it) so two connected GMs can't both write the same actors.
async function _migrateNpcTokenNameplates() {
	const NONE = CONST.TOKEN_DISPLAY_MODES.NONE;
	const HOVER = CONST.TOKEN_DISPLAY_MODES.HOVER;
	const stale = game.actors?.filter(
		a => a.type === "npc" && (a.prototypeToken?.displayName ?? NONE) === NONE
	) ?? [];
	for (const actor of stale) {
		await actor.update({ "prototypeToken.displayName": HOVER });
	}
}

// Give the NPCs already in the world the people silhouette new ones now get at creation
// (StonetopActor#_preCreate), so a neighbor with no portrait stops showing Foundry's
// mystery-man in the sidebar, on a drag preview and in chat — the steading roster was
// already drawing the placeholder, but only there. Only touches actors still wearing a
// stock Foundry default (or the placeholder under a pre-rename system id), so a portrait
// anyone chose is never overwritten. Idempotent: once stamped, the actor no longer matches,
// so re-running every load is a cheap no-op needing no version flag. Primary-GM only (the
// caller gates it) so two connected GMs can't both write the same actors.
async function _migrateNpcPlaceholderPortraits() {
	const stale = game.actors?.filter(
		a => a.type === "npc" && a.img !== PERSON_DEFAULT_IMG && isDefaultImg(a.img)
	) ?? [];
	for (const actor of stale) {
		await actor.update({ img: PERSON_DEFAULT_IMG });
	}
}

// Point a stock prototype token at the portrait its actor is already wearing, so somebody who
// gave a person a face BEFORE the token started following the portrait
// (StonetopActor#_syncPrototypeTokenImage) does not have to go and re-pick it to stop the
// mystery-man coming back the moment they drag that person onto a scene.
//
// Only a token still on a stock placeholder — Foundry's default or this system's people
// silhouette — and only where the actor has real art to offer it, so a token anyone chose (or
// Tokenizer cut) is never touched. The steading is skipped: its portrait is a picture of a place.
// Idempotent: once pointed, the actor no longer matches, so re-running every load is a cheap
// no-op needing no version flag. Primary-GM only (the caller gates it) so two connected GMs
// can't both write the same actors.
// One batched write rather than a round-trip each: unlike its two neighbours above, this matches
// every character, NPC and monster with art and a stock token, which in an established world is
// most of the actor list — and each separate update is its own socket round-trip, document diff
// and sheet/directory repaint, all of it on the blocking startup path.
async function _migrateTokenImagesToPortraits() {
	const stale = game.actors?.filter(a =>
		a.type !== "stonetop" && a.system?.customType !== "stonetop"
		&& !isDefaultImg(a.img)
		&& a.prototypeToken?.texture?.src !== undefined
		&& isDefaultImg(a.prototypeToken.texture.src)
	) ?? [];
	const updates = stale.map(a => ({ _id: a.id, "prototypeToken.texture.src": a.img }));
	if (updates.length) await Actor.updateDocuments(updates);
}

async function _migrateArmourToArmor() {
	const staleActors = game.actors.filter(
		a => a.type === "character" && a.system?.attributes?.armour !== undefined
	);
	if (!staleActors.length) return;
	for (const actor of staleActors) {
		await actor.update({ "system.attributes.-=armour": null });
	}
}

// The GM-prep page families (threats / hazards) used to store one JournalEntry per item in
// a per-steading "<Steading> Threats" / "<Steading> Hazards" Folder; they now store all of
// a family's items as pages of ONE such JournalEntry. See _consolidateGmPrepFamily.
const _GM_PREP_FAMILIES = [
	{ folderFlagId: "threatsFolderId", pageType: "threat", ensureEntry: ensureThreatsEntry },
	{ folderFlagId: "hazardsFolderId", pageType: "hazard", ensureEntry: ensureHazardsEntry },
];

// Fold each steading's old folder-of-single-page-entries into the new single journal.
// Runs on the primary GM only, so two connected GMs can't both copy the same entries;
// every load, but a cheap no-op once the old folder flag is gone, so it needs no version
// setting. Robust to a partial run: each new page is stamped with its source entry id and
// the old entry is tagged once its page exists, so a retry never duplicates pages and
// never deletes un-copied content.
async function _migrateGmPrepPagesToSingleJournal() {
	if (!game.user?.isGM || !isPrimaryGM()) return;
	const steadings = game.actors?.filter(a => a.type === "stonetop") ?? [];
	for (const steading of steadings) {
		for (const family of _GM_PREP_FAMILIES) {
			try {
				await _consolidateGmPrepFamily(steading, family);
			} catch (err) {
				console.error(`Stonetop | Could not consolidate ${family.pageType}s for "${steading.name}" into a single journal.`, err);
			}
		}
	}
}

async function _consolidateGmPrepFamily(steading, { folderFlagId, pageType, ensureEntry }) {
	const oldFolderId = (resolvedFlagProperty(steading, "steading") ?? {})[folderFlagId];
	if (!oldFolderId) return; // already migrated (or this steading never had any) — nothing to do
	const folder = game.folders?.get(oldFolderId) ?? null;

	const oldEntries = folder
		? folder.contents
			.filter(e => e.getFlag?.(STONETOP_SCOPE, pageType))
			.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
		: [];

	if (oldEntries.length) {
		const entry = await ensureEntry(steading); // mints the "<Steading> <Suffix>" journal + sets its flag
		if (!entry) return;

		// Copy each old single-page's content into the new entry as a fresh page, remembering
		// old -> new ids so placed scene pins can be re-linked. An entry already consumed by a
		// prior (interrupted) run carries the id of the page it became, so we reuse that.
		const remap = [];
		let sort = entry.pages.reduce((m, p) => Math.max(m, p.sort ?? 0), 0);
		for (const old of oldEntries) {
			const oldPage = old.pages.find(p => p.type === pageType);
			if (!oldPage) continue;
			let newPageId = old.getFlag(STONETOP_SCOPE, "consolidatedInto");
			if (!newPageId) {
				// If a prior run created the page but died before tagging its source entry,
				// the page still carries `migratedFrom`, so reuse it rather than copy twice.
				const existing = entry.pages.find(p => p.getFlag?.(STONETOP_SCOPE, "migratedFrom") === old.id);
				if (existing) {
					newPageId = existing.id;
				} else {
					sort += 100000;
					const [newPage] = await entry.createEmbeddedDocuments("JournalEntryPage", [{
						type: pageType,
						name: oldPage.name,
						sort,
						system: foundry.utils.deepClone(oldPage.system ?? {}),
						flags: { [STONETOP_SCOPE]: { migratedFrom: old.id } },
					}]);
					if (!newPage) continue;
					newPageId = newPage.id;
				}
				await old.setFlag(STONETOP_SCOPE, "consolidatedInto", newPageId);
			}
			remap.push({ oldEntryId: old.id, oldPageId: oldPage.id, newPageId });
		}

		// Re-point any scene Note pins from the old (entryId, pageId) to the new page.
		if (game.scenes) {
			for (const scene of game.scenes) {
				const updates = [];
				for (const n of scene.notes) {
					const hit = remap.find(r => r.oldEntryId === n.entryId && r.oldPageId === n.pageId);
					if (hit) updates.push({ _id: n.id, entryId: entry.id, pageId: hit.newPageId });
				}
				if (updates.length) await scene.updateEmbeddedDocuments("Note", updates).catch(() => {});
			}
		}

		// Content + pins have moved: drop the old single-page entries.
		for (const old of oldEntries) await old.delete().catch(() => {});
	}

	// Remove the now-empty folder and clear the stale folder flag so this won't run again.
	if (folder) await folder.delete().catch(() => {});
	const [key, val] = deletionEntry(`flags.${STONETOP_SCOPE}.steading.${folderFlagId}`);
	await steading.update({ [key]: val });
}

// Nudge a GM who is past the first-session Welcome guide but has never imported the book
// art: whisper the "you can import your images" card once, with a button that launches the
// Import Book Art macro. Gated so it never interrupts a fresh world — while the guide still
// auto-opens, its own "Import the book art" step is where this belongs — and never nags a GM
// who already imported: art lives OUTSIDE the world, so a GM who imported in another world
// already has it here (reapply re-points it) and skips straight to marking this resolved.
// Resolves exactly once, then the flag stops it re-checking.
async function _postBook2ArtReminderOnce() {
	if (getSetting("book2ArtReminderShown")) return;
	// Hold off until the Welcome guide has stopped auto-opening — the GM finished session
	// zero or ticked "Don't show this again". Mirrors _openGmWelcomeGuide's gate. Not flagged
	// here: a fresh world legitimately reaches this state later, so keep checking until it does.
	if (!getSetting("gmWelcomeShown") && !sessionZeroComplete()) return;

	// Past the guide, and nothing imported yet: whisper the one-time nudge to the GMs.
	if (!(await hasImportedBook2Art())) {
		if (!globalThis.ChatMessage?.create) return; // retry next load if chat isn't ready
		await ChatMessage.create({
			content: _buildBook2ArtReminderContent(),
			whisper:  ChatMessage.getWhisperRecipients("GM").map(u => u.id),
			speaker: { alias: "Stonetop" },
		});
	}
	await setSetting("book2ArtReminderShown", true);
}

function _buildBook2ArtReminderContent() {
	return stonetopChatCard(
		"Import Your Book Art",
		`<div class="stonetop-roll-card-description">
			<p>Own the Stonetop PDFs? You can rebuild the monster and location illustrations right here in your world &mdash; portraits, tokens, treasure and journal art, all filled in from your own books. Nothing is uploaded anywhere; the pictures are reconstructed locally on your machine.</p>
			<p>It's best to run this <strong>before your players join</strong>, and to <strong>close any journal you're editing</strong> first. You can re-run it any time from the <strong>Import Book Art</strong> macro in your Macro Directory.</p>
		</div>
		<div class="row stonetop-art-reminder__actions">
			<button type="button" class="stonetop-import-art-open">
				<i class="fas fa-images"></i> Import Book Art
			</button>
		</div>`,
		"stonetop-art-reminder-card");
}

// -- REBUILD DETAIL PORTRAITS FROM ART ALREADY IMPORTED --------
// Detail portraits (crops of a multi-figure illustration) arrived after the first release that
// shipped whole-illustration People art, so a GM who already imported holds every PARENT on disk
// and none of the details. Those can be cut from the parents locally — no PDF, no re-import — so
// offer it once rather than making them hunt for their books again. See book2-art/rebuild-crops.js.
//
// The once-per-world rules — including "found nothing, so do not latch, and ask again next
// load" — belong to offerDurableArtOnce; what is local here is what counts as rebuildable and
// how the offer is presented.
function _offerPeopleArtRebuildOnce() {
	return offerDurableArtOnce({
		setting: "peopleArtRebuildOffered",
		findWork: async () => {
			// Both kinds of cuttable art: the detail portraits, and the square faces the small
			// surfaces use. One offer covers both — they are the same work from the GM's side
			// (cut from pictures already on disk) and asking twice would just be nagging.
			// Counted through run-rebuild.js, the same façade the three run paths use.
			const { countPeopleArtRebuilds } = await import("../book2-art/run-rebuild.js");
			return await countPeopleArtRebuilds() || null;
		},
		offer: async count => {
			if (!globalThis.ChatMessage?.create) return false; // chat isn't ready — retry next load
			await ChatMessage.create({
				content: _buildPeopleArtRebuildContent(count),
				whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id),
				speaker: { alias: "Stonetop" },
			});
		},
	});
}

function _buildPeopleArtRebuildContent(count) {
	return stonetopChatCard(
		"Rebuild Portraits",
		`<div class="stonetop-roll-card-description">
			<p>The <strong>People of Stonetop</strong> gallery now offers individual portraits cut from the
			group illustrations &mdash; one face per person, instead of a whole crowd scene &mdash; and a
			square close-up of each face, for the small round portraits on the character and steading sheets.
			You already have the source pictures, so <strong>${count}</strong> of these can be made right here
			from the art you imported before.
			<strong>You do not need your PDFs, and you do not need to re-import.</strong></p>
			<p>They are cut from pictures already on your disk, so they come out a little smaller than a fresh
			import would give. If you would rather have them at full size, re-run the
			<strong>Import Book Art</strong> macro instead &mdash; either way, nothing already on disk is deleted.</p>
		</div>
		<div class="row stonetop-art-reminder__actions">
			<button type="button" class="stonetop-rebuild-crops-run">
				<i class="fas fa-crop-simple"></i> Rebuild ${count} portraits
			</button>
		</div>`,
		"stonetop-art-reminder-card");
}

async function _postStartupWelcomeMessageOnce() {
	if (getSetting("startupWelcomeShown")) return;
	if (!globalThis.ChatMessage?.create) return;
	await ChatMessage.create({
		content: _buildStartupWelcomeContent(),
		speaker: { alias: "Stonetop" },
	});
	await setSetting("startupWelcomeShown", true);
}

function _buildStartupWelcomeContent() {
	return `<section class="pbta-chat-card stonetop-roll-card stonetop-startup-card">
		<div class="cell cell--chat">
			<div class="chat-title row flexrow">
				<h2 class="cell__title">Welcome to <span class="stonetop-startup-card__title-logo">Stonetop</span></h2>
				<div class="cell__subtitle">Fresh-start helper</div>
			</div>
			<div class="stonetop-roll-card-description">
				<p>This is an unofficial Foundry VTT system for <strong>Stonetop</strong>, by Jeremy Strandberg, illustrated by Lucie Arnoux, with layout, editing, and co-design by Jason Lutes.</p>
			</div>
			<div class="card-content stonetop-startup-card__content">
				<div class="row stonetop-startup-card__section">
					<h3 class="cell__subtitle">For Players</h3>
					<ul>
						<li>Guided, resumable character creation from the playbook picker.</li>
						<li>Automated move rolls with modifiers, advantage or disadvantage, and auto hit tiers.</li>
						<li>A step-by-step level-up wizard with inline stat, move, and trait choosers.</li>
						<li>Interactive Clash and Let Fly, resolved from the chat card.</li>
						<li>Armor and load tracked automatically from your equipped gear.</li>
						<li>Followers and the Seeker's arcana on tidy, trackable cards.</li>
					</ul>
				</div>
				<div class="row stonetop-startup-card__section">
					<h3 class="cell__subtitle">For Game Masters</h3>
					<ul>
						<li>A first-session Welcome guide and a Let Spring Burst Forth walkthrough.</li>
						<li>A steading sheet with seasonal automation, improvements, and disasters.</li>
						<li>A Threats tab of book-faithful cards you can pin to a scene.</li>
						<li>Love Letters: personal, one-time moves you hand to a single character.</li>
						<li>Character Introductions that compile into "The Chronicle" world journal.</li>
						<li>An End of Session macro that awards XP to the whole table at once.</li>
					</ul>
				</div>
				<div class="row stonetop-startup-card__section">
					<h3 class="cell__subtitle">Bundled Content</h3>
					<ul>
						<li>The full Book I and II bestiary, around 180 creatures, hidden from players until you reveal it.</li>
						<li>A cross-linked Locations and Lore journal covering the wider world.</li>
						<li>The complete deck of major and minor arcana.</li>
					</ul>
				</div>
				<div class="row stonetop-startup-card__section">
					<h3 class="cell__subtitle">Useful Settings</h3>
					<ul>
						<li><span><strong>Sheet Font &amp; Size</strong>: choose the typeface and scale the text on Stonetop sheets.</span></li>
						<li><span><strong>On Hover Info</strong>: turn all hover info on/off, or tune Stats, Basic Moves, Playbook Moves, Traits, and Gear Tags individually.</span></li>
						<li><span><strong>Shift Up/Down Buttons on Roll Cards</strong>: turn this on to add GM-only buttons that bump a roll's result up or down a tier from the chat card, no re-roll needed.</span></li>
					</ul>
				</div>
				<div class="row stonetop-startup-card__section">
					<h3 class="cell__subtitle">Recommended Add-on</h3>
					<ul>
						<li><span>Install <strong><a href="https://foundryvtt.com/packages/dice-so-nice">Dice So Nice!</a></strong> for 3D dice on the tabletop. Every move, damage, and steading roll uses Foundry's dice, so it adds a little immersion to your rolls.</span></li>
					</ul>
				</div>
			</div>
			<div class="row stonetop-startup-card__actions">
				<button type="button" class="stonetop-startup-open-welcome">
					<i class="fas fa-feather"></i> Open the First-Session Guide
				</button>
			</div>
			<div class="row row--border stonetop-startup-card__footer">
				Open <strong>Configure Settings</strong> and filter for <strong>Stonetop</strong> to adjust these options.
			</div>
		</div>
	</section>`;
}
