// The primary GM's world sweeps at `ready`: the repairs, refreshes and backfills that bring a
// world's documents up to what this release writes. Run by onReady (hooks/Ready.js) before
// anything renders a sheet, one after another, each one caught so a failure costs only itself.
//
// SEQUENTIAL ON PURPOSE. Several read what an earlier one wrote (the move refresh feeds the
// replacing-move stamp and the grant repair; the landmark reveal feeds the link and the refit),
// and every `oncePerVersion` sweep
// stamps the same `repairSweepVersions` setting by read-modify-write, so two of them in flight
// at once would drop one stamp. Do not hand this list to Promise.all.

import { isPrimaryGM } from "../utils/primary-gm.js";
import { bestEffort } from "../utils/best-effort.js";
import { deletionEntry } from "../utils/foundry-compat.js";
import { isDefaultImg } from "../utils/strings.js";
import { updatePlacedTokens } from "../utils/placed-tokens.js";
import { PERSON_DEFAULT_IMG } from "../utils/person-portrait.js";
import { getStonetopSteadingActor } from "../utils/world.js";
import { isFightTabEnabled, getArraySetting, setSetting } from "../settings.js";
import { STONETOP_SCOPE, ITEM_FLAG_SCOPE, resolvedFlagProperty } from "../actors/character/StonetopFlags.js";
import { migrateAllSteadingPeople, ensurePeopleFolders, backfillAllResidentHomes } from "../actors/steading/steading-people.js";
import { NEW_SHOOT_MARKER, LEGACY_SHOOT_MARKERS } from "../data/follower-actor.js";
import { isArcanumData, newArcanumSlug } from "../item/createArcanum.js";
import { CharacterTokenLinkDialog } from "../dialogs/CharacterTokenLinkDialog.js";
import { ensureRelationshipMapFolder } from "../relmap/relmap-doc.js";
import { ensureThreatsEntry } from "../threats/threat-store.js";
import { ensureHazardsEntry } from "../hazards/hazard-store.js";
import { fileGmPrepJournalsInChronicle } from "../journal/gm-prep-page.js";
import { reconcileSitePins } from "../sites/site-scene-pins.js";
import { markPosterMapScenes } from "../book2-art/poster-maps.js";
import { linkLandmarkNotes, refitLandmarkNotes, revealLandmarkNotesOnce } from "./PlaceOfInterestDrop.js";
import { refitGmPrepPins } from "./ThreatNotePins.js";
import { repairAllChronicleFlagScopes } from "../migration/chronicle-flag-scope.js";
import { oncePerVersion, forgetSweep } from "../migration/once-per-version.js";
import { repairCharacterTokenLinks, applyLinkChoices } from "../migration/link-character-tokens.js";
import { renameAllSeasonYearPages } from "../migration/season-year-page-names.js";
import { clearAllBlankDangers } from "../migration/blank-dangers.js";
import { grandfatherWeaponsOfWar } from "../migration/weapons-of-war-grandfather.js";
import { grandfatherRetiredMoves } from "../migration/retired-move-grandfather.js";
import { grandfatherWouldBeHeroes } from "../migration/would-be-hero-grandfather.js";
import { grandfatherCreationFinished, CREATION_FINISHED_SWEEP } from "../migration/creation-finished-grandfather.js";
import { repairAllPossessionGrants } from "../migration/possession-grant-repair.js";
import { repairMasteredArcanumCircles } from "../migration/mastered-arcanum-circles.js";
import { settleAllArcanumBoxLayouts } from "../migration/tulpa-move-boxes.js";
import { refreshHeldMoves } from "../migration/move-refresh.js";
import { refreshSteadingImprovements } from "../migration/improvement-refresh.js";
import { refreshSeededMonsters } from "../migration/bestiary-refresh.js";
import { refreshCatalogFollowers } from "../migration/follower-refresh.js";

/**
 * Every world sweep, in order. PRIMARY GM ONLY: they all write shared world documents, which two
 * connected GMs would race and a player has no right to touch. Paired with isGM because
 * isPrimaryGM() alone is true when NO GM is connected, which would hand the whole list to a lone
 * player, who would fail every write and be shown the GM's token-link question.
 */
