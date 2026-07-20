// Where the Book II art the GM imported lives, and how a manifest `out` path resolves
// against it.
//
// Two sides depend on this agreeing exactly: the apply pass (reapply.js) browses the folder
// to learn which files are on disk, and treasure-drops.js points a dragged item at a file
// that pass said was there. Resolve the path two different ways and the index reports "on
// disk" while the item points somewhere else — a broken image with nothing to catch it. So
// the root rule, its default, and `${root}/${out}` live here and nowhere else.

export const DEFAULT_ROOT = "stonetop-book-art";

/**
 * The configured durable art folder, with trailing slashes normalized away so `${root}/${out}`
 * never yields a double slash — which wouldn't match the paths FilePicker.browse returns, and
 * would silently no-op the whole apply pass.
 *
 * Tolerant of a missing/unregistered setting: treasure-drops.js is unit-tested outside Foundry,
 * and a world on an older system version hasn't registered these settings yet.
 */
export function book2ArtRoot() {
	let configured = null;
	try {
		configured = globalThis.game?.settings?.get?.("stonetop_pwd", "book2ArtRoot");
	} catch (_) { /* setting not registered in this world */ }
	return String(configured || DEFAULT_ROOT).replace(/\/+$/, "");
}

/** Fully-qualified path of one manifest `out` path inside the durable folder. */
export function book2ArtSrc(out) {
	return `${book2ArtRoot()}/${out}`;
}
