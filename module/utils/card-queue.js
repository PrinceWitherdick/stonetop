// One line per chat card for everything this client writes to its damage flag: an Apply, a Readiness
// spend, the fight's +N toggle. Each reads the card when its turn comes, so none writes over what
// another just wrote. On the GM's client this lines up the GM's own presses with players' relayed ones
// (combat/attack-flow.js#handleApplyQuery, fight/defend-spend.js#handleSpendQuery).

import { inTurn } from "./turn-queue.js";

/**
 * Run `work` once every write already queued for this card on this client has finished.
 *
 * @template T
 * @param {ChatMessage} message
 * @param {() => Promise<T>} work
 * @returns {Promise<T>}
 */
export function inCardTurn(message, work) {
	// Namespaced, because the queue is shared with every other kind of document that takes turns.
	return inTurn(`card:${message?.id ?? null}`, work);
}