export async function runPrimaryGmSweeps() {
	if (!game.user?.isGM || !isPrimaryGM()) return;

	await bestEffort("armour → armor migration", _migrateArmourToArmor);
	// Take retired sheet-preference flags off any actor still carrying one (see
	// _RETIRED_ACTOR_FLAGS). A no-op in a clean world.
	await bestEffort("retired actor-flag sweep", _dropRetiredActorFlags);
	// Untick Group fight on sidebar monsters while the Fight tab is on, which picks a group's scale
	// token by token — and put the ticks back when the tab goes off again
	// (see _reconcileWorldGroupFights).
	await bestEffort("world Group fight reconcile", _reconcileWorldGroupFights);
	await bestEffort("GM-prep single-journal consolidation", _migrateGmPrepPagesToSingleJournal);
	// Un-duplicate any chronicle journal a build with the misfiled flag key re-seeded. Swept
	// every load rather than latched: it is idempotent by construction (nothing is left for
	// it to match once it has run), so there is no gate that can get stuck. See
	// migration/chronicle-flag-scope.js.
	await bestEffort("chronicle flag-scope repair", repairAllChronicleFlagScopes);
	// Move a world's loose Threats / Hazards / Sites journals into The Chronicle, where new
	// ones are minted now. Swept every load rather than latched, for the same reason as the
	// pass above: it matches only what is still unfiled, so once a world is tidy there is
	// nothing left for it to find. It leaves a journal the GM has filed themselves alone.
	await bestEffort("GM-prep journal filing", fileGmPrepJournalsInChronicle);
	// Give a slug to any arcanum card built before StonetopItem#_preCreate stamped them.
	// Idempotent, but GATED anyway (migration/once-per-version.js): idempotent buys the second
	// run being safe, not the whole Items sidebar being filtered on every load of every session
	// to find the nothing that is left. `_preCreate` is what keeps a slugless card from being
	// made at all now, so this is legacy repair and has a last world to run in.
	await bestEffort("arcanum slug sweep", () => oncePerVersion("arcanumSlugs", _stampMissingArcanumSlugs));
	// Bring the moves, treasures and gear characters already hold (and the Items sidebar's) up to
	// the pack: fill what it has gained, and correct a value it has since changed or dropped where
	// the copy still holds exactly what an older release shipped (migration/move-refresh.js). Per
	// VERSION, and what lets every rule read the held copy with no fallback to the pack of its own.
	// FIRST of the move sweeps: the replacing-move stamp below reads `replaces` and the grant
	// repair reads `grantsPossession` off the held copy. The grandfathers after it still see each
	// copy's original release, which the refresh keeps aside (made-under.js) before it writes.
	await bestEffort("refreshing held moves", () => oncePerVersion("moveRefresh", refreshHeldMoves));
	// The same for the Book II improvement cards a steading holds (migration/improvement-refresh.js):
	// a dropped card is a copy, brought up to the shipped card while it is still one a release
	// shipped. The GM is whispered which, and which were already built.
	await bestEffort("refreshing steading improvement cards", () => oncePerVersion("improvementRefresh", refreshSteadingImprovements));
	// And the monsters seeded into the Actors sidebar (migration/bestiary-refresh.js), which Deploy
	// and the monster browser prefer to the pack: a stat-block field or a move still holding what
	// an older pack shipped is brought up to the pack; a GM's own edit is left.
	await bestEffort("refreshing seeded monsters", () => oncePerVersion("bestiaryRefresh", refreshSeededMonsters));
	// And the follower cards made from the system's own lists (migration/follower-refresh.js): the
	// good dog's herder default and two summons' notes, wherever a card still holds the old value.
	await bestEffort("refreshing catalog followers", () => oncePerVersion("followerRefresh", refreshCatalogFollowers));
	// Keep a crossbow a character already carries on the sheet now that Weapons of War grants only
	// the five weapons it names (migration/weapons-of-war-grandfather.js). GATED: it reads the
	// outfit catalog and then every character's inventory flags, and it is legacy repair — the
	// narrowed grant is what ships, so a world swept once has nothing left to find.
	await bestEffort("Weapons of War grandfathering", () => oncePerVersion("weaponsOfWarGrandfather", grandfatherWeaponsOfWar));
	// Stamp the replacing moves taken before anything recorded the move they retired, so the
	// original's absence still reads as met (migration/retired-move-grandfather.js). GATED: legacy
	// repair, and it only ever reaches copies made under a release that never stamped.
	await bestEffort("replacing-move grandfathering", () => oncePerVersion("retiredMoveGrandfather", grandfatherRetiredMoves));
	// Keep "The Hero" for a Would-Be Hero who was one by OWNING a starred move, before crossing off
	// waited for its first use (migration/would-be-hero-grandfather.js). GATED: legacy repair, and it
	// only ever reaches moves made under a release that crossed off on ownership.
	await bestEffort("Would-Be Hero grandfathering", () => oncePerVersion("wouldBeHeroGrandfather", grandfatherWouldBeHeroes));
	// Stamp the characters made before `creationFinished` existed as finished, so a stale progress
	// flag does not read as half built (migration/creation-finished-grandfather.js). Once per WORLD:
	// the work itself skips any world that has a stamp for it.
	await bestEffort("creation-finished grandfathering", () => oncePerVersion(CREATION_FINISHED_SWEEP, grandfatherCreationFinished));
	// Bring special-possession gear made before its grant was corrected up to the grant (the
	// Tannery cuirass made as a stacking modifier; see migration/possession-grant-repair.js).
	// Per VERSION, because a grant only changes with a release: each new version is one more
	// chance for a grant to have moved, and between releases there is nothing to find.
	await bestEffort("special-possession gear repair", () => oncePerVersion("possessionGrantRepair", repairAllPossessionGrants));
	// Tick the rest of the unlock circles on a Seeker's mastered card that the old run-count
	// grant left at one (migration/mastered-arcanum-circles.js). GATED: legacy repair, and a
	// world swept once has nothing left to find.
	await bestEffort("mastered arcanum repair", () => oncePerVersion("masteredArcanumCircles", repairMasteredArcanumCircles));
	// Move marks on arcana whose printed boxes have moved (the beautiful scroll's four move
	// boxes; migration/tulpa-move-boxes.js). Per VERSION: each character records that it has
	// been settled in the same write that settles it, so a repeat, a sweep that dies part-way
	// or a player's own client settling first all leave nothing to do twice.
	await bestEffort("arcanum box layout settle", () => oncePerVersion("arcanumBoxLayouts", settleAllArcanumBoxLayouts));

	// Point player tokens back at the characters they stand for. An unlinked PC token carries
	// a private copy of its character, and the two drift because a roll writes to the sheet's
	// Actor while every chat-card button resolves its Actor out of the message speaker — which
	// core rewrites to the TOKEN whenever one is on the canvas. See
	// migration/link-character-tokens.js for the whole account.
	//
	// Gated per version because it is a full walk of every token on every Scene, and
	// `_preCreate` now stamps the link on new characters, so what is left is legacy. The gate
	// is UNSTAMPED again when the GM leaves a drifted token undecided: an unanswered question
	// is not a finished sweep, and the alternative is a world that quietly never asks again
	// about two characters wearing one name.
	await bestEffort("player-token link repair", _repairCharacterTokenLinks);
	// Catch Chronicle year pages up to the "Year One" naming the sheet and the picker
	// already use. It recognises a generated name and writes one, so it is idempotent and
	// needs no gate. The years that go stale are the closed-out ones nobody re-records, so
	// healing on write is not enough. See migration/season-year-page-names.js.
	await bestEffort("Chronicle year-page rename", renameAllSeasonYearPages);
	// Take out the blank Dangers entries the page sheet wrote until 43ca5442, one after every
	// real entry on each save (see migration/blank-dangers.js). Once per version: a full walk
	// of every journal page, and nothing writes them any more.
	await bestEffort("blank Dangers entry cleanup", () => oncePerVersion("blankDangers", clearAllBlankDangers));
	// Convert each steading's plain-text Residents/Neighbors rows into linked NPC actors
	// (idempotent). Swept every load, not once per world: players can't create actors, so a
	// background that seeds neighbors during onboarding leaves text rows for the GM to pick up here.
	await bestEffort("Residents/Neighbors → NPC conversion", migrateAllSteadingPeople);
	// Give already-linked Residents of Stonetop a "Stonetop" Home if theirs is blank
	// (new residents get this at creation). One-time, idempotent.
	await bestEffort("Resident Home backfill", backfillAllResidentHomes);
	// Pre-create both people folders so a player adding the first member never has to
	// (folder creation is a GM-only right; ensurePeopleFolder returns null for them).
	await bestEffort("ensurePeopleFolders", ensurePeopleFolders);
	// Same reason, for the relationship maps' folder: creating a Folder is a GM-only right,
	// so a player making the first map would otherwise have nowhere to file it.
	await bestEffort("ensureRelationshipMapFolder", ensureRelationshipMapFolder);
	await bestEffort("token-nameplate migration", _migrateTokenNameplates);
	await bestEffort("NPC placeholder-portrait migration", _migrateNpcPlaceholderPortraits);
	await bestEffort("token-image backfill", _migrateTokenImagesToPortraits);
	await bestEffort("initiate shoot-marker backfill", _migrateShootMarker);
	await bestEffort("people portrait/frame flip", _migratePeoplePortraitsToWhole);
	// Open the lettered village pins already on this world's scenes up to the players
	// they were always for (once per world; see revealLandmarkNotesOnce), then point any
	// that still open nothing at their Chronicle page (every load; a no-op once linked).
	await bestEffort("landmark map-pin reveal", revealLandmarkNotesOnce);
	await bestEffort("landmark map-pin linking", linkLandmarkNotes);
	// And bring the lettered discs' own formatting up to the current design, which nothing
	// else does: they are written once and never revisited, and they now share the village
	// map with the captions its printing letters, so a size change to either shows up as the
	// other being stale. Silent once they agree.
	await bestEffort("landmark map-pin refit", refitLandmarkNotes);
	// Same bargain for the GM's own prep pins: a site dropped on a scene wears the Sites tab's
	// mound now, and every site pinned before that still wears a threat's torn note.
	//
	// Gated by VERSION rather than latched, which is the right shape for a refit: it is not a
	// one-shot repair but "bring these up to the current design", so it has to run again the
	// next time the design moves — and it does, because the stamp trails the new version. What
	// it stops is walking every Note on every Scene, a third time after the two landmark passes
	// above, on every load in between.
	await bestEffort("GM-prep map-pin refit", () => oncePerVersion("gmPrepPins", refitGmPrepPins));
	// And put the GM's already-placed sites onto the table's maps, for the world that gained
	// its poster Scenes AFTER it wrote its sites up — an ordinary order to do things in, since
	// pinning a site on the walkthrough's map needs no Scene at all. Nothing else does this:
	// the Scene pin was only ever written by a placement, so those sites went on saying
	// "already on The Vicinity" over a table map that had never heard of them.
	await bestEffort("site map-pin reconcile", () => oncePerVersion("sitePins",
		() => reconcileSitePins(getStonetopSteadingActor()?.typedActor ?? null)));
	// Put the named places back on the poster maps, whose printing carries no labels at all,
	// and bring pins already down up to the current design. Every load, and
	// silent when they already agree: the only other thing that writes a poster-map Scene is
	// an offer this world answered long ago, so a pass that ran once could never change
	// anything it had already made (see markPosterMapScenes).
	await bestEffort("poster map marker placement", markPosterMapScenes);
}

