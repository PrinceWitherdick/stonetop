// Some special possessions are kits/stations that bundle a fixed set of mundane
// gear — the Blessed's Apiary is "beeswax, honey, ◇ bee smokers…". Rather than make
// the player hand-type each line, a possession's authored `grantsItems` array is
// materialized into real inventory items when the possession is selected, and
// removed when it's deselected. Items the book writes plainly land in the small
// column (no load); items it marks ◇ land in the regular column with a load weight.
//
// Granted items are ordinary `inventory-custom` items (so they render and delete
// like any write-in) tagged with `sourcePossession`/`sourceKey` for sync, plus a
// `sourceLabel` that drives the "from <possession>" note on the gear tab.

// Build the embedded-item create payloads for a possession's grants, skipping any
// already present (matched by `sourceKey`) so re-selecting / re-running onboarding
// never duplicates. Pure — unit-tested without Foundry.
export function grantsToCreate(grantsItems = [], existingKeys = new Set(), { slug, sourceLabel } = {}) {
	return (grantsItems ?? [])
		.filter(g => g?.name && !existingKeys.has(g.name))
		.map(g => {
			const regular = g.column === "regular";
			const system = {
				moveType:         "inventory-custom",
				inventoryColumn:  regular ? "regular" : "small",
				sourcePossession: slug,
				sourceKey:        g.name,
				sourceLabel:      sourceLabel ?? null,
			};
			// Small items have no ◇ load, so they carry no weight (mirrors a write-in
			// small item); regular items take their authored weight, defaulting to 1 ◇.
			if (regular) system.weight = g.weight ?? 1;
			// Worn gear (the Tannery's boiled leather cuirass) carries an `armor`
			// shape ({base}/{modifier}) that counts toward armor when its ◇ is checked
			// — i.e. when the character is actually wearing it.
			if (g.armor) system.armor = g.armor;
			return { name: g.name, type: "move", system };
		});
}
