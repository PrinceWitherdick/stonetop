/**
 * Re-map a child job's own 0–1 progress onto a slice of its parent's bar.
 *
 * A multi-phase import (read the compendium, remap the cross-links, fingerprint what
 * landed) has each phase reporting 0–1 for itself while the window shows one bar. Without
 * this, every phase writes its own `from + fraction * width` by hand — three spellings of
 * the same arithmetic, at least one of which ends up deriving its share by subtracting the
 * others, so retuning the layout means recomputing the tail in your head.
 *
 * Phases are given as `[from, to]` BOUNDARIES rather than widths, so a set of them visibly
 * tiles 0–1 and a gap or an overlap is something you can see rather than something you have
 * to add up.
 *
 * Returns undefined when there is no parent reporter, so the child's `onProgress?.(…)`
 * short-circuits and an un-narrated run builds no progress objects or detail strings at all.
 *
 * @param {((p: {fraction: number, detail?: string}) => void)|undefined} onProgress  the parent reporter
 * @param {[number, number]} bounds  this phase's slice of the parent bar
 * @returns {((p: {fraction?: number, detail?: string}) => void)|undefined}
 */
export function progressSlice(onProgress, [from, to]) {
	if (!onProgress) return undefined;
	return ({ fraction = 0, detail } = {}) => onProgress({ fraction: from + fraction * (to - from), detail });
}

/**
 * Split `[from, to]` into `count` equal, consecutive slices — for a phase that is itself a
 * loop over N children, each reporting 0–1 for its own share (one compendium pack of
 * several, say). Returns a function of the child's index.
 *
 * @param {[number, number]} bounds
 * @param {number} count
 * @returns {(index: number) => [number, number]}
 */
export function progressSubSlice([from, to], count) {
	const span = (to - from) / (count || 1);
	return (index) => [from + index * span, from + (index + 1) * span];
}

// The bar layout shared by the two single-pack seeds (SeedActors, SeedItems), which have the
// same shape: build the folder tree one folder at a time, then create every document in one
// bulk call. Only the folder pass has per-item motion to report, so it owns the head of the
// bar; the bulk create is one long call, so the rest is a single jump. Named here rather
// than spelled out in both seeds, which otherwise agree on these numbers by coincidence.
export const SEED_FOLDER_PHASE = [0, 0.34];
export const SEED_BULK_CREATE_FRACTION = 0.5;
