// Shared view-model builders for the GM-prep cards (threat + hazard). The two cards use
// the same doom-track / GM-moves / custom-player-moves markup and data hooks, so the
// derivation of those pieces lives once here; each card's own builder adds only its
// unique fields (a threat's themes/aspects/stakes/nested, a hazard's damage line).
import { enrichHTML } from "../utils/foundry-compat.js";

/** True when a value has non-whitespace text. */
export function hasText(s) {
	return !!String(s ?? "").trim();
}

/** Trimmed, non-empty strings from a string-list system field. */
export function stringList(arr) {
	return (Array.isArray(arr) ? arr : []).map(String).filter(hasText);
}

/** The grim-portent doom rows ({index, text, done}); keeps a ticked-but-blank row. */
export function buildDoomRows(sys) {
	const grim = Array.isArray(sys.grimPortents) ? sys.grimPortents : [];
	return grim
		.map((p, index) => ({ index, text: String(p?.text ?? ""), done: !!p?.done }))
		.filter(r => hasText(r.text) || r.done);
}

/** The impending-doom line VM ({text, done, hasText}). */
export function buildImpending(sys) {
	return {
		text: String(sys.impendingDoom?.text ?? ""),
		done: !!sys.impendingDoom?.done,
		hasText: hasText(sys.impendingDoom?.text),
	};
}

/** Custom player-move cards with enriched prose; drops fully-blank rows. Async. */
export async function buildCustomPlayerMoves(sys, enrich) {
	const raw = Array.isArray(sys.customPlayerMoves) ? sys.customPlayerMoves : [];
	const out = [];
	for (const m of raw) {
		if (!hasText(m?.label) && !hasText(m?.text)) continue;
		out.push({ label: String(m?.label ?? ""), text: await enrich(m?.text) });
	}
	return out;
}

/** The card prose enricher: resolves @UUID links / inline rolls, hiding GM secret blocks. */
export function cardEnricher() {
	return (html) => enrichHTML(String(html ?? ""), { secrets: false });
}
