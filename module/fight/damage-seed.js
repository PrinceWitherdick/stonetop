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
// and fighting it is the group rules' business. And only with the Fight tab on: with it off there is
// no fight record to read, and nothing here builds a seed.
//
// GROUP AGAINST GROUP (p.416) gets a seed of its own, on a group token's damage rolled from its sheet
// (a monster fighting as a group, or a crew with a headcount): "If one group outnumbers the other, they
// get a +1 bonus to damage and armor for every multiplier past 1." The bigger group's roll opens with
// +N damage; the smaller group's opens with -N, which is the bigger group's +N armor taken off the roll,
// since a stat block's damage card has nothing that applies armor. Both are counted over the groups in
// the engagement only: "Foes that are engaged by individual PCs aren't really part of a group."
//
// The seed is plain data, carried through the damage window, the roll and the card's flags:
//   { bonus, count, direction: "onFoe"|"onHero", target, names, label, pill, pillLeftOff, cite, applied }

import { outnumberBonus, pileOnBonus } from "../data/follower-build.js";
import { isFightTabEnabled } from "../settings.js";
import { format, localize } from "../utils/i18n.js";
import { HEROES, FOES } from "./engagements.js";
import { engagementFor, engagementOf, fightOnScene, combatantBodies, combatantSide, sideInfoFor } from "./fight-state.js";
import { classifySide } from "./fight-sides.js";
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

/**
 * A group's seed in a group-against-group exchange, or null when neither side outnumbers the other.
 *
 * @param {object} p
 * @param {number} p.yours   bodies in the roller's side's groups
 * @param {number} p.theirs  bodies in the other side's groups
 */
export function makeGroupSeed({ yours, theirs }) {
	const ahead = outnumberBonus(yours, theirs).bonus;
	const behind = outnumberBonus(theirs, yours).bonus;
	if (ahead < 1 && behind < 1) return null;
	const data = { yours, theirs };
	const direction = ahead > 0 ? "groupAhead" : "groupBehind";
	const bonus = ahead > 0 ? ahead : -behind;
	const pill = format(`${KEY}.${direction === "groupAhead" ? "pillAhead" : "pillBehind"}`, { ...data, bonus: Math.abs(bonus) });
	return {
		bonus, count: yours, direction, target: "", names: [],
		label: format(`${KEY}.${direction}`, { ...data, bonus: Math.abs(bonus) }),
		pill,
		pillLeftOff: format(`${KEY}.leftOff`, { pill }),
		cite: localize(`${KEY}.citeGroups`),
		applied: true,
	};
}

/** The group-against-group seed for a fighter in a snapshot, or null. See the note at the top. */
function groupSeedFor(found, self) {
	const cluster = found.result.clusters.find(c => c.heroIds.includes(self.id) || c.foeIds.includes(self.id));
	const groups = cluster?.groups;
	if (!groups) return null;
	const [yours, theirs] = self.side === HEROES
		? [groups.heroGroupBodies, groups.foeGroupBodies]
		: [groups.foeGroupBodies, groups.heroGroupBodies];
	return makeGroupSeed({ yours, theirs });
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
 * The ONE combatant a roller stands as on `scene`, or null.
 *
 * An unlinked token's actor is its token's combatant. Any other actor is the combatant for that actor,
 * when there is exactly one: a stat block opened from the sidebar with three of its tokens in the fight
 * could be any of them, and guessing would aim a roll from the wrong place.
 */
export function rollerCombatant(combat, scene, actor) {
	if (!combat || !scene || !actor) return null;
	const here = [...(combat.combatants ?? [])].filter(c => c.sceneId === scene.id);
	const tokenId = actor.token?.id ?? null;
	if (tokenId) return here.find(c => c.tokenId === tokenId) ?? null;
	const mine = here.filter(c => c.actorId === actor.id);
	return mine.length === 1 ? mine[0] : null;
}

/**
 * Everyone else attacking one fighter, and the roller: the p.414 pile-on on that one target.
 *
 * The roller counts once whether or not their own token is in the fight (a Clash rolled from the sheet
 * with a foe targeted is still an attack on that foe), and a target fought by nobody else gets no seed.
 *
 * @param {object} p
 * @param {Actor} p.attacker
 * @param {{uuid: string}} p.target  the one target, as the card froze it
 * @param {"heroes"|"foes"} p.against  the side the target has to be on
 */
function pileOnSeed({ attacker, target, against }) {
	let tokenDoc = null;
	try { tokenDoc = globalThis.fromUuidSync?.(target.uuid, { strict: false }) ?? null; } catch { return null; }
	if (tokenDoc?.documentName !== "Token") return null;
	const found = engagementFor(tokenDoc);
	if (!found) return null;
	const victim = fighterIn(found, found.combatant.id);
	if (victim?.side !== against || victim.bodies !== 1) return null;

	const roller = combatantForActor(found.combat, found.scene, attacker);
	const attackers = found.entry.attackers;
	const rollerIn = roller && attackers.includes(roller.id);
	const count = bodiesOf(found, attackers) + (rollerIn ? 0 : 1);
	if (count < 2) return null;
	const names = namesOf(found, attackers);
	if (!rollerIn) names.unshift(attacker.name);
	return makeSeed({ count, direction: against === HEROES ? "onHero" : "onFoe", target: victim.name, names });
}

/**
 * The fight's +N for a damage roll about to hit `targets`, whichever side is rolling it, or null.
 *
 * A GROUP TOKEN takes the group-against-group seed (p.416) whoever it hits, and never a pile-on, exactly
 * as its sheet always has (see sheetSeed). Anyone else gets the pile-on (p.414) against ONE target: a
 * foe for a hero, a hero for a foe. Several targets get none, because the damage against each is rolled
 * separately and one card carries one +N.
 *
 * @param {object} p
 * @param {Actor} p.attacker
 * @param {Array<{uuid: string, hasActor?: boolean}>} p.targets  who the roll hits
 * @returns {object|null}
 */
export function seedForRoll({ attacker, targets = [] }) {
	if (!isFightTabEnabled() || !attacker) return null;
	const scene = globalThis.canvas?.scene ?? null;
	const combat = fightOnScene(scene);
	const roller = rollerCombatant(combat, scene, attacker);
	// Only a group token needs the fight worked out here; everyone else's seed reads the target's.
	if (roller && combatantBodies(roller).bodies > 1) {
		const found = engagementOf(combat, scene, roller);
		const self = fighterIn(found, roller.id);
		if (self?.bodies > 1) return groupSeedFor(found, self);
	}
	const applyable = (targets ?? []).filter(t => t?.hasActor !== false && t?.uuid);
	if (applyable.length !== 1) return null;
	// Someone outside the fight rolls as the side they would join on: a character as a hero.
	const side = roller ? combatantSide(roller) : classifySide(sideInfoFor(attacker))?.side ?? null;
	return pileOnSeed({ attacker, target: applyable[0], against: side === FOES ? HEROES : FOES });
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
 * opponent: the other fighters on its side attacking that same opponent, and itself. A token standing
 * for a group gets the group-against-group seed instead, when its engagement is one.
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
	// A group in a group-against-group exchange takes that rule's seed, and never a pile-on's.
	if (self?.bodies > 1) return groupSeedFor(found, self);
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
