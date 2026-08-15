/**
 * "Does this character own move X?" — the one answer, for every playbook feature that asks.
 *
 * The `type === "move"` check is the whole point, and it is the reason this is shared rather
 * than re-typed per feature: an inventory item, an arcanum, or a follower's gear may legally
 * carry the same name as a move, and none of them grant it. A feature that forgets the type
 * check lights its icon for the wrong sheet, and it fails quietly — nobody notices until a
 * player names a sword after a move.
 *
 * Pure: no Foundry global is touched, so every caller stays testable with a plain object.
 */

/** Does this actor own a MOVE by that exact name? */
export function ownsMoveNamed(actor, name) {
	return !!actor?.items?.some(i => i.type === "move" && i.name === name);
}

/**
 * The owned move Item itself, or undefined. For callers that need something off the document —
 * a resource `max`, a description — rather than just whether it is there.
 */
export function ownedMove(actor, name) {
	return (actor?.items ?? []).find(i => i.type === "move" && i.name === name);
}

/** Every move name this character owns, as a Set, for callers testing several names at once. */
export function ownedMoveNames(actor) {
	return new Set((actor?.items ?? []).filter(i => i.type === "move").map(i => i.name));
}

/**
 * Does this actor own ANY of `names`?
 *
 * `owned` is an optional pre-built Set from `ownedMoveNames`, for callers resolving several of
 * these in one go: the character sheet's getData asks five separate ownership questions per
 * render, and each one answering for itself walks the whole item collection again.
 *
 * Without a Set this stays the short-circuiting `some(ownsMoveNamed)` it was, deliberately —
 * building a Set to test one or two names costs more than the scan it would replace.
 */
export function ownsAnyMoveNamed(actor, names, owned = null) {
	return owned ? names.some(name => owned.has(name))
	             : names.some(name => ownsMoveNamed(actor, name));
}
