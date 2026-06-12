export const PACKS = [
	{ name: "stonetop-items",    type: "Item" },
	{ name: "stonetop-journals", type: "JournalEntry" },
	{ name: "stonetop-bestiary", type: "Actor" },
	{ name: "stonetop-locations", type: "JournalEntry" },
];

// LevelDB key prefix for each pack's primary document type.
export const DOC_KEY_PREFIX = {
	Item:         "items",
	JournalEntry: "journal",
	Actor:        "actors",
};
