import { majorArcanaImg } from "../arcana-icons.js";

export function createStonetopArcanumSheetClass(BaseItemSheet) {
	return class StonetopArcanumSheet extends BaseItemSheet {
		static get defaultOptions() {
			return foundry.utils.mergeObject(super.defaultOptions, {
				classes: ["stonetop", "sheet", "item", "stonetop-arcanum-sheet"],
				width: 460,
				height: "auto",
				template: "modules/stonetop/templates/item/arcanum-sheet.hbs",
				resizable: true,
			});
		}

		async getData() {
			const data = await super.getData();
			const flags = this.item.flags?.stonetop ?? {};
			data.front = flags.front ?? {};
			data.back = flags.back ?? {};
			data.slug = flags.slug ?? "";
			data.arcanaImg = majorArcanaImg(flags.slug);
			return data;
		}
	};
}
