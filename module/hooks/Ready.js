import { runStartupMigrations } from "./PbtaSheetConfig.js";
import { ensureStonetopSingleton, remindDestinedOmenRoll } from "./StonetopSingleton.js";
import { seedCompendiumJournalsOnce, restampSeededJournalSources, updateSeededJournalsOnVersionChange, syncSeededFolderColors } from "./SeedCompendiums.js";
import { reapplyBook2ArtOnVersionChange, reapplyBook2Art, hasImportedBook2Art } from "../book2-art/reapply.js";
import { BOOK2_ART_MACRO_NAME, findBook2ArtWorldMacro, loadBook2ArtMacroSource, runImportBookArtMacro } from "../book2-art/macro.js";
import { stonetopChatCard } from "../utils/chat.js";
import { applySheetFont, applySheetFontScale, applyEditPencilRevealDelay, applyHideRollableIcon, applyReduceMotion, getSetting, setSetting } from "../settings.js";
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

const _EOS_MACRO_NAME   = "End of Session";
const _EOS_MACRO_IMG    = "systems/stonetop_pwd/assets/icons/macros/truce.svg";
const _EOS_MACRO_SCRIPT = "game.stonetop?.openEndOfSession?.()";
const _EOS_HOTBAR_SLOT  = 10;

// The Chronicle hotbar macro (slot 9): compiles the recorded Introductions + Spring
// Burst answers and expedition log into the shared "The Chronicle" journal and opens it
// (GM-only — saveChronicle is seed-once, so re-running it preserves inline edits). Sits
// just before End of Session and, like it, is handled separately from the slots-1–5
// _SYSTEM_MACROS set and keyed on its command so it won't collide with a user macro of
// the same name.
const _CHRONICLE_MACRO_NAME   = "The Chronicle";
const _CHRONICLE_MACRO_IMG    = "systems/stonetop_pwd/assets/icons/macros/bookmarklet.svg";
const _CHRONICLE_MACRO_SCRIPT = "game.stonetop?.saveChronicle?.()";
const _CHRONICLE_HOTBAR_SLOT  = 9;

// The "(TEST ONLY) Populate World" dev macro, added to the Macro Directory but never
// the hotbar. Its body is the create-test-characters dev script — that gitignored file
// is the single source of truth, fetched at runtime (see _ensureTestPopulateMacro), so
// builds that omit it simply skip seeding the macro.
const _TEST_MACRO_NAME   = "(TEST ONLY) Populate World";
const _TEST_MACRO_SRC    = "systems/stonetop_pwd/scripts/local/create-test-characters.js";
const _TEST_MACRO_IMG    = "systems/stonetop_pwd/assets/icons/macros/hazard-sign.svg";
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
	{ name: "Welcome to Stonetop", img: "systems/stonetop_pwd/assets/icons/macros/direction-signs.svg", command: "game.stonetop?.openWelcome?.()",        slot: 1 },
	{ name: "Seasons Change",      img: "systems/stonetop_pwd/assets/icons/macros/spring.svg",           command: "game.stonetop?.openSeasonsChange?.()", slot: 2 },
	{ name: "Run an Expedition",   img: "systems/stonetop_pwd/assets/icons/macros/treasure-map.svg",     command: "game.stonetop?.openExpedition?.()",     slot: 3 },
	{ name: "Weather",             img: "systems/stonetop_pwd/assets/icons/macros/sun-cloud.svg",        command: "game.stonetop?.openWeather?.()",        slot: 4 },
	{ name: "Write a Love Letter", img: "systems/stonetop_pwd/assets/icons/macros/love-letter.svg",      command: "game.stonetop?.openLoveLetter?.()",     slot: 5 },
	{ name: "Die of Fate",         img: "systems/stonetop_pwd/assets/icons/macros/die-of-fate.svg",      command: "game.stonetop?.rollDieOfFate?.()",      slot: 6 },
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
	await _migrateArmourToArmor();
	await _migrateGmPrepPagesToSingleJournal();
	await runStartupMigrations();
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
	game.stonetop.reapplyBook2Art   = (opts = {}) => reapplyBook2Art(opts);
	// Launch the interactive bring-your-own-book "Import Book Art" extractor macro (NOT the
	// silent re-point pass above). The entry point the post-startup art-reminder chat button
	// and the Welcome guide's "Import Book Art" button both call. Callable from the console:
	//   game.stonetop.importBookArt()
	game.stonetop.importBookArt     = () => runImportBookArtMacro();

	_registerCharacterAutoOpen();

	if (game.user.isGM) await _applyCoreSettingDefaultsForNewWorld();
	if (game.user.isGM) await _assignSteadingToUnassignedGm();

	// Seeding the gazetteer into a brand-new world imports ~160 journal entries — a
	// visible pause. On an established world the seed is a no-op that returns instantly,
	// so await it inline as before. On a fresh world, kick it off in the BACKGROUND so it
	// doesn't hold up the ready sequence (and, crucially, the Welcome guide): we pop the
	// guide right away and surface the seeded orientation material once the import lands
	// (see the `wasFreshWorld` handling further down).
	const wasFreshWorld = game.user.isGM && !getSetting("seedingComplete");
	let seeding = Promise.resolve();
	if (wasFreshWorld) {
		// Re-apply Book II art (only if its durable folder is already populated, e.g. a
		// GM who ran the import in another world) BEFORE the seed, so a brand-new world
		// imports art-bearing journals; then seed, then the journal version sync.
		seeding = reapplyBook2ArtOnVersionChange()
			.catch((err) => console.error("Stonetop | Book II art re-apply failed:", err))
			.then(() => seedCompendiumJournalsOnce())
			.then(() => restampSeededJournalSources())
			.then(() => updateSeededJournalsOnVersionChange())
			.then(() => syncSeededFolderColors());
	} else if (game.user.isGM) {
		// Re-apply Book II art BEFORE the journal sync so freshly re-applied compendium
		// art propagates into pristine (un-edited) world journal copies for free
		// (updateSeededJournalsOnVersionChange reads the live compendium). See
		// book2-art/reapply.js.
		try { await reapplyBook2ArtOnVersionChange(); }
		catch (err) { console.error("Stonetop | Book II art re-apply failed:", err); }
		await seedCompendiumJournalsOnce();
		await restampSeededJournalSources();
		await updateSeededJournalsOnVersionChange();
		await syncSeededFolderColors();
		// Every-load self-heal: add any durable Book II art still MISSING from world
		// journals (e.g. art that only landed on disk after a journal was imported, or a
		// journal imported before the durable folder existed). Cheap — it reads a world
		// entry's own pages first and only touches the compendium for a row whose art is
		// actually absent, so it does no compendium reads once everything is applied.
		try { await reapplyBook2Art({ worldOnly: true, cheapWorldSkip: true }); }
		catch (err) { console.error("Stonetop | Book II art self-heal failed:", err); }
	}
	if (game.user.isGM) {
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

	// Best-effort and independent: a failure in one default must not skip the other,
	// and neither should strand the flag (which would re-run both every load). Each
	// logs and moves on, then we record that this world's defaults have been applied.
	await _defaultAllowPlayerActorCreation();
	await _defaultDisableAutomaticTokenRotation();

	await setSetting("coreSettingDefaultsApplied", true);
}

