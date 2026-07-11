import { resolveResidentsGrid, readStoredColumnState, writeStoredColumnState } from "./steading-column-util.js";

const STORAGE_PREFIX = "stonetop_pwd.columnSort.";

/**
 * Lets users click the column headers of a `.steading-residents-table` (the
 * grid-based Players/Residents/Neighbors tables on the steading sheet) to sort
 * the rows ascending/descending on that column, and persists the chosen sort in
 * localStorage so it survives re-renders (editing a cell re-renders the sheet).
 *
 * The sort is purely visual: rows are reordered in the DOM but each row keeps
 * its original `data-index`, so edits and deletes still target the right entry
 * in the underlying flag array. Empty placeholder "add" rows (blank name) always
 * sink to the bottom in their original order, never mixed into the sort.
 *
 * Clicking a column cycles: unsorted -> ascending -> descending -> ascending...
 * Clicking a different column starts it ascending.
 *
 * @param {HTMLElement} table       - the `.steading-residents-table` wrapper
 * @param {string}      storageKey  - unique key (e.g. "players", "residents", "neighbors")
 */
export function makeColumnsSortable(table, storageKey) {
	const grid = resolveResidentsGrid(table);
	if (!grid) return;
	const { header, list } = grid;

	// Sortable columns are every header cell that carries a label; the trailing
	// actions column has none and is skipped.
	const headerCells = Array.from(header.children)
		.filter(cell => cell.querySelector(":scope > .steading-residents-header-label"));
	if (!headerCells.length) return;

	const columnKey = cell => {
		// The col-name class (e.g. "steading-residents-col-occupation") is shared
		// between a header cell and its matching row cells, so it doubles as the
		// per-column sort key and the selector for reading each row's value.
		const cls = Array.from(cell.classList).find(c =>
			c.startsWith("steading-residents-col-") && c !== "steading-residents-col-resizable" && c !== "steading-residents-col-sortable");
		return cls ?? null;
	};

	const storageId = `${STORAGE_PREFIX}${storageKey}`;
	let state = null;
	const saved = readStoredColumnState(storageId);
	if (saved && typeof saved.col === "string" && (saved.dir === "asc" || saved.dir === "desc")) state = saved;

	const persist = () => writeStoredColumnState(storageId, state);

	const valueOf = (row, colClass) => {
		const cell = row.querySelector(`:scope > .${colClass}`);
		if (!cell) return "";
		const input = cell.querySelector("input");
		const raw = input ? input.value : cell.textContent;
		return (raw ?? "").trim();
	};

	const nameClass = "steading-residents-col-name";

	const applySort = () => {
		const rows = Array.from(list.querySelectorAll(":scope > .steading-residents-row"));
		// Decorate each row ONCE with its name and its active-column value, so the comparator
		// and the placeholder split read cached primitives instead of re-querying the DOM on
		// every comparison (which was O(n log n) querySelectors per sort).
		const decorated = rows.map(row => ({
			row,
			name: valueOf(row, nameClass),
			key: state ? valueOf(row, state.col) : "",
		}));
		// Blank-name rows are the edit-mode "add" placeholders; keep them pinned at the
		// bottom in DOM order and only sort the real entries above them.
		const placeholders = decorated.filter(d => d.name === "");
		const real = decorated.filter(d => d.name !== "");

		if (state) {
			const dir = state.dir === "desc" ? -1 : 1;
			real.sort((a, b) => {
				// Blank values in the sorted column sink to the bottom regardless of direction.
				if (a.key === "" && b.key !== "") return 1;
				if (b.key === "" && a.key !== "") return -1;
				return dir * a.key.localeCompare(b.key, undefined, { numeric: true, sensitivity: "base" });
			});
		}

		// Only touch the DOM when the order actually changes — the common unsorted re-render
		// (template already renders placeholders last) then costs nothing.
		const ordered = [...real, ...placeholders];
		if (ordered.some((d, i) => d.row !== rows[i])) {
			for (const d of ordered) list.appendChild(d.row);
		}
	};

	const updateIndicators = () => {
		for (const cell of headerCells) {
			const key = columnKey(cell);
			const active = state && key === state.col;
			cell.classList.toggle("is-sorted", !!active);
			cell.classList.toggle("is-sorted-asc", !!active && state.dir === "asc");
			cell.classList.toggle("is-sorted-desc", !!active && state.dir === "desc");
			const icon = cell.querySelector(":scope > .steading-residents-sort-icon");
			if (icon) {
				icon.className = "fas steading-residents-sort-icon "
					+ (active ? (state.dir === "asc" ? "fa-sort-up" : "fa-sort-down") : "fa-sort");
			}
		}
	};

	for (const cell of headerCells) {
		const key = columnKey(cell);
		if (!key) continue;
		cell.classList.add("steading-residents-col-sortable");
		// The icon sits beside the label (not inside it) so the label keeps its own
		// ellipsis truncation when the column is dragged narrow.
		if (!cell.querySelector(":scope > .steading-residents-sort-icon")) {
			const icon = document.createElement("i");
			icon.className = "fas fa-sort steading-residents-sort-icon";
			cell.appendChild(icon);
		}
		cell.addEventListener("click", ev => {
			// Ignore clicks that land on the drag-resize handle at the cell's edge.
			if (ev.target.closest(".steading-col-resize-handle")) return;
			if (state && state.col === key) {
				state.dir = state.dir === "asc" ? "desc" : "asc";
			} else {
				state = { col: key, dir: "asc" };
			}
			persist();
			applySort();
			updateIndicators();
		});
	}

	applySort();
	updateIndicators();
}
