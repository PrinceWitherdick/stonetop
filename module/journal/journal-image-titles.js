/**
 * Title the image-popout with the JournalEntry's name when a reader clicks a
 * picture embedded in a journal page.
 *
 * Core's `JournalEntrySheet#_onClickImage` (client/applications/sheets/journal/
 * journal-entry-sheet.mjs) opens an ImagePopout when any journal image is clicked
 * and titles it `page?.name ?? target.title`. The `page.name` branch only fires
 * for a dedicated *image-type* page (`.journal-entry-page.image`); every other
 * picture — our Book II art embeds (`<img class="stonetop-journal-art">`), the
 * Setting Overview map figures, any illustration inside a prose/location/bestiary
 * page — is not on such a page, so core falls back to the `<img>`'s `title`
 * attribute. Our embeds carry only `alt`, never `title`, so the popout opens with
 * a blank window title.
 *
 * We want the enlarged view to be labelled with the entry it came from — e.g.
 * enlarging the banner on the "Huffel Peaks" journal should title the popout
 * "Huffel Peaks". Rather than reimplement core's handler (it evolves — `caption`
 * and `shareImage` were added recently), we WRAP it: for a content image with no
 * title of its own, we set the `<img>`'s `title` to the entry name just long
 * enough for core's synchronous `title` read, then strip it back off (so no native
 * browser tooltip lingers). Dedicated image pages, foreign images, and any image
 * that already carries an intentional `title` are handed straight to core
 * untouched.
 *
 * Patches the AppV2 `JournalEntrySheet` (the entry window on v13+/v14, which is
 * where the click listener lives) and, defensively, the legacy AppV1 `JournalSheet`
 * — both share the exact same title-fallback line. Idempotent via an own-property
 * marker, mirroring resizable-dialogs.js.
 */

// Set the clicked image's title to `name` only for core's synchronous read, then
// restore it. `base` is core's own `_onClickImage`, so every other behaviour
// (caption, share-image, nopopout, dedicated image pages) is inherited unchanged.
function wrapOnClickImage(proto) {
	if (!proto || Object.prototype.hasOwnProperty.call(proto, "_stonetopImageTitlePatched")) return;
	const base = proto._onClickImage;
	if (typeof base !== "function") return;

	proto._onClickImage = function (event) {
		// The clicked <img>: `currentTarget` on AppV1's jQuery-delegated listener
		// (bound to `img:not(.nopopout)`), `target` on AppV2's frame-level listener.
		const target = event?.currentTarget?.matches?.("img") ? event.currentTarget : event?.target;
		const entry = this.entry ?? this.document ?? this.object;

		// Only nudge the title for a picture embedded in page content: skip dedicated
		// image pages (core already names those), non-images / nopopout images, any
		// image with its own title, and the (impossible-but-cheap-to-guard) nameless
		// entry.
		const isContentImage = target?.matches?.("img:not(.nopopout)")
			&& !target.closest?.(".journal-entry-page.image")
			&& !target.getAttribute?.("title")
			&& entry?.name;
		if (!isContentImage) return base.call(this, event);

		target.setAttribute("title", entry.name);
		try {
			return base.call(this, event);
		} finally {
			// The image never had a title of its own (guarded above), so removing ours
			// restores it exactly — no stray native tooltip on hover.
			target.removeAttribute("title");
		}
	};
	proto._stonetopImageTitlePatched = true;
}

export function patchJournalImagePopoutTitles() {
	wrapOnClickImage(foundry?.applications?.sheets?.journal?.JournalEntrySheet?.prototype);
	// Legacy AppV1 entry sheet (v12); harmless no-op where it isn't present.
	wrapOnClickImage(foundry?.appv1?.sheets?.JournalSheet?.prototype);
}
