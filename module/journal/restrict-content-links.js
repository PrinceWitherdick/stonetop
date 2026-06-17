// Strips content-links a player can't actually follow out of rendered journal
// prose, leaving just the link's label as plain text.
//
// Stonetop's prose is densely cross-linked: locations, lore, and the bestiary
// codex all @UUID-link one another, and creature names auto-link into the
// gazetteer. The bestiary codex entries are seeded GM-only (ownership default
// NONE) so players can be surprised by what they meet — but a player the GM has
// granted a Location or Lore journal would still see those creature links
// rendered as clickable text. Clicking one only earns a "you don't have
// permission to view this" warning, and the link styling itself teases that
// there's a hidden entry behind the name.
//
// So at render time we walk a player's enriched journal HTML and replace any
// content-link they can't open with its plain label: the prose still reads
// normally and nothing hints at the secret entry. GMs keep every link intact.

/**
 * De-link every content-link in `root` the current user can't view, leaving the
 * link's label as plain text. No-op for GMs (they can see everything). Safe to
 * call repeatedly on the same HTML.
 * @param {HTMLElement|jQuery} root  Rendered journal HTML (Foundry passes jQuery
 *                                   on v12, a bare element on v13+).
 */
export function restrictContentLinks(root) {
	if (game.user?.isGM) return;
	const el = root?.jquery ? root[0] : root;
	if (!el?.querySelectorAll) return;
	for (const a of el.querySelectorAll("a.content-link[data-uuid]")) {
		if (currentUserCanView(a.dataset.uuid)) continue;
		// Replace only the anchor, not its surroundings: most cross-links are
		// authored as `<strong>@UUID…</strong>`, so swapping the <a> for a text
		// node leaves the wrapping <strong> in place and the word stays bold —
		// exactly what the GM sees, just no longer clickable. (The "link look" is
		// only cursor/hover, which goes away with the anchor; bold is prose
		// emphasis we keep.)
		const label = (a.textContent ?? "").trim() || a.dataset.uuid;
		a.replaceWith(document.createTextNode(label));
	}
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
