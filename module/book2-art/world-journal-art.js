// Pure helpers for embedding Book II art into journal pages, shared by the runtime
// re-apply (reapply.js) and mirrored inline by the bring-your-own-book macro
// (scripts/local/book2-art/import-book2-art.js). Foundry-free so the embed + match
// logic is unit-testable: callers pass plain strings / arrays; these decide what the
// new content should be and return null when nothing needs to change, so no-op writes
// are skipped and counters stay honest.
//
// Both journal shapes are handled: a "bestiary" codex page keeps its prose in
// system.description, a "location" page in system.sections[].body. The embed markup +
// `stonetop-journal-art` class match what the macro's compendium pass writes, so the
// idempotency check (does the body already reference this src?) works across paths.

const ART_CLASS = "stonetop-journal-art";

function esc(s) {
	return String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

// The exact <p><img …></p> embed the compendium/world passes write. Kept in one place
// so every path produces identical markup (and so the idempotency + insertion regex
// below stay in lockstep with it).
export function artEmbed(src, name) {
	return `<p><img class="${ART_CLASS}" src="${src}" alt="${esc(name)}"></p>`;
}

// New bestiary-page description with the art embed prepended, or null if this src is
// already embedded. Idempotent on the src path (not the whole embed), so re-running
// with a different alt never double-adds.
export function bestiaryDescriptionWithArt(description, src, name) {
	const desc = description ?? "";
	if (desc.includes(src)) return null;
	return artEmbed(src, name) + desc;
}

// New location `sections` array with any missing art embeds inserted into the target
// section's body, in book order — after the LAST art embed already there rather than
// pushed above older ones — or null if there's nothing to add. `srcs` is the ordered
// list of on-disk art paths for this location (already filtered to what exists on
// disk). Returns a fresh array with only the target section replaced, so the caller's
// live document data is never mutated in place.
export function locationSectionsWithArt(sections, sectionIndex, srcs, name) {
	const list = Array.isArray(sections) ? sections : [];
	const idx = sectionIndex ?? 0;
	const sec = list[idx];
	if (!sec) return null;

	const body = sec.body ?? "";
	let add = "";
	for (const src of srcs ?? []) {
		if (!body.includes(src) && !add.includes(src)) add += artEmbed(src, name);
	}
	if (!add) return null;

	const artRe = new RegExp(`<p><img class="${ART_CLASS}"[^>]*></p>`, "g");
	let lastEnd = -1, m;
	while ((m = artRe.exec(body))) lastEnd = m.index + m[0].length;
	const newBody = lastEnd >= 0 ? body.slice(0, lastEnd) + add + body.slice(lastEnd) : add + body;

	const next = list.slice();
	next[idx] = { ...sec, body: newBody };
	return next;
}

// Find the page within a world JournalEntry that corresponds to a compendium page.
// Match by id first (stable on a fresh seed, where fromCompendium keeps embedded ids)
// then fall back to name + type: the managed-journal refresh recreates pages with
// fresh ids (SeedCompendiums.js createEmbeddedDocuments … keepId:false), so id-matching
// alone would miss a world whose entry has been refreshed. `pages` may be an array or a
// Foundry EmbeddedCollection. Returns the page doc or null.
export function matchWorldPage(pages, pageId, pageName, pageType) {
	const list = Array.isArray(pages) ? pages : (pages?.contents ?? (pages ? Array.from(pages) : []));
	return list.find((p) => (p.id ?? p._id) === pageId)
		?? (pageName ? list.find((p) => p.name === pageName && p.type === pageType) : null)
		?? null;
}
