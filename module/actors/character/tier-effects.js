// What a roll's TIER does to the character who rolled it, kept in step with the card's tier after the dice.
//
// A handful of moves change the roller's own state by the tier they land on:
//  - We Happy Few's 6- shakes the Marshal's nerves (fight-states.js).
//  - Prepare a Welcome's 10+ regains 1 Surprise (combat/battle-holds.js).
//  - Commune with Aratis's 10+ holds 2 Sanction (roll-boosts.js).
//  - Wielder of the White Flame's 7+ lights the holy light; Luminous Shield's 6- snuffs it (holy-light.js).
//  - Defend holds Readiness by tier (combat/defend-readiness.js).
//
// The tier is not settled when the dice land: a GM's Shift Up/Down, a +1 pressed on the card (Diligence,
// Sanction, Many Hands, a Blessing), Burn Brightly, all move it. So each effect is SETTLED, not fired: told
// the tier and what it did for this card so far, it does or undoes whatever the difference is, and answers
// what it has done now. The answer rides on the card (message flag `tierEffects`), written after the roll
// and after each move of its total, which is what lets a lift undo only what THIS card did: nerves already
// shaken before the roll were not shaken by it, and a lift leaves them.
//
// ONE SEAM for every way the tier moves: stonetop.js calls reconcileTierEffects wherever a card's total is
// rewritten, on whichever client rewrote it (a GM's Shift, the card's own player, or the GM's client
// answering a relayed +1: roll-boosts.js#handleBoostQuery). A client that cannot write the character does
// nothing.

import { SYSTEM_ID } from "../../system-id.js";
import { classifyResult } from "../../utils/roll-engine.js";
import { speakerActor } from "../../utils/speaker-actor.js";
import { shakeNervesOnMiss, setFightState, WE_HAPPY_FEW } from "./fight-states.js";
import { regainSurpriseOnHit, takeBackSurprise, PREPARE_A_WELCOME } from "../../combat/battle-holds.js";
import { holdSanctionOnHit, releaseSanction, sanctionTrack, COMMUNE_WITH_ARATIS } from "./roll-boosts.js";
import { LUMINOUS_SHIELD, WIELDER_OF_THE_WHITE_FLAME } from "./holy-light.js";
import { DEFEND_MOVE } from "../../combat/defend-readiness.js";

/** The message flag holding what a roll's tier effects have done, keyed as TIER_EFFECTS is. */
export const TIER_EFFECTS_FLAG = "tierEffects";

const count = value => Math.max(0, Math.trunc(Number(value) || 0));

/**
 * Each effect: the moves it belongs to, and `settle(actor, move, tier, done)`, which brings the character
 * to what `tier` asks given what this card has `done` so far (undefined at the roll itself), and resolves
 * to what the card has done now.
 */
const TIER_EFFECTS = {
	// true: this card shook the nerves.
	nerves: {
		moves: [WE_HAPPY_FEW],
		async settle(actor, move, tier, done) {
			const wants = tier === "failure";
			if (wants && !done) return shakeNervesOnMiss(actor, { name: move }, tier);
			if (!wants && done) { await setFightState(actor, "nerves", false); return false; }
			return !!done;
		},
	},
	// How many Surprise this card gave back (0 or 1).
	surpriseRegained: {
		moves: [PREPARE_A_WELCOME],
		async settle(actor, move, tier, done) {
			const wants = tier === "success";
			const n = count(done);
			if (wants && !n) return (await regainSurpriseOnHit(actor, { name: move }, tier)) ? 1 : 0;
			if (!wants && n) { await takeBackSurprise(actor, n); return 0; }
			return n;
		},
	},
	// How many Sanction this card filled.
	sanctionFilled: {
		moves: [COMMUNE_WITH_ARATIS],
		async settle(actor, move, tier, done) {
			const wants = tier === "success";
			const n = count(done);
			if (wants && !n) {
				const before = sanctionTrack(actor);
				return before && await holdSanctionOnHit(actor, { name: move }, tier) ? before.max - before.held : 0;
			}
			if (!wants && n) { await releaseSanction(actor, n); return 0; }
			return n;
		},
	},
	// The holy light: true when this card lit it (Wielder), or what it snuffed (Luminous Shield).
	holyLight: {
		moves: [WIELDER_OF_THE_WHITE_FLAME, LUMINOUS_SHIELD],
		settle: (_actor, move, tier, done, character) => character?.settleHolyLightTier?.(move, tier, done) ?? done ?? false,
	},
	// `{prior, set}`: the Readiness held before the roll, and what this card's tier raised it to.
	readiness: {
		moves: [DEFEND_MOVE],
		settle: (_actor, _move, tier, done, character) => character?.settleDefendReadinessTier?.(tier, done) ?? done ?? null,
	},
};

