// What the book already says about the village's lettered places.
//
// Stonetop's map is lettered A–R and the steading sheet ships the first six of those
// filled in — the Stone, the granary, the public house, the cistern, the pavilion of the
// gods, the watchtowers. The gazetteer has a sentence or two on each, plus four more
// features (the Ringwall, the switchback path, the fields, the Old Wall) that a GM may
// well name into one of the blank letters. That is what lets a Place of Interest's
// Chronicle page open with something worth reading rather than an empty body.
//
// The prose below is a VERBATIM copy of the "Places" bullets on the shipped "The Village
// of Stonetop" location journal (packs/src/stonetop-locations/settlements/), with its
// `@UUID` cross-links flattened to the bold names they display. Nothing at runtime can
// read a pack's source, so it is duplicated here on purpose and pinned by
// tests/data/village-places.test.js, which reads that pack and fails if the two drift.

/**
 * Normalise a place name for matching: case-folded, leading article dropped, `&` spelled
 * out, punctuation flattened to single spaces. "The Public House & Stables" and "public
 * house and stables" both come out the same, which is the whole point — the six defaults
 * are only defaults, and a GM is free to retype any of them.
 */
export function normalizePlaceName(name) {
	return String(name ?? "")
		.toLowerCase()
		.replace(/&/g, " and ")
		.replace(/[^a-z0-9]+/g, " ")
		.trim()
		.replace(/^the /, "")
		.trim();
}

/**
 * The ten village features the gazetteer describes.
 *
 * `aliases` are normalised names this entry answers to. A steading place matches when its
 * normalised name IS an alias or BEGINS with one followed by a word boundary — so "Public
 * House & Stables" finds "public house" and "Watchtowers (north)" finds "watchtowers",
 * while "Stonemason" cannot creep onto "stone".
 */
export const VILLAGE_PLACES = Object.freeze([
	{
		key: "stone",
		aliases: ["stone", "standing stone"],
		blurb: "The Stone is well over 50 feet tall and etched in faded runes. It seems older than even the Maker-ruins upon which the village was founded. When storms roll in, lightning strikes the Stone repeatedly.",
	},
	{
		key: "cistern",
		aliases: ["cistern"],
		blurb: "The Cistern is an underground vault, clearly an artifact of the <strong>Makers</strong>. Locals fill it with rain, snow, and water from the <strong>Stream</strong>.",
	},
	{
		key: "public-house",
		aliases: ["public house", "publick house", "pub"],
		blurb: "The public house is a large hall, where folks meet after sundown to drink and socialize. It offers floor space to travelers and a small stable under the same roof. The town’s horses are kept here.",
	},
	{
		key: "granary",
		aliases: ["granary"],
		blurb: "The granary is a warehouse built on a Maker-ruin foundation. Foodstuffs are stored here. Everyone contributes, everyone shares.",
	},
	{
		key: "pavilion",
		aliases: ["pavilion of the gods", "pavilion"],
		blurb: "The pavilion of the gods is an openair structure with shrines to <strong>Aratis</strong>, <strong>Danu</strong>, <strong>Helior</strong>, <strong>Tor</strong>, and maybe others. As close as Stonetop gets to a temple.",
	},
	{
		key: "ringwall",
		aliases: ["ringwall", "ring wall"],
		blurb: "The Ringwall is a waist-high fence of fieldstones, 2-3 feet thick. It won’t keep out serious raiders, but provides a little cover if needed. Homes beyond it are newer, built by immigrants or younger families.",
	},
	{
		key: "watchtowers",
		aliases: ["watchtowers", "watchtower", "watch towers", "watch tower"],
		blurb: "Watchtowers stand along the Ringwall, a dozen feet tall or so. One to the north, one to the southeast, one to the southwest. Villagers rotate through watch duty at night.",
	},
	{
		key: "switchback",
		aliases: ["switchback path", "switchback", "switchback trail"],
		blurb: "A switchback path leads down the bluff to the Stream and the <strong>Great Wood</strong>. Climbing it takes 10-15 minutes, longer with a heavy load.",
	},
	{
		key: "fields",
		aliases: ["fields", "field"],
		blurb: "The fields stretch out around the town, about 1,000 acres total. A third of the land sits fallow each year, with the rest growing barley, oats, beans, and potatoes. Farmers work the fields communally, rather than as familial plots.",
	},
	{
		key: "old-wall",
		aliases: ["old wall"],
		blurb: "The Old Wall wraps around the fields, about a mile from the Stone itself and at the end of the West Road. Clearly once a mighty rampart, it has tumbled and been buried by the ages. When the villagers need stone for construction, they dig it out of the old wall and haul it back to town.",
	},
]);

/**
 * The gazetteer entry for a place NAME as the steading sheet spells it, or null when the
 * book has nothing to say about it — which is the normal case for the twelve letters a GM
 * fills in themselves.
 */
export function villagePlaceFor(name) {
	const normalized = normalizePlaceName(name);
	if (!normalized) return null;
	return VILLAGE_PLACES.find(place => place.aliases.some(
		alias => normalized === alias || normalized.startsWith(`${alias} `)
	)) ?? null;
}

/** The book's paragraph about `name`, as HTML, or "" when it describes no such place. */
export function villagePlaceBlurb(name) {
	const place = villagePlaceFor(name);
	return place ? `<p>${place.blurb}</p>` : "";
}
