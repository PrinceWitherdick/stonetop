// One fighter's blow landing on a token that stands for a whole group.
//
// A group fought as one (p.416) has "HP and armor as though it was one individual member of the group",
// and "damage represents casualties". That is the arithmetic for a group trading blows with another group.
// A single fighter swinging into it is something else: "Foes that are engaged by individual PCs aren't
// really part of a group" (p.416), and Rhianna, cutting her way through six crinwin, drops the first and
// leaves the second "up but injured" (p.415). Taken off the pool, the same 3 damage from her would put all
// twelve crinwin of a horde out at once, because the pool is only one crinwin's 3 HP.
//
// SO A LONE ATTACKER'S BLOW HITS ONE MEMBER. It is measured against one member's HP (the pool's maximum):
// enough to drop them, and one fewer stands (the group's size goes down by one); short of that, the member
// is hurt, and the harm is kept on the token until the next lone blow finishes them. One blow drops one
// member however hard it lands: the others are not in the way of it. The pool itself is left to the group
// exchanges it was made for.
//
// A GROUP'S BLOW ON A GROUP stays on the pool, as the book has it, and so does anything aimed at a token
// that is not fighting as a group.

import { SYSTEM_ID } from "../system-id.js";
import { isFightTabEnabled } from "../settings.js";
import { groupCasualties } from "../data/follower-build.js";
import { fightsAsGroup } from "./fight-sides.js";
import { fightOnScene, combatantBodies, GROUP_SIZE_FLAG, groupStartSize } from "./fight-state.js";
import { rollerCombatant } from "./damage-seed.js";

/** The flag holding the HP the group's currently hurt member has lost. */
export const GROUP_WOUND_FLAG = "groupWound";

// The size a group started at (GROUP_SIZE_FLAG, groupStartSize) lives in fight-state.js, which counts bodies.
export { GROUP_SIZE_FLAG, groupStartSize };

/** The HP a group's hurt member has lost, as kept on its token's actor. */
export const groupWound = actor => Math.max(0, Math.trunc(Number(actor?.flags?.[SYSTEM_ID]?.[GROUP_WOUND_FLAG]) || 0));

/**
 * A group token's numbers, or null for a token that is not one group of several: a monster fighting
 * as a group, with more than one of them left.
 *
 * @param {Actor} actor  the token's actor
 * @returns {{hpMax: number, hp: number, count: number, standing: number, wound: number}|null}
 */
export function groupTokenInfo(actor) {
	const system = actor?.system ?? {};
	if (!fightsAsGroup({ type: actor?.type, fightAsGroup: system.fightAsGroup, organization: system.organization })) return null;
	const hpMax = Math.trunc(Number(system.attributes?.hp?.max) || 0);
	const count = Math.trunc(Number(system.count) || 0);
	if (hpMax <= 0 || count <= 1) return null;
	const hp = Number.isFinite(Number(system.attributes?.hp?.value)) ? Number(system.attributes.hp.value) : hpMax;
	const { standing } = groupCasualties({ hpMax, hpCurrent: hp, count });
	if (standing <= 1) return null;
	return { hpMax, hp, count, standing, wound: groupWound(actor) };
}

/**
 * What one lone blow does to one member of a group. PURE.
 *
 * @param {{hpMax: number, count: number, wound: number}} group
 * @param {number} damage  after armor
 * @returns {{down: boolean, harmed: boolean, count: number, wound: number, memberHp: number}}
 *   `harmed` is false for a blow that did no damage, `count` is the group's size afterwards, `wound` the
 *   hurt member's HP lost afterwards, and `memberHp` what that member has left (0 when they went down).
 */
export function memberHit({ hpMax, count, wound = 0 }, damage) {
	const dealt = Math.max(0, Math.round(Number(damage) || 0));
	const lost = Math.max(0, Math.trunc(Number(wound) || 0)) + dealt;
	if (dealt > 0 && lost >= hpMax) return { down: true, harmed: true, count: Math.max(0, count - 1), wound: 0, memberHp: 0 };
	return { down: false, harmed: dealt > 0, count, wound: lost, memberHp: Math.max(0, hpMax - lost) };
}

/**
 * Whether the attacker behind a damage card is itself a group on the map: a token standing for more than
 * one body in the fight where `scene` is. Anyone else, including an attacker the fight cannot place, is a
 * lone attacker.
 *
 * @param {Actor|null} attacker
 * @param {Scene|null} scene  the scene the target stands on
 */
function attackerIsGroup(attacker, scene) {
	if (!attacker || !scene) return false;
	const combat = fightOnScene(scene);
	const combatant = rollerCombatant(combat, scene, attacker);
	return !!combatant && combatantBodies(combatant).bodies > 1;
}

/**
 * Whether damage from `attacker` onto `targetActor` is a lone blow into a group (see the note at the top):
 * the Fight tab on, the target a group token, and the attacker not a group.
 */
export function isLoneBlowOnGroup(targetActor, attacker, scene) {
	if (!isFightTabEnabled()) return false;
	return !!groupTokenInfo(targetActor) && !attackerIsGroup(attacker, scene);
}

/**
 * Land a lone blow on a group token: one member down (the size falls by one) or hurt (kept on the token).
 * Returns what happened, or null when the token is not a group of several.
 *
 * @param {Actor} targetActor
 * @param {number} damage  after armor
 */
export async function applyMemberHit(targetActor, damage) {
	const group = groupTokenInfo(targetActor);
	if (!group) return null;
	const hit = memberHit(group, damage);
	const update = {};
	if (hit.count !== group.count) update["system.count"] = hit.count;
	if (hit.wound !== group.wound) update[`flags.${SYSTEM_ID}.${GROUP_WOUND_FLAG}`] = hit.wound;
	// The first to go down: keep the size the group started at (GROUP_SIZE_FLAG).
	if (hit.down && groupStartSize(targetActor) < group.count) update[`flags.${SYSTEM_ID}.${GROUP_SIZE_FLAG}`] = group.count;
	if (Object.keys(update).length) await targetActor.update(update);
	const after = groupCasualties({ hpMax: group.hpMax, hpCurrent: group.hp, count: hit.count });
	return { ...hit, before: group.standing, after: after.standing, hpMax: group.hpMax };
}
