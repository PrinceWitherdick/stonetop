// Shared "is this a shipped placeholder the book art may adopt over?" test for a world
// bestiary actor's portrait — the monster mirror of steading-portrait.js.
//
// A seeded world monster actor (module/hooks/SeedActors.js) is created with the compendium
// actor's img, which ships as a creature-type icon (bestiary/<type>.svg) — NEVER the book
// illustration, which is wired onto the compendium only after a GM runs the Import Book Art
// macro. So the runtime re-apply (module/book2-art/reapply.js) has to tell two states apart:
//   • "this actor is still on its shipped creature-type placeholder" -> adopt the durable art
//   • "the group set a portrait of their own"                        -> leave it untouched
// Anything under the creature-type icon dir counts as a placeholder, plus the same paths under
// the legacy `stonetop` system id and Foundry's generic defaults (and a missing image). A real
// portrait — a webp/png the GM chose — is not a placeholder and is never overwritten.

import { CREATURE_TYPE_ICON_DIR } from "./creature-types.js";

// The creature-type icon dir under the old system id, for worlds migrated from `stonetop`.
const LEGACY_CREATURE_TYPE_ICON_DIR = "systems/stonetop/assets/icons/bestiary";

// True when `img` is a shipped placeholder the durable book art is allowed to replace.
// DEFAULT_TOKEN is read at call time (not import time) so it reflects the running Foundry.
export function isBestiaryPlaceholderImg(img) {
	if (!img) return true;
	const defaultToken = globalThis.CONST?.DEFAULT_TOKEN ?? "icons/svg/mystery-man.svg";
	// Tolerate a leading slash so `/systems/...` (or `/icons/...`) matches the same as the
	// bare path — applied to every comparison, not just the dir prefixes.
	const bare = String(img).replace(/^\//, "");
	if (bare === "icons/svg/mystery-man.svg" || bare === defaultToken.replace(/^\//, "")) return true;
	return bare.startsWith(`${CREATURE_TYPE_ICON_DIR}/`) || bare.startsWith(`${LEGACY_CREATURE_TYPE_ICON_DIR}/`);
}
