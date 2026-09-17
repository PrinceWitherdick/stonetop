// The fight's extra damage, offered to a damage roll before it is rolled.
//
// Book I p.414: "When multiple combatants deal damage to a single foe, roll one combatant's damage
// (usually the best one) and add +1 extra damage for each capable attacker after the first." The fight
// already knows who is attacking whom (engagements.js), so a damage roll against a foe several people
// are fighting opens with that +N filled in and named, and a counter-attack from several foes on one
// character carries it too.
//
// A SEED, NOT A RULING. It is ticked and labelled in the damage window, where the roller can untick it,
// and it is named on the damage card, where whoever presses Apply can leave it off. The book's own
// example waives it ("Didn't I cut the first one down before it could hurt me?" "Good point.", p.415),
// and a table that agrees with that needs one click, not a hand-edited HP box.
//
// ONLY FOR A SINGLE FOE, as the sentence says: a token standing for a crew or a horde is several foes,
// and fighting it is the group rules' business (the tab offers those). And only with the Fight tab on:
// with it off there is no fight record to read, and nothing here builds a seed.
//
// The seed is plain data, carried through the damage window, the roll and the card's flags:
//   { bonus, count, direction: "onFoe"|"onHero", target, names, label, pill, pillLeftOff, cite, applied }

import { pileOnBonus } from "../data/follower-build.js";
import { isFightTabEnabled } from "../settings.js";
import { format, localize } from "../utils/i18n.js";
import { HEROES, FOES } from "./engagements.js";
import { engagementFor, engagementOf, fightOnScene } from "./fight-state.js";
import { namesPhrase } from "./fight-copy.js";

const KEY = "stonetop.fight.seed";

/**
 * A seed's words, built once when it is made so every client shows the same sentence.
 *
 * @param {object} p
 * @param {number} p.count        attackers (bodies) on the target, the roller included
 * @param {"onFoe"|"onHero"} p.direction  a party hitting a foe, or foes hitting a party member
 * @param {string} p.target       who is being hit
 * @param {string[]} p.names      who is doing the hitting
 */
export function makeSeed({ count, direction, target, names }) {
	const bonus = pileOnBonus(count).bonus;
	if (bonus < 1) return null;
	const who = namesPhrase(names, format);
	const label = direction === "onHero"
		? format(`${KEY}.onHero`, { bonus, target, names: who })
		: format(`${KEY}.${count === 2 ? "onFoeTwo" : "onFoe"}`, { bonus, target, names: who });
	const pill = format(`${KEY}.${direction === "onHero" ? "pillOnHero" : "pillOnFoe"}`, { bonus, count });
	return {
		bonus, count, direction, target, names: [...names],
		label,
		pill,
		pillLeftOff: format(`${KEY}.leftOff`, { pill }),
		cite: localize(`${KEY}.cite`),
		applied: true,
	};
}

/** The fighter a snapshot has for a combatant id, or null. */
const fighterIn = (snapshot, id) => snapshot?.fighters?.find(f => f.id === id) ?? null;

/** Sum of bodies over fighter ids, from a snapshot. */
const bodiesOf = (snapshot, ids) => ids.reduce((sum, id) => sum + (fighterIn(snapshot, id)?.bodies ?? 0), 0);

/** Names over fighter ids, from a snapshot. */
const namesOf = (snapshot, ids) => ids.map(id => fighterIn(snapshot, id)?.name).filter(Boolean);

/** The combatant standing for an actor in a fight, matched as a linked token is: by actor id. */
function combatantForActor(combat, scene, actor) {
	if (!combat || !scene || !actor) return null;
	const tokenId = actor.token?.id ?? null;
	return [...(combat.combatants ?? [])].find(c => c.sceneId === scene.id
		&& (tokenId ? c.tokenId === tokenId : c.actorId === actor.id)) ?? null;
}

/**
 * A party member's attack on one foe: the foe's other attackers, and the roller.
 *
 * The roller counts once whether or not their own token is in the fight (a Clash rolled from the sheet
 * with a foe targeted is still an attack on that foe), and a foe fought by nobody else gets no seed.
 *
 * @param {object} p
 * @param {Actor} p.attacker
 * @param {{uuid: string}} p.target  the one foe, as the attack card froze it
 * @returns {object|null}
 */
