// THE TIMELINE, KEPT UP TO DATE WITHOUT ANYBODY ASKING.
//
// Five jobs, all hooks:
//
//  • MILESTONES off a character's own changes (timeline-milestones.js says which): a level, a death,
//    a lasting wound, an arcanum, a follower gained. `preUpdateActor` snapshots the character only
//    when an update touches something a milestone is read off; `updateActor` diffs and writes.
//    ⚠ ONLY ON THE CLIENT THAT MADE THE CHANGE. Every client hears every update; letting each of them
//    write would be one row per connected player, each racing the others for the same page.
//  • KILLS off a damage card's applied rows (timeline-kills.js says whose): `preUpdateChatMessage`
//    notes which rows were applied already, `updateChatMessage` credits the new ones that felled
//    somebody. The same only-the-client-that-made-it rule, which is whoever pressed Apply.
//  • A FOLLOWER'S DEATH, announced by the fate dialog (`stonetop.followerDied`): the companion and
//    the initiates keep no stored record of dying for a diff to find.
//  • A PAGE FOR A NEW CHARACTER, as soon as there is one (primary GM), rather than at the next load.
//  • A RENAMED character's page renamed with them (primary GM), so the Journal sidebar keeps up.
//
// QUIET WHILE A CHARACTER IS BEING MADE. Character creation writes a level, names a companion, hands
// out arcana; none of that is the character's STORY yet, and a thread that opens on six rows of
// "found" and "joined" is the noise the timeline exists to avoid. The one exception is a Seeker's
// major arcanum, which is who they are from the first page.

import { STONETOP_SCOPE, readableFlags } from "../actors/character/StonetopFlags.js";
import { creationFlowOpen } from "../actors/character/creation-flow.js";
import { isMidCreation } from "../actors/character/onboarding-progress.js";
import { isPrimaryGM } from "../utils/primary-gm.js";
import { format, localize } from "../utils/i18n.js";
import { LEARNED_OPTION, creationMilestones, detectMilestones, snapshotFrom, touchesWatched } from "./timeline-milestones.js";
import { creditsKills, felledBy, foeName, isFoe, newlyApplied } from "./timeline-kills.js";
import { characterBehind } from "../actors/character/follower-masters.js";
import { combatantSide, fightOnScene, sideInfoFor } from "../fight/fight-state.js";
import { rollerCombatant } from "../fight/damage-seed.js";
import { FOES } from "../fight/engagements.js";
import { damageRowActor } from "../utils/damage.js";
import { prettifySlug } from "../utils/ledger-core.js";
import { warn } from "../utils/logger.js";
import { recordKills, recordMilestones } from "./timeline-record.js";
import { renameTrackPage, syncTrackPages, trackForActor } from "./timeline-store.js";

/** The update option that carries the before-snapshot from `preUpdateActor` to `updateActor`. */
export const BEFORE_OPTION = "stonetopTimelineBefore";

export { LEARNED_OPTION };

/** The text a Death's Door mark is seeded with before the player writes their own (DeathsDoorDialog). */
const MARK_PLACEHOLDER_KEY = "stonetop.specialMoves.deathsDoor.mark.placeholder";

/**
 * Is this character still being made? The creation windows count until their commit has finished
 * (CharacterOnboardingDialog awaits its completion before it closes), and a character backed out of
 * half-built still reads as mid-creation. Every check tolerant, since none of them may throw here.
 */
function beingCreated(actor) {
	try { if (creationFlowOpen(actor?.id)) return true; } catch { /* no creation window module state */ }
	try { return isMidCreation(actor); } catch { return false; }
}

/** The facts a milestone is read off, for one character. */
export function milestoneSnapshot(actor) {
	return snapshotFrom({ system: actor?.system ?? {}, flags: readableFlags(actor) });
}

let arcanaRepo = null;

/**
 * An arcanum's FRONT title -- what even an unidentified card shows -- or its slug made readable.
 * Never the back's title, which is the card's secret.
 */
