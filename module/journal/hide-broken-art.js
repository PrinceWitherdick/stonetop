// Belt-and-braces safety net: never let a book-art image paint as the browser's
// broken-image glyph in a journal. The re-apply only ever embeds art whose file is
// on the GM's server disk (module/book2-art/reapply.js), and Foundry serves that
// folder to every client — so in the normal shared-world case a player loads exactly
// what the GM imported. This covers the failure modes OUTSIDE that guarantee: the
// durable art folder was moved or deleted after the embed was written, a world was
// migrated to a host that didn't carry it, or a stale embed points at a file that is
// simply gone. In any of those, the stored <img> would render an empty frame for
// whoever opens the page. We watch our own art images at render time and, if one
// fails to load, quietly drop its wrapper so the reader sees no gap where a picture
// would have been — rather than a broken box.
//
// Scoped to the two shapes this system embeds, so a GM's own hand-embedded prose
// image (a broken one there is theirs to notice and fix) is left alone:
//   • <img class="stonetop-journal-art">        inline illustrations + the lifted banner
//   • <figure class="stonetop-map"><img></…>    Setting Overview regional maps
// Runs for GMs and players alike, on every journal render, and is idempotent — each
// image element is wired at most once. Mirrors the root-unwrap style of the sibling
// journal render passes (restrict-content-links.js).

import { isInJournalEditor } from "../utils/journal-editor-guard.js";

// Remove a failed image's smallest sensible wrapper. A banner can hold several
// lead-art paragraphs, so drop only the failing <p> (or a map's <figure>); then, if
// that emptied the lifted banner shell, remove the shell too so no bare frame lingers.
function dropBrokenArt(img) {
	const banner = img.closest(".stonetop-journal-art-banner");
	(img.closest("figure.stonetop-map") || img.closest("p") || img).remove();
	if (banner && !banner.querySelector("img")) banner.remove();
}

// Wire every managed art image in `root` to self-remove on load failure. `root` is
// the rendered journal HTML — jQuery on v12, a bare element on v13+ (match the other
// journal render passes).
export function hideBrokenJournalArt(root) {
	const el = root?.jquery ? root[0] : root;
	if (!el?.querySelectorAll) return;
	for (const img of el.querySelectorAll("img.stonetop-journal-art, figure.stonetop-map img")) {
		if (img._stonetopBrokenArtWired) continue;
		// Never touch an image inside a live editor: dropping a "broken" one there would
		// delete it from the saved source on the next save (see journal-editor-guard.js).
		if (isInJournalEditor(img)) continue;
		img._stonetopBrokenArtWired = true;
		// Attach the listener BEFORE the already-loaded check, so an image that errors
		// in the gap between the two can't slip past. A finished load has complete ===
		// true; a broken one additionally has naturalWidth === 0 (a good raster load is
		// > 0), which is the only way to catch a failure that happened before this code
		// ran — the error event won't fire again for it. Our art is raster .webp, so a
		// successful load always reports a non-zero natural width.
		img.addEventListener("error", () => dropBrokenArt(img), { once: true });
		if (img.complete && img.naturalWidth === 0) dropBrokenArt(img);
	}
}
