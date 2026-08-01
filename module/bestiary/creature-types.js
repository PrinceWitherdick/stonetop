// The creature-type taxonomy from Stonetop Book I, "Dangers" p.392 ("Monster
// types"). Each type has a circular icon (extracted from that page) used as the
// default art for stat blocks without custom imagery. Shared by the stat-block
// sheet and the bulk importer, so it's a plain ES module with no Foundry deps.

import { SYSTEM_ID } from "../system-id.js";

// Authored once: monster-portrait.js recognises OUR placeholder art by this path, so the
// writer and the reader must not be able to drift apart.
export const CREATURE_TYPE_ICON_SUFFIX = "assets/icons/bestiary";
export const CREATURE_TYPE_ICON_DIR = `systems/${SYSTEM_ID}/${CREATURE_TYPE_ICON_SUFFIX}`;

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
	return found ? `${CREATURE_TYPE_ICON_DIR}/${found.slug}.svg` : null;
}

export function creatureTypeLabel(slug) {
	return CREATURE_TYPE_CHOICES[slug] ?? "";
}

// Font Awesome (solid) glyph per type, for compact UI like the monster→follower
// banner where the circular art icons would be too heavy. Keyed by the same
// slugs as CREATURE_TYPES.
const CREATURE_TYPE_FA = {
	"human-individual": "fa-user",
	"human-group":      "fa-users",
	"natural-beast":    "fa-paw",
	"spirit":           "fa-ghost",
	"construct":        "fa-gear",
	"spirit-construct": "fa-gears",
	"fae":              "fa-hat-wizard",
	"undead":           "fa-skull",
	"corrupted":        "fa-biohazard",
	"maker":            "fa-hammer",
	"emanation":        "fa-bolt",
	"thing-below":      "fa-water",
	"unknown-origin":   "fa-circle-question",
};

/** Font Awesome class for a type, defaulting to a generic monster glyph. */
export function creatureTypeFaIcon(slug) {
	return CREATURE_TYPE_FA[slug] ?? "fa-dragon";
}

// The inverse table, built once. Two slugs can't share a glyph today, and if one ever did
// the first listed would win — which is fine, since this only ever picks a stand-in mark.
const FA_TO_CREATURE_TYPE = Object.fromEntries(
	Object.entries(CREATURE_TYPE_FA).map(([slug, fa]) => [fa, slug]),
);

/**
 * The taxonomy slug a Font Awesome glyph stands for — the inverse of creatureTypeFaIcon.
 *
 * Compact UI shows a creature as a glyph while the sidebar wants a real image, so anything
 * holding only the glyph (a follower card's portraitIcon, say) can get back to the type and
 * from there to its circular mark. Returns null for a glyph outside the taxonomy; callers
 * decide what an unrecognised one should stand in as.
 */
export function creatureTypeForFaIcon(fa) {
	const key = String(fa ?? "").trim();
	return FA_TO_CREATURE_TYPE[key] ?? null;
}
