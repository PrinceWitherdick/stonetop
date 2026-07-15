// Pure helpers for embedding Book II art into journal pages, shared by the runtime
// re-apply (reapply.js) and mirrored inline by the bring-your-own-book macro
// (scripts/local/book2-art/import-book2-art.js). Foundry-free so the embed + match
// logic is unit-testable: callers pass plain strings / arrays; these decide what the
// new content should be and return null when nothing needs to change, so no-op writes
// are skipped and counters stay honest.
//
// Three journal shapes are handled: a "bestiary" codex page keeps its prose in
// system.description, a "location" page in system.sections[].body, and a plain "text"
// page (the Setting Overview's regional-map pages) in text.content. The embed markup +
// `stonetop-journal-art` class match what the macro's compendium pass writes, so the
// idempotency check (does the body already reference this src?) works across paths.

const ART_CLASS = "stonetop-journal-art";
const MAP_FIGURE_CLASS = "stonetop-map";

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

// A minimal top-of-page prose section, used only as a last-resort home for art when a
// page has no sections left to place it in (see below). Empty heading + the "glance"
// act (which the page sheet renders with no divider and directly under the title), so
// the lifted art reads as a plain banner. Matches LocationPageModel's section schema.
function leadArtSection(body) {
	return { kind: "prose", heading: "", group: "glance", danger: false, body, pairs: [], groups: [] };
}

// A fresh global matcher for our canonical embeds. Fresh each call because a global regex
// carries `lastIndex` state that must never leak between calls. Used only to find the
// insertion point (after the last embed already there); detection + stripping match by
// `src` instead (below), so they survive markup that the wrapper regex no longer fits.
const artEmbedRe = () => new RegExp(`<p><img class="${ART_CLASS}"[^>]*></p>`, "g");

// Escape a string for literal use inside a RegExp.
function escapeRegExp(s) {
	return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Managed art is detected and stripped by its exact `src` — the durable-art path this
// system generates — NOT by the surrounding wrapper markup. A GM who opens a location
// page re-saves its sections through ProseMirror, which normalizes each <img> (reorders
// attributes, and can drop our class), so a wrapper-shaped regex would stop recognizing
// art it had already placed and re-insert a duplicate on the next re-apply (while failing
// to strip the old copy during relocation). Keying on `src="<path>"` (quote-delimited, so
// one path is never a prefix of another) stays robust to that, matching how the bestiary
// path stays idempotent (bestiaryDescriptionWithArt uses a plain src substring check too).
const imgTagForSrc = (src) => new RegExp(`<img\\b[^>]*\\ssrc="${escapeRegExp(src)}"[^>]*>`, "gi");

// True if `body` already carries an <img> for exactly this src.
function bodyHasSrc(body, src) {
	return imgTagForSrc(src).test(String(body ?? ""));
}
// `body` with the managed embed(s) for this exact src removed — the <img>, plus its
// wrapping <p> when the <img> is that paragraph's sole content (so relocation leaves no
// empty paragraph behind). Any other art is left intact.
function stripSrcEmbed(body, src) {
	const s = escapeRegExp(src);
	return String(body ?? "")
		.replace(new RegExp(`<p\\b[^>]*>\\s*<img\\b[^>]*\\ssrc="${s}"[^>]*>\\s*</p>`, "gi"), "")
		.replace(imgTagForSrc(src), "");
}

// New location `sections` array that places this row's art in the manifest's target
// section — AUTHORITATIVELY — or null if the page already matches. `srcs` is the ordered
// list of on-disk art paths the manifest assigns to `sectionIndex` (already filtered to
// what exists on disk). Returns a fresh array (the caller's live document data is never
// mutated in place).
//
// The manifest is the source of truth for WHERE each illustration lives: an embed found
// in some OTHER section is RELOCATED into the target section (stripped from where it was,
// re-inserted here), so re-sectioning an image in the picker actually moves it on the page
// instead of being ignored as "already present somewhere". Within the target section, art
// is inserted after the last embed already there, keeping book order; each src appears
// once. An already-correct page (every src in the target section, none lingering
// elsewhere) is a no-op → null, so re-applies don't churn documents.
//
// Placement is resilient to a GM reshaping the page:
//   • if the target section was deleted (index out of range, or a falsy hole) the art
//     falls back to the FIRST real section — the top — so it is never silently dropped; and
//   • if every section has been deleted, a minimal prose section is synthesised at the top
//     to hold it (the page sheet lifts a leading embed into a banner; see journal/lead-art.js).
export function locationSectionsWithArt(sections, sectionIndex, srcs, name) {
	const list = Array.isArray(sections) ? sections : [];
	const wanted = [];
	for (const s of srcs ?? []) if (s && !wanted.includes(s)) wanted.push(s);
	if (!wanted.length) return null;

	// Target the manifest's section; if it's gone (out of range or a falsy hole) fall back
	// to the first real section. findIndex returns -1 for an empty or all-empty list.
	const requested = sectionIndex ?? 0;
	const targetIdx = list[requested] ? requested : list.findIndex((s) => s);

	// No-op fast path: every wanted src already sits in the target section and nowhere else.
	const targetBody = targetIdx >= 0 ? (list[targetIdx].body ?? "") : "";
	let needsWork = wanted.some((src) => !bodyHasSrc(targetBody, src));
	for (let i = 0; i < list.length && !needsWork; i++) {
		if (i === targetIdx || !list[i]) continue;
		needsWork = wanted.some((src) => bodyHasSrc(list[i].body ?? "", src));
	}
	if (!needsWork) return null;

	// Strip every wanted src out of every section (new objects only where the body changed)
	// so the re-insert below gives each a single, authoritative home.
	const next = list.slice();
	for (let i = 0; i < next.length; i++) {
		const sec = next[i];
		if (!sec) continue;
		let body = sec.body ?? "";
		for (const src of wanted) body = stripSrcEmbed(body, src);
		if (body !== (sec.body ?? "")) next[i] = { ...sec, body };
	}

	const add = wanted.map((src) => artEmbed(src, name)).join("");
	if (targetIdx < 0) return [leadArtSection(add)]; // page had no sections at all

	// Insert into the target section after its last remaining art embed (book order).
	const sec = next[targetIdx];
	const body = sec.body ?? "";
	const re = artEmbedRe();
	let lastEnd = -1, m;
	while ((m = re.exec(body))) lastEnd = m.index + m[0].length;
	next[targetIdx] = { ...sec, body: lastEnd >= 0 ? body.slice(0, lastEnd) + add + body.slice(lastEnd) : add + body };
	return next;
}

// The <figure> embed for a Setting Overview regional map. Distinct markup from the
// bestiary/location illustrations (a captioned, column-bounded figure rather than a
// framed inline <img>), matching the private project's setting-journal map pages.
export function mapFigureEmbed(src, name) {
	return `<figure class="${MAP_FIGURE_CLASS}"><img src="${src}" alt="${esc(name)}"></figure>`;
}

// New text-page content with a map figure prepended at the top, or null when nothing
// should change. Idempotent on the src path, AND a no-op if the page already carries
// ANY map figure: a world that already shows a map here (e.g. a GM's own labelled
// variant) is never given a second, stacked one.
export function textPageWithMap(content, src, name) {
	const html = content ?? "";
	if (html.includes(src) || html.includes(`class="${MAP_FIGURE_CLASS}"`)) return null;
	return mapFigureEmbed(src, name) + html;
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
