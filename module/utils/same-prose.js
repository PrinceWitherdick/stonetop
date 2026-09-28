// Two pieces of HTML that a ProseMirror editor would hold as the same document.
//
// WHY A SAVE HAS TO ASK. An always-on editor (a `<prose-mirror>` without `toggled`) saves itself
// when it is taken off the page, and reports a `change` whenever its content, as ProseMirror
// writes it out, differs from the HTML it was handed. Book pages ship HTML that ProseMirror writes
// differently (classes it has no mark for, wrappers it unwraps, whitespace), so closing or
// redrawing a pop-out "changed" every such field without anybody typing a letter. Writing that
// back stopped the page reading as pristine to the managed journal updates, and on a location page
// the extra writes raced a real edit and threw it away.
//
// Compared by running BOTH sides through the parse and serialize the editor itself uses
// (`HTMLProseMirrorElement#_getValue` is `serializeString(doc.content)` of the parsed value), so an
// editor's own output always compares equal to the HTML it was opened on.

/**
 * @param {string|null|undefined} a
 * @param {string|null|undefined} b
 * @returns {boolean} True when a save of `a` over `b` would change nothing a reader could see.
 */
export function sameProse(a, b) {
	const x = a ?? "";
	const y = b ?? "";
	if (x === y) return true;
	const dom = globalThis.foundry?.prosemirror?.dom;
	if (typeof dom?.parseString !== "function" || typeof dom?.serializeString !== "function") return false;
	try {
		return normalize(dom, x) === normalize(dom, y);
	} catch {
		// HTML the parser chokes on is not provably the same, so it is written.
		return false;
	}
}

const normalize = (dom, html) => dom.serializeString(dom.parseString(html).content);
