import { getSetting, setSetting } from "../settings.js";
import { isPrimaryGM } from "../utils/primary-gm.js";

/**
 * Make a once-per-world offer about art the GM already has on disk.
 *
 * The durable art folder outlives the world it was imported into, so a GM who imported once
 * and then started a fresh campaign has material sitting right there with nothing pointing at
 * it. Each of those gaps gets an offer — rebuild the portrait details from the parents you
 * already have; build the poster-map Scenes from the maps you already have — and every one of
 * them has the same three-part shape, including one rule that is easy to get backwards:
 *
 *   • ASKED ALREADY? Never ask twice. Declining is an answer, and re-asking every load is
 *     nagging;
 *   • ANYTHING TO OFFER? `findWork` returns falsy when there is nothing worth asking about —
 *     what counts as "worth" is the caller's to decide (any rebuildable crop; any map without
 *     its Scene). Nothing to offer means say nothing AND LEAVE THE FLAG UNSET, so a GM who
 *     imports their art next month still gets asked. Latching here is the mistake this helper
 *     exists to make unrepeatable: it is silent, and it costs the GM the offer forever; and
 *   • COULD WE ACTUALLY ASK? `offer` returns false when it could not present at all (chat not
 *     ready this early in the load). That is not an answer either, so it does not latch.
 *
 * The flag is set once `offer` resolves, BEFORE any work the caller does with the answer — so
 * a GM who says yes and then hits an error is not asked the whole question again.
 *
 * @param {{setting: string, findWork: () => Promise<any>, offer: (work: any) => Promise<any>}} spec
 */
export async function offerDurableArtOnce({ setting, findWork, offer }) {
	// ONE GM asks. The latch is world-scoped but it is only written at the END, after findWork
	// and offer have both awaited — so two GMs joining together both pass the check below and
	// both whisper the same card to the GM group. The gate belongs here rather than at each call
	// site: WorldSetup's caller had it and both of Ready.js's did not, which is precisely the
	// asymmetry a shared helper exists to remove.
	//
	// Paired with isGM because isPrimaryGM() alone is true when NO GM is connected, which would
	// let a lone player run it — the same pairing every other world-writing sweep uses.
	if (!game.user?.isGM || !isPrimaryGM()) return;
	if (getSetting(setting)) return;
	const work = await findWork();
	if (!work) return;
	if (await offer(work) === false) return;
	await setSetting(setting, true);
}
