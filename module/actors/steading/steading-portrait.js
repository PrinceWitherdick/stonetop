// Shared identity + placeholder detection for the world "Stonetop" steading actor's portrait.
//
// The steading is a runtime-created world singleton (no stable compendium id), and its
// portrait is only ever ADOPTED over a shipped placeholder — never a portrait the group
// chose themselves. Two runtime consumers must agree on "is this still a placeholder?":
//   • the singleton bootstrap (module/hooks/StonetopSingleton.js), and
//   • the Book art re-apply safety net (module/book2-art/reapply.js).
// So the answer lives here, once. The standalone "Import Book Art" macro
// (scripts/local/book2-art/import-book2-art.js) HAND-MIRRORS the set below — it ships as a
// packed command string and cannot import a system module. The set here is derived from the
// system-id list, so it is a superset of the macro's hand-written one; that direction is
// safe (the macro is merely more conservative), the reverse is not.

import { systemAssetVariants } from "../../migration/compat.js";

export const STEADING_ACTOR_TYPE = "stonetop";
export const STEADING_DEFAULT_IMG = "systems/stonetop_pwd/assets/stonetop_image.svg";

// Every image we treat as a "shipped placeholder" the book art may replace: the current "S"
// emblem (svg + any legacy raster), the same paths under every system id this package has
// shipped under, and Foundry's generic defaults. A missing/empty image counts too. Anything
// else is a portrait the group set on purpose and is left untouched.
const STEADING_PLACEHOLDER_IMGS = new Set(
	["svg", "webp", "png"].flatMap(ext => systemAssetVariants(`assets/stonetop_image.${ext}`))
);

// True when `img` is a shipped placeholder the durable book art is allowed to replace.
// DEFAULT_TOKEN is read at call time (not import time) so it reflects the running Foundry.
export function isSteadingPlaceholderImg(img) {
	const defaultToken = globalThis.CONST?.DEFAULT_TOKEN ?? "icons/svg/mystery-man.svg";
	if (!img) return true;
	// Tolerate a leading slash so `/systems/...` matches the same as the bare path.
	const bare = String(img).replace(/^\//, "");
	return bare === "icons/svg/mystery-man.svg" || bare === "icons/svg/item-bag.svg"
		|| bare === String(defaultToken).replace(/^\//, "") || STEADING_PLACEHOLDER_IMGS.has(bare);
}
