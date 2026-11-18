// `game.stonetop`: the entry points macros, chat-card buttons, settings onChange handlers and the
// console reach this system through. Wired by onReady (hooks/Ready.js) once the sheet partials are
// registered, and before anything later in the ready sequence can call one.

import { MACRO_MODULES } from "../book2-art/macro-modules.js";
import { runImportBookArtMacro } from "../book2-art/macro.js";
import { reapplyBook2Art } from "../book2-art/reapply.js";
import { clearArtBrowseCache } from "../book2-art/browse.js";
import { rulebookMacroApi } from "../books/rulebook-api.js";
import { EndOfSessionDialog } from "../dialogs/EndOfSessionDialog.js";
import { IntroductionsDialog } from "../dialogs/IntroductionsDialog.js";
import { SpringBurstDialog } from "../dialogs/SpringBurstDialog.js";
import { ExpeditionDialog } from "../dialogs/ExpeditionDialog.js";
import { WeatherDialog } from "../dialogs/WeatherDialog.js";
import { WelcomeDialog } from "../dialogs/WelcomeDialog.js";
import { FoundryBasicsDialog } from "../dialogs/FoundryBasicsDialog.js";
import { LoveLetterDialog } from "../dialogs/LoveLetterDialog.js";
import { StonetopBrowserDialog } from "../dialogs/StonetopBrowserDialog.js";
import { openRelationshipMap } from "../dialogs/RelationshipMapWindow.js";
import { openTimelineWindow } from "../dialogs/TimelineWindow.js";
import { CharacterCreationDialog } from "../actors/character/dialogs/CharacterCreationDialog.js";
import { resolvedFlags } from "../actors/character/StonetopFlags.js";
import { createArcanumItem } from "../item/createArcanum.js";
import { StonetopArcanaInspireDialog } from "../item/StonetopArcanaInspireDialog.js";
import { canCreateRelationshipMap, listRelationshipMaps } from "../relmap/relmap-doc.js";
import { promptForNewRelationshipMap } from "../relmap/relmap-make.js";
import { defaultBoard } from "../relmap/relmap-last.js";
import { refreshWeatherFx } from "../seasons/current-weather.js";
import { nextSeasonStamp, readCurrentSeason, readCurrentYear } from "../seasons/current-season.js";
import { refuseHiddenFeature } from "../settings.js";
import { writeChronicle } from "../utils/chronicle.js";
import { rollDieOfFate } from "../utils/die-of-fate.js";
import { openProgressNotification } from "../utils/progress-notification.js";
import { getStonetopSteadingActorOrWarn } from "../utils/world.js";
import { rollMoveFromUuid } from "./HotbarDrop.js";

