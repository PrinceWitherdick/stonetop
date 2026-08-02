/**
 * Finding the ancestor that a given element actually scrolls inside.
 *
 * Which element that is differs per host and cannot be hardcoded: the character sheet
 * scrolls in `.window-content`, the NPC sheet in its active tab panel. Two features need
 * the answer — the relationships board's drag auto-scroll and the moves sidebar's collapse
 * handle — and both were walking the ancestor chain themselves.
 *
 * `overflow: hidden` ancestors are deliberately skipped. `.stonetop-sheet-layout` is one:
 * it clips rather than scrolls, so anchoring to it reproduces the very bugs these callers
 * exist to fix.
 *
 * `preserveScroll` at the bottom is the other half of the same concern: holding those
 * scrollports still across an operation that would otherwise reset them.
 */

const SCROLLABLE_OVERFLOW = new Set(["auto", "scroll", "overlay"]);

/**
 * The nearest scrolling ancestor of `node`, or null.
 *
 * @param {HTMLElement} node
 * @param {object}  [options]
 * @param {boolean} [options.mustOverflow]  when true, also require the ancestor to be
 *   overflowing RIGHT NOW (`scrollHeight > clientHeight`). Callers that act during a
 *   gesture want this — an ancestor that isn't overflowing has nothing to scroll. Callers
 *   that bind a listener up front must NOT, because at wire time the content may not have
 *   grown tall enough yet and they would bind to nothing.
 * @returns {HTMLElement|null}
 */
export function scrollParent(node, { mustOverflow = false } = {}) {
	for (let el = node?.parentElement; el; el = el.parentElement) {
		if (SCROLLABLE_OVERFLOW.has(getComputedStyle(el).overflowY)
			&& (!mustOverflow || el.scrollHeight > el.clientHeight)) return el;
		if (el === el.ownerDocument?.body) break;
	}
	return null;
}

/**
 * Run `fn` — something that momentarily un-scrolls the page — and hand every scrollport
 * under `root` its position back.
 *
 * Written for an auto-height window's re-measure. Foundry's `setPosition({height: "auto"})`
 * CLEARS the frame's inline height so it can read the natural one back, and while that is
 * off, a panel sized `height: 100%` has no definite parent to resolve against: it grows to
 * its own content, stops overflowing, and the browser clamps its scrollTop to zero. The
 * frame's rendered height then comes back byte-identical (a CSS `max-height` was capping it
 * either way), so nothing looks like it happened — but the reader is at the top of the tab
 * again. Verified in Chromium: 2242 -> 0 with the frame at 700px before and after.
 *
 * Nothing re-renders, so the elements and their offsets are all still valid on the far side;
 * restoring is a plain write-back. Both halves run inside one call, so no frame paints in
 * between and the jump is never seen.
 *
 * A non-zero `scrollTop` is the whole test for "worth restoring" — it is cheaper than asking
 * for computed overflow per element, and an element sitting at 0 has nothing to lose.
 *
 * @param {HTMLElement} root  subtree to hold still; `root` itself is included.
 * @param {Function} fn       the layout-disturbing operation.
 * @returns {*} whatever `fn` returned.
 */
export function preserveScroll(root, fn) {
	const held = [];
	for (const el of [root, ...(root?.querySelectorAll?.("*") ?? [])]) {
		if (el?.scrollTop) held.push([el, el.scrollTop]);
	}
	try {
		return fn();
	} finally {
		for (const [el, top] of held) el.scrollTop = top;
	}
}
