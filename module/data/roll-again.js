// "ROLL AGAIN": the one shape every generator table row uses when it asks for another roll on its own
// table, and the one reader of it. The site tables (site-tables.js, things-below-tables.js) and the
// artifact tables (artifact-creation-tables.js) each used to encode it their own way, a bare max on
// one side and a range object on the other, so a reroll the artifact tables could say (1d8+1, a
// group) had no spelling on the site side, and each wizard read it with its own code.
//
//   again       present = the row asks for a reroll on the same table, never landing on itself.
//               `{ max }` narrows a ranged table to a smaller die ("and roll 1d8 again" is
//               `{ max: 8 }`), `{ min, max }` to a shifted one ("1d8+1" is `{ min: 2, max: 9 }`),
//               `{ group }` to one group of a list table ("roll on the more common table"), and
//               `{}` is the whole table ("and roll again").
//   againCount  how many rerolls ("roll twice" is 2). Default 1.

/**
 * What a row's "roll again" asks for, `{min, max, group, count}` with each narrowing null when the
 * row leaves it open, or null for a row that asks for nothing. PURE.
 */
export function againSpec(row) {
	const a = row?.again;
	if (!a || typeof a !== "object") return null;
	const num = v => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v) : null);
	return {
		min:   num(a.min),
		max:   num(a.max),
		group: a.group ?? null,
		count: Math.max(1, Math.floor(Number(row.againCount) || 1)),
	};
}

/**
 * The rows a row's reroll is made on: `table` narrowed by its spec, never the row itself. Empty for
 * a row that asks for no reroll. Always a new array. PURE.
 */
export function againPool(table, row) {
	const spec = againSpec(row);
	if (!spec || !Array.isArray(table)) return [];
	return table.filter(r => r !== row
		&& (spec.min == null || (typeof r.min === "number" && r.min >= spec.min))
		&& (spec.max == null || (typeof r.max === "number" && r.max <= spec.max))
		&& (spec.group == null || r.group === spec.group));
}