async function arcanumName(slug) {
	try {
		if (!arcanaRepo) {
			const { FoundryArcanaRepository } = await import("../actors/character/repositories/FoundryArcanaRepository.js");
			arcanaRepo = new FoundryArcanaRepository();
		}
		const card = await arcanaRepo.findBySlug(slug);
		if (card?.front?.title) return card.front.title;
	} catch { /* fall through to the slug */ }
	return prettifySlug(slug);
}

/** A detected milestone, in words, ready to write. */
async function inWords(found) {
	const data = { ...found.data };
	if (found.arcanaSlug) data.name = await arcanumName(found.arcanaSlug);
	const milestone = { source: found.source, key: found.key, title: format(found.titleKey, data) };
	if (found.body) milestone.body = found.body;
	else if (found.bodyKey) milestone.body = format(found.bodyKey, found.bodyData ?? {});
	if (found.refresh?.length) milestone.refresh = found.refresh;
	return milestone;
}

/** `preUpdateActor`: snapshot a character before an update that could make a milestone. */
export function onPreUpdateActor(actor, changed, options) {
	if (actor?.type !== "character" || !options) return;
	if (!touchesWatched(changed, STONETOP_SCOPE, foundry.utils.flattenObject)) return;
	options[BEFORE_OPTION] = milestoneSnapshot(actor);
}

/** `updateActor`: write whatever milestones the update made, on the client that made it. */
export async function onUpdateActor(actor, changed, options, userId) {
	const before = options?.[BEFORE_OPTION];
	if (!before || actor?.type !== "character" || userId !== globalThis.game?.user?.id) return;
	let found = detectMilestones(before, milestoneSnapshot(actor), {
		learned: options?.[LEARNED_OPTION] ?? "",
		markPlaceholder: localize(MARK_PLACEHOLDER_KEY),
	});
	if (found.length && beingCreated(actor)) found = creationMilestones(found);
	if (!found.length) return;
	await recordMilestones(actor, await Promise.all(found.map(inWords)));
}

/** The update option carrying which of a damage card's rows were applied before the update. */
export const APPLIED_BEFORE_OPTION = "stonetopKillsBefore";

/** The hook a follower's death is announced on: `(actor, {follower, slug, index, name})`. */
export const FOLLOWER_DIED_HOOK = "stonetop.followerDied";

/**
 * Was a struck target on the other side, AS THE FIGHT PLACES IT? A side the Fight tab stamped on the
 * target's combatant wins (`combatantSide`), so an NPC the GM moved across counts for the side it
 * was moved to. Outside a fight, the side the actor implies, with the disposition the card saw.
 *
 * ⚠ NEVER A CHARACTER OR A FOLLOWER, WHATEVER THE STAMP SAYS (the user's ruling: a kill on your own
 * people is not a kill to count). The follower test is the wider of the two the system has: the
 * fight's own `followerOrigin` flag (`sideInfoFor`), or a character behind the NPC (`characterBehind`).
 */
function struckFoe(target, cardDisposition) {
	const info = sideInfoFor(target, target.token ?? null);
	if (info.type === "character" || info.hasPlayerOwner) return false;
	if (info.isFollower || (target.type === "npc" && characterBehind(target))) return false;
	const scene = target.token?.parent ?? globalThis.canvas?.scene ?? null;
	const combatant = rollerCombatant(fightOnScene(scene), scene, target);
	if (combatant) return combatantSide(combatant) === FOES;
	return isFoe({ ...info, disposition: cardDisposition ?? info.disposition });
}

/** `preUpdateChatMessage`: note which rows a damage card had applied, when its rows are changing. */
export function onPreUpdateChatMessage(message, changed, options) {
	if (!options) return;
	const path = `flags.${STONETOP_SCOPE}.damage`;
	const keys = Object.keys(foundry.utils.flattenObject(changed ?? {}) ?? {});
	if (!keys.some(key => key === path || key === `${path}.applied` || key.startsWith(`${path}.applied.`))) return;
	options[APPLIED_BEFORE_OPTION] = (message?.getFlag?.(STONETOP_SCOPE, "damage")?.applied ?? [])
		.map(row => row?.uuid).filter(Boolean);
}

