// Shared plumbing for the steading residents-table column features (drag-resize in
// resizable-columns.js and click-to-sort in sortable-columns.js). Both resolve the same
// header/list sub-elements of a `.steading-residents-table` and persist a per-table value
// to localStorage behind the same try/catch, so that logic lives here once.

/**
 * Resolve a `.steading-residents-table` wrapper into its header and list rows.
 * @returns {{header: HTMLElement, list: HTMLElement}|null} null when either is missing.
 */
export function resolveResidentsGrid(table) {
	const header = table?.querySelector(":scope > .steading-residents-header");
	const list = table?.querySelector(":scope > .steading-residents-list");
	if (!header || !list) return null;
	return { header, list };
}

/** Parse a stored column value; null on missing/corrupt/unavailable storage. */
export function readStoredColumnState(storageId) {
	try { return JSON.parse(localStorage.getItem(storageId) ?? "null"); }
	catch (_err) { return null; }
}

/** Persist a column value (or remove it when null); swallows quota/availability errors. */
export function writeStoredColumnState(storageId, value) {
	try {
		if (value == null) localStorage.removeItem(storageId);
		else localStorage.setItem(storageId, JSON.stringify(value));
	} catch (_err) { /* ignore quota/availability errors */ }
}