// Bring the actors already in the world up to the "name shows on hover to anyone" token default
// that new ones now get at creation (StonetopActor#_preCreate). Every type, not just NPCs: see
// there for why the rule stopped being per-type, and for the spoiler note on creature names.
//
// Only touches what is still at the untouched core default (displayName NONE), so a GM who
// deliberately set a different mode (hidden, always-on, owner-only) keeps it. NONE is also how a
// GM would deliberately hide a name, and there is no way to tell those two apart — core's own
// default IS NONE — so this reads it as "never decided", which is what it is on all but a handful
// of tokens in any world.
//
// AND the tokens already standing on scenes, which the prototype does not reach: a TokenDocument
// carries its own `displayName`, copied when it was placed, so a sweep that stopped at the
// prototype would fix only the NEXT token dragged out and leave every villager already on the map
// nameless. That is precisely the token somebody is hovering.
//
// One batched write per collection rather than a round trip each (_updateActorsBatched): this now
// matches most of the actor list rather than a handful of NPCs, and each separate update is its own
// socket round trip, document diff and sidebar repaint, all of it on the blocking startup path.
//
// Idempotent: once bumped, nothing matches, so re-running every load is a cheap no-op needing no
// version flag. Primary-GM only (the caller gates it) so two connected GMs can't both write the
// same documents.
async function _migrateTokenNameplates() {
	const NONE = CONST.TOKEN_DISPLAY_MODES.NONE;
	const HOVER = CONST.TOKEN_DISPLAY_MODES.HOVER;
	const unnamed = (mode) => (mode ?? NONE) === NONE;

	const stale = game.actors?.filter(a => unnamed(a.prototypeToken?.displayName)) ?? [];
	await _updateActorsBatched(stale, () => ({ "prototypeToken.displayName": HOVER }), "nameplate backfill");

	// One request per affected scene, and none at all for a scene with nothing to bump — which
	// after the first load is every scene. See utils/placed-tokens.js, shared with the two other
	// sweeps that have to reach past the prototype.
	await updatePlacedTokens(t => unnamed(t.displayName), () => ({ displayName: HOVER }), { what: "name" });
}

