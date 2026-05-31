export const MAJOR_ARCANA_ICONS = {
	"azure-hand":                 "icon-arcana-azurehand.png",
	"blackwood-fetishes":         "icon-arcana-blackwoodfetishes.png",
	"blood-quenched-sword":       "icon-arcana-bloodsword.png",
	"demonhide-cloak":            "icon-arcana-demonhide.png",
	"hectumel-codex":             "icon-arcana-hectumelcodex.png",
	"hungering-maw-of-hlad":      "icon-arcana-hungrymaw.png",
	"ineffable-words":            "icon-arcana-ineffalewords.png",
	"mindgem":                    "icon-arcana-mindgem.png",
	"norubas-ice-sphere":         "icon-arcana-icesphere.png",
	"red-scepter":                "icon-arcana-redscepter.png",
	"redwood-effigy":             "icon-arcana-redwoodeffigy.png",
	"ring-of-daagon":             "icon-arcana-ringofdaagon.png",
	"rune-laden-scales":          "icon-arcana-scales.png",
	"shield-of-the-wisent-witch": "icon-arcana-wisentshield.png",
	"staff-of-the-lidless-orb":   "icon-arcana-lidlessorb.png",
	"storm-markings":             "icon-arcana-stormmarkings.png",
	"twisted-spear":              "icon-arcana-twistedspear.png",
	"whispering-rocks":           "icon-arcana-whisperingrocks.png",
};

export function majorArcanaImg(slug) {
	const file = MAJOR_ARCANA_ICONS[slug];
	return file ? `modules/stonetop/assets/icons/arcana/${file}` : null;
}
