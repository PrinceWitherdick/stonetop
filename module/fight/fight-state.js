// A fight's documents, read into engagements.js's plain input, for whoever is looking.
//
// THE ONLY PLACE THAT TOUCHES DOCUMENTS for the fight's arithmetic: the Fight tab, the map overlay
// and the damage pre-fill all come through here, so they cannot disagree about who is fighting whom.
//
// THE RECORD IS CORE'S. A fight is a Combat; its Combatants carry two flags of ours, `side`
// ("heroes"|"foes", stamped when they join) and `count` (a headcount the GM set on a crew's token).
// Nothing about who is engaged is ever stored: it is worked out from where the tokens stand.
//
// Three things about the documents that are easy to get wrong:
//  • A TOKEN MID-ANIMATION IS NOT WHERE IT IS GOING. Core merges each animation frame into the token
//    document itself, so `tokenDoc.x` walks across the map for a second after every move. Contact is
//    read from `_source`, the position the move saved, or the engagements would flicker frame by frame.
//  • MONSTER TOKENS ARE UNLINKED. Their HP, group size and "fight as a group" switch live on the
//    token's own actor (`combatant.actor` is `token.actor`), never on the sidebar actor.
//  • A PLAYER'S TARGETS ONLY EXIST ON THE CANVAS SCENE. Core keeps every user's targets in sync, but
//    only for the scene on screen, so a scene nobody is looking at has melee and nothing else.

import { SYSTEM_ID } from "../system-id.js";
import { engage, HEROES, FOES } from "./engagements.js";
import { classifySide, bodiesFor } from "./fight-sides.js";

export const FIGHT_FLAG = "fight";
export const SIDE_FLAG = "side";
export const COUNT_FLAG = "count";
/** Where everyone stood before the last line-up, for "Put everyone back" (start-fight.js). */
export const LAST_LINE_UP_FLAG = "lastLineUp";

/** Core's OWNER ownership level, which a module read in tests cannot reach through CONST. */
const OWNER = 3;

const ours = doc => doc?.flags?.[SYSTEM_ID] ?? {};
/** A collection as an array; nothing for anything that cannot be walked. */
const each = collection => (typeof collection?.[Symbol.iterator] === "function" ? [...collection] : []);

/** Whether a Combat was started (or claimed) as a Stonetop fight. */
export function isFight(combat) {
	return !!ours(combat)[FIGHT_FLAG];
}

/** Whether a combat is fought on this scene: linked to it, or unlinked with someone standing on it. */
export function combatTouchesScene(combat, scene) {
	if (!combat || !scene) return false;
	if (combat.scene) return combat.scene.id === scene.id;
	return each(combat.combatants).some(c => c.sceneId === scene.id);
}

/**
 * The fight on a scene: the one the Fight tab is showing when it is fought here, else the active one,
 * else the most recently changed. Only a Combat stamped as a fight counts: a world that ran the old
 * Introductions still has its active, tokenless roster Combat, and that is nobody's fight.
 *
 * ⚠ THE TAB CAN BE SHOWING A FIGHT THAT IS OVER. Core takes a deleted Combat out of `game.combats`
 * before the delete hooks run, but the tab only lets go of it when its redraw lands, a render later.
 * Anything asking in between (the Fight window closing at the end of a fight) would be handed the
 * fight that just ended, so the tab's choice counts only while the world still holds it.
 */
export function fightOnScene(scene) {
	if (!scene) return null;
	const viewed = globalThis.ui?.combat?.viewed ?? null;
	const combats = globalThis.game?.combats;
	const stillHeld = typeof combats?.get !== "function" || combats.get(viewed?.id) === viewed;
	if (isFight(viewed) && stillHeld && combatTouchesScene(viewed, scene)) return viewed;
	const here = each(globalThis.game?.combats).filter(c => isFight(c) && combatTouchesScene(c, scene));
	here.sort((a, b) => (Number(!!b.active) - Number(!!a.active))
		|| ((b._stats?.modifiedTime ?? 0) - (a._stats?.modifiedTime ?? 0)));
	return here[0] ?? null;
}

