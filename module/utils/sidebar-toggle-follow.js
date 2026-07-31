/**
 * Keep the moves sidebar's collapse handle reachable at any scroll offset.
 *
 * The character and steading sheets scroll as ONE unit inside `.window-content` (see
 * `keepScrollAcrossTab`): outside the Notes tab the flex height chain is never relinked,
 * so `.stonetop-sheet-layout` grows as tall as its content and the whole sheet — header,
 * tab body and moves sidebar together — scrolls in the window. The collapse handle is
 * absolutely positioned at `top: 0` of the sidebar, which means that once you scroll past
 * the top of the sidebar the handle is gone and there's no way to fold the sidebar away
 * without scrolling all the way back up.
 *
 * `position: sticky` can't fix this: `.stonetop-sheet-layout` sets `overflow: hidden`, so
 * IT becomes the sticky element's scrollport, and it never scrolls — the handle would sit
 * exactly where it does today. So we drive `top` ourselves, from the geometry the scroll
 * actually produces: how far the sidebar's top edge has travelled above the visible area.
 *
 * At scroll 0 the offset clamps to 0, so the handle looks and behaves exactly as before;
 * past that it slides down to stay parked at the top of what you can see, and it stops at
 * the sidebar's bottom edge rather than floating off the end of it.
 */

import { scrollParent } from "./scroll-parent.js";

/** jQuery event namespace, so a re-render replaces its listener instead of stacking one. */
const NS = "scroll.stonetopSidebarFollow";

/**
 * Where the handle should sit, as an offset from the sidebar's own top edge.
 *
 * Pure geometry, split out so it can be tested without a layout engine. All inputs are
 * viewport-relative (i.e. `getBoundingClientRect`), which is what makes this agnostic
 * about WHICH ancestor is doing the scrolling.
 *
 * @param {object} box
 * @param {number} box.sidebarTop     Sidebar's top edge, viewport-relative.
 * @param {number} box.sidebarHeight  Sidebar's full height.
 * @param {number} box.scrollerTop    Scroll container's top edge, viewport-relative.
 * @param {number} box.handleHeight   The handle's own height.
 * @returns {number} Pixels from the sidebar's top edge.
 */
export function handleOffset({sidebarTop, sidebarHeight, scrollerTop, handleHeight}) {
	// Positive once the sidebar's top has been scrolled up out of view; negative (clamped
	// to 0) while the sidebar still starts below the top of the visible area.
	const scrolledPast = scrollerTop - sidebarTop;
	const floor = Math.max(0, sidebarHeight - handleHeight);
	return Math.min(Math.max(scrolledPast, 0), floor);
}

/**
 * Wire the follow behaviour for a sheet. Safe to call on every render; safe to call on a
 * sheet with no moves sidebar.
 *
 * @param {JQuery|HTMLElement} html  The sheet's rendered root (what `activateListeners` gets).
 */
export function followSidebarToggle(html) {
	const root    = html?.[0] ?? html;
	const sidebar = root?.querySelector?.(".stonetop-moves-sidebar");
	const handle  = sidebar?.querySelector(".stonetop-sidebar-toggle");
	if (!handle) return;

	const scroller = scrollParent(sidebar);
	if (!scroller) return;

	let frame = 0;
	// The offset is pinned at 0 for the whole first screen of scrolling, and thereafter
	// changes by whole pixels — so most frames would write back the value already there.
	// Skipping those keeps a scroll from dirtying style on every tick.
	let written = null;
	const update = () => {
		frame = 0;
		const sb = sidebar.getBoundingClientRect();
		const sp = scroller.getBoundingClientRect();
		const top = handleOffset({
			sidebarTop:    sb.top,
			sidebarHeight: sb.height,
			scrollerTop:   sp.top,
			handleHeight:  handle.offsetHeight,
		});
		if (top === written) return;
		written = top;
		handle.style.top = `${top}px`;
	};

	// Coalesce to one write per frame — scroll fires far faster than the handle can move.
	const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };

	// AppV1 re-renders replace the form but keep `.window-content`, so an un-namespaced
	// bind would stack another listener per render, each closing over a detached sidebar.
	$(scroller).off(NS).on(NS, schedule);

	// Collapsing changes the sidebar's height, which moves the bottom clamp. The rAF runs
	// after the click handler's class flip, so it measures the settled layout.
	handle.addEventListener("click", schedule);

	update();
}
