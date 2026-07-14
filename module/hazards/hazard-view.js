// Builds the shared view-model for a hazard card, used by all three renderers: the
// page sheet (view mode), the steading tab's Hazards section, and the on-canvas
// overlay. The hazard card deliberately reuses the threat card's markup conventions
// (.threat-card wrapper, .threat-portent__check doom boxes, [data-threat-reveal]),
// so threat-view's shared wiring (doom toggles, reveal clicks, drag-to-pin) works on
// hazard cards without a parallel set of handlers.
import { HAZARD_ACCENT, resolveDamageEffects, formatHazardDamage } from "./hazard-data.js";
import { isThreatRevealed } from "../threats/threat-store.js";
import { enrichHTML } from "../utils/foundry-compat.js";

function hasText(s) {
	return !!String(s ?? "").trim();
}

/** The hazard's book-style damage line ("1d10+2 (ignores armor, forceful)"), derived
 *  from the stored worksheet picks plus any free-form extras. */
export function hazardDamageLine(sys = {}) {
	const { tags, bonus } = resolveDamageEffects(sys.damageEffects ?? []);
	const extra = String(sys.damageExtra ?? "").split(",").map(t => t.trim()).filter(Boolean);
	return formatHazardDamage({
		die: sys.damageDie ?? "",
		bonus,
		tags: [...tags, ...extra.filter(t => !tags.includes(t))],
		certainDeath: !!sys.certainDeath,
	});
}

/**
 * View-model for one hazard page. Async because prose fields are enriched. Pass
 * `{ forOwner }` to force the owner/editable affordances (defaults to page.isOwner).
 */
export async function buildHazardCardVM(page, { forOwner } = {}) {
	const sys = page.system ?? {};
	// Enrich prose (resolve @UUID links, inline rolls) without revealing GM secret blocks.
	const enrich = (html) => enrichHTML(String(html ?? ""), { secrets: false });

	const grim = Array.isArray(sys.grimPortents) ? sys.grimPortents : [];
	const doomRows = grim
		.map((p, index) => ({ index, text: String(p?.text ?? ""), done: !!p?.done }))
		.filter(r => hasText(r.text) || r.done);
	const impending = {
		text: String(sys.impendingDoom?.text ?? ""),
		done: !!sys.impendingDoom?.done,
		hasText: hasText(sys.impendingDoom?.text),
	};

	const gmMoves = (Array.isArray(sys.gmMoves) ? sys.gmMoves : []).map(String).filter(hasText);

	const rawCustom = Array.isArray(sys.customPlayerMoves) ? sys.customPlayerMoves : [];
	const customPlayerMoves = [];
	for (const m of rawCustom) {
		if (!hasText(m?.label) && !hasText(m?.text)) continue;
		customPlayerMoves.push({ label: String(m?.label ?? ""), text: await enrich(m?.text) });
	}

	const damage = hazardDamageLine(sys);

	return {
		id: page.id,
		uuid: page.uuid,
		name: page.name,
		accent: HAZARD_ACCENT,
		damage,
		hasDamage: hasText(damage),
		certainDeath: !!sys.certainDeath,
		instinct: String(sys.instinct ?? ""),
		hasInstinct: hasText(sys.instinct),
		description: await enrich(sys.description),
		hasDescription: hasText(sys.description),
		advanceTrigger: String(sys.advanceTrigger ?? ""),
		hasAdvanceTrigger: hasText(sys.advanceTrigger),
		doomRows,
		impendingDoom: impending,
		hasDoomTrack: doomRows.length > 0 || impending.hasText,
		gmMoves,
		hasGmMoves: gmMoves.length > 0,
		customPlayerMoves,
		hasCustomMoves: customPlayerMoves.length > 0,
		revealed: isThreatRevealed(page),
		isOwner: forOwner ?? page.isOwner,
	};
}