/** What classifySide needs to know about an actor and its token. */
export function sideInfoFor(actor, tokenDoc = null) {
	return {
		type: actor?.type ?? "",
		hasPlayerOwner: !!actor?.hasPlayerOwner,
		isFollower: !!actor?.flags?.[SYSTEM_ID]?.followerOrigin,
		disposition: tokenDoc?._source?.disposition ?? tokenDoc?.disposition ?? null,
	};
}

/** The side a combatant fights on: the one stamped on it, else the one its actor implies. */
export function combatantSide(combatant) {
	const stamped = ours(combatant)[SIDE_FLAG];
	if (stamped === HEROES || stamped === FOES) return stamped;
	return classifySide(sideInfoFor(combatant?.actor, combatant?.token))?.side ?? null;
}

/** How many capable bodies a combatant's token stands for. See fight-sides.js#bodiesFor. */
export function combatantBodies(combatant) {
	const actor = combatant?.actor;
	const system = actor?.system ?? {};
	return bodiesFor({
		defeated: !!combatant?.isDefeated,
		type: actor?.type ?? "",
		fightAsGroup: !!system.fightAsGroup,
		organization: system.organization ?? "",
		hp: system.attributes?.hp ?? {},
		count: system.count ?? 0,
		headcount: ours(combatant)[COUNT_FLAG] ?? null,
	});
}

/** The scene's grid, as engagements.js#touching reads it. */
export function gridOf(scene) {
	const grid = scene?.grid ?? {};
	const types = globalThis.CONST?.GRID_TYPES ?? { GRIDLESS: 0, SQUARE: 1 };
	const type = Number(grid.type ?? types.SQUARE);
	const kind = type === types.GRIDLESS ? "gridless" : type === types.SQUARE ? "square" : "hex";
	return { size: Number(grid.size) > 0 ? Number(grid.size) : 100, kind };
}

/** A token's footprint in scene pixels, from its SAVED position and size (see the note at the top). */
export function tokenRect(tokenDoc) {
	const src = tokenDoc?._source ?? tokenDoc ?? {};
	const width = Number(src.width) || 1;
	const height = Number(src.height) || 1;
	const size = typeof tokenDoc?.getSize === "function"
		? tokenDoc.getSize({ width, height })
		: { width: width * 100, height: height * 100 };
	return { x: Number(src.x) || 0, y: Number(src.y) || 0, w: size.width, h: size.height };
}

/** The level a token stands on, from its saved data, or null on a map without levels. */
export const tokenLevel = tokenDoc => tokenDoc?._source?.level ?? null;

/** The canvas's scene rectangle, as `{x, y, w, h}`, or null. */
export function sceneRectOf(canvas) {
	const rect = canvas?.dimensions?.sceneRect ?? canvas?.dimensions?.rect ?? null;
	return rect ? { x: rect.x, y: rect.y, w: rect.width, h: rect.height } : null;
}

/** Whether rectangle `at` lies wholly inside `bounds`; anything does when there are no bounds. */
export function insideRect(at, bounds) {
	return !bounds || (at.x >= bounds.x && at.y >= bounds.y
		&& at.x + at.w <= bounds.x + bounds.w && at.y + at.h <= bounds.y + bounds.h);
}

/**
 * One combatant as a fighter on `scene`, or null when their token is not on it.
 *
 * VISIBILITY IS THE TRACKER'S OWN RULE, not the canvas's line of sight: a GM counts everyone; a player
 * counts a combatant core's tracker would show them (`combatant.visible`) whose token is not hidden.
 * Sight would make a player's numbers change as their token turns a corner, and would differ between
 * a scene they are looking at and one they are not.
 */
export function fighterOf(combatant, { scene, viewer = globalThis.game?.user } = {}) {
	const token = combatant?.token;
	if (!token || !scene || combatant.sceneId !== scene.id) return null;
	const side = combatantSide(combatant);
	if (!side) return null;
	const { bodies, out } = combatantBodies(combatant);
	const visible = !!viewer?.isGM || (combatant.visible !== false && !token.hidden);
	return {
		id: combatant.id,
		side,
		name: combatant.name || token.name || combatant.actor?.name || "",
		rect: tokenRect(token),
		level: tokenLevel(token),
		bodies,
		out,
		visible,
	};
}