/**
 * `updateChatMessage`: the foes a press of Apply felled, onto the striker's timeline, on the client
 * that pressed it. ONE write for the whole press, so a sweep that drops three foes is one row updated.
 *
 * Whether the card credits anybody is asked once, since every row on it was struck by the same hand:
 * a character's own blow, never a follower's and never a card the character TOOK. Each target is then
 * asked whether it is a foe, as the fight would place it.
 */
export async function onUpdateChatMessage(message, changed, options, userId) {
	const before = options?.[APPLIED_BEFORE_OPTION];
	if (!Array.isArray(before) || userId !== globalThis.game?.user?.id) return;
	const damage = message?.getFlag?.(STONETOP_SCOPE, "damage");
	const fresh = newlyApplied(damage?.applied, before).filter(row => felledBy(row) > 0);
	if (!fresh.length) return;
	const attacker = damage.attackerUuid ? await fromUuid(damage.attackerUuid).catch(() => null) : null;
	const credited = creditsKills({
		attackerType: attacker?.type, selfHarm: !!damage.selfHarm,
		followerBlow: !!message.getFlag(STONETOP_SCOPE, "followerBlow"),
	});
	if (!credited) return;
	const slain = [];
	for (const row of fresh) {
		const result = (damage.results ?? []).find(r => r?.uuid === row.uuid);
		const target = damageRowActor(await fromUuid(row.uuid).catch(() => null));
		if (!target) continue;
		if (!struckFoe(target, result?.disposition)) continue;
		const name = foeName(result?.name) || target.name;
		for (let i = 0; i < felledBy(row); i++) slain.push(name);
	}
	if (slain.length) await recordKills(attacker, slain);
}

/**
 * A follower's death, from the one place that decides it (StonetopCharacterSheet's fate dialog, by
 * way of `FOLLOWER_DIED_HOOK`). Keyed by which follower it was, so a second press on the same fate
 * is one row.
 */
export async function recordFollowerDeath(actor, { follower = "", slug = "", index = "", name = "" } = {}) {
	if (actor?.type !== "character") return null;
	return recordMilestones(actor, [{
		source: "follower",
		key:    `follower:dead:${follower}:${slug ?? ""}:${index ?? ""}:${name}`,
		title:  format("stonetop.timeline.milestone.followerDied", { name }),
	}]);
}

/** `createActor`: a new character gets a thread now, not at the next load. Primary GM only. */
export function onCreateActor(actor) {
	if (actor?.type !== "character" || !globalThis.game?.user?.isGM || !isPrimaryGM()) return;
	syncTrackPages().catch(err => warn("could not make a timeline page for a new character", err));
}

/** `updateActor`: a renamed character (or steading) renames their page. Primary GM only. */
export function onRenameActor(actor, changed) {
	if (!("name" in (changed ?? {})) || !globalThis.game?.user?.isGM || !isPrimaryGM()) return;
	const track = trackForActor(actor);
	if (!track) return;
	renameTrackPage(track.trackId, actor.name).catch(err => warn("could not rename a timeline page", err));
}

/** Wire every hook above. Called once, at module load of stonetop.js. */
export function registerTimelineWatch() {
	Hooks.on("preUpdateActor", onPreUpdateActor);
	Hooks.on("updateActor", (actor, changed, options, userId) => {
		onRenameActor(actor, changed);
		onUpdateActor(actor, changed, options, userId).catch(err => warn("could not record a milestone", err));
	});
	Hooks.on("createActor", onCreateActor);
	Hooks.on("preUpdateChatMessage", onPreUpdateChatMessage);
	Hooks.on("updateChatMessage", (message, changed, options, userId) => {
		onUpdateChatMessage(message, changed, options, userId).catch(err => warn("could not add kills to the timeline", err));
	});
	Hooks.on(FOLLOWER_DIED_HOOK, (actor, fate) => {
		recordFollowerDeath(actor, fate).catch(err => warn("could not record a follower's death", err));
	});
}
