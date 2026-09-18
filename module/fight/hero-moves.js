// Playbook moves that change a blow in a fight, read off the fight on the map.
//
// Most of what a character's moves do in a fight is fiction, and stays the table's. These change a number
// the damage card is about to write, or a die a foe is about to roll, and the fight already knows the
// facts they turn on:
//  • UNDAUNTED (Would-Be Hero): "When you are outnumbered or facing a foe bigger than you, you get +1 armor
//    and deal +1d6 damage." Outnumbered is the fight's count: more than one on them, or more foes than
//    heroes in their engagement. Bigger is the stat block's size, large or huge.
//  • BIG DAMN HERO (Would-Be Hero): "When you Defend, you can spend 1 Readiness to lock eyes with an
//    attacker; they have disadvantage on damage rolls against you and your ward for the rest of the fight."
//    Kept on the hero's combatant, so it ends with the fight. The ward is whoever stands beside the hero:
//    the fight has no record of who a character is protecting, and a Defend is made for the people right
//    there.
// The Defend spends on the damage card (Parry & Riposte, Steadfast Guardian, A Mighty Rampart) are in
// defend-spend.js.

import { SYSTEM_ID } from "../system-id.js";
import { format } from "../utils/i18n.js";
import { ownsMoveNamed } from "../actors/character/owns-move.js";
import { HEROES, touching } from "./engagements.js";
import { fightOnScene, gridOf } from "./fight-state.js";
import { rollerEngagement } from "./damage-seed.js";

export const HERO_MOVES = Object.freeze({
	PARRY: "Parry & Riposte",
	SECOND_INTENT: "Second Intent",
	STEADFAST: "Steadfast Guardian",
	RAMPART: "A Mighty Rampart",
	BIG_DAMN_HERO: "Big Damn Hero",
	UNDAUNTED: "Undaunted",
});

/** The foes a hero has locked eyes with (Big Damn Hero), as combatant ids on the hero's combatant. */
export const LOCKED_EYES_FLAG = "lockedEyes";

/** Sizes bigger than a person, as a stat block records them. */
const BIGGER = new Set(["large", "huge"]);

/** Everyone an engagement entry is fighting, near or far: its melee, who it shoots, and who shoots it. */
const opponentIds = entry => [...new Set([...entry.melee, ...entry.shootingAt, ...entry.shotBy])];

/** Whether a combatant's actor is bigger than a person: a large or huge stat block. */
function isBigger(combatant) {
	const system = combatant?.actor?.system ?? {};
	if (BIGGER.has(String(system.size ?? "").toLowerCase())) return true;
	return String(system.tags ?? "").split(",").some(tag => BIGGER.has(tag.trim().toLowerCase()));
}

/**
 * Whether Undaunted is on for this character right now, and why: "outnumbered" or "bigger". Null when
 * they do not have the move, are not in a fight on the map, or neither holds. PURE apart from the fight.
 *
 * @param {Actor} actor
 * @param {object|null} [found]  engagementOf's answer for them, when the caller has it
 * @returns {null|"outnumbered"|"bigger"}
 */
export function undauntedNow(actor, found = undefined) {
	if (!ownsMoveNamed(actor, HERO_MOVES.UNDAUNTED)) return null;
	const place = found === undefined ? rollerEngagement(actor) : found;
	if (!place) return null;
	const { entry, result, combatant } = place;
	const bodiesOf = id => place.fighters.find(f => f.id === id)?.bodies ?? 0;
	const cluster = result.clusters.find(c => c.heroIds.includes(combatant.id));
	const heroes = (cluster?.heroIds ?? []).reduce((n, id) => n + bodiesOf(id), 0);
	const foes = (cluster?.foeIds ?? []).reduce((n, id) => n + bodiesOf(id), 0);
	if (entry.attackerBodies >= 2 || (cluster && foes > heroes)) return "outnumbered";
	return opponentIds(entry).some(id => isBigger(place.combatants.get(id))) ? "bigger" : null;
}

/** Undaunted's +1d6, as the damage window offers it, or null when it is not on. */
export function undauntedOffer(actor) {
	const why = undauntedNow(actor);
	if (!why) return null;
	return {
		key: "undaunted",
		dice: "1d6",
		label: format(`stonetop.fight.heroMoves.undaunted.${why}`, {}),
		pill: format("stonetop.fight.heroMoves.undaunted.pill", {}),
		applied: true,
	};
}

/** The foes in the fight a character could lock eyes with: whoever they are fighting, near or far. */
export function lockEyesCandidates(actor) {
	const place = rollerEngagement(actor);
	if (!place) return [];
	const locked = new Set(place.combatant.flags?.[SYSTEM_ID]?.[LOCKED_EYES_FLAG] ?? []);
	return opponentIds(place.entry).filter(id => !locked.has(id)).map(id => place.combatants.get(id)).filter(Boolean);
}

/**
 * Lock eyes with a foe: the hero's combatant keeps its id, and the foe rolls damage against the hero and
 * their ward with disadvantage from now on. Returns whether it was written.
 */
export async function lockEyes(actor, foeCombatantId) {
	const mine = rollerEngagement(actor)?.combatant;
	if (!mine || !foeCombatantId) return false;
	const had = mine.flags?.[SYSTEM_ID]?.[LOCKED_EYES_FLAG] ?? [];
	if (had.includes(foeCombatantId)) return false;
	await mine.update({ [`flags.${SYSTEM_ID}.${LOCKED_EYES_FLAG}`]: [...had, foeCombatantId] });
	return true;
}

/**
 * The heroes whose locked eyes put a foe's damage roll at disadvantage against these targets: a target who
 * locked eyes with the roller, or who stands beside a hero who did. Empty when none.
 *
 * @param {Actor} foe  the roller
 * @param {Array<{uuid: string}>} targets
 * @returns {string[]} the heroes' names
 */
export function eyesLockedAgainst(foe, targets = []) {
	if (!targets?.length) return [];
	// Asked on every aimed damage roll, by anyone: the fight is only worked out once somebody in it has
	// locked eyes with a foe.
	const combatants = [...(fightOnScene(globalThis.canvas?.scene ?? null)?.combatants ?? [])];
	if (!combatants.some(c => c.flags?.[SYSTEM_ID]?.[LOCKED_EYES_FLAG]?.length)) return [];
	const place = rollerEngagement(foe);
	if (!place) return [];
	const byUuid = new Map([...place.combatants.values()].map(c => [c.token?.uuid, c]));
	const fighter = id => place.fighters.find(f => f.id === id);
	const grid = gridOf(place.scene);
	const lockers = place.fighters.filter(f => f.side === HEROES
		&& (place.combatants.get(f.id)?.flags?.[SYSTEM_ID]?.[LOCKED_EYES_FLAG] ?? []).includes(place.combatant.id));
	const names = [];
	for (const target of targets) {
		const hit = byUuid.get(target?.uuid);
		const hitFighter = hit ? fighter(hit.id) : null;
		if (!hitFighter) continue;
		for (const hero of lockers) {
			if (hero.id === hitFighter.id || touching(hero, hitFighter, grid)) {
				if (!names.includes(hero.name)) names.push(hero.name);
			}
		}
	}
	return names;
}
