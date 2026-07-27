// The communities beyond Stonetop that the steading can hold a standing with —
// the roster behind the "Other Settlements" relations table on the steading sheet.
//
// Scope: an entry is here when the books present it as a living community with
// someone Stonetop could deal with. That is deliberately wider than "towns": the
// setting's nearest neighbors include nomadic bands and non-human powers, and Book I's
// own "Neighbors" section lists them side by side with Marshedge and the Delve. It
// excludes Stonetop itself (the subject of the table, never a row), wilderness regions,
// roads, dead Maker ruins, and monster lairs.
//
// `slug` is the storage key in the steading's `system.relationships` map, so it must
// stay stable and dot-free — renaming one orphans that steading's rating. `packSlug`
// names the matching packs/src/stonetop-locations entry, kept so a future build can
// link a row to its Locations compendium page; "" where the books give a people no
// place entry of their own.
//
// Order is how a Stonetop GM reads the map: standing trade partners first, then the
// nearer neighbors, then the wider world, then the powers that are barely places at all.
export const SETTLEMENTS = [
	{
		slug: "gordins-delve",
		name: "Gordin's Delve",
		icon: "fas fa-city",
		region: "the Huffel Peaks, at the end of the West Road",
		blurb: "Mining town of ~700-800 run by five Bosses; four days west at the end of the West Road.",
		packSlug: "gordins-delve",
	},
	{
		slug: "marshedge",
		name: "Marshedge",
		icon: "fas fa-city",
		region: "on the Highway, above Ferrier's Fen",
		blurb: "Town of ~800-900 above the Fen; the richest neighbor, ruled by a mixed Council.",
		packSlug: "marshedge",
	},
	{
		slug: "hillfolk",
		name: "Hillfolk",
		icon: "fas fa-campground",
		region: "the Steplands, ranging onto the Flats",
		blurb: "Dozens of nomadic Steplands bands; signal them with a bonfire at Titan Bones.",
		packSlug: "the-steplands",
	},
	{
		slug: "barrier-pass",
		name: "Barrier Pass",
		icon: "fas fa-place-of-worship",
		region: "the Whitefang Mountains, five days north",
		blurb: "Walled fortress-monastery of ~200; stoic and closed, but the one printed trade track.",
		packSlug: "barrier-pass",
	},
	{
		slug: "north-manmarch",
		name: "North Manmarch",
		icon: "fas fa-chess-rook",
		region: "east of the Great Wood, north of the Highway",
		blurb: "Thousands of Manmarchers in hundreds of hamlets under a half-dozen hillfort chiefs.",
		packSlug: "north-manmarch",
	},
	{
		slug: "ustrina",
		name: "Ustrina",
		icon: "fas fa-mask",
		region: "deep in the Huffel Peaks, reached via the Labyrinth",
		blurb: "Masked, black-robed traders who surface from the Labyrinth to deal at the Delve.",
		packSlug: "ustrina",
	},
	{
		slug: "lygos",
		name: "Lygos",
		icon: "fas fa-city",
		region: "the arid south, beyond the South Manmarch",
		blurb: "The great southern city; a rare caravan reaches the Delve, fewer still come here.",
		packSlug: "lygos-and-the-south",
	},
	{
		slug: "the-fae",
		name: "The Fae",
		icon: "fas fa-leaf",
		region: "the Great Wood and Ferrier's Fen",
		blurb: "Fickle powers of wood and fen; they convene the Wandering Market.",
		packSlug: "",
	},
];
