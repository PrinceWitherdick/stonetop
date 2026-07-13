// Builds the shared view-model for a threat card, used by all three renderers:
// the page sheet (view mode), the steading Threats tab, and the on-canvas overlay.
// Centralizing it keeps the book-faithful card identical everywhere and gives every
// host the same data-* hooks (data-portent-index / data-doom) to wire interactivity.
import { threatType, threatProximity } from "./threat-types.js";
import { isThreatRevealed, setPortentDone, setDoomDone, setThreatRevealed } from "./threat-store.js";
import { enrichHTML } from "../utils/foundry-compat.js";

function hasText(s) {
	return !!String(s ?? "").trim();
}

/**
 * View-model for one threat page. Async because prose fields are enriched. Pass
 * `{ forOwner }` to force the owner/editable affordances (defaults to page.isOwner).
 */
export async function buildThreatCardVM(page, { forOwner } = {}) {
	const sys = page.system ?? {};
	const type = threatType(sys.type);
	const proximity = threatProximity(sys.proximity);
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

	const stakes = (Array.isArray(sys.stakes) ? sys.stakes : []).map(String).filter(hasText);
	const gmMoves = (Array.isArray(sys.gmMoves) ? sys.gmMoves : []).map(String).filter(hasText);
	const nested = (Array.isArray(sys.nested) ? sys.nested : [])
		.filter(n => hasText(n?.name))
		.map(n => ({ name: String(n.name), type: threatType(n.type).label, instinct: String(n.instinct ?? "") }));

	const rawCustom = Array.isArray(sys.customPlayerMoves) ? sys.customPlayerMoves : [];
	const customPlayerMoves = [];
	for (const m of rawCustom) {
		if (!hasText(m?.label) && !hasText(m?.text)) continue;
		customPlayerMoves.push({ label: String(m?.label ?? ""), text: await enrich(m?.text) });
	}

	return {
		id: page.id,
		uuid: page.uuid,
		name: page.name,
		type,
		accent: type.accent,
		instinct: String(sys.instinct ?? ""),
		hasInstinct: hasText(sys.instinct),
		proximity,
		description: await enrich(sys.description),
		hasDescription: hasText(sys.description),
		doomRows,
		impendingDoom: impending,
		hasDoomTrack: doomRows.length > 0 || impending.hasText,
		stakes,
		hasStakes: stakes.length > 0,
		gmMoves,
		hasGmMoves: gmMoves.length > 0,
		customPlayerMoves,
		hasCustomMoves: customPlayerMoves.length > 0,
		nested,
		hasNested: nested.length > 0,
		revealed: isThreatRevealed(page),
		isOwner: forOwner ?? page.isOwner,
	};
}

// ── Shared card interactivity ───────────────────────────────────────────────────
// The card view is identical across the page sheet, the steading Threats tab, and the
// on-canvas overlay, so the two interactions its data-* hooks expose (ticking the doom
// track, toggling reveal) are wired once here. Hosts differ only in how a card element
// maps back to its page — passed in as `resolvePage` — and in what they do afterward.

/**
 * Wire the doom-track checkboxes onto a delegated `root`: ticking a grim portent or the
 * impending-doom box writes straight to the page. `resolvePage(checkbox)` returns the
 * page (or a promise of it) the ticked control belongs to.
 */
export function wireThreatDoomChange(root, resolvePage) {
	root.addEventListener("change", async ev => {
		const chk = ev.target.closest?.(".threat-portent__check");
		if (!chk || chk.disabled) return;
		ev.stopPropagation();
		const page = await resolvePage(chk);
		if (!page) return;
		if (chk.dataset.doom === "true") await setDoomDone(page, chk.checked);
		else await setPortentDone(page, Number(chk.dataset.portentIndex), chk.checked);
	});
}

/**
 * Wire "drag a threat card onto a scene to drop a linked pin" on a delegated `root`. The
 * WHOLE card is the drag handle (no grip element), so the selector matches the draggable
 * card; hosts pass their own scoped `selector` and an optional `fallbackUuid` (the page's
 * own uuid, used when the card markup doesn't carry data-page-uuid). Centralized here so
 * every host (page sheet, steading tab, overlay) shares one selector and can't diverge.
 * @param {HTMLElement} root
 * @param {{ selector?: string, fallbackUuid?: string|null }} [opts]
 */
export function wireThreatCardDrag(root, { selector = ".threat-card[draggable='true']", fallbackUuid = null } = {}) {
	root.addEventListener("dragstart", ev => {
		const card = ev.target.closest?.(selector);
		if (!card) return;
		const uuid = card.dataset.pageUuid || fallbackUuid;
		if (!uuid) return;
		ev.dataTransfer.setData("text/plain", JSON.stringify({ type: "JournalEntryPage", uuid }));
		ev.dataTransfer.effectAllowed = "copy";
	});
}

/**
 * Handle a click on a card's reveal eye, if that's what was clicked. Call from a host's
 * own click handler and honor the returned boolean (true = handled, stop). Kept as a
 * call rather than its own listener so a host can run its post-reveal work (e.g. a
 * re-render the ownership flip doesn't trigger) and interleave with its other branches.
 * @returns {Promise<boolean>} whether a reveal toggle was handled.
 */
export async function handleThreatRevealClick(ev, resolvePage) {
	const reveal = ev.target.closest?.("[data-threat-reveal]");
	if (!reveal) return false;
	ev.preventDefault(); ev.stopPropagation();
	const page = await resolvePage(reveal);
	if (page) await setThreatRevealed(page, !isThreatRevealed(page));
	return true;
}
