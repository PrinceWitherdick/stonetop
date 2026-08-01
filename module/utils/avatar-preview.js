/**
 * Hover preview for a small avatar thumbnail: a card holding the full-size image and the
 * person's name, shown while the pointer is over the thumbnail.
 *
 * Portaled to <body> and positioned `fixed`, NOT the wrapper-span + `::after` idiom this
 * codebase uses elsewhere for hover-to-enlarge. Every host for this one is a scrolling
 * table or a lane column, and an `overflow` ancestor clips a pseudo-element popup on both
 * axes (`overflow-y: auto` clips x too) — so the preview would be cut off exactly where
 * the rows are densest. Positioning against the viewport is what escapes those ancestors.
 *
 * The steading's Residents / Neighbors tables, the shared relationships component and the
 * arcana tab's card art all draw from here, so an enlarged image reads identically wherever
 * one is raised. The art differs only in shape and in which side it sits on, which is what
 * the `variant` and `placement` options carry.
 */

const PREVIEW_CLASS = "stonetop-avatar-preview";
/** Clearance from the thumbnail, and from the viewport edge. */
const GAP  = 8;
const EDGE = 8;

/** There is only ever one preview, so tearing down is a query rather than bookkeeping. */
export function removeAvatarPreview() {
	document.querySelector(`.${PREVIEW_CLASS}`)?.remove();
}

/**
 * Where the popup sits relative to its anchor. Both flip to the opposite side when the
 * preferred one would run off the viewport, then clamp on both axes — a thumbnail near a
 * window edge is the common case, not the exception.
 *
 * "below" suits a row in a table: the popup is wider than the 26px portrait, so centring it
 * horizontally keeps it over the row it belongs to. "right" suits art at the left edge of a
 * card, where there is room beside it and stacking below would cover the card's own text.
 */
const PLACEMENTS = {
	below: (a, pw, ph) => {
		let top = a.bottom + GAP;
		if (top + ph > window.innerHeight - EDGE) top = a.top - ph - GAP;
		return { top, left: a.left + a.width / 2 - pw / 2 };
	},
	right: (a, pw, ph) => {
		let left = a.right + GAP;
		if (left + pw > window.innerWidth - EDGE) left = a.left - pw - GAP;
		return { top: a.top + a.height / 2 - ph / 2, left };
	},
};

/**
 * Show the preview for `anchor`, an <img> thumbnail. Its `src` is the image and its
 * `data-name` is the caption; without a `src` there is nothing to enlarge and this is a
 * no-op, which is what keeps it safe to point at a placeholder icon.
 *
 * @param {HTMLImageElement} anchor
 * @param {object}  [options]
 * @param {"below"|"right"} [options.placement]  which side of the anchor to sit on
 * @param {string}  [options.variant]  extra class for a differently-shaped preview
 *                                     (e.g. "stonetop-avatar-preview--art" for card art)
 */
export function showAvatarPreview(anchor, { placement = "below", variant = "" } = {}) {
	removeAvatarPreview();
	if (!anchor?.src) return null;

	const popup = document.createElement("div");
	popup.className = variant ? `${PREVIEW_CLASS} ${variant}` : PREVIEW_CLASS;
	const img = document.createElement("img");
	img.src = anchor.src;
	img.alt = "";
	popup.appendChild(img);
	const name = anchor.dataset?.name?.trim();
	if (name) {
		const caption = document.createElement("strong");
		caption.textContent = name;
		popup.appendChild(caption);
	}
	// Appended before measuring: offsetWidth/offsetHeight are 0 until it is in the document.
	document.body.appendChild(popup);

	const rect = anchor.getBoundingClientRect();
	const pw = popup.offsetWidth;
	const ph = popup.offsetHeight;
	const { top, left } = (PLACEMENTS[placement] ?? PLACEMENTS.below)(rect, pw, ph);
	popup.style.top  = `${Math.max(EDGE, Math.min(top, window.innerHeight - ph - EDGE))}px`;
	popup.style.left = `${Math.max(EDGE, Math.min(left, window.innerWidth - pw - EDGE))}px`;

	// Above the window that raised it. Foundry writes an app's z-index inline as it brings
	// windows to front, so read it back rather than guessing a constant that a stack of open
	// sheets would climb past. !important because the popup is outside the app's subtree and
	// must not lose to anything the theme sets on body-level children.
	const z = Number.parseInt(anchor.closest(".app, .application")?.style?.zIndex) || 0;
	popup.style.setProperty("z-index", String(Math.max(10000, z + 2)), "important");
	return popup;
}

// Every selector wired against a given root, so repeat calls share ONE pair of listeners
// instead of stacking their own. A root is a freshly rendered subtree, so an entry dies with
// the render that made it; the WeakMap is what keeps that automatic.
const WIRED_ROOTS = new WeakMap();

/**
 * Delegate the preview from `root` for every thumbnail matching `selector`.
 *
 * Capture phase, because mouseenter/mouseleave do NOT bubble — they are delivered to
 * ancestors on the way down only, so a delegated listener has to catch them there or see
 * nothing at all. (mouseover/mouseout do bubble, but they also fire on every move between
 * child elements, which would tear the preview down and rebuild it mid-hover.)
 *
 * Calling this more than once for the same root is normal — a character sheet wires its
 * follower faces, its arcana thumbs and its relationship portraits independently — so the
 * selectors are pooled rather than each getting its own listener pair. That matters because
 * a capture-phase mouseenter fires for every element the pointer crosses: one pooled
 * `closest` over the joined selector costs one ancestor walk per move, where N separate
 * wirings cost N.
 */
export function wireAvatarPreview(root, selector, options) {
	if (!root || !selector) return;
	const wired = WIRED_ROOTS.get(root);
	if (wired) {
		// A re-wire of the same selector (a second pass over one root) must not DOUBLE it —
		// but it must not be ignored either. The later call is the current wiring, so its
		// options replace what the entry was holding; dropping them would silently pin the
		// preview's placement and variant to whichever pass happened to run first.
		const existing = wired.entries.find(e => e.selector === selector);
		if (existing) existing.options = options;
		else {
			wired.entries.push({ selector, options });
			wired.joined = wired.entries.map(e => e.selector).join(", ");
		}
		return;
	}

	const state = { entries: [{ selector, options }], joined: selector };
	WIRED_ROOTS.set(root, state);
	// One walk to find the thumbnail, then a cheap `matches` on the element we already have
	// to say which wiring owns it (and so which options to show it with).
	const hit = ev => ev.target.closest?.(state.joined);
	root.addEventListener("mouseenter", ev => {
		const thumb = hit(ev);
		if (thumb) showAvatarPreview(thumb, state.entries.find(e => thumb.matches(e.selector))?.options);
	}, true);
	root.addEventListener("mouseleave", ev => {
		if (hit(ev)) removeAvatarPreview();
	}, true);
}
