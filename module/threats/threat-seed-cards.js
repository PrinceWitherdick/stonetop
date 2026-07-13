// A homebrew threat authored in-app becomes a draggable "Threat" card in a shared
// journal (like the steading-improvement cards). The card carries the threat SEED
// (name / type / instinct / proximity / suggested GM moves) as a data-attribute
// payload; dropping it onto a steading sheet's Threats tab creates that steading's
// own threat entry from the seed (see StonetopSteadingSheet). The card reuses the
// improvement card's look with its own accent + skull icon.
import { escHtml } from "../utils/strings.js";
import { createHomebrewCard, readHomebrewCardPayload, bindHomebrewCardDrag } from "../journal/homebrew-cards.js";
import { ensureChronicleFolder } from "../utils/chronicle.js";
import { threatType, threatProximity } from "./threat-types.js";

export const STONETOP_THREAT_SEED_DRAG_TYPE = "StonetopThreatSeed";

/** Read + parse a threat card's seed, or null if malformed. */
export function readThreatSeedCard(card) {
	return readHomebrewCardPayload(card, "stonetopThreat");
}

/**
 * Build the draggable card HTML for a threat seed. User-authored text is plain, so
 * it's HTML-escaped; the seed payload is stored verbatim (unescaped strings) so the
 * drop handler recreates the threat exactly as authored.
 * @param {{name:string, type?:string, instinct?:string, proximity?:string, gmMoves?:string[]}} seed
 */
export function renderThreatSeedCardHtml(seed) {
	const type = threatType(seed?.type);
	const prox = threatProximity(seed?.proximity);
	const name = escHtml(seed?.name ?? "New Threat");
	const instinct = escHtml(seed?.instinct ?? "");
	const moves = (Array.isArray(seed?.gmMoves) ? seed.gmMoves : []).map(escHtml);

	const payload = {
		name: seed?.name ?? "New Threat",
		type: type.id,
		instinct: seed?.instinct ?? "",
		proximity: prox.id,
		gmMoves: Array.isArray(seed?.gmMoves) ? seed.gmMoves : [],
	};
	const dataAttr = escHtml(JSON.stringify(payload));

	const body = [];
	body.push(`<p class="stonetop-journal-threat-meta"><strong>${escHtml(type.label)}</strong> &middot; ${escHtml(prox.label)}</p>`);
	if (instinct) body.push(`<p class="stonetop-journal-improvement-flavor"><em>Instinct:</em> ${instinct}</p>`);
	if (moves.length) body.push(`<ul class="steading-req-list">${moves.map(m => `<li class="check-bullet">${m}</li>`).join("")}</ul>`);

	return `<div class="stonetop-journal-improvement stonetop-journal-threat" draggable="true" data-stonetop-threat="${dataAttr}" title="Drag onto the Stonetop steading sheet's Threats tab">`
		+ `<div class="stonetop-journal-improvement-head">`
		+ `<i class="fas fa-skull" aria-hidden="true"></i>`
		+ `<span class="stonetop-journal-improvement-eyebrow">Threat</span>`
		+ `<span class="stonetop-journal-improvement-name">${name}</span>`
		+ `</div>`
		+ `<div class="stonetop-journal-improvement-body">${body.join("")}</div>`
		+ `</div>`;
}

/** Author a homebrew threat card into the shared homebrew journal and open it. GM-only. */
export function createThreatSeedCard(seed) {
	return createHomebrewCard({
		title: "Threats",
		kind: "threat",
		name: seed?.name,
		html: renderThreatSeedCardHtml(seed),
		ensureFolder: ensureChronicleFolder,
	});
}

/**
 * Attach drag behaviour to every threat-seed card under `root` (idempotent). Baked
 * HTML can't populate `dataTransfer`, so this serializes the card's seed into the
 * payload the steading Threats tab drop handler recognizes.
 * @param {HTMLElement|jQuery} root
 */
export function bindThreatSeedDrag(root) {
	bindHomebrewCardDrag(root, {
		selector: ".stonetop-journal-threat[data-stonetop-threat]",
		datasetKey: "stonetopThreat",
		boundFlag: "stThreatBound",
		dragType: STONETOP_THREAT_SEED_DRAG_TYPE,
		payloadKey: "seed",
	});
}
