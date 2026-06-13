import { applyGearTermTooltips } from "../utils/gear-term-tooltips.js";
import { ensureMonsterRefIndex, enrichBestiaryElement } from "../utils/bestiary-cross-refs.js";
import { getHoverDescriptionSetting } from "../settings.js";
import { markQuestionBullets } from "../utils/question-bullets.js";

// Apply gear-term tooltips only to the containers we know hold gear-tag <em>
// elements. Applying to html[0] wholesale reaches into PBTA system partials
// and other structural elements we shouldn't touch.
const GEAR_TAG_SELECTORS = ".stonetop-inv-note, .stonetop-item-description";

// Read-mode prose containers on the monster sheet that hold
// damage/quality/instinct/move text worth cross-linking and tagging.
const BESTIARY_PROSE_SELECTORS = [
	".stonetop-monster-prose",            // concept, damage value, instinct value
	".stonetop-monster-readonly-text",    // qualities, dangers, nests, notes
	".stonetop-monster-move-description",  // monster move bodies
	".stonetop-monster-line",             // hooks / origins lines
	".stonetop-discovery-body",           // discovery sub-section prose
].join(", ");

export function onRenderActorSheet(sheet, html) {
	const root = html[0];
	root?.closest(".app")?.classList.add("stonetop");
	markQuestionBullets(root);

	const type = sheet?.actor?.type;
	if (type === "monster") {
		_enrichBestiarySheet(sheet, root);
		return;
	}

	if (!getHoverDescriptionSetting("hoverDescriptionsGearTags")) return;
	root.querySelectorAll(GEAR_TAG_SELECTORS).forEach(el => applyGearTermTooltips(el));
}

async function _enrichBestiarySheet(sheet, root) {
	if (!root) return;
	const monsterRefs = getHoverDescriptionSetting("hoverDescriptionsMonsterRefs");
	const gearTags    = getHoverDescriptionSetting("hoverDescriptionsGearTags");
	if (!monsterRefs && !gearTags) return;

	// Delegated on the freshly rendered root so it also catches links injected
	// after the (awaited) index build below.
	if (monsterRefs) root.addEventListener("click", _onCreatureRefClick);

	if (monsterRefs) await ensureMonsterRefIndex();
	if (!root.isConnected) return; // sheet re-rendered while we awaited — stale root

	const selfName = sheet.actor?.name ?? "";
	for (const el of root.querySelectorAll(BESTIARY_PROSE_SELECTORS)) {
		enrichBestiaryElement(el, { selfName, monsterRefs, gearTags });
	}
}

async function _onCreatureRefClick(ev) {
	const link = ev.target.closest(".stonetop-monster-ref");
	if (!link) return;
	ev.preventDefault();
	ev.stopPropagation();
	const doc = link.dataset.uuid ? await fromUuid(link.dataset.uuid).catch(() => null) : null;
	doc?.sheet?.render(true);
}
