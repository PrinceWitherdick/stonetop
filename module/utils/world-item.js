// Create a reusable WORLD Item everyone can read, then toast a localized "created"
// message. Shared by the "Create Item -> ..." world savers (custom moves, inventory
// gear): the loose world item is OBSERVER-readable (matching homebrew moves/arcana) so
// players can drag it too; the embedded copy a drop plants inherits the actor's
// ownership regardless. `messageKey` is formatted with the created item's name.
export async function createWorldItem(data, messageKey) {
	data.ownership = { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER };
	const item = await Item.create(data);
	if (item) {
		ui.notifications?.info?.(game.i18n.format(messageKey, { name: item.name }));
	}
	return item;
}
