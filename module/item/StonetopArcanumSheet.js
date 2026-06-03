import { majorArcanaImg } from "../arcana-icons.js";
import { ITEM_FLAG_SCOPE } from "../actors/character/StonetopFlags.js";

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
			data.front = flags.front ?? {};
			data.back = flags.back ?? {};
			data.slug = flags.slug ?? "";
			data.arcanaImg = majorArcanaImg(flags.slug);
			return data;
		}
	};
}
