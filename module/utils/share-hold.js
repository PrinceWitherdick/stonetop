// "Other PCs hold 1 Blessing" (Piety), "each ally holds N Inspiration" (We Happy Few): a character hands
// a hold to the characters beside them. A player cannot write another player's character, so the ones
// this client owns are written here and the rest go to the GM's client in ONE query, whose handler
// checks the asker plays the giver and has the move learned, then writes each (holdForEach). The giver
// is never their own ally.

/**
 * Hand `hold` to each of `targets` this client owns; `relay(rest)` asks the GM's client for the others
 * and answers the uuids it reached.
 *
 * @param {Actor} giver
 * @param {Actor[]} targets
 * @param {object} p
 * @param {(target: Actor) => Promise<void>} p.hold
 * @param {(targets: Actor[]) => Promise<string[]>} p.relay
 * @returns {Promise<{given: Actor[], missed: Actor[]}>}  who holds it now, and who could not be reached
 */
export async function shareHold(giver, targets, { hold, relay }) {
	const given = [];
	const relayed = [];
	for (const target of targets ?? []) {
		if (target?.type !== "character" || target.id === giver?.id) continue;
		if (target.isOwner) {
			await hold(target);
			given.push(target);
		} else relayed.push(target);
	}
	const done = relayed.length ? await relay(relayed) : [];
	const reached = Array.isArray(done) ? done : [];
	return { given: [...given, ...relayed.filter(t => reached.includes(t.uuid))], missed: relayed.filter(t => !reached.includes(t.uuid)) };
}

/**
 * The GM's side, once the query's handler has checked who asked: `hold` for each character `targetUuids`
 * names, the giver skipped. Answers the uuids given it.
 *
 * @param {Actor} giver
 * @param {unknown} targetUuids  the query's list, as sent
 * @param {(target: Actor) => Promise<void>} hold
 * @param {(uuid: string) => Actor|null} resolve
 * @returns {Promise<string[]>}
 */
export async function holdForEach(giver, targetUuids, hold, resolve) {
	const done = [];
	for (const uuid of Array.isArray(targetUuids) ? targetUuids : []) {
		const target = typeof uuid === "string" ? resolve(uuid) : null;
		if (target?.type !== "character" || target.id === giver.id) continue;
		await hold(target);
		done.push(target.uuid);
	}
	return done;
}
