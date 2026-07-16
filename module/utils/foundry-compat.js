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
 * Build the `document.update()` entry that deletes `keyPath`. v13+ wants a fresh
 * `new ForcedDeletion()` INSTANCE as the value at the key (the core removes a key
 * only when its value is `instanceof ForcedDeletion`); it warns on the legacy `-=`
 * syntax. v12 has no such operator and only understands `-=`. Returns
 * `[updateKey, value]` for whichever form this core exposes, so callers stay
 * correct across v12–v14.
 * @param {string} keyPath  Dotted path to the key to delete (e.g. "flags.stonetop.checks.c1").
 * @returns {[string, *]}
 */
export function deletionEntry(keyPath) {
	const ForcedDeletion = foundry.data?.operators?.ForcedDeletion;
	if (ForcedDeletion) return [keyPath, new ForcedDeletion()];
	const i = keyPath.lastIndexOf(".");
	return [`${keyPath.slice(0, i + 1)}-=${keyPath.slice(i + 1)}`, null];
}
