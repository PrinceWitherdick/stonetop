// A crew member (or a custom group's member) a lone blow drops in a fight gets the fate dialog (Book I
// p.469), as one dropped from the sheet's own HP box does.
//
// The blow is written by whoever applies the damage card, which is the GM's client whenever a player's
// press is relayed (combat/attack-flow.js#handleApplyQuery), and the fate is the Marshal's player's to
// answer. So the roster write carries the fate as an update option (fight/group-hits.js
// #ROSTER_FATE_OPTION; Foundry hands update options to every client with the update), and the one
// client that answers for the Marshal opens it: their player, else any player who owns them, else the
// GM (hooks/DeathsDoorPrompt.js#answersFor), the same rungs the dying walkthrough climbs.
//
// Not twice: the sheet's HP box opens the dialog itself and writes without the option, and only the
// answering client acts on it.

import { ROSTER_FATE_OPTION } from "./group-hits.js";
import { answersFor } from "../hooks/DeathsDoorPrompt.js";

/**
 * `updateActor`: open the fate dialog a roster write asked for, on the client that answers for the
 * character. Returns whether this client opened it.
 *
 * @param {Actor} actor
 * @param {object} _changes
 * @param {object} [options]  the update's options; `options[ROSTER_FATE_OPTION]` is the fate to ask
 * @param {string} [_userId]
 * @param {{answers?: Function}} [deps]  for the tests
 * @returns {boolean}
 */
export function onUpdateActorRosterFate(actor, _changes, options = {}, _userId = null, { answers = answersFor } = {}) {
	const fate = options?.[ROSTER_FATE_OPTION];
	if (!fate || actor?.type !== "character") return false;
	try {
		if (!answers(actor)) return false;
		const sheet = actor.sheet;
		if (typeof sheet?._openFollowerFate !== "function") return false;
		sheet._openFollowerFate(fate);
		return true;
	} catch (err) {
		console.error("Stonetop | Could not open the roster member's fate:", err);
		return false;
	}
}

/** Registered once, at module scope in stonetop.js. */
export function registerRosterFateHooks() {
	Hooks.on("updateActor", onUpdateActorRosterFate);
}
