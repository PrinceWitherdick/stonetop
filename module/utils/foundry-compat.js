// Version shims for Foundry APIs that moved or changed across v12–v14. Keeping the
// branching in one place means new call sites pick the right form automatically and
// a future "drop v12" cleanup is a single edit rather than a hunt.

/**
 * Resolve a drag event's payload. V13 moved TextEditor under
 * `foundry.applications.ux` and deprecated the bare global; prefer the namespaced
 * implementation, fall back to the global on older cores.
 * @param {DragEvent} ev
 */
export function getDragEventData(ev) {
	const textEditor = foundry?.applications?.ux?.TextEditor?.implementation;
	return textEditor?.getDragEventData?.(ev) ?? globalThis.TextEditor?.getDragEventData?.(ev);
}

/**
 * Does this path point at a video rather than a still image? V13 moved VideoHelper under
 * `foundry.helpers.media`; fall back to the global, then to the extension list core itself
 * uses (which also covers a headless test with no Foundry globals at all).
 * @param {string} path
 * @returns {boolean}
 */
export function hasVideoExtension(path) {
	const helper = globalThis.foundry?.helpers?.media?.VideoHelper ?? globalThis.VideoHelper;
	if (typeof helper?.hasVideoExtension === "function") return !!helper.hasVideoExtension(path);
	return /\.(webm|mp4|m4v|ogv)(\?|#|$)/i.test(String(path));
}

/**
 * The configured FilePicker class. V13 moved it under `foundry.applications.apps` and routes
 * subclassing through `.implementation`; older cores expose the bare global. Returns undefined
 * in a headless test with no Foundry globals, so callers can guard.
 * @returns {typeof FilePicker|undefined}
 */
export function filePicker() {
	const moved = globalThis.foundry?.applications?.apps?.FilePicker;
	return moved?.implementation ?? moved ?? globalThis.FilePicker;
}

/**
 * Repoint one key of a rendered Application's `options`. ApplicationV2 hands out a frozen
 * options object (`this.options = Object.freeze(...)`), so assigning a key through it throws
 * under strict mode — but the field holding it is a plain writable property, so swap in a
 * fresh frozen copy. AppV1 windows keep a mutable object and are written in place. Needed
 * because a re-render reads its state back off `options`, so a change that skips it is lost.
 * @param {Application} app
 * @param {string} key
 * @param {*} value
 */
export function setAppOption(app, key, value) {
	const options = app?.options;
	if (!options) return;
	if (Object.isFrozen(options)) app.options = Object.freeze({ ...options, [key]: value });
	else options[key] = value;
}

/**
 * Enrich stored HTML for display (resolves `@UUID` links, inline rolls, etc.).
 * V13 moved TextEditor under `foundry.applications.ux`; on older cores (or before
 * it's ready) fall back to the raw value so callers always get a usable string.
 * @param {string} value
 * @param {object} [options]  Passed through to TextEditor.enrichHTML (e.g. `{ secrets: false }`).
 * @returns {Promise<string>}
 */
export async function enrichHTML(value, options) {
	const textEditor = foundry?.applications?.ux?.TextEditor;
	if (!textEditor?.enrichHTML) return value ?? "";
	return textEditor.enrichHTML(value ?? "", options);
}

/**
 * Build the `document.update()` entry that deletes `keyPath`. Only **v14+** removes a
 * key when the update value is a fresh `new ForcedDeletion()` INSTANCE (the core deletes
 * a key only when its value is `instanceof ForcedDeletion`), and only v14+ warns on the
 * legacy `-=` syntax. v13 exposes the same operator class, but a nested ForcedDeletion
 * value passed to `Document#update` for an object-typed flag is NOT applied there — the
 * key silently survives with no error (this is why followers wouldn't delete/hand off on
 * v13). v13 and earlier delete reliably via the `-=` leaf-key prefix, which the codebase
 * already uses directly elsewhere. So reach for the operator only on v14+ (gated on the
 * running generation, not merely the class's existence) and use `-=` below it. Returns
 * `[updateKey, value]` for whichever form this core actually applies.
 * @param {string} keyPath  Dotted path to the key to delete (e.g. "flags.stonetop.checks.c1").
 * @returns {[string, *]}
 */
export function deletionEntry(keyPath) {
	const ForcedDeletion = foundry.data?.operators?.ForcedDeletion;
	const generation = Number(globalThis.game?.release?.generation) || 0;
	if (ForcedDeletion && generation >= 14) return [keyPath, new ForcedDeletion()];
	const i = keyPath.lastIndexOf(".");
	return [`${keyPath.slice(0, i + 1)}-=${keyPath.slice(i + 1)}`, null];
}

/**
 * The compendium-source uuid a world document was imported from: v14 stamps
 * `_stats.compendiumSource` at import time; older cores used the legacy `flags.core.sourceId`
 * flag. Returns null for a hand-made world document that never came from a compendium.
 * Works on real Documents and on plain index rows (reads properties, never calls the doc).
 * @param {object} doc
 * @returns {string|null}
 */
export function compendiumSourceOf(doc) {
	return doc?._stats?.compendiumSource ?? doc?.flags?.core?.sourceId ?? null;
}