// Give a GM who has no assigned character the shared steading as their default character,
// once. Foundry's `User#character` only references an actor id (it needn't be a
// `character`-type actor), so the "Stonetop" steading rides in the GM's player-list entry
// and their "toggle character sheet" hotkey opens it in a click. Client-scoped and gated
// on a once-flag so it mirrors the per-user assignment:
//   • a GM who already runs their own PC (or previously accepted the steading) is left
//     untouched — we record the flag and never re-check; and
//   • a GM who later clears the assignment stays cleared — we never re-assign.
// If no steading exists yet (e.g. a secondary GM logging in before the primary GM minted
// it), we return WITHOUT setting the flag so the next load tries again. GM-only caller.
async function _assignSteadingToUnassignedGm() {
	if (getSetting("gmSteadingAssigned")) return;

	// Already has a character (their own PC, or the steading from a prior run): respect it
	// and stop checking.
	if (game.user.character) {
		await setSetting("gmSteadingAssigned", true);
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
	await setSetting("gmSteadingAssigned", true);
}

// Let players create their own characters from Foundry's "Create Actor" dialog by
// default. Core ships the ACTOR_CREATE permission as Assistant-GM-and-up only, so
// without this a player never even sees the sidebar's "Create Actor" button. We add
// the Player and Trusted Player roles once, on a fresh world, so the GM keeps full
// control afterward: revoking it under Configure Permissions sticks, because this
// never runs again. ACTOR_CREATE isn't per-type, so this also lets players create
// other actor types — the steading singleton and monster-builder preCreateActor
// hooks (StonetopSingleton.js) already guard those paths.
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
	const mintedForMe  = actor.getFlag?.("stonetop_pwd", "autoOpenFor") === game.user.id;
	const isMyAssigned = !game.user.isGM && game.user.character?.id === actor.id;
	if (!mintedForMe && !isMyAssigned) return;
	// Owner-only flag; drop it first so the mint greeting only ever fires once.
	if (mintedForMe) actor.unsetFlag("stonetop_pwd", "autoOpenFor").catch(() => {});

	if (playbookSlug(actor)) {
		// Finished — never re-enter creation. Clear any progress flag / resume
		// snapshot a mid-creation "Save & close" (or an edit pass) left behind, so the
		// GM roster reads "Finished" rather than a stale "exited"/page note.
		actor.unsetFlag?.("stonetop_pwd", "onboardingProgress").catch(() => {});
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
	if (!needsOrientation && getSetting("settingOverviewShown")) return;

	overview.sheet.render(true);
	if (!getSetting("settingOverviewShown")) await setSetting("settingOverviewShown", true);
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
// Its body is the
// create-test-characters dev script, fetched so that gitignored file stays the single
// source of truth: a missing file (a build that omits scripts/) skips silently, leaving
// real worlds untouched. Seeded once — a GM who deletes it keeps it gone — but while it
// exists its command is re-synced so edits to the script propagate. GM-only.
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

	await Macro.create({ name: _TEST_MACRO_NAME, type: "script", img: _TEST_MACRO_IMG, command, scope: "global", folder: folder?.id ?? null });
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

// Fold each steading's old folder-of-single-page-entries into the new single journal
// (GM-only). Runs every load but is a cheap no-op once the old folder flag is gone, so it
// needs no version setting. Robust to a partial run: an old entry is tagged the moment its
// page is copied, so a retry never duplicates pages and never deletes un-copied content.
async function _migrateGmPrepPagesToSingleJournal() {
	if (!game.user?.isGM) return;
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
				sort += 100000;
				const [newPage] = await entry.createEmbeddedDocuments("JournalEntryPage", [{
					type: pageType,
					name: oldPage.name,
					sort,
					system: foundry.utils.deepClone(oldPage.system ?? {}),
				}]);
				if (!newPage) continue;
				newPageId = newPage.id;
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
