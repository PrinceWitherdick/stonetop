import { StonetopDialog } from "../utils/stonetop-dialog.js";
import { wireTabSearch } from "../utils/tab-search.js";
import { buildFacetGroups, isRowHidden, toggleChip } from "../utils/catalog-filters.js";
import { stripHtmlToText } from "../utils/strings.js";
import { truncateValue } from "../utils/ledger-core.js";

/**
 * Shared shell for the "look through the whole list" browsers: the Arcana browser and the
 * Bestiary & People browser. One window, one skin (the `.stonetop-catalog-*` CSS), one set
 * of gestures — a search box and single-select chip groups that copy the steading
 * improvements bar, click-the-lit-chip-to-clear and all.
 *
 * It exists because those gestures are the whole of a browser and none of its subject. A
 * subclass says WHAT is in the list and HOW each row reads; everything below — loading,
 * chip state, filtering in place, the live count, the empty state, opening a row's sheet —
 * is the same work whatever the list holds.
 *
 * A subclass provides:
 *   _catalogSources()          → [] for a single-list browser, else [{ key, label, icon }]
 *   async _loadRows(source)    → rows for a source (see the row shape below)
 *   _facetGroups(source, rows) → group defs for the filter bar (see utils/catalog-filters.js)
 *   _emptyMessage(source)      → the line shown when everything is filtered out
 *
 * A ROW is the shape templates/dialogs/partials/catalog-row.hbs renders:
 *   { key, uuid, title, img, placeholderImg, marked, inactive, flags[], badges[], note,
 *     summary, search, facets{} }
 * `key` identifies the row within its source (a slug, an id — anything stable). `search` is
 * the prebuilt lowercase index, so a term can reach text the row only shows as a tooltip.
 *
 * Rows are loaded once per source and cached: switching source is a re-render off the cache,
 * and chip clicks don't re-render at all.
 */
export class CatalogBrowserDialog extends StonetopDialog {
	constructor(options = {}) {
		super(options);
		// Lit chip per group, per source — `{ source: { groupKey: chipKey } }`. Kept per
		// source so switching to People and back doesn't quietly drop the monster filters.
		this._active = {};
		this._rowCache = new Map();
		this._source = this._catalogSources()[0]?.key ?? "";
	}

	// ------------------------------------------------------------- subclass contract

	/** Sources this browser can show. Empty for a browser with only one list. */
	_catalogSources() { return []; }

	/** Rows for a source. Called once per source; the result is cached. */
	async _loadRows(_source) { return []; }

	/** Facet group defs for a source, given its already-loaded rows. */
	_facetGroups(_source, _rows) { return []; }

	/** The line shown when the chips and search between them leave nothing. */
	_emptyMessage(_source) { return "Nothing matches those filters."; }

	/** Tooltip + placeholder for the search control. */
	_searchLabels(_source) { return { title: "Search", placeholder: "Filter…" }; }

	// ------------------------------------------------------------- state

	/** The lit chips for the current source, created on first use. */
	get _activeFilters() {
		return this._active[this._source] ??= {};
	}

	async _rowsFor(source) {
		if (!this._rowCache.has(source)) this._rowCache.set(source, await this._loadRows(source));
		return this._rowCache.get(source);
	}

	/**
	 * Drop cached rows so the next render re-reads the world. Pass a source to drop just that
	 * list: an edit to one of them is no reason to re-read (and re-sort, re-facet, re-render)
	 * the other, which on the bestiary is 212 rows.
	 */
	invalidateRows(source = null) {
		if (source === null) this._rowCache.clear();
		else this._rowCache.delete(source);
	}

	// ------------------------------------------------------------- render

	async getData() {
		const rows    = await this._rowsFor(this._source);
		const active  = this._activeFilters;
		const sources = this._catalogSources();
		const search  = this._searchLabels(this._source);
		// Counts on the source tabs come from whatever is already cached; a source nobody
		// has opened yet shows none rather than being loaded just to be counted, which on
		// the bestiary would mean pulling 212 documents to draw a number.
		return {
			sources: sources.map(s => {
				const count = this._rowCache.get(s.key)?.length ?? null;
				// `hasCount` rather than leaning on {{#if count}}: a source that has been
				// opened and holds nothing must show "0", not look unvisited, and Handlebars
				// counts 0 as falsy.
				return { ...s, active: s.key === this._source, count, hasCount: count !== null };
			}),
			hasSources: sources.length > 1,
			groups:  buildFacetGroups(this._facetGroups(this._source, rows), rows, active),
			rows:    rows.map(row => ({ ...row, filtered: isRowHidden(row, active) })),
			// Seeds the count line for the first paint; _updateCount rewrites it from the DOM
			// from then on, which is the only place that knows about the search's hides too.
			total:   `${rows.length} ${this._countNoun(rows.length)}`,
			empty:   this._emptyMessage(this._source),
			searchTitle:       search.title,
			searchPlaceholder: search.placeholder,
		};
	}

