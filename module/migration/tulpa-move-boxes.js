// The beautiful scroll's reverse, brought up to the printed card (Book II p.527).
//
// The book boxes four of the tulpa's five moves: the first is always its own and the player picks
// 2 of the other four. The shipped text printed all five as bare ▶ lines, so a summoned tulpa got
// every one. The four boxes now sit after the three instinct boxes, and a card's marks are stored
// by index, so a Cost ticked before that (9 to 11) would read as a move. BOX_LAYOUT_CHANGES in
// CharacterArcana.js carries the change; CharacterArcana#settleBoxLayouts moves a character's
// marks once and records that it has, in the same update.
//
// Because that record makes settling safe to repeat, it runs from two places:
//   • the primary GM, across every character, once per version (settleAllArcanumBoxLayouts), and
//   • each player, across the characters they own, on every load (settleOwnArcanumBoxLayouts),
//     so a player who loads before the GM never sees, or ticks, the new card over old marks.
// Every write to such a card settles it first too (setArcanumBoxChecked), so no path can tick a
// box against the new text while older marks are still waiting to move.

/**
 * @param {object} [options]
 * @param {Iterable} [options.actors]
 * @returns {Promise<number>} how many characters were written to
 */
export async function settleAllArcanumBoxLayouts({ actors = globalThis.game?.actors ?? [] } = {}) {
	let written = 0;
	for (const actor of actors) {
		if (actor?.type !== "character") continue;
		if (await actor.typedActor?.settleArcanumBoxLayouts?.()) written += 1;
	}
	return written;
}

/**
 * The characters this user can write, settled. A player's own client, on load: a GM's world
 * sweep covers everyone else.
 */
export async function settleOwnArcanumBoxLayouts({ actors = globalThis.game?.actors ?? [] } = {}) {
	const own = [...actors].filter(actor => actor?.isOwner);
	return settleAllArcanumBoxLayouts({ actors: own });
}