/**
 * Which fighter a player's targets shoot from: the token of their assigned character, else the one
 * hero they own outright. Null for a GM, whose targets are bookkeeping for whichever creature they
 * happen to be running, and for a player with several heroes and no character assigned, where
 * there is no telling which of them is doing the shooting.
 */
export function userFighterId(user, combat, scene) {
	if (!user || user.isGM || !combat || !scene) return null;
	const here = each(combat.combatants).filter(c => c.sceneId === scene.id && c.token);
	const character = user.character ?? null;
	if (character) {
		const mine = here.find(c => c.actorId === character.id);
		if (mine) return mine.id;
	}
	const owned = here.filter(c => combatantSide(c) === HEROES && (c.actor?.ownership?.[user.id] ?? 0) >= OWNER);
	return owned.length === 1 ? owned[0].id : null;
}

/** Every player's targets on this scene, as shots from their fighter. */
export function rangedPairs(combat, scene, { users = globalThis.game?.users, canvasScene = globalThis.canvas?.scene } = {}) {
	if (!combat || !scene || canvasScene?.id !== scene.id) return [];
	const byToken = new Map(each(combat.combatants).filter(c => c.sceneId === scene.id).map(c => [c.tokenId, c]));
	const pairs = [];
	for (const user of each(users)) {
		if (!user?.active || user.isGM) continue;
		const from = userFighterId(user, combat, scene);
		if (!from) continue;
		for (const target of each(user.targets)) {
			const combatant = byToken.get(target?.document?.id ?? target?.id);
			if (combatant && combatant.id !== from) pairs.push({ from, to: combatant.id });
		}
	}
	return pairs;
}

/**
 * The whole fight on one scene, for one viewer.
 *
 * @returns {null|{combat, scene, fighters: object[], combatants: Map<string, object>,
 *   elsewhere: object[], result: ReturnType<typeof engage>}}
 *   `elsewhere` holds the combatants this viewer may see whose token is not on this scene.
 */
export function snapshotFight(combat, { scene, viewer = globalThis.game?.user, users, canvasScene } = {}) {
	if (!combat || !scene) return null;
	const fighters = [];
	const combatants = new Map();
	const elsewhere = [];
	for (const combatant of each(combat.combatants)) {
		const fighter = fighterOf(combatant, { scene, viewer });
		if (fighter) {
			fighters.push(fighter);
			combatants.set(combatant.id, combatant);
		} else if (viewer?.isGM || combatant.visible !== false) {
			elsewhere.push(combatant);
		}
	}
	// Heroes listed first, each side in the order they joined, so engagements read left to right.
	fighters.sort((a, b) => (a.side === b.side ? 0 : a.side === HEROES ? -1 : 1));
	const result = engage({
		fighters,
		grid: gridOf(scene),
		ranged: rangedPairs(combat, scene, { users, canvasScene }),
	});
	return { combat, scene, fighters, combatants, elsewhere, result };
}

/**
 * The fight a token is in, from that token's point of view, or null when it is in none: its fight,
 * its combatant, and its entry in the engagements.
 */
export function engagementFor(tokenDoc, options = {}) {
	const scene = tokenDoc?.parent ?? null;
	const combat = fightOnScene(scene);
	if (!combat) return null;
	const combatant = each(combat.combatants).find(c => c.tokenId === tokenDoc.id && c.sceneId === scene.id);
	return engagementOf(combat, scene, combatant, options);
}

/** One combatant's place in a fight on `scene`: the snapshot, the combatant and its entry, or null. */
export function engagementOf(combat, scene, combatant, { viewer = globalThis.game?.user, users, canvasScene } = {}) {
	if (!combatant) return null;
	const snapshot = snapshotFight(combat, { scene, viewer, users, canvasScene });
	const entry = snapshot?.result.byFighter[combatant.id];
	return entry ? { ...snapshot, combatant, entry } : null;
}