// Give the NPCs already in the world the people silhouette new ones now get at creation
// (StonetopActor#_preCreate), so a neighbor with no portrait stops showing Foundry's
// mystery-man in the sidebar, on a drag preview and in chat — the steading roster was
// already drawing the placeholder, but only there. Only touches actors still wearing a
// stock Foundry default (or the placeholder under a pre-rename system id), so a portrait
// anyone chose is never overwritten. Idempotent: once stamped, the actor no longer matches,
// so re-running every load is a cheap no-op needing no version flag. Primary-GM only (the
// caller gates it) so two connected GMs can't both write the same actors.
// One batched write rather than a round trip each, for the reason its neighbours state: on the
// load where this fires it fires for every art-less NPC in the world at once, and a world seeded
// with a full steading roster has a lot of those.
async function _migrateNpcPlaceholderPortraits() {
	const stale = game.actors?.filter(
		a => a.type === "npc" && a.img !== PERSON_DEFAULT_IMG && isDefaultImg(a.img)
	) ?? [];
	await _updateActorsBatched(stale, () => ({ img: PERSON_DEFAULT_IMG }), "NPC placeholder portrait");
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
	await _updateActorsBatched(stale, a => ({ "prototypeToken.texture.src": a.img }), "token-image backfill");
}

// Lift an initiate of Danu off the marker's old file. The shoot an art-less initiate wears
// moved from followers/sprout.svg to followers/new-shoot.svg, and the old file is gone, so an
// actor stamped before the move points at nothing and draws a broken image. The old path is
// matched under every id this package has shipped under (LEGACY_SHOOT_MARKERS), since an
// actor stamped before a rename still names the old one.
//
// Both the portrait and the prototype token, because followerNpcActorData sets the two
// together and a token left behind would put the break back on the next drag to a scene.
// Only exact matches on a path we ourselves wrote, so art anyone chose is never touched.
// Idempotent: once lifted, the actor stops matching, so re-running every load is a cheap
// no-op needing no version flag. Primary-GM only (the caller gates it).
//
// AND the tokens already standing on scenes, which its two neighbours above have no need to
// touch and this one does. They repoint paths that still resolve — a mystery-man silhouette is
// ugly, not broken — while the file this one is lifting off is GONE from the package. A
// TokenDocument carries its own `texture.src`, copied from the prototype when it was placed, so
// an initiate already on a map would draw a broken image on every load forever; `prototypeToken`
// only governs the NEXT one dragged out.
async function _migrateShootMarker() {
	const wasOurs = p => LEGACY_SHOOT_MARKERS.includes(String(p ?? "").replace(/^\//, ""));
	const tokenWasOurs = actor => wasOurs(actor.prototypeToken?.texture?.src);
	const stale = game.actors?.filter(actor => wasOurs(actor.img) || tokenWasOurs(actor)) ?? [];
	await _updateActorsBatched(stale, actor => ({
		...(wasOurs(actor.img) ? { img: NEW_SHOOT_MARKER } : {}),
		...(tokenWasOurs(actor) ? { "prototypeToken.texture.src": NEW_SHOOT_MARKER } : {}),
	}), "shoot-marker lift");

	// One request per affected scene, and none at all for a scene with nothing to lift — which
	// after the first load is every scene. See utils/placed-tokens.js.
	await updatePlacedTokens(
		t => wasOurs(t.texture?.src),
		() => ({ "texture.src": NEW_SHOOT_MARKER }),
		{ what: "lift" },
	);
}

// Put every People-of-Stonetop portrait onto the WHOLE illustration, with the hand-chosen square
// as a frame over it and as the token's own file. See module/book2-art/repoint-portraits.js for
// the three writes and why they are one move.
//
// ON LOAD, unlike the rebuild it also runs inside. The rebuild is behind a chat card that
// offer-once.js latches the moment it is POSTED, so a world whose GM scrolled past that card can
// never be asked again — and every one of those worlds is currently showing a small square face to
// any module that reads `actor.img`, which is the bug this fixes. Nothing here CUTS a file (the
// resolver only ever names squares the world has already extracted), so unlike the rebuild there
// is nothing to ask permission for: it rearranges three fields into the layout a bestiary creature
// has always had, and leaves every surface drawing the same pixels it drew before.
//
// Idempotent by construction, so re-running every load is a cheap no-op needing no version flag:
// the target values are computed from the art index rather than from the actor, so a portrait
// already in this layout produces an empty update and drops out of the plan. Primary-GM only (the
// caller gates it) so two connected GMs can't both write the same actors.
async function _migratePeoplePortraitsToWhole() {
	const { flipPeoplePortraitsToWhole } = await import("../book2-art/repoint-portraits.js");
	const result = await flipPeoplePortraitsToWhole();
	if (result.changes) {
		const placed = result.placed ? ` ${result.placed} placed token(s) followed.` : "";
		console.log(`Stonetop | People portraits: ${result.changes} field(s) moved onto the whole illustration across ${result.updated} actor(s).${placed}`);
	}
}

// One batched actor write, falling back to one write per actor.
//
// `build(actor)` returns the update body for that actor, WITHOUT `_id`, and is called once per
// actor per attempt — deliberately, never once for the whole batch. On v14 a deletion body carries
// a `ForcedDeletion` INSTANCE rather than a magic key (utils/foundry-compat.js), and core deletes
// only where the value `instanceof ForcedDeletion`; the contract there is a fresh instance per key,
// so building one and spreading it across every document in the request is trusting an operator
// object to be reusable when nothing says it is.
//
// THE FALLBACK IS WHAT MAKES A PARTIAL SWEEP HONEST. `Actor.updateDocuments` is all-or-nothing, so
// one locked or unwritable actor rejects the batch and every clean actor behind it stays stale —
// on a sweep that only ever fires on the one load where it has work to do. Walking them
// individually saves everything that can be saved, exactly as flipPeoplePortraitsToWhole does; all
// of these are idempotent, so whatever still fails is simply picked up next load.
//
// `what` names the job in the two warnings.
async function _updateActorsBatched(actors, build, what) {
	if (!actors.length) return 0;
	try {
		await Actor.updateDocuments(actors.map(a => ({ _id: a.id, ...build(a) })));
		return actors.length;
	} catch (err) {
		console.warn(`Stonetop | bulk ${what} failed; retrying one actor at a time:`, err);
	}
	let updated = 0;
	for (const actor of actors) {
		try {
			await actor.update(build(actor));
			updated++;
		} catch (err) {
			console.warn(`Stonetop | could not ${what} on "${actor?.name}":`, err);
		}
	}
	return updated;
}

// Drop the pre-rename `system.attributes.armour` key from characters that still carry it.
//
// PRIMARY-GM ONLY, like every other sweep in onReady. A player has no right to update actors
// they don't own, so running this on their client threw `User lacks permission to update Actor`
// once per stale character — and because the call site was a bare `await`, that rejection tore
// down the rest of onReady for them: no hotbar macros, no game.stonetop, no window restore. It
// went unnoticed because the early return below makes it a silent no-op in an already-clean
// world, which is every world the developers were testing against.
export async function _migrateArmourToArmor() {
	if (!game.user?.isGM || !isPrimaryGM()) return;
	const staleActors = game.actors.filter(
		a => a.type === "character" && a.system?.attributes?.armour !== undefined
	);
	if (!staleActors.length) return;
	// ONE batched request, like every other actor sweep here. Per-actor updates cost a socket
	// round trip, a world-wide `updateActor` broadcast and an Actors-sidebar repaint EACH, all on
	// the blocking startup path — and on the one load where this fires it fires for every stale
	// character at once. Built per actor rather than once for the batch, and with a per-actor
	// retry behind it: see _updateActorsBatched for both reasons.
	await _updateActorsBatched(
		staleActors,
		() => Object.fromEntries([deletionEntry("system.attributes.armour")]),
		"armour key drop",
	);
}

// Per-actor flags in OUR scope that no code reads any more, because the control that wrote them
// is gone from the sheet. Nothing breaks if one is left behind — a stale flag is inert — but a
// world's actor data should say what the system actually uses, and a retired key left lying
// around is the kind of thing that gets mistaken for live state later.
//
// Add a key here only once its last READER is gone, not merely its writer: a flag still consulted
// somewhere would be silently reset to its default by this sweep.
const _RETIRED_ACTOR_FLAGS = [
	// The Invocations tab's "Known first / A–Z" sort dropdown, dropped when the tab settled on the
	// single order (known first, then alphabetically). Only a Lightbearer whose player opened that
	// dropdown ever carried it.
	"invocationsSort",
	// NOT `rollMode`, though 1.5.3 did remove its last reader. The sheet's Advantage/Disadvantage
	// picker is coming back as the "sticky advantage" alternative to the pre-roll prompt, and
	// `StonetopCharacter#rollMode` reads that flag again — so sweeping it would reset a live
	// preference on every load, which is exactly what the rule above this list forbids. Retire it
	// only if that control is dropped for good.
];

// Sweep those keys off every actor that still has one.
//
// PRIMARY-GM ONLY, like every other write in onReady. A player has no right to update actors they
// don't own, and the rejection would tear down the rest of the hook for them — the lesson
// _migrateArmourToArmor above learned the hard way.
//
// Needs no version flag: it is idempotent by construction, since after a run there is no key left
// to match and the walk below makes it a silent no-op. One batched request rather than one per
// actor, because unlike the armour sweep this walks EVERY actor in the world, not just characters
// — with the same per-actor retry behind it, so one unwritable actor can't hold the rest stale.
export async function _dropRetiredActorFlags() {
	if (!game.user?.isGM || !isPrimaryGM()) return 0;
	const staleKeys = new Map();
	for (const actor of game.actors ?? []) {
		const flags = actor.flags?.[STONETOP_SCOPE];
		if (!flags) continue;
		const stale = _RETIRED_ACTOR_FLAGS.filter(key => flags[key] !== undefined);
		if (stale.length) staleKeys.set(actor, stale);
	}
	if (!staleKeys.size) return 0;
	await _updateActorsBatched(
		[...staleKeys.keys()],
		// Through deletionEntry so v14 gets a ForcedDeletion instance rather than a deprecated
		// `-=` key, while v13 gets the `-=` prefix, which is the only form that works there.
		actor => Object.fromEntries(
			staleKeys.get(actor).map(key => deletionEntry(`flags.${STONETOP_SCOPE}.${key}`))),
		"retired flag sweep",
	);
	return staleKeys.size;
}

// Keep the monster sheet's Group fight switch (`system.fightAsGroup`) on WORLD monsters in step with
// the Fight tab: unticked while the tab is on, and PUT BACK when it goes off again.
//
// With the tab on, a group's scale is chosen for each TOKEN: as it joins a fight (the "how many?"
// window) and from the tab after that (Merge, Split: fight/group-scale.js), and the sheet no longer
// draws the switch. A sidebar monster ticked before then, or while the tab was switched off, hands
// the switch to every token dragged out of it, is never asked "how many?", and has no box left to
// untick. Tokens keep theirs: each is the scale its own fight settled on.
//
// WHICH IS A GOOD REASON TO UNTICK AND NO REASON AT ALL TO FORGET. The tab is a switch a GM can
// throw back the same evening; the ticks it ate were a dozen deliberate decisions about a dozen
// bestiary entries, and nothing recorded them, so throwing it back left the whole sidebar unticked
// with no way to tell which entries had been which. So the untick writes down whose switch it took
// (`groupFightUnticked`), and turning the tab off gives them back and clears the record.
//
// A GM who re-ticks an entry with the tab OFF and turns it on again is swept as before, and their
// new tick is added to the record: it is a list of what this sweep took, not a one-time snapshot.
//
// Every load rather than once per version, since the tab can be thrown either way at any time.
// Idempotent, and in a settled world a filter over the Actors sidebar that finds nothing to write.
// PRIMARY-GM ONLY, like every other write in onReady, and batched with the same per-actor retry
// (see _updateActorsBatched).
export async function _reconcileWorldGroupFights() {
	if (!game.user?.isGM || !isPrimaryGM()) return 0;
	return isFightTabEnabled() ? _untickWorldGroupFights() : _restoreWorldGroupFights();
}

/** The tab is ON: take the switch off every world monster still carrying it, and remember whose. */
async function _untickWorldGroupFights() {
	const ticked = (game.actors ?? []).filter(actor => actor.type === "monster" && actor.system?.fightAsGroup);
	if (!ticked.length) return 0;
	const wrote = await _updateActorsBatched(ticked, () => ({ "system.fightAsGroup": false }), "Group fight untick");
	// Everyone the batch was about, not only those `wrote` counted: a per-actor retry that dropped
	// one leaves it still ticked, the next load sweeps it again, and the Set swallows the repeat.
	// Recording one whose write failed costs nothing either — the restore hands the switch back only
	// to a monster that has not got it, so an id that never lost one is passed over.
	if (wrote) {
		const held = new Set([...getArraySetting("groupFightUnticked"), ...ticked.map(actor => actor.id)]);
		await setSetting("groupFightUnticked", [...held]);
	}
	return wrote;
}

/** The tab is OFF: the switch is back on the sheet, so give back what the untick took. */
async function _restoreWorldGroupFights() {
	const held = getArraySetting("groupFightUnticked");
	if (!held.length) return 0;
	// Cleared whether or not anyone is left to give it back to: an id whose monster has since been
	// deleted, or which the GM has already re-ticked by hand, is a record with nothing left to say.
	const heldIds = new Set(held);
	const back = [...(game.actors ?? [])]
		.filter(actor => heldIds.has(actor?.id) && actor.type === "monster" && !actor.system?.fightAsGroup);
	const wrote = back.length
		? await _updateActorsBatched(back, () => ({ "system.fightAsGroup": true }), "Group fight restore")
		: 0;
	await setSetting("groupFightUnticked", []);
	return wrote;
}

// Give a slug to any arcanum card in the world that has none.
//
// Every arcanum needs one: it is the identity key for each holder's marks, unlock counts and
// owned/identified/flipped lists, so a card without one silently keys all of that off "". New
// cards can no longer arrive that way -- StonetopItem#_preCreate stamps the gap before the
// document is written -- but a world may already hold one built by macro or console before that
// existed. Repairing it used to be the editor's `getData`, which only reached cards somebody
// happened to open in edit mode.
//
// Idempotent by construction and so needs no version flag: after a run there is nothing left to
// match. WORLD items only -- a card embedded on an actor is not an arcanum (arcana are referenced
// by slug from a pack or the world, never owned as embedded documents).
//
// PRIMARY-GM ONLY, like every other write in onReady: a player has no right to update world
// items, and the rejection would tear down the rest of the hook for them.
export async function _stampMissingArcanumSlugs() {
	if (!game.user?.isGM || !isPrimaryGM()) return 0;
	const slugless = (game.items ?? []).filter(
		item => isArcanumData(item) && !String(item.flags?.[ITEM_FLAG_SCOPE]?.slug ?? "").trim()
	);
	if (!slugless.length) return 0;
	// ONE batched request, like every other sweep here: per-item updates each cost a socket round
	// trip and an Items-sidebar repaint, on the blocking startup path.
	try {
		await Item.updateDocuments(slugless.map(item => ({
			_id: item.id,
			[`flags.${ITEM_FLAG_SCOPE}.slug`]: newArcanumSlug(),
		})));
	} catch (err) {
		// Never cost the GM their load: the cards still open, and the next load tries again.
		console.warn("Stonetop | Could not stamp slugs on slug-less arcana.", err);
		return 0;
	}
	console.log(`Stonetop | Gave a slug to ${slugless.length} arcanum card(s) that had none.`);
	return slugless.length;
}

const _TOKEN_LINK_SWEEP = "characterTokenLinks";

/**
 * Run the player-token link repair, and decide whether the sweep is finished.
 *
 * The silent half — stamping prototypes, linking tokens whose private copy is empty — always
 * completes. The other half is a question, and a question is only answered once: a GM who
 * dismisses the window, or who parks a character on "leave it unlinked" for now, has not
 * finished the sweep, so the version stamp is taken back off and the next load asks again.
 *
 * `forgetSweep` runs AFTER `oncePerVersion` returns rather than inside its work function,
 * because the stamp is written on the way out — forgetting from inside would be overwritten by
 * the very stamp it is trying to remove.
 */
async function _repairCharacterTokenLinks() {
	let unfinished = false;
	await oncePerVersion(_TOKEN_LINK_SWEEP, async () => {
		const drifted = await repairCharacterTokenLinks();
		if (!drifted.length) return;
		const { applied, choices } = await CharacterTokenLinkDialog.ask(drifted);
		if (!applied) { unfinished = true; return; }
		const { linked, left, failed } = await applyLinkChoices(drifted, choices);
		if (linked) console.log(`Stonetop | Relinked ${linked} player token(s) to their characters.`);
		if (left)   console.log(`Stonetop | Left ${left} player token(s) unlinked, as asked.`);
		// Only a FAILED write reopens the sweep. A token the GM deliberately left unlinked is an
		// answer, and asking again every load would be this system overruling them.
		if (failed) unfinished = true;
	});
	if (unfinished) await forgetSweep(_TOKEN_LINK_SWEEP);
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
