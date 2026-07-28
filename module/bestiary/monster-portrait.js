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

import { systemAssetVariants } from "../migration/compat.js";
import { CREATURE_TYPE_ICON_SUFFIX } from "./creature-types.js";

// Creature-type icon dirs under every system id this package has shipped under, so a
// world seeded before an id rename still reads its portraits as replaceable placeholders.
// The suffix comes from the module that WRITES these portraits, and the active id is the
// first entry, so this subsumes CREATURE_TYPE_ICON_DIR and cannot drift from it.
const CREATURE_TYPE_ICON_DIRS = systemAssetVariants(`${CREATURE_TYPE_ICON_SUFFIX}/`);

// True when `img` is a shipped placeholder the durable book art is allowed to replace.
// DEFAULT_TOKEN is read at call time (not import time) so it reflects the running Foundry.
export function isBestiaryPlaceholderImg(img) {
	if (!img) return true;
	const defaultToken = globalThis.CONST?.DEFAULT_TOKEN ?? "icons/svg/mystery-man.svg";
	// Tolerate a leading slash so `/systems/...` (or `/icons/...`) matches the same as the
	// bare path — applied to every comparison, not just the dir prefixes.
	const bare = String(img).replace(/^\//, "");
	if (bare === "icons/svg/mystery-man.svg" || bare === defaultToken.replace(/^\//, "")) return true;
	return CREATURE_TYPE_ICON_DIRS.some(dir => bare.startsWith(dir));
}
