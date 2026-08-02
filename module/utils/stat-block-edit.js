// Inline-edit + portrait helpers shared by the two stat-block sheets (monster, NPC), which wire
// the same play-mode portrait popout and the same whitelisted field/move updates. `sheet` is the
// AppV1 sheet instance (uses sheet.actor / sheet._editMode); the whitelist is passed per sheet.
import { isDefaultImg } from "./strings.js";
import { fullPortraitSrc } from "../book2-art/people-portraits.js";

// Wire the play-mode portrait click → ImagePopout. Edit mode leaves Foundry's own file picker,
// and the decorative default/creature-type icon is never enlarged. `root` is the sheet root el.
//
// Opens the WHOLE illustration when `img` is a People-of-Stonetop square, for the same reason the
// header renders one (StonetopNpcSheet.getData) and the hover preview swaps one in
// (utils/avatar-preview.js): the square is a ~200px face cut from a standing figure, so popping it
// out would answer "show me this bigger" with a picture smaller than the one just clicked.
// Anything else resolves to null and is enlarged as itself.
export function wirePortraitPopout(sheet, root) {
	root.querySelector(".stonetop-portrait")?.addEventListener("click", ev => {
		if (sheet._editMode || isDefaultImg(sheet.actor.img)) return;
		ev.preventDefault();
		ev.stopPropagation();
		const src = fullPortraitSrc(sheet.actor.img) ?? sheet.actor.img;
		new ImagePopout(src, { title: sheet.actor.name }).render(true);
	});
}

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
