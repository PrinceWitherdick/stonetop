/**
 * The filtering logic behind the catalogue browsers (see dialogs/CatalogBrowserDialog.js —
 * the Arcana browser and the Bestiary & People browser).
 *
 * Deliberately Foundry-free and side-effect-free so the rules that decide what a viewer can
 * see are unit-testable without a DOM or a game object. The dialog owns the wiring; this
 * owns the answers.
 *
 * A ROW carries a `facets` map — `{ groupKey: value }`, or `{ groupKey: [values] }` for a
 * facet an entry can hold several of at once (an arcanum is often a Relic AND a Power). A
 * GROUP DEF names a chip row: `{ key, label, chips: [{ key, label, icon?, img?, hint?, mod? }] }`.
 * ACTIVE is `{ groupKey: litChipKey }`, with "" or a missing key meaning "this group is not
 * filtering".
 *
 * A CHIP KEY MUST NOT BE "". Empty is how this module spells "nothing lit in this group", so
 * a chip keyed "" would clear itself the instant it was clicked and could never light. A
 * facet whose natural value is blank (an NPC with no `home` is a resident of Stonetop) must
 * be normalised to a real key by the row builder, not carried through as "".
 */

/** Whether one row carries `chipKey` in the facet group `groupKey`. */
export function rowMatchesChip(row, groupKey, chipKey) {
	const value = row?.facets?.[groupKey];
	return Array.isArray(value) ? value.includes(chipKey) : value === chipKey;
}

/**
 * Whether the lit chips hide a row. Groups AND together; a group with nothing lit hides
 * nothing. Note the direction: this answers "hide?", so it composes as an OR with the
 * search's own hide — a row survives only when nothing hides it.
 */
export function isRowHidden(row, active = {}) {
	for (const [groupKey, chipKey] of Object.entries(active)) {
		if (!chipKey) continue;
		if (!rowMatchesChip(row, groupKey, chipKey)) return true;
	}
	return false;
}

/**
 * Toggle a chip within its group and return the new active map. Single-select per group,
 * and clicking the lit chip clears it — which is why no group needs an "All" chip.
 *
 * Returns a new object rather than mutating, so a caller can diff or discard it.
 */
export function toggleChip(active, groupKey, chipKey) {
	const next = { ...active };
	next[groupKey] = next[groupKey] === chipKey ? "" : chipKey;
	return next;
}

/**
 * Render-ready facet groups: every chip stamped with whether it's lit and how many rows it
 * would leave.
 *
 * The counts are of the WHOLE row set, not of what the other lit chips leave. A count that
 * moved as you filtered would be more precise and much less useful: the number is there to
 * tell you how big a pile you're about to open, and it should say the same thing whichever
 * order you click things in.
 *
 * A chip matching nothing is kept, not dropped — a group whose chips came and went as the
 * catalogue changed would be a filter bar you couldn't learn.
 */
export function buildFacetGroups(defs, rows, active = {}) {
	return defs.map(def => {
		const chips = def.chips.map(chip => ({
			...chip,
			active: (active[def.key] ?? "") === chip.key,
			count:  rows.filter(row => rowMatchesChip(row, def.key, chip.key)).length,
		}));
		return {
			...def,
			chips,
			// A group with too many values to spell out in pills renders as a dropdown
			// (`control: "select"`). Resolved to a plain boolean here so the template needs no
			// comparison helper, and `anyActive` so its "Any …" option knows to be selected.
			isSelect:  def.control === "select",
			anyActive: chips.some(chip => chip.active),
		};
	});
}

/**
 * Chip defs for a facet whose values aren't known until the world is read — which steadings
 * the NPCs actually come from, say. Taken from the rows themselves, so the bar reflects this
 * world rather than a list someone has to remember to update.
 *
 * Alphabetical, except that `first` is pinned to the front: Stonetop is where the campaign
 * is, and it reads as the origin the other steadings are measured from rather than as the
 * entry that happens to fall between Marshedge and the Tor.
 *
 * Blank values are skipped — see the empty-key rule above.
 */
export function facetChipsFromRows(rows, groupKey, { first = null } = {}) {
	const seen = new Set();
	for (const row of rows) {
		for (const value of [].concat(row?.facets?.[groupKey] ?? [])) {
			if (value) seen.add(value);
		}
	}
	return [...seen]
		.sort((a, b) => (a === first ? -1 : b === first ? 1 : a.localeCompare(b)))
		.map(value => ({ key: value, label: value }));
}
