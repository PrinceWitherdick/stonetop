// A journal page is edited through a LIVE ProseMirror surface. v13+ renders a
// `<prose-mirror>` custom element (our per-section location/bestiary editors add the
// class `stonetop-entry-rich-editor`); once it mounts, its editable div carries
// `.ProseMirror` / `contenteditable="true"`; v11–12 wrap it in `.editor` >
// `.editor-content`. The read view carries none of these.
//
// Our render-time enhancers rebuild `<p>`/`<li>`/`<table>` in place (treasure drag-cells,
// requirement checkboxes, roll-table buttons, homebrew-card drags, glyph/tooltip wraps).
// Run over that editing surface, ProseMirror's mutation observer folds the injected
// `<img>`/spans into its document, and `editor.value` then serializes the mangled result
// straight back into the page on save — the `<img>` hoisted out of its `<p>`, the badge
// duplicated as a stray paragraph, the formatting destroyed. So every content-mutating
// enhancer skips anything inside an editor. This mirrors the `_SKIP` clause
// value-tooltips.js / debility-tooltips.js already use for the same reason.
//
// The check is PER-ELEMENT, not per-render: inline section editing is mixed — one section
// is a live editor while its siblings stay in read view and must still be decorated — so a
// blanket "skip the whole render in edit mode" would wrongly strip the sibling views.
export const JOURNAL_EDITOR_SELECTOR =
	'.editor, .editor-content, prose-mirror, .ProseMirror, [contenteditable="true"]';

/**
 * True when `node` sits inside a live journal editing surface (a ProseMirror editor).
 * Accepts an element or a text node (checks its parent). Enhancers call this to leave
 * editor content untouched so their marks never bake into the saved source.
 * @param {Node|null} node
 * @returns {boolean}
 */
export function isInJournalEditor(node) {
	const el = node?.nodeType === 1 ? node : node?.parentElement ?? null;
	return !!el?.closest?.(JOURNAL_EDITOR_SELECTOR);
}
