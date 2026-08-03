// Inline-edit + portrait helpers shared by the two stat-block sheets (monster, NPC), which wire
// the same play-mode portrait popout and the same whitelisted field/move updates. `sheet` is the
// AppV1 sheet instance (uses sheet.actor / sheet._editMode); the whitelist is passed per sheet.
import { isDefaultImg } from "./strings.js";
import { displayPortraitSrc } from "../book2-art/people-portraits.js";
import { addPortraitFrameControl } from "./popout-header-control.js";
import { actorFrameHandle } from "./portrait-frame-handles.js";
import { openPortraitFrameEditor } from "./PortraitFrameDialog.js";

// Wire the play-mode portrait click → ImagePopout. Edit mode leaves Foundry's own file picker,
// and the decorative default/creature-type icon is never enlarged. `root` is the sheet root el.
//
// Opens the WHOLE illustration when `img` is a People-of-Stonetop square, for the same reason the
// header renders one (StonetopNpcSheet.getData) and the hover preview swaps one in
// (utils/avatar-preview.js): the square is a ~200px face cut from a standing figure, so popping it
// out would answer "show me this bigger" with a picture smaller than the one just clicked.
// Anything else resolves to null and is enlarged as itself.
export function wirePortraitPopout(sheet, root) {
	// Edit mode: the portrait itself is Foundry's file picker (data-edit="img"), so framing needs
	// its own button beside it. This is where a custom image is chosen, which makes it the one
	// place the framer most needs to be reachable.
	root.querySelector(".stonetop-frame-portrait-btn")?.addEventListener("click", ev => {
		ev.preventDefault();
		ev.stopPropagation();
		const handle = actorFrameHandle(sheet.actor, { editable: sheet.isEditable });
		if (!handle?.canWrite) return;
		openPortraitFrameEditor({
			handle,
			img: sheet.actor.img,
			title: `Frame ${sheet.actor.name}`,
			onSaved: () => sheet.render(false),
		});
	});

	root.querySelector(".stonetop-portrait")?.addEventListener("click", ev => {
		if (sheet._editMode || isDefaultImg(sheet.actor.img)) return;
		ev.preventDefault();
		ev.stopPropagation();
		const src = displayPortraitSrc(sheet.actor.img);
		const popout = new ImagePopout(src, { title: sheet.actor.name });
		popout.render(true);

		// Choose which square of this portrait the small round surfaces show: the relationship
		// hearts on every sheet that lists this person, and the steading roster. The frame lives
		// on the actor, so setting it here shows up everywhere at once.
		addPortraitFrameControl(popout, actorFrameHandle(sheet.actor, { editable: sheet.isEditable }), {
			name: sheet.actor.name,
			img: sheet.actor.img,
			onSaved: () => sheet.render(false),
		});
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
