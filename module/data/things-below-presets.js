// The six established Things Below (Stonetop Book II, "For We Are Many", pp. 419-421),
// transcribed as presets that pre-fill the Create-a-Thing wizard. They are NOT seeded as
// world documents (a named world threat would leak to players — v14 broadcasts world
// JournalEntries in full; see reference_foundry-world-docs-broadcast). They are pure
// pre-fill data plus "see also" references into the existing lore/locations/arcana.
//
// `themeIds` index into THEMES (module/data/things-below-tables.js) so the wizard can
// pre-select the book's themes; `instinct`, `titles`, and `moves` are verbatim.

// The master lore JournalEntry ("The Things Below") + the bestiary folder, for reference.
export const TB_LORE_ENTRY_ID = "5Kym1qDHTmM8XUQ6";
export const TB_BESTIARY_FOLDER_ID = "WfCT2r0yWAQFVrI9";

export const THINGS_BELOW = [
	{
		slug: "daagon",
		name: "Daagon",
		titles: ["Who Waits in Deep Waters"],
		themeIds: [9, 11], // gluttony/greed/jealousy + roiling flesh/mutation/transformation
		instinct: "To take from the surface, to never let go",
		moves: [
			"Send forth minions to do its bidding",
			"Offer power, wealth, immortality",
			"Demand a sacrifice",
			"Twist its servants into wet and wriggling things",
		],
		blurb: "Something patient and vast lurks below deep water, an abyssal mouth opening into a belly that can never be filled.",
		seeAlso: ["Blackwater Lake", "the secrets of Gordin's Delve", "the Ring of Daagon"],
	},
	{
		slug: "elrash-orra",
		name: "El'rash-Orra",
		titles: ["Lord of Orbs", "the Many-Eyes"],
		themeIds: [2, 3], // denial/shame/secrets/deceit + delusion/delirium/nightmare
		instinct: "To reveal all manner of ugliness",
		moves: [
			"Spy on someone's actions, desires, shames",
			"Give knowledge (wanted or not) via dreams or visions",
			"Twist someone's senses (of reality, of themselves)",
		],
		blurb: "A faceless sovereign upon a silver throne, robes falling open into a night sky of countless eyes that see all shames and secret fears.",
		seeAlso: ["the Staff of the Lidless Orb"],
	},
	{
		slug: "hectumel",
		name: "Hec'tumel",
		titles: ["Pale Serpent", "Slitherer in Darkness", "Death Is Its Eyes"],
		themeIds: [1, 12], // darkness/cold/despair + death/undeath/loss/grief
		instinct: "To smother life, hope, and light",
		moves: [
			"Sense powerful longings and emotions",
			"Offer services, secrets, or power",
			"Twist a bargain to its favor",
		],
		blurb: "A pale, dead, reptilian thing with skulls where it should have eyes; it raised up the first sorcerers and delighted when its gifts brought them low.",
		seeAlso: ["the Hec'tumel Codex"],
	},
	{
		slug: "hlad",
		name: "Hlad",
		titles: ["the Devourer", "the Eternal Maw"],
		themeIds: [4, 6], // hunger/need/addiction + destruction/chaos/ruin/ignorance
		instinct: "To consume reality",
		moves: [
			"Erode strength, wholeness, life",
			"Draw in the weak-willed",
			"Grow in strength and power",
		],
		blurb: "A hole in reality, a howling vortex of destruction; to hear its song is to wish for the respite of oblivion.",
		seeAlso: ["the Hungering Maw of Hlad"],
	},
	{
		slug: "lbinbozia",
		name: "L'bin'bozia",
		titles: ["Flesh-Candle", "the Wax Skull", "Roiling Tomb"],
		themeIds: [11, 10], // roiling flesh/mutation/transformation + confinement/suffocation/pressure/abuse
		instinct: "To horrify and overwhelm",
		moves: [
			"Torment with nightmares",
			"Turn someone's flesh against them",
			"Offer them respite, at a terrible price",
		],
		blurb: "A corpse, bubbling and blistering and wreathed in white flame, leering from a chair of squirming limbs, welcoming you to your eternal home.",
		seeAlso: ["the Wretch (page 436)"],
	},
	{
		slug: "yaawkara",
		name: "Y'aaw'kara",
		titles: ["the Howling Wind", "the Flayer of Flesh"],
		themeIds: [4, 5, 7], // hunger/need/addiction + cruelty/torture/violence/rage + wounds/injury/pain
		instinct: "To spread pain and misery",
		moves: [
			"Sense or amplify hunger, fear, anger, pain",
			"Offer the strength of cruelty",
			"Inflict the Howling Curse on someone",
		],
		blurb: "A starving wolf with the body of a starving man, bleeding from a dozen wounds, his wheezing breath howling like a blizzard gale.",
		seeAlso: ["Barrier Pass", "the Whitefang Mountains"],
	},
];

const _BY_SLUG = new Map(THINGS_BELOW.map(t => [t.slug, t]));

/** Resolve a preset by slug, or null. */
export function thingBelowPreset(slug) {
	return _BY_SLUG.get(String(slug ?? "")) ?? null;
}

/** The full display name for a preset: name + titles ("Daagon, Who Waits in Deep Waters"). */
export function presetFullName(preset) {
	if (!preset) return "";
	const titles = Array.isArray(preset.titles) ? preset.titles.filter(Boolean) : [];
	return [preset.name, ...titles].join(", ");
}
