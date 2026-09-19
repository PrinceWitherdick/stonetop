// One line per chat card for everything this client writes to its damage flag: an Apply, a Readiness
// spend, the fight's +N toggle. Each reads the card when its turn comes, so none writes over what
// another just wrote. On the GM's client this lines up the GM's own presses with players' relayed ones
// (combat/attack-flow.js#handleApplyQuery, fight/defend-spend.js#handleSpendQuery).

/** message id -> the last queued write's promise. */
const queue = new Map();

/**
 * Run `work` once every write already queued for this card on this client has finished.
 *
 * @template T
 * @param {ChatMessage} message
 * @param {() => Promise<T>} work
 * @returns {Promise<T>}
 */
export function inCardTurn(message, work) {
	const id = message?.id ?? null;
	const run = (queue.get(id) ?? Promise.resolve()).catch(() => {}).then(work);
	queue.set(id, run);
	// The last in line lets go of the card; one queued behind it keeps the entry.
	return run.finally(() => { if (queue.get(id) === run) queue.delete(id); });
}
