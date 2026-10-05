import { SYSTEM_ID } from "../system-id.js";
import { adjustXp } from "./xp.js";
import { speakerActor } from "./speaker-actor.js";
import { canRewriteCard } from "./chat.js";

// Taking back the XP a miss just marked.
//
// The receipt a miss posts ("+1 XP (16 / 8)") carries an Undo, because the commonest way to mark
// XP wrongly is to roll the wrong move, or to roll it for the wrong character. Before this the
// only remedy was to type the total back into the sheet by hand, which is a second chance to get
// it wrong and leaves the ledger reading as though the XP was earned and then quietly edited
// away rather than never earned at all.
//
// IT TAKES BACK A DELTA, NOT A REMEMBERED TOTAL. Undoing a mark from ten minutes ago must not
// wipe out what has happened since, and `-1` composes with everything in between where restoring
// a snapshot would overwrite it. The write goes through the same per-character queue as every
// other XP change (utils/xp.js), so an undo racing a fresh mark cannot lose either of them.
//
// ONCE, AND ONCE IS ENFORCED ON THE MESSAGE. Disabling the button only stops a second click on
// this screen: the card re-renders on every other client, and again after every reload, and each
// of those would hand back a fresh enabled button. The flag is what makes it stay undone.

/** The message flag stamped at creation, holding how much this card marked. */
export const XP_MARK_FLAG = "xpMark";
/** The latch. Its presence means this card's XP has already been handed back. */
export const XP_UNDONE_FLAG = "xpMarkUndone";
/** On a miss's receipt: the id of the roll card whose miss it marked (roll-engine.js#reconcileMissXp). */
export const XP_MARK_FOR_FLAG = "xpMarkFor";
/** On a roll card: its miss earns XP (a character's roll, and the move does not say otherwise). */
export const MISS_XP_FLAG = "missXp";

/**
 * Hand back what a receipt marked, once: latch the card, then take the XP back through the queue.
 * The one write behind the receipt's Undo and behind a rewritten roll that is no longer a miss.
 *
 * Latched BEFORE the write. A failure after the latch releases it, so the card never reads
 * "undone" with the XP still marked; doing it the other way round means a crash between the two
 * hands the same XP back twice.
 *
 * @returns {Promise<{applied: boolean, after: number, max: number}|null>} null when there was
 *          nothing to take back (already undone, or the card marked nothing)
 */
export async function takeBackXpMark(message, actor, { move = "Undo XP" } = {}) {
	const marked = Number(message?.getFlag?.(SYSTEM_ID, XP_MARK_FLAG) ?? 0);
	if (!marked || message.getFlag(SYSTEM_ID, XP_UNDONE_FLAG)) return null;
	await message.setFlag(SYSTEM_ID, XP_UNDONE_FLAG, true);
	try {
		return await adjustXp(actor, -marked, { move });
	} catch (err) {
		await message.unsetFlag(SYSTEM_ID, XP_UNDONE_FLAG)
			.catch(e => console.error("Stonetop | Could not release the XP undo latch:", e));
		throw err;
	}
}

/**
 * The card's spent state.
 *
 * Both halves matter. The button says what happened and stops being a control; the card stops
 * asserting a total that is no longer true. Without the second, "+1 XP (16 / 8)" goes on sitting
 * in the log as a fact, which is the thing the undo was for.
 */
export function markCardUndone(btn) {
	btn.disabled = true;
	btn.innerHTML = `<i class="fas fa-rotate-left"></i> Undone`;
	// Found from the BUTTON rather than from the message element: the render hook is handed the
	// whole message on some paths and the card on others, and `closest` is right either way.
	btn.closest(".stonetop-xp-mark-card")?.classList.add("is-xp-undone");
}

/**
 * Wire the Undo on an XP receipt. A no-op on every other card.
 *
 * @param {object} message  the ChatMessage
 * @param {HTMLElement} html  its rendered element
 */
export function wireUndoXpMark(message, html) {
	const btn = html?.querySelector?.(".stonetop-xp-undo");
	if (!btn) return;

	const marked = Number(message.getFlag(SYSTEM_ID, XP_MARK_FLAG) ?? 0);
	const actor  = speakerActor(message);
	// Nothing to take back, or not this user's to take. The control goes away rather than sitting
	// there dead: a player looking at somebody else's receipt is not being denied anything, so
	// there is nothing to explain to them.
	if (!marked || !canRewriteCard(message, actor)) { btn.remove(); return; }

	if (message.getFlag(SYSTEM_ID, XP_UNDONE_FLAG)) { markCardUndone(btn); return; }

	// Three guards, because the flag alone is not enough and neither is the button.
	//
	// `inFlight` is the one that actually stops a double click. Writing the flag is itself an
	// await, so two presses landing in the same tick BOTH get past a flag check and BOTH write
	// it, each believing it was first — the flag records that an undo happened, it cannot decide
	// which press owns it. `btn.disabled` does not cover this either: a browser will not fire a
	// disabled button, but a re-entrant call is not a browser.
	let inFlight = false;

	btn.addEventListener("click", async () => {
		if (inFlight) return;
		// Another client may have undone this while the button was on screen, with their
		// re-render not yet here. Cheap to ask, and it turns a doomed write into the right paint.
		if (message.getFlag(SYSTEM_ID, XP_UNDONE_FLAG)) { markCardUndone(btn); return; }

		inFlight = true;
		btn.disabled = true;
		try {
			// takeBackXpMark latches first and releases the latch if the write fails, so a failure
			// never leaves the card reading "undone" with the XP still marked.
			const out = await takeBackXpMark(message, actor);
			// Already at zero: the XP has been spent on a level since, so there is nothing left to
			// hand back. The card is still marked undone, because the mark IS withdrawn, but
			// saying so out loud beats a button that looks like it did nothing.
			if (out) {
				globalThis.ui?.notifications?.info(out.applied
					? `Took back ${marked} XP from ${actor.name}. Now ${out.after} / ${out.max}.`
					: `${actor.name} had no XP left to take back.`);
			}

			markCardUndone(btn);
		} catch (err) {
			console.error("Stonetop | Error undoing a marked XP:", err);
			// The latch is released by now. Re-enabling the button lets the GM try again; the next
			// render reads the flag, not the DOM, and the flag is clear.
			btn.disabled = false;
		} finally {
			// Cleared on both paths. After a success the flag check at the top is what refuses
			// the next press; after a failure this is what lets the GM try again.
			inFlight = false;
		}
	});
}
