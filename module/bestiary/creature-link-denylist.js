// Canonical list of creature names excluded from auto-linking, the single source of
// truth for both the build-time linkifier (scripts/local/bestiary/links.mjs, which
// imports this and matches case-sensitively — the book capitalizes creature names) and
// the runtime cross-reference index (module/bestiary/monster-ref-index.js, which
// lowercase-normalizes these on read). A whole creature is excluded by full name, so
// its stripped variants never register either (e.g. "The Guard" keeps the bare word
// "guard" from linking every incidental "guard" in prose).
//
// Title-case here to match the linkifier's case-sensitive matching; the runtime maps
// them through its own `_norm()` when building its lookup set.
export const CREATURE_LINK_DENYLIST = [
	// Generic role / occupation / common words — would link incidental prose.
	"Adept", "Adventurer", "Antiquarian", "Assassin", "Bandit", "Bandit Chief",
	"Caravan Guard", "Cavalry", "Chief", "Cultist", "Alley Cutthroats",
	"Desperate Souls", "Fanatic", "Fundamental", "Guardian", "Infantry",
	"Laborers", "Legionary", "Monk", "Necromancer", "Novice", "Pacifier",
	"Shade", "Skirmisher", "Sorcerer", "Specter", "The Guard", "Thieves",
	"Thrall", "Wraith", "Wretch",
	// Collide with a lore / location entry of the same name (that entry links it).
	"Fomoraij",      // lore: Fomoraij
	"Rime Lord",     // lore: Rime Lords
	"The Crombil",   // location: The Crombil
];
