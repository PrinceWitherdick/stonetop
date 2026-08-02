import { rebuildPeopleArt, plannedPeopleArtRebuilds } from "./rebuild-crops.js";
import { publishPeopleArtIndexes } from "./reapply.js";
import { repointPeopleSquares } from "./repoint-portraits.js";

/**
 * Cut every portrait this world could have from the art it already holds, then point what is
 * already in play at it. The one path all three entry points take.
 *
 * There are three because ONE was not enough. The offer is a whispered chat card, and
 * offer-once.js latches its flag the moment that card is POSTED — not when it is clicked, which
 * is deliberate (a GM who says yes and then hits an error must not be re-asked the whole
 * question). The cost of that is a card scrolled past, deleted, or landing on whichever of two
 * GMs happened to be primary is a card gone for good. For the crop rebuild that only ever meant
 * missing a nicety. For squares it means upgrading, seeing nothing change, and having no way to
 * ask again — so the work is also reachable from the Welcome guide's Book Art step and from
 * `game.stonetop.rebuildPortraits()`.
 *
 * Safe to run repeatedly by construction: every stage re-plans against what is on disk, so a
 * second run cuts only what is genuinely missing and re-points only what has not moved yet.
 */
export async function runPeopleArtRebuild({ onProgress = null } = {}) {
	const art = await rebuildPeopleArt({ onProgress });
	// Publishes peopleArt AND peoplePortraitArt from what just landed. Has to happen between the
	// two: the re-point reads the square index to know which squares actually exist, and would
	// otherwise point portraits at files this run only just created and has not indexed yet.
	await publishPeopleArtIndexes();
	let repointed = 0;
	try {
		repointed = (await repointPeopleSquares()).changes;
	} catch (err) {
		// Never fails the rebuild. The files are cut and the gallery works either way, and
		// running again retries this half on its own.
		console.error("Stonetop | could not re-point existing portraits:", err);
	}
	return { ...art, repointed };
}

/** How much there is to do, without doing any of it. Drives whether an entry point offers at all. */
export async function countPeopleArtRebuilds() {
	try {
		return (await plannedPeopleArtRebuilds()).length;
	} catch (err) {
		console.error("Stonetop | could not count rebuildable portrait art:", err);
		return 0;
	}
}

const SPINNER = '<i class="fas fa-spinner fa-spin"></i>';

/**
 * Drive the rebuild from a button, which is how two of the three entry points reach it (the chat
 * card in stonetop.js, the Welcome guide's Book Art step).
 *
 * Owns everything those two agreed on when they were separate copies: disable so an impatient
 * second click cannot start a duplicate pass over the same 140-odd images, swap the label for a
 * spinner that counts, notify with describeRebuild, and put the label back if it threw. Same
 * disable/try/notify/restore contract as chronicle.js's saveChronicleFromButton.
 *
 * On success the button is left DISABLED with the spinner still on it: what a finished run should
 * say differs per caller (the chat card latches to "Rebuilt N", the Welcome guide re-renders the
 * whole step away), so the final word belongs to them.
 *
 * @returns {Promise<object|null>}  the run's result, or null if it threw (already reported).
 */
export async function runPeopleArtRebuildFromButton(btn) {
	const label = btn?.innerHTML;
	if (btn) { btn.disabled = true; btn.innerHTML = `${SPINNER} Rebuilding…`; }
	try {
		const res = await runPeopleArtRebuild({
			onProgress: (done, total) => {
				if (btn) btn.innerHTML = `${SPINNER} Rebuilding… ${done}/${total}`;
			},
		});
		ui.notifications?.[res.failed ? "warn" : "info"]?.(describeRebuild(res));
		return res;
	} catch (err) {
		console.error("Stonetop | portrait rebuild failed:", err);
		ui.notifications?.error?.("Portrait rebuild failed — see the console.");
		if (btn) { btn.disabled = false; btn.innerHTML = label; }
		return null;
	}
}

/** What to tell the GM afterwards. Every entry point says the same thing about the same run. */
export function describeRebuild(res) {
	const n = res?.written ?? 0;
	const bits = [`Rebuilt ${n} portrait${n === 1 ? "" : "s"} from art already on disk.`];
	if (res?.repointed) {
		bits.push(res.repointed === 1
			? "1 portrait already in play now uses its close-up."
			: `${res.repointed} portraits already in play now use their close-up.`);
	}
	if (res?.failed) bits.push(`${res.failed} could not be read (see the console).`);
	return bits.join(" ");
}
