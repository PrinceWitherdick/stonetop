import { ledgerCategoryGroups } from "./ledger-categories.js";
import { escHtml } from "./strings.js";

/**
 * Shared toolbar wiring for the character, steading and NPC ledger dialogs, which are
 * otherwise identical. Keeps the "filter by subject" dropdown and live text
 * search in one place so the dialogs can't drift apart.
 */

// Dropdown values are prefixed so one <select> can carry both levels of the filter: pick a whole
// category, or a single subject inside it. An empty value means "no filter".
export const CATEGORY_VALUE_PREFIX = "cat:";
export const NOUN_VALUE_PREFIX = "noun:";

/**
 * Build the `<optgroup>` list for the ledger's filter dropdown: one group per category, led by
 * an "All <Category>" option and followed by that category's distinct subjects.
 *
 * A character with a few hundred moves used to produce a few hundred flat options, so finding
 * anything meant scrolling past every move name in the game. Per-subject counts stay off the
 * labels — a trailing "(3)" reads as part of the subject rather than a tally — but the
 * category rows show one, since there the number is the point.
 */
export function ledgerNounOptionsHtml(entries) {
	return ledgerCategoryGroups(entries).map(group => {
		const all = `<option value="${CATEGORY_VALUE_PREFIX}${escHtml(group.id)}">All ${escHtml(group.label)} (${group.count})</option>`;
		const nouns = group.nouns
			.map(noun => `<option value="${NOUN_VALUE_PREFIX}${escHtml(noun)}">${escHtml(noun)}</option>`)
			.join("");
		return `<optgroup label="${escHtml(group.label)}">${all}${nouns}</optgroup>`;
	}).join("");
}

/**
 * Wire the toolbar's text search + subject dropdown to show/hide entries. Caches each
 * entry's lowercased text once (and the entry list itself), so no keystroke re-queries
 * the DOM; subject and category are read from the `data-` attributes buildRows already
 * stamped. Runs `afterFilter` — e.g. to resync date headers and the select-all
 * checkbox — after each change.
 */
export function wireLedgerFilters(html, afterFilter) {
	const entries = html.find(".stonetop-ledger-entry");
	entries.each((_, el) => {
		el._ledgerText = (el.querySelector(".stonetop-ledger-entry-main")?.textContent ?? "").toLowerCase();
	});

	const searchEl = html.find(".stonetop-ledger-search")[0];
	const nounEl   = html.find(".stonetop-ledger-noun")[0];
	const applyFilter = () => {
		const term = (searchEl?.value ?? "").trim().toLowerCase();
		const selection = nounEl?.value ?? "";
		const category = selection.startsWith(CATEGORY_VALUE_PREFIX) ? selection.slice(CATEGORY_VALUE_PREFIX.length) : "";
		const noun     = selection.startsWith(NOUN_VALUE_PREFIX) ? selection.slice(NOUN_VALUE_PREFIX.length) : "";
		entries.each((_, el) => {
			const matchesText     = !term || el._ledgerText.includes(term);
			const matchesNoun     = !noun || el.dataset.noun === noun;
			const matchesCategory = !category || el.dataset.category === category;
			el.hidden = !(matchesText && matchesNoun && matchesCategory);
		});
		afterFilter?.();
	};

	html.find(".stonetop-ledger-search").on("input", applyFilter);
	html.find(".stonetop-ledger-noun").on("change", applyFilter);
}
