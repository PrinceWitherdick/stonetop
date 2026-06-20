// De-links content-links a player can't actually follow out of rendered journal
// prose — but keeps the GM-authored hover summary on the ones it's safe to.
//
// Stonetop's prose is densely cross-linked: locations, lore, and the bestiary
// codex all @UUID-link one another, and creature names auto-link into the
// gazetteer. The bestiary codex entries are seeded GM-only (ownership default
// NONE) so players can be surprised by what they meet — but a player reading the
// Setting Overview would still see those creature links rendered as clickable
// text. Clicking one only earns a "you don't have permission to view this"
// warning, and the link styling itself teases that there's a hidden entry behind
// the name.
//
// So at render time we walk a player's enriched journal HTML and de-link any
// content-link they can't open. How we de-link depends on what's behind it:
//
//   • A Location or Lore entry isn't a secret — its one-line summary is meant to
//     orient the reader. We keep that hover summary, swapping the anchor for a
//     non-clickable <span> that still shows the description on hover but never
//     links through (the player just can't open the full entry yet).
//   • The bestiary codex IS a secret. We flatten it to plain text, dropping the
//     tooltip too, so nothing — not even a hover — hints at the hidden entry.
//
// GMs keep every link intact. Runs after applyLocationTooltips (which stamps the
// `data-tooltip` summary we carry across) — see the journal render hook.

/**
 * De-link every content-link in `root` the current user can't view. Location /
 * Lore links keep their hover summary as a plain <span>; bestiary links (and any
 * link with no summary) flatten to plain text. No-op for GMs. Safe to call
 * repeatedly on the same HTML.
 * @param {HTMLElement|jQuery} root  Rendered journal HTML (Foundry passes jQuery
 *                                   on v12, a bare element on v13+).
 */
export function restrictContentLinks(root) {
	if (game.user?.isGM) return;
	const el = root?.jquery ? root[0] : root;
	if (!el?.querySelectorAll) return;
	for (const a of el.querySelectorAll("a.content-link[data-uuid]")) {
		if (currentUserCanView(a.dataset.uuid)) continue;
		// Most cross-links are authored as `<strong>@UUID…</strong>`, so replacing
		// only the anchor leaves the wrapping <strong> in place and the word stays
		// bold — exactly what the GM sees, just no longer clickable.
		const label = (a.textContent ?? "").trim() || a.dataset.uuid;
		const summary = a.dataset.tooltip;
		if (summary && !isSpoilerTarget(a.dataset.uuid)) {
			// Safe to summarize (a Location or Lore entry): keep the hover
			// description on a non-clickable span. No link affordance, no click —
			// just the same one-liner the GM gets on hover.
			const span = document.createElement("span");
			span.className = "content-summary";
			span.dataset.tooltip = summary;
			span.textContent = label;
			a.replaceWith(span);
		} else {
			// Spoiler (the GM-only bestiary codex) or nothing to show: flatten to
			// plain text, dropping any tooltip so nothing teases the hidden entry.
			a.replaceWith(document.createTextNode(label));
		}
	}
}

/**
 * Is `uuid` a GM-only bestiary codex entry — content we must never even hint at
 * to a player (so a de-linked cross-link to it may NOT keep its hover summary)?
 * The codex lives in `bestiary`-type journal pages; Locations and Lore use
 * `location` pages, so the page type cleanly tells the two apart. Resolves the
 * (world) entry the cross-link points at and checks its pages. Anything we can't
 * resolve is treated as a spoiler — the safe default.
 */
function isSpoilerTarget(uuid) {
	let doc = null;
	try { doc = fromUuidSync(uuid); } catch { doc = null; }
	if (!doc) return true;
	if (doc.type === "bestiary") return true; // a direct page-level link
	for (const page of doc.pages ?? []) {
		if (page?.type === "bestiary") return true;
	}
	return false;
}

/**
 * Can the current user open the document at `uuid`? Compendium links defer to
 * the pack's visibility for this user; world links to the document's own
 * ownership. Anything we can't resolve (a broken link, or a compendium pack the
 * user can't see) is treated as off-limits, which is the safe default here.
 */
function currentUserCanView(uuid) {
	if (!uuid) return true;
	if (uuid.startsWith("Compendium.")) {
		const [, scope, packName] = uuid.split(".");
		const pack = game.packs?.get(`${scope}.${packName}`);
		return pack ? pack.visible : false;
	}
	let doc = null;
	try { doc = fromUuidSync(uuid); } catch { doc = null; }
	if (!doc) return false;
	return doc.testUserPermission?.(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER) ?? true;
}
