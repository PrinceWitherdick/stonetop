/**
 * Keep a sheet's single scroll container from lurching when you switch tabs.
 *
 * Our actor sheets scroll as ONE unit inside `.window-content` (core sets
 * `overflow: hidden auto` on it): the header, stats and the active tab body all move
 * together. Because each tab is a different height and only the active one is in the
 * DOM flow, switching to a shorter tab leaves the browser with less content than your
 * current scroll offset needs — so it clamps the scroll back toward the top and the
 * whole sheet visibly jumps/bounces up.
 *
 * Rather than reset to the top (which reads as an unwanted "bounce"), we keep the
 * reader as close to where they were as the incoming tab allows: capture the scroll
 * offset before the tab toggles, then restore it CLAMPED to the incoming tab's real
 * scrollable range. Switching between tabs both tall enough preserves the exact offset;
 * switching to a shorter tab lands on the bottom of that tab's real content instead of
 * being bounced to the top. We deliberately do NOT preserve an offset past the incoming
 * tab's content (an earlier version grew a spacer to do that, which just parked the
 * viewport in blank space below the content). Scrolled to the very top (the common case)
 * is a no-op.
 *
 * @param {JQuery|HTMLElement} element         The sheet's root element (`this.element`).
 * @param {() => void}         applyTabChange   Invokes the superclass tab switch (which
 *                                              toggles the `.active` panel).
 */
export function keepScrollAcrossTab(element, applyTabChange) {
	const el = element?.[0] ?? element;
	const wc = el?.querySelector(".window-content");
	const keep = wc?.scrollTop ?? 0;

	applyTabChange();

	if (!wc) return;
	// Retire any spacer a previous version of this code may have left in the form so it
	// can't hold dead space at the end of a now-shorter tab.
	const spacer = wc.querySelector(".stonetop-scroll-spacer");
	if (spacer) spacer.style.height = "0px";

	// scrollTop 0 can never be clamped, so there's nothing to preserve.
	if (keep <= 0) return;

	// Clamp to the incoming tab's real max scroll; never restore past its content (which
	// would show blank parchment). The browser clamps to the same bound anyway.
	const maxScroll = Math.max(0, wc.scrollHeight - wc.clientHeight);
	wc.scrollTop = Math.min(keep, maxScroll);
}