export function registerStonetopApi() {
	game.stonetop ??= {};
	// The modules the Import Book Art macro borrows, so a bundled release hands it this system's own
	// instances rather than second copies. See book2-art/macro-modules.js.
	game.stonetop.macroModules = MACRO_MODULES;
	game.stonetop.openEndOfSession  = () => new EndOfSessionDialog().render(true);
	game.stonetop.openIntroductions = () => IntroductionsDialog.open();
	// Cursor onChange dispatcher (registered on the introCursor world setting): opens/
	// focuses/closes the Introductions dialog on the active player's client as the GM
	// drives the round-robin. See dialogs/IntroductionsDialog.js.
	game.stonetop.onIntroCursor     = cursor => IntroductionsDialog.handleIntroCursor(cursor);
	// Order onChange dispatcher (the introductionsOrder world setting): redraws an open
	// pre-check on every client when a GM randomizes or moves someone.
	game.stonetop.onIntroductionsOrder = () => IntroductionsDialog.onOrderChanged();
	game.stonetop.openSpringBurst   = () => SpringBurstDialog.open();
	// Run the steading's Seasons Change homefront move from the hotbar: launch the
	// season-picker → roll flow (the same one the sheet's Seasons Change move uses)
	// WITHOUT opening the steading sheet — the dialog carries a "Stonetop" header
	// button to jump to the sheet if wanted. Warns if there's no steading yet.
	game.stonetop.openSeasonsChange = () => {
		getStonetopSteadingActorOrWarn()?.sheet._onSeasonsChange();
	};
	// The same move with the picker skipped: straight to the season after the one the clock is in
	// (Winter turns over into Spring of the next year). The top-of-screen bar's "Next Season"
	// button (seasons/time-banner.js). Warns if there's no steading yet. GM-only, like the bar's
	// button: the move it runs writes the steading's clock, gains and Fortunes.
	game.stonetop.openNextSeason = () => {
		if (!game.user?.isGM) return;
		const steading = getStonetopSteadingActorOrWarn();
		if (!steading) return;
		const next = nextSeasonStamp(readCurrentSeason(steading), readCurrentYear(steading));
		steading.sheet._showSeasonDialog(next.season, next.year);
	};
	// Compile the recorded Introductions + Spring Burst answers into the shared
	// "Chronicle" journal and open it (GM-only). Callable from the Introductions
	// dialog's "Let spring break forth!" finish, the Expedition dialog, a macro, or
	// the console.
	game.stonetop.saveChronicle     = () => writeChronicle().then(j => j?.sheet?.render(true));
	game.stonetop.openExpedition    = () => ExpeditionDialog.open();
	game.stonetop.onExpeditionLog   = (value, userId) => ExpeditionDialog.onLogChanged(value, userId);
	// GM-only, here and again in WeatherDialog.open for any caller that reaches the class itself.
	game.stonetop.openWeather       = () => (game.user?.isGM ? WeatherDialog.open() : null);
	// Put the canvas weather back in step with the weather-effect settings. Registered here
	// because settings.js reaches this way rather than importing the seasons module, which reads
	// settings.js itself; its onChange handlers call this whenever one of those switches moves.
	game.stonetop.refreshWeatherFx  = () => refreshWeatherFx();
	game.stonetop.openWelcome       = () => WelcomeDialog.open();
	game.stonetop.openFoundryBasics = () => FoundryBasicsDialog.open();
	// Preview/test the player-facing creation intro for any character on demand
	// (it normally only auto-pops on the owning player's client). Pass an actor, or
	// it falls back to the current user's assigned character:
	//   game.stonetop.openCharacterCreation()
	game.stonetop.openCharacterCreation = (actor = game.user.character) =>
		actor ? CharacterCreationDialog.open(actor)
		      : ui.notifications.warn("No character to start creation for.");
	// Cut every picture this world could have out of the book art already on disk — the detail
	// portraits, the square faces the small round pictures use, and the square a creature's token
	// stands on — then point NPCs and creatures already in play at them. GM-only (it writes files).
	//
	// The same work the one-time chat card offers, reachable on demand because that card latches
	// the moment it is posted: scrolled past, deleted, or landed on the other GM and it is gone
	// for good. Safe to run any number of times — every stage re-plans from what is on disk.
	game.stonetop.rebuildPortraits = async () => {
		if (!game.user.isGM) return ui.notifications.warn("Only a GM can rebuild book art.");
		const { runBookArtRebuild, countBookArtRebuilds, describeRebuild } =
			await import("../book2-art/run-rebuild.js");
		const todo = await countBookArtRebuilds();
		if (!todo) return ui.notifications.info("Every picture this world can build is already on disk.");
		// The other two entry points are buttons, which count down in their own label. This one
		// has no button, and a toast that fades after five seconds while a 140-image job runs on
		// is the exact thing the notification bar exists for. No delay: the caller just asked.
		const bar = openProgressNotification(
			`Stonetop: rebuilding ${todo} picture${todo === 1 ? "" : "s"}`, { delayMs: 0 });
		let res;
		try {
			res = await runBookArtRebuild({
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
	// Look THROUGH what the world holds, with a tab per list: every arcanum (the shipped
	// compendium plus any homebrew cards, filtered by what each one does and by how badly its
	// Consequences track punishes whoever carries it), every monster stat block, and every NPC.
	// GM prep: both compendia are GM-hidden, half the point of the arcana list is reading the
	// curses on cards the players haven't found, and an NPC's status and home are the GM's own
	// notes — so its macro is seeded by the GM-only macro pass (hooks/system-macros.js) and there is no button for
	// it on a character sheet. Pass a source to land on a particular tab:
	//   game.stonetop.openBrowser("people")
	//
	// `ownedSlugs` only badges arcana rows as "Held". Read off the caller's assigned character
	// when they have one (a GM usually doesn't), so the badges are right without the browser
	// having to be opened from a sheet.
	game.stonetop.openBrowser = (source, actor = game.user.character) =>
		StonetopBrowserDialog.open({ source, ownedSlugs: actor ? resolvedFlags(actor).arcana?.owned ?? [] : [] });
	// The two windows "Browse Stonetop" replaced, kept as the tab they used to open. Console
	// and macro habits outlive a merge, and both are one line.
	game.stonetop.openArcanaBrowser   = (actor)  => game.stonetop.openBrowser("arcana", actor);
	game.stonetop.openBestiaryBrowser = (source) => game.stonetop.openBrowser(source ?? "monsters");
	// Who at this table knows whom. OUTSIDE any GM gate: every player owns these maps and edits
	// them, which is the whole shape of the feature. With no argument it opens the only map, or
	// asks which one; pass a name or an id to go straight there.
	//   game.stonetop.openRelationshipMap("The people of Stonetop")
	game.stonetop.openRelationshipMap = (which) => _openRelationshipMap(which);
	// The whole campaign on one timeline: Stonetop's thread and every character's, side by side
	// under one column of seasons. OUTSIDE any GM gate, on the same reading as the map above it --
	// the record is the table's, not the GM's.
	//
	// NO HOTBAR MACRO GOES WITH THIS, and that is a decision rather than an omission: slots 1-10
	// were all spoken for when it shipped (an older world's still are), and the timeline already has two doors that the macros do not (a tab on
	// the steading sheet and one on every character sheet, each with a button through to here).
	// This entry is what lets a GM who wants it on the bar make their own.
	game.stonetop.openTimeline = () => openTimelineWindow();
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
	// What that macro asks about the books it has been handed: may this world keep a copy of one
	// for reading, has it got one already, and here is the file. The macro is a self-contained
	// string in a compendium and imports nothing of ours, so this is the only way it can reach
	// the reader (books/rulebook-api.js says why at length). A GM who supplies Book I to have its
	// illustrations cut out of it should not then be asked for Book I a second time to be able to
	// READ it, which is what the two features did to them before this existed.
	game.stonetop.rulebooks         = rulebookMacroApi();
}

/**
 * Open a relationship map by name or id, or the one this reader was last on.
 *
 * IT NEVER ASKS WHICH. A world with several maps used to get a picker here, on the grounds that the
 * macro would otherwise be wrong most of the time. It is not: a table lives on one board, opens it
 * all session, and picked the same row out of that list every time. So the macro goes where this
 * client last was, and `relmap/relmap-last.js` holds the whole rule (and the two fallbacks, for a
 * client that has never opened one). The sidebar and the map's own page strip are how you get to a
 * different map.
 *
 * With no maps at all, a GM (or anyone with the journal-create right) is asked what a new map is to
 * be called and given it, and everybody else is told who can.
 *
 * ⚠ IT ASKS FOR THE NAME, and did not used to. Every world is given a map called "Stonetop" during
 * setup (relmap/relmap-make.js), so a world with none is one whose GM deleted that map -- and
 * minting a second "Stonetop" unasked is undoing a decision rather than saving anybody a keystroke.
 * The same question the steading sheet's empty Relationship Map tab asks, through the same call.
 *
 * Nothing while the GM has the map switched off, and above all no new map: `openRelationshipMap`
 * would refuse the board, but only after the name had been asked and the map made.
 */
async function _openRelationshipMap(which) {
	if (refuseHiddenFeature("relationshipMap")) return null;
	const maps = listRelationshipMaps();
	if (which) {
		const wanted = maps.find(m => m.id === which || m.name === which);
		if (wanted) return openRelationshipMap(wanted);
	}
	const landing = defaultBoard(maps);
	if (landing) {
		return openRelationshipMap(landing.entry, landing.pageId ? { pageId: landing.pageId } : {});
	}
	if (!canCreateRelationshipMap()) {
		ui.notifications?.info?.(game.i18n.localize("stonetop.relmap.maps.cannotCreate"));
		return null;
	}
	const made = await promptForNewRelationshipMap();
	return made ? openRelationshipMap(made) : null;
}
