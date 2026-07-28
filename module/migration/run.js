/**
 * Sequences the system-id migration.
 *
 * Phase 1 is additive and reversible: every flag bag and setting is COPIED into the new
 * namespace and nothing is deleted, so until the flip the world is still a fully working
 * old-system world. Phase 2 is the one irreversible click. There is deliberately no stop
 * point between them: a world that has been prepared but not flipped is just a world
 * with some extra unread flags, and offering to stop there only invites confusion.
 *
 * Destructive rewrites (asset paths, compendiumSource stamps, core.sheetClasses) belong
 * to the NEW system's first launch, not here. Doing them now would break map-pin labels,
 * bestiary portrait detection, the journal update channel and every sheet default while
 * the old system is still the one running.
 */

import { SYSTEM_ID, RENAME_TARGET_ID } from "../system-id.js";
import { copyFlags, previewFlags } from "./copy-flags.js";
import { copySettings, copyLocalStorage, planSettingCopies } from "./copy-settings.js";
import { collectTargets, collectWorldPackTargets } from "./world-scan.js";
import { flipWorldSystem, verifyFlip, shutdownWorld } from "./flip.js";

/** Settings documents live in a collection the ClientSettings API refuses to expose. */
export function worldSettingDocs(game) {
	const storage = game?.settings?.storage?.get?.("world");
	return storage ? [...storage] : [];
}

/**
 * Every place in this world that can carry our flags. One definition, so the preview and
 * the run can never disagree about what the migration covers.
 */
export async function allTargets(game) {
	return [...collectTargets(game), ...(await collectWorldPackTargets(game))];
}

/**
 * A read-only report of what the migration would do. Safe to run at any time.
 *
 * `options.targets` reuses a list the caller already built — worth doing here because
 * building one loads every document of every unlocked world compendium. A target list is
 * a SNAPSHOT, so only pass one that was built moments ago; prepareWorld deliberately
 * builds its own rather than inheriting the assistant's, which may be a session old.
 */
export async function previewMigration(game, options = {}) {
	const { source = SYSTEM_ID, target = RENAME_TARGET_ID } = options;
	const targets = options.targets ?? await allTargets(game);

	let documents = 0;
	let alreadyDone = 0;
	for (const entry of targets) {
		const { pending, alreadyDone: done } = previewFlags(entry.docs, { source, target, ...entry.flagOptions });
		documents += pending;
		alreadyDone += done;
	}

	const settingsPlan = planSettingCopies(worldSettingDocs(game), { source, target });
	return {
		documents,
		alreadyDone,
		settings: settingsPlan.creates.length + settingsPlan.updates.length,
		locations: targets.length
	};
}

/**
 * Phase 1. Copies everything into the new namespace. Reversible: nothing is deleted and
 * the world still runs on the old system afterwards.
 *
 * Scans the world itself unless a caller passes `options.targets`. Do not hand it a list
 * built earlier in the session: documents created since would be silently skipped.
 */
export async function prepareWorld(game, options = {}) {
	const { source = SYSTEM_ID, target = RENAME_TARGET_ID, storage = globalThis.localStorage, onProgress } = options;
	const copyOptions = { source, target };

	const targets = options.targets ?? await allTargets(game);
	let documents = 0;
	let index = 0;

	for (const entry of targets) {
		index += 1;
		onProgress?.({ phase: "documents", label: entry.label, index, total: targets.length });
		// Per-target flag options (the actor-only legacy fold) ride on the target itself,
		// so the preview and the run apply exactly the same rules to the same documents.
		const result = await copyFlags(entry.docs, entry.apply, { ...copyOptions, ...entry.flagOptions });
		documents += result.updated;
	}

	onProgress?.({ phase: "settings", label: "World settings", index: targets.length, total: targets.length });
	const settingDocs = worldSettingDocs(game);
	const settingClass = game?.settings?.storage?.get?.("world")?.documentClass;
	const settings = await copySettings(settingDocs, {
		create: (docs) => settingClass.createDocuments(docs),
		update: (docs) => settingClass.updateDocuments(docs)
	}, copyOptions);

	const local = copyLocalStorage(storage, copyOptions);
	return { documents, settings, local, locations: targets.length };
}

/**
 * Phase 2. The irreversible step, followed immediately by a shutdown. Never let the
 * session continue past a successful flip: `game.world` now points at the new system
 * while the loaded packs and `game.system` are still the old one.
 */
export async function flipAndShutDown(game, options = {}) {
	const { target = RENAME_TARGET_ID, fetchImpl, onProgress } = options;

	onProgress?.({ phase: "flip", label: "Re-pointing this world at the renamed system" });
	const flipped = await flipWorldSystem({ game, target, fetchImpl });
	if (!flipped.ok) return { ok: false, stage: "flip", error: flipped.error };

	const confirmed = await verifyFlip({ worldId: game?.world?.id, target, fetchImpl });
	if (!confirmed.ok) return { ok: false, stage: "verify", error: confirmed.error };

	onProgress?.({ phase: "shutdown", label: "Returning to the setup screen" });
	const down = await shutdownWorld(game, options);
	// A failed shutdown is not a failed migration: world.json is already correct. Say so
	// rather than implying the flip did not happen. But it is NOT nothing either — the
	// session is now running past the flip, so the message has to be a stop sign, not a
	// footnote.
	if (!down.ok) {
		// One message for every way the shutdown can fail, because the consequence is the
		// same in all of them: the session is now running past the flip, with world.json
		// already pointing at the renamed system.
		const detail = down.error ? ` (${down.error})` : "";
		return {
			ok: true,
			stage: "shutdown",
			warning: `This world has already been moved to the renamed system, but Foundry did not return to the setup screen${detail}. Do not keep playing: close Foundry, start it again, and launch the world.`
		};
	}
	return { ok: true, stage: "done" };
}

// There is deliberately no whole-run wrapper here. MigrationAssistant gates on preflight()
// in _check() and then calls prepareWorld + flipAndShutDown itself, so a second sequencer
// would only be a copy of that order waiting to drift out of step with it.
