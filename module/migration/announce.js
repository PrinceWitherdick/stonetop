import { RENAME_TARGET_ID } from "../system-id.js";
import { fetchTargetManifest } from "./flip.js";
import { MigrationAssistant } from "./MigrationAssistant.js";

// Offers the system-id migration once per session, and only once the renamed system is
// actually installed — the assistant is useless before that, and nagging a GM who has
// not installed it yet is just noise.
//
// Deliberately session-scoped (a module-level flag) rather than a stored setting: a
// client-scope setting leaks across worlds in the same browser, and a world-scope one
// would need migrating by the very thing it gates.

let offeredThisSession = false;

/** Is the renamed system present on this server? Never throws — absent is the normal case. */
export async function renamedSystemInstalled(fetchImpl = globalThis.fetch, target = RENAME_TARGET_ID) {
	try {
		return (await fetchTargetManifest(target, fetchImpl))?.id === target;
	} catch {
		return false;
	}
}

export async function maybeOfferMigration({ fetchImpl, force = false, target = RENAME_TARGET_ID } = {}) {
	if (!game.user?.isGM) return false;
	if (offeredThisSession && !force) return false;
	if (!(await renamedSystemInstalled(fetchImpl ?? globalThis.fetch.bind(globalThis), target))) return false;

	offeredThisSession = true;
	MigrationAssistant.open();
	return true;
}

/** Test seam. */
export function resetMigrationOffer() {
	offeredThisSession = false;
}