export function outgoingSeed({ attacker, target }) {
	if (!isFightTabEnabled() || !attacker || !target?.uuid) return null;
	let tokenDoc = null;
	try { tokenDoc = globalThis.fromUuidSync?.(target.uuid, { strict: false }) ?? null; } catch { return null; }
	if (tokenDoc?.documentName !== "Token") return null;
	const found = engagementFor(tokenDoc);
	if (!found) return null;
	const foe = fighterIn(found, found.combatant.id);
	if (foe?.side !== FOES || foe.bodies !== 1) return null;

	const rollerCombatant = combatantForActor(found.combat, found.scene, attacker);
	const attackers = found.entry.attackers;
	const rollerIn = rollerCombatant && attackers.includes(rollerCombatant.id);
	const count = bodiesOf(found, attackers) + (rollerIn ? 0 : 1);
	if (count < 2) return null;
	const names = namesOf(found, attackers);
	if (!rollerIn) names.unshift(attacker.name);
	return makeSeed({ count, direction: "onFoe", target: foe.name, names });
}

/**
 * Foes striking one party member: every foe in contact with them. Foes do not target, so contact is
 * all the fight can know about who is hitting a character, and the foe the character clashed with is
 * in contact already.
 *
 * @param {object} p
 * @param {Actor} p.pc
 * @param {object|null} [p.found]  pcEngagement(pc), when the caller already has it
 * @returns {object|null}
 */
export function incomingSeed({ pc, found = pcEngagement(pc) }) {
	if (!found) return null;
	const hero = fighterIn(found, found.combatant.id);
	if (hero?.side !== HEROES || hero.bodies !== 1) return null;
	const count = found.entry.attackerBodies;
	if (count < 2) return null;
	return makeSeed({ count, direction: "onHero", target: hero.name, names: namesOf(found, found.entry.attackers) });
}

/** A character's place in the fight on the canvas scene, or null. */
export function pcEngagement(pc) {
	if (!isFightTabEnabled() || !pc) return null;
	const scene = globalThis.canvas?.scene ?? null;
	const combat = fightOnScene(scene);
	return engagementOf(combat, scene, combatantForActor(combat, scene, pc));
}

/**
 * The foes a character is in contact with, as tokens: who "your enemy" is when a counter-attack
 * comes with nothing targeted.
 *
 * @returns {Array<{uuid: string, name: string, actorId: string|null, disposition: number, hasActor: boolean}>}
 */
export function engagedFoeTargets(pc, found = pcEngagement(pc)) {
	if (!found) return [];
	return found.entry.melee
		.map(id => found.combatants.get(id))
		.filter(c => c?.token)
		.map(c => ({ uuid: c.token.uuid, name: c.name || c.token.name, actorId: c.actorId ?? null, disposition: c.token.disposition ?? 0, hasActor: !!c.actor }));
}

/**
 * A monster's or NPC's damage, rolled from its token's sheet, when that token is fighting exactly one
 * opponent: the other fighters on its side attacking that same opponent, and itself.
 *
 * @param {object} p
 * @param {Actor} p.actor  the sheet's actor (a token's own actor, for an unlinked token)
 * @returns {object|null}
 */
export function sheetSeed({ actor }) {
	if (!isFightTabEnabled() || !actor) return null;
	const scene = globalThis.canvas?.scene ?? null;
	const tokenDoc = actor.token
		?? (actor.getActiveTokens?.(false, true) ?? []).filter(t => t?.parent?.id === scene?.id)
			.reduce((only, t, i) => (i === 0 ? t : null), null);
	if (!tokenDoc) return null;
	const found = engagementFor(tokenDoc);
	if (!found) return null;
	const self = fighterIn(found, found.combatant.id);
	const opponents = [...new Set([...found.entry.melee, ...found.entry.shootingAt])];
	if (!self || opponents.length !== 1) return null;
	const opponent = fighterIn(found, opponents[0]);
	if (!opponent || opponent.bodies !== 1) return null;
	const { attackers, attackerBodies: count } = found.result.byFighter[opponent.id];
	if (count < 2) return null;
	return makeSeed({
		count,
		direction: opponent.side === HEROES ? "onHero" : "onFoe",
		target: opponent.name,
		names: namesOf(found, attackers),
	});
}