	activateListeners(html) {
		super.activateListeners(html);
		// `.stonetop-catalog` IS the template's root element, so `html[0]` is already it and
		// `html[0].querySelector(".stonetop-catalog")` finds nothing — querySelector looks at
		// descendants, never at the element itself. That silently handed wireTabSearch a null
		// scope, which it takes as "no search control here" and returns from: the magnifying
		// glass rendered and did nothing at all. Resolved from the window element instead, where
		// it genuinely is a descendant, with the root as the fallback.
		//
		// Listeners bind to this element rather than to `this.element[0]`: the window element
		// survives a re-render and would collect a fresh set of handlers every time, while the
		// inner content is replaced wholesale and takes its listeners with it.
		const root = this.element?.[0]?.querySelector(".stonetop-catalog") ?? (html[0] ?? html);

		wireTabSearch(root, {
			itemSel: ".stonetop-catalog-row",
			// The prebuilt index rather than textContent: it reaches text the row shows only
			// as a tooltip, and skips the chrome around it.
			textFor: el => el.dataset.search ?? el.textContent,
			onFilter: () => this._updateCount(root),
		});

		root.addEventListener("click", ev => {
			// A source tab swaps the list AND the whole filter bar, so it re-renders.
			const tab = ev.target.closest(".stonetop-catalog-source");
			if (tab) {
				ev.preventDefault();
				if (tab.dataset.source !== this._source) {
					this._source = tab.dataset.source;
					this.render(false);
				}
				return;
			}

			// Chips filter in place — no re-render, so the list keeps its scroll position and
			// the search box keeps its term mid-typing.
			const chip = ev.target.closest(".stonetop-catalog-filter");
			if (chip) {
				ev.preventDefault();
				this._active[this._source] = toggleChip(this._activeFilters, chip.dataset.group, chip.dataset.key);
				this._applyFilters(root);
				return;
			}

			const row = ev.target.closest(".stonetop-catalog-row");
			if (row) this._openRow(row.dataset.uuid);
		});

		// A dropdown facet sets its group directly — its empty option IS the unfiltered state,
		// so there's no toggle-to-clear to do. Filters in place like the chips.
		root.addEventListener("change", ev => {
			const select = ev.target.closest(".stonetop-catalog-select");
			if (!select) return;
			this._active[this._source] = { ...this._activeFilters, [select.dataset.group]: select.value };
			this._applyFilters(root);
		});

		// The rows are role="button", so they owe a keyboard user the same opening. Space is
		// swallowed rather than left to scroll the list out from under the focused row.
		root.addEventListener("keydown", ev => {
			if (ev.key !== "Enter" && ev.key !== " ") return;
			const row = ev.target.closest(".stonetop-catalog-row");
			if (!row) return;
			ev.preventDefault();
			this._openRow(row.dataset.uuid);
		});

		this._updateCount(root);
	}

	/** Open an entry's own sheet — the browser summarises, the sheet is the thing. */
	async _openRow(uuid) {
		const doc = await fromUuid(uuid);
		doc?.sheet?.render(true);
	}

	/** Re-light the chips and re-hide the rows for the current filter state. */
	async _applyFilters(root) {
		const rows   = await this._rowsFor(this._source);
		const active = this._activeFilters;
		const byKey  = new Map(rows.map(row => [row.key, row]));

		for (const chip of root.querySelectorAll(".stonetop-catalog-filter")) {
			const lit = (active[chip.dataset.group] ?? "") === chip.dataset.key;
			chip.classList.toggle("is-active", lit);
			chip.setAttribute("aria-pressed", lit ? "true" : "false");
		}
		// Dropdown facets are re-synced too, not just the one the viewer touched: clearing a
		// group from anywhere else must show up here rather than leaving a stale selection.
		for (const select of root.querySelectorAll(".stonetop-catalog-select")) {
			const value = active[select.dataset.group] ?? "";
			select.value = value;
			select.classList.toggle("is-active", !!value);
		}
		for (const el of root.querySelectorAll(".stonetop-catalog-row")) {
			const row = byKey.get(el.dataset.key);
			el.classList.toggle("stonetop-catalog-filtered", !!row && isRowHidden(row, active));
		}
		this._updateCount(root);
	}

	/**
	 * "12 of 82" under the filter bar. Counted off the DOM rather than off the row data
	 * because the search hides rows too, and only the DOM knows about both hides.
	 */
	_updateCount(root) {
		const rows  = [...root.querySelectorAll(".stonetop-catalog-row")];
		const shown = rows.filter(el =>
			!el.classList.contains("stonetop-catalog-filtered") &&
			!el.classList.contains("stonetop-search-hidden")
		).length;
		const label = root.querySelector(".stonetop-catalog-count");
		if (label) {
			const noun = this._countNoun(shown);
			label.textContent = shown === rows.length ? `${rows.length} ${noun}` : `${shown} of ${rows.length} ${noun}`;
		}
		const empty = root.querySelector(".stonetop-catalog-empty");
		if (empty) empty.classList.toggle("is-visible", shown === 0);
	}

	/** What the current source's entries are called in the count line. */
	_countNoun(_shown) { return "entries"; }

	// ------------------------------------------------------------- row helpers

	/**
	 * A one-line gist of some authored prose, clipped at a word boundary by the system's one
	 * truncator so the ellipsis never lands mid-word.
	 */
	static summarize(html, max = 190) {
		return truncateValue(stripHtmlToText(html), max);
	}

	/** The lowercase search index for a row, from whatever text the caller thinks matters. */
	static searchIndex(...parts) {
		return parts.flat().filter(Boolean).join(" ").toLowerCase();
	}
}
