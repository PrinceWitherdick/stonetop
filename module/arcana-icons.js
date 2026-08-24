import { isDefaultImg } from "./utils/strings.js";

/**
 * Registry of the SHIPPED Major Arcana, each mapped to its card-art icon. For shipped
 * arcana, membership in this map IS the taxonomy (use {@link isMajorArcana} when all you
 * have is a slug). Homebrew arcana instead declare their tier via `flags.stonetop.major`,
 * so when you hold the resolved item prefer {@link isMajorArcanumItem} / {@link arcanumCardImg},
 * which honor the stored flag and fall back to this allowlist. Don't re-derive "is major"
 * from `majorArcanaImg() !== null`.
 */
export const MAJOR_ARCANA_ICONS = {
	"azure-hand":                 "icon-arcana-azurehand.webp",
	"blackwood-fetishes":         "icon-arcana-blackwoodfetishes.webp",
	"blood-quenched-sword":       "icon-arcana-bloodsword.webp",
	"demonhide-cloak":            "icon-arcana-demonhide.webp",
	"hectumel-codex":             "icon-arcana-hectumelcodex.webp",
	"hungering-maw-of-hlad":      "icon-arcana-hungrymaw.webp",
	"ineffable-words":            "icon-arcana-ineffalewords.webp",
	"mindgem":                    "icon-arcana-mindgem.webp",
	"norubas-ice-sphere":         "icon-arcana-icesphere.webp",
	"red-scepter":                "icon-arcana-redscepter.webp",
	"redwood-effigy":             "icon-arcana-redwoodeffigy.webp",
	"ring-of-daagon":             "icon-arcana-ringofdaagon.webp",
	"rune-laden-scales":          "icon-arcana-scales.webp",
	"shield-of-the-wisent-witch": "icon-arcana-wisentshield.webp",
	"staff-of-the-lidless-orb":   "icon-arcana-lidlessorb.webp",
	"storm-markings":             "icon-arcana-stormmarkings.webp",
	"twisted-spear":              "icon-arcana-twistedspear.webp",
	"whispering-rocks":           "icon-arcana-whisperingrocks.webp",
};

export function majorArcanaImg(slug) {
	const file = MAJOR_ARCANA_ICONS[slug];
	return file ? `systems/stonetop_pwd/assets/icons/arcana/${file}` : null;
}

export function isMajorArcana(slug) {
	return Object.prototype.hasOwnProperty.call(MAJOR_ARCANA_ICONS, slug);
}

/**
 * Taxonomy for a resolved arcanum (a {@link MinorArcanum}, the snapshot, or any object
 * with `slug`/`major`). Homebrew arcana declare `major: true` explicitly; shipped arcana
 * omit it and fall back to the {@link MAJOR_ARCANA_ICONS} allowlist. Prefer this over
 * {@link isMajorArcana} anywhere you hold the item, so user-created majors are first-class.
 */
export function isMajorArcanumItem(item) {
	return item?.major === true || isMajorArcana(item?.slug);
}

/**
 * Card-art path for a resolved arcanum, or null for minor arcana (which have no art).
 * Shipped majors use their registered icon; homebrew majors fall back to the Item's own
 * `img` — but a stock placeholder (the default item-bag icon / no img) counts as no art,
 * so a freshly created major shows nothing rather than a generic Foundry icon. Pass a
 * {@link MinorArcanum} (carries `slug`, `major`, `img`).
 */
export function arcanumCardImg(item) {
	if (!isMajorArcanumItem(item)) return null;
	const registered = majorArcanaImg(item?.slug);
	if (registered) return registered;
	return isDefaultImg(item?.img) ? null : item.img;
}
