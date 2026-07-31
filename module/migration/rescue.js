/**
 * Phase 1, run late: repair a world that arrived on this system without its data.
 *
 * The rename is three phases (see run.js and finish-run.js), and only the middle one is
 * visible from outside: re-pointing `world.json`. Anyone who performs that step by hand,
 * which is the only way to do it on a hosted Foundry, moves the world without ever copying
 * the campaign into the new namespace. The result is a world that launches cleanly, reports
 * the right system, and opens every sheet blank apart from its default selections, because
 * the data is still filed under the old id. Nothing is lost, and it looks exactly like loss.
 *
 * The assistant's hosted mode now offers phase 1 as its own button, so this should stop
 * happening. It does not help the worlds it already happened to, and it does not help anyone
 * who edits `world.json` without reading anything, which is the whole population that hits
 * this. So the renamed system checks on its own and repairs itself.
 *
 * Runs BEFORE finish-run's sweep, deliberately: this copies a flag bag verbatim, stale asset
 * paths and all, and the sweep is what rewrites those. Doing it the other way round would
 * leave the freshly copied bag pointing at `systems/<oldId>/` for another whole launch.
 */

import { SYSTEM_ID } from "../system-id.js";
import { RESCUABLE_SOURCE_IDS } from "./compat.js";
import { previewFlags } from "./copy-flags.js";
import { prepareWorld } from "./run.js";
import { list } from "./world-scan.js";
import { FINISH_SETTING } from "./finish-run.js";
import { setSetting } from "../settings.js";
import { isPrimaryGM } from "../utils/primary-gm.js";

/**
 * World collections the sentinel scans. Every one is already in memory when Ready fires.
 *
 * Deliberately not the full target list: that one loads every document of every unlocked
 * world compendium, which is far too expensive to pay on every launch, and this runs on
 * every launch. Actors alone would cover the reported failure, but not a prep world holding
 * only journals and scenes, and walking the collections already resident costs nothing.
 *
 * Embedded documents are not scanned, and do not need to be: a stranded page implies a
 * stranded world, and the repair itself walks everything.
 */
export const SENTINEL_COLLECTIONS = Object.freeze(["actors", "items", "journal", "scenes", "macros", "tables"]);

/**
 * The newest prior id this world still has un-copied data under, or null.
 *
 * Asks the same question the migration asks, through the same code, so "would phase 1 do
 * anything here?" cannot drift from "does phase 1 do anything here?". No ACTOR_FLAG_OPTIONS:
 * the legacy fold changes what a copy MERGES, never whether there is one to make, so passing
 * it here would only imply a distinction the sentinel does not draw.
 */
export function findStrandedScope(game, { sources = RESCUABLE_SOURCE_IDS, target = SYSTEM_ID } = {}) {
	for (const source of sources) {
		if (source === target) continue;
		for (const key of SENTINEL_COLLECTIONS) {
			const { pending } = previewFlags(list(game?.[key]), { source, target });
			if (pending) return source;
		}
	}
	return null;
}

/**
 * Copy a stranded world into the active scope. The same phase 1 the assistant runs, from
 * the other side of the rename.
 *
 * Settings are filled in rather than overwritten. By the time this runs the world has been
 * live on the new id for at least one session, so a value already under the new id is the
 * GM's current choice and the one under the old id is a fossil. The flag copy needs no such
 * care: it skips any document already stamped as cut over, so a healthy document is never a
 * candidate in the first place.
 */
export async function rescueStrandedWorld(game, { source, target = SYSTEM_ID, onProgress } = {}) {
	const result = await prepareWorld(game, { source, target, overwriteSettings: false, onProgress });

	// The sweep in finish-run is stamped once per world, so a world that already ran it would
	// never re-sweep the bag we just created. Clearing the stamp makes the next sweep
	// unconditional, which is cheaper than reasoning about which build wrote what in which
	// order. The sweep is idempotent, so a needless re-run costs only time.
	//
	// Not allowed to fail the run. By this point the campaign has already been copied, which
	// is the part that matters and the part that is hard to redo: the sentinel will not fire
	// again, so throwing here would report a repair that plainly worked as having failed, and
	// leave nothing to retry. A stale stamp only costs one deferred sweep.
	try {
		await setSetting(FINISH_SETTING, "");
	} catch (err) {
		console.error("Stonetop | rescue could not clear the sweep stamp; asset paths may need another launch", err);
	}
	return result;
}

/**
 * The Ready-hook entry point. Gated to the primary GM, and to a world that actually needs it.
 *
 * No prompt, deliberately. This is not a choice a GM can make well: declining leaves a world
 * that reads as destroyed, and accepting only restores what was already sitting there.
 */
export async function maybeRescueStrandedWorld(game = globalThis.game) {
	// isPrimaryGM() alone is true when NO GM is connected, so a lone player would run the
	// whole copy and then fail on the first world write.
	if (!game?.user?.isGM || !isPrimaryGM()) return { ran: false, reason: "not-primary-gm" };

	const source = findStrandedScope(game);
	if (!source) return { ran: false, reason: "nothing-stranded" };

	console.warn(`Stonetop | this world's data is still filed under "${source}". Copying it into "${SYSTEM_ID}" now.`);

	// world-scan skips locked world compendiums rather than unlocking them behind the GM's
	// back, so a locked pack holding Stonetop data is silently left stranded. Say so.
	const locked = list(game?.packs).filter((p) => p?.metadata?.packageType === "world" && p.locked);
	if (locked.length) {
		console.warn("Stonetop | skipping locked world compendium(s):", locked.map((p) => p.metadata?.label ?? p.collection));
	}

	const result = await rescueStrandedWorld(game, { source });
	console.log("Stonetop | system-id rescue:", JSON.stringify(result));

	ui.notifications?.info?.(
		"Stonetop found this world's campaign data still stored under the old system ID and has copied it across. Press F5 to reload once.",
		{ permanent: true }
	);
	return { ran: true, source, ...result };
}
