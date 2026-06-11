import { majorArcanaImg } from "../arcana-icons.js";
import { ITEM_FLAG_SCOPE } from "../actors/character/StonetopFlags.js";
import { centerArcanumTracks } from "../utils/glyphs.js";

export function createStonetopArcanumSheetClass(BaseItemSheet) {
	return class StonetopArcanumSheet extends BaseItemSheet {
		static get defaultOptions() {
			return foundry.utils.mergeObject(super.defaultOptions, {
				classes: ["stonetop", "sheet", "item", "stonetop-arcanum-sheet"],
				width: 460,
				height: "auto",
				template: "systems/stonetop_pwd/templates/item/arcanum-sheet.hbs",
				resizable: true,
			});
		}

		async getData() {
			const data = await super.getData();
			const flags = this.item.flags?.[ITEM_FLAG_SCOPE] ?? {};
			// Deep-clone before transforming so we never mutate the item's live flags.
			const front = foundry.utils.deepClone(flags.front ?? {});
			const back  = foundry.utils.deepClone(flags.back ?? {});
			if (front.description)         front.description         = centerArcanumTracks(front.description);
			if (front.unlock?.description) front.unlock.description  = centerArcanumTracks(front.unlock.description);
			if (back.description)          back.description          = centerArcanumTracks(back.description);
			data.front = front;
			data.back = back;
			data.slug = flags.slug ?? "";
			data.arcanaImg = majorArcanaImg(flags.slug);
			return data;
		}
	};
}
