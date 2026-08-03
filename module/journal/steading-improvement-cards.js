// Makes the baked "Steading Improvement" cards in journal prose draggable onto the
// Stonetop steading sheet. The cards are emitted by the gazetteer generator (see
// scripts/local/shared/gazetteer.mjs `renderSteadingImprovementCard`) with a
// `data-steading-improvement` attribute carrying the structured definition as JSON.
//
// Baked HTML can't populate `dataTransfer`, so — like the bestiary's
// `_bindStatBlockDrag` — this runtime pass attaches a `dragstart`. Unlike that one
// (which emits Foundry's native `{type:"Actor", uuid}` payload for the canvas drop
// handler), here we serialize the card's full definition into a custom payload the
// steading sheet's own drop handler recognizes. Wired
// from every journal render path (the generic journal hook for Lore/prose pages and
// the Location page sheet, which renders through its own sheet).

import { escHtml } from "../utils/strings.js";
import { createHomebrewCard, readHomebrewCardPayload, bindHomebrewCardDrag } from "./homebrew-cards.js";

export const STEADING_IMPROVEMENT_DRAG_TYPE = "StonetopSteadingImprovement";

/**
 * Runtime twin of the gazetteer's `renderSteadingImprovementCard` (build-time,
 * scripts/local) — builds the same draggable card HTML for an improvement authored
 * in-app, so a dropped homebrew card lands as an identical custom improvement. User
 * input is plain text, so it's HTML-escaped (the built-ins ship light markdown that
 * the generator processes; here there's none to process).
 * @param {{name:string, flavor?:string, effect?:string, category?:string, sections?:Array<{heading?:string, items?:string[]}>}} def
 */
export function renderImprovementCardHtml(def) {
	const name = escHtml(def?.name ?? "");
	const flavor = def?.flavor ? escHtml(def.flavor) : "";
	const effect = def?.effect ? escHtml(def.effect) : "";
	const sections = (Array.isArray(def?.sections) ? def.sections : []).map(s => ({
		heading: escHtml(s?.heading ?? ""),
		items: (Array.isArray(s?.items) ? s.items : []).map(escHtml),
	}));

	// Payload mirrors the built-in IMPROVEMENT_DEFINITIONS shape (items are HTML
	// strings); double-escaped for the double-quoted attribute, decoded on read.
	// `category` rides along so a dropped card lands under the right filter chip on the
	// steading sheet; the build-time gazetteer emits no category, and those cards stay
	// uncategorised (and so unfiltered). Validated by StonetopSteading.addCustomImprovement.
	const payload = { name: def?.name ?? "", category: def?.category ?? "", flavor, effect, sections };
	const dataAttr = escHtml(JSON.stringify(payload));

	const body = [];
	if (flavor) body.push(`<p class="stonetop-journal-improvement-flavor">${flavor}</p>`);
	for (const s of sections) {
		if (s.heading) body.push(`<p class="steading-req-heading">${s.heading}</p>`);
		if (s.items.length) body.push(`<ul class="steading-req-list">${s.items.map(i => `<li class="check-bullet">${i}</li>`).join("")}</ul>`);
	}
	if (effect) body.push(`<p class="stonetop-journal-improvement-effect">${effect}</p>`);

	return `<div class="stonetop-journal-improvement" draggable="true" data-steading-improvement="${dataAttr}" title="Drag onto the Stonetop steading sheet">`
		+ `<div class="stonetop-journal-improvement-head">`
		+ `<i class="fas fa-screwdriver-wrench" aria-hidden="true"></i>`
		+ `<span class="stonetop-journal-improvement-eyebrow">Steading Improvement</span>`
		+ `<span class="stonetop-journal-improvement-name">${name}</span>`
		+ `</div>`
		+ `<div class="stonetop-journal-improvement-body">${body.join("")}</div>`
		+ `</div>`;
}

/** Author a homebrew steading-improvement card into the shared homebrew journal and
 *  open it so the fresh draggable card is on screen. GM-only. */
export function createImprovementCard(def) {
	return createHomebrewCard({
		title: "Homebrew Steading Improvements",
		kind: "improvement",
		name: def?.name,
		html: renderImprovementCardHtml(def),
	});
}

/** Read + parse a card's improvement definition, or null if malformed. */
export function readImprovementCard(card) {
	return readHomebrewCardPayload(card, "steadingImprovement");
}

/**
 * Attach drag behaviour to every steading-improvement card under `root`.
 * Idempotent — re-binding a card is skipped, so it's safe on every render.
 * @param {HTMLElement|jQuery} root
 */
export function bindSteadingImprovementDrag(root) {
	bindHomebrewCardDrag(root, {
		selector: ".stonetop-journal-improvement[data-steading-improvement]",
		datasetKey: "steadingImprovement",
		boundFlag: "stImprovementBound",
		dragType: STEADING_IMPROVEMENT_DRAG_TYPE,
		payloadKey: "improvement",
	});
}
