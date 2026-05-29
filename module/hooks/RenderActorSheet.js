import { applyGearTermTooltips } from "../utils/gear-term-tooltips.js";

// Apply gear-term tooltips only to the containers we know hold gear-tag <em>
// elements. Applying to html[0] wholesale reaches into PBTA system partials
// and other structural elements we shouldn't touch.
const GEAR_TAG_SELECTORS = ".stonetop-inv-note, .stonetop-item-description";

export function onRenderActorSheet(sheet, html) {
	html[0]?.closest(".app")?.classList.add("stonetop");
	html[0].querySelectorAll(GEAR_TAG_SELECTORS).forEach(el => {
		applyGearTermTooltips(el);
	});
}
