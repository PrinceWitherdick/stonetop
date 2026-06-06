import { applyGearTermTooltips } from "../utils/gear-term-tooltips.js";
import { getHoverDescriptionSetting } from "../settings.js";
import { markQuestionBullets } from "../utils/question-bullets.js";

// Apply gear-term tooltips only to the containers we know hold gear-tag <em>
// elements. Applying to html[0] wholesale reaches into PBTA system partials
// and other structural elements we shouldn't touch.
const GEAR_TAG_SELECTORS = ".stonetop-inv-note, .stonetop-item-description";

export function onRenderActorSheet(sheet, html) {
	html[0]?.closest(".app")?.classList.add("stonetop");
	markQuestionBullets(html[0]);
	if (!getHoverDescriptionSetting("hoverDescriptionsGearTags")) return;
	html[0].querySelectorAll(GEAR_TAG_SELECTORS).forEach(el => {
		applyGearTermTooltips(el);
	});
}
