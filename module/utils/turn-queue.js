// Read-modify-write against a Foundry document is not safe to run twice at once: both copies read the
// same "before", and the second write lands on top of the first as though it had never happened. A
// checkbox is exactly where that happens, because two of them can be pressed inside one round trip.
//
// So the writes that share a document take turns. One line per key, on this client.

/** key -> the last queued write's promise. */
const queue = new Map();

/**
 * Run `work` once every job already queued under `key` on this client has finished.
 *
 * A rejected job does not block the line: the next one runs regardless, and the rejection still
 * reaches whoever awaited it.
 *
 * @template T
 * @param {string|null} key
 * @param {() => Promise<T>} work
 * @returns {Promise<T>}
 */
export function inTurn(key, work) {
	const run = (queue.get(key) ?? Promise.resolve()).catch(() => {}).then(work);
	queue.set(key, run);
	// The last in line lets go of the key; one queued behind it keeps the entry.
	return run.finally(() => { if (queue.get(key) === run) queue.delete(key); });
}
