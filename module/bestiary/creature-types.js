// The creature-type taxonomy from Stonetop Book I, "Dangers" p.392 ("Monster
// types"). Each type has a circular icon (extracted from that page) used as the
// default art for stat blocks without custom imagery. Shared by the stat-block
// sheet and the bulk importer, so it's a plain ES module with no Foundry deps.

export const CREATURE_TYPE_ICON_DIR = "systems/stonetop_pwd/assets/icons/bestiary";

export const CREATURE_TYPES = [
	{ slug: "human-individual", label: "Human (individual)" },
	{ slug: "human-group",      label: "Humans (group)" },
	{ slug: "natural-beast",    label: "Natural / Beast" },
	{ slug: "spirit",           label: "Spirit" },
	{ slug: "construct",        label: "Construct" },
	{ slug: "spirit-construct", label: "Spirit / Construct" },
	{ slug: "fae",              label: "Fae" },
	{ slug: "undead",           label: "Undead" },
	{ slug: "corrupted",        label: "Corrupted / Fomoraij" },
	{ slug: "maker",            label: "Maker" },
	{ slug: "emanation",        label: "Emanation" },
	{ slug: "thing-below",      label: "Thing Below" },
	{ slug: "unknown-origin",   label: "Unknown Origin" },
];

export const CREATURE_TYPE_CHOICES = Object.fromEntries(
	CREATURE_TYPES.map(t => [t.slug, t.label]),
);

/** Absolute path (from the Foundry data root) to a type's icon, or null. */
export function creatureTypeIcon(slug) {
	if (!slug) return null;
	const found = CREATURE_TYPES.find(t => t.slug === slug);
	return found ? `${CREATURE_TYPE_ICON_DIR}/${found.slug}.webp` : null;
}

export function creatureTypeLabel(slug) {
	return CREATURE_TYPE_CHOICES[slug] ?? "";
}
