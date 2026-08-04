// Inline-edit helpers shared by the two stat-block sheets (monster, NPC), which take the same
// whitelisted field/move updates. `sheet` is the AppV1 sheet instance (uses sheet.actor /
// sheet._editMode); the whitelist is passed per sheet. The header portrait all three sheets share
// is wired by `wirePortraitPopout` in utils/actor-portrait-picker.js.

// Persist an inline edit to one of the actor's own system fields, whitelisted to `richTextFields`
// (an array of { key } entries) so a stray data-field can't write anywhere else.
export async function updateRichTextField(sheet, richTextFields, field, value) {
	if (!richTextFields.some(entry => entry.key === field)) return;
	await sheet.actor.update({ [`system.${field}`]: value ?? "" });
}

// Persist an inline edit to one of a move item's fields, whitelisted to `editableFields` (a Set).
export async function updateMoveField(sheet, editableFields, itemId, field, value) {
	if (!editableFields.has(field)) return;
	const item = sheet.actor.items.get(itemId);
	if (!item) return;
	await item.update({ [field]: value ?? "" });
}