/** The moves whose tier does something to the roller. */
export const TIER_EFFECT_MOVES = Object.freeze([...new Set(Object.values(TIER_EFFECTS).flatMap(e => e.moves))]);

/**
 * Bring the roller to what `tier` asks of `move`, given what the card has `done` so far (null at the roll).
 * Resolves to the card's new record: `{}` for a move with no tier effects.
 *
 * @param {Actor} actor
 * @param {string} move  the move's name, as its card's `move` flag has it
 * @param {"success"|"partial"|"failure"} tier
 * @param {object|null} [done]  the card's `tierEffects` flag
 * @param {object} [options]
 * @param {StonetopCharacter} [options.character]  the actor's character model (default `actor.typedActor`)
 * @returns {Promise<object>}
 */
export async function settleTierEffects(actor, move, tier, done = null, { character = actor?.typedActor } = {}) {
	const record = {};
	for (const [key, effect] of Object.entries(TIER_EFFECTS)) {
		if (!effect.moves.includes(move)) continue;
		record[key] = await effect.settle(actor, move, tier, done?.[key], character);
	}
	return record;
}

/** Write a record on its card, when there is anything to write. Whether it wrote. */
export async function recordTierEffects(message, record, { scope = SYSTEM_ID } = {}) {
	if (!message?.setFlag || !record || !Object.keys(record).length) return false;
	try {
		await message.setFlag(scope, TIER_EFFECTS_FLAG, record);
		return true;
	} catch (err) {
		console.warn("Stonetop | could not note a roll's tier effects on its card", err);
		return false;
	}
}

/**
 * A roll card's total has moved (a Shift, a +1, Burn Brightly): bring its roller to the new tier's
 * effects, undoing only what this card did. A card without the flag was rolled before this was kept (or by
 * a move with no tier effects) and is left alone. Whether anything was written.
 *
 * @param {ChatMessage} message
 * @param {number} total  the card's new total
 * @param {object} [options]
 * @param {Actor|null} [options.actor]  the roller (default: the card's speaker)
 */
export async function reconcileTierEffects(message, total, { actor = undefined, scope = SYSTEM_ID } = {}) {
	const done = message?.getFlag?.(scope, TIER_EFFECTS_FLAG);
	if (!done || typeof done !== "object" || !Number.isFinite(Number(total))) return false;
	const roller = actor === undefined ? speakerActor(message) : actor;
	if (roller?.type !== "character") return false;
	if (roller.isOwner === false) {
		console.warn(`Stonetop | this client cannot write ${roller.name}, so the tier effects of their shifted roll were not brought up to date`);
		return false;
	}
	const move = message.getFlag(scope, "move");
	try {
		const next = await settleTierEffects(roller, move, classifyResult(Number(total)).key, done);
		if (!Object.keys(next).length || JSON.stringify(next) === JSON.stringify(done)) return false;
		return recordTierEffects(message, next, { scope });
	} catch (err) {
		console.error("Stonetop | bringing a shifted roll's tier effects up to date failed", err);
		return false;
	}
}
