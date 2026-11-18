import { wrapStonetopGlyphsInEl } from "./glyphs.js";

/**
 * Prepare a move's authored text for a HOVER PANEL, in place.
 *
 * Three surfaces show a move's description in a panel that appears under the pointer and
 * vanishes on mouseleave: the sidebar's basic-move panel, the character sheet's move
 * cross-reference tooltip, and the onboarding dialog's word tooltip. All three had grown their
 * own copy of this preparation and the copies had already drifted — all three stripped
 * `<details>`, only one redrew the glyphs — so a move written with a mark read correctly in one
 * panel and as raw fallback-font characters in the next.
 *
 * What a hover panel needs, and why:
 *
 * COLLAPSIBLE BLOCKS GO. A `<details>` (Chart a Course's "Travel Times" table) cannot be opened
 * in a panel that closes the moment the pointer leaves it, so it would read as a dead label.
 * They stay clickable on the item sheet, which is where a reader can actually open one.
 *
 * GLYPHS ARE REDRAWN. These panels are the only place a move's text is shown without the
 * sheet's own pass over it — each writes its body straight from a compendium description, or
 * from a clone whose wrapper element is dropped on the way in — so Outfit's "mark as many ◇"
 * and Have What You Need's "(□)" arrived as raw characters in the fallback font.
 *
 * `wrapStonetopGlyphsInEl` over the whole panel rather than `wrapGlyphTextContainers`, per the
 * rule in glyphs.js: a surface with no editable prose at all wraps its root, which covers
 * strictly more and costs the container list nothing. A hover panel is display-only by
 * construction — it is built fresh from a string or a clone and never holds an input.
 *
 * Panels rebuild their content on every hover, so this is re-run each time and nothing goes
 * stale.
 *
 * @param {HTMLElement} panel  The panel/tooltip root, with its content already written.
 * @returns {HTMLElement} `panel`, so it can be chained onto the expression that built it.
 */
export function prepareMoveHoverBody(panel) {
	if (!panel) return panel;
	panel.querySelectorAll("details").forEach(d => d.remove());
	wrapStonetopGlyphsInEl(panel);
	return panel;
}

// Every hover panel a sheet has portaled to <body>, keyed by the sheet, so one call takes the
// lot down. A panel lives OUTSIDE the sheet's subtree, so neither a re-render nor a close
// removes it on its own. The character sheet's move cross-reference tooltip leaked on close for
// exactly that reason: its teardown named one panel field, and the sheet had grown a second.
const OWNED_PANELS = new WeakMap();

/**
 * Register a body-portaled hover panel as belonging to `owner` (a sheet), so
 * `removeHoverPanels(owner)` takes it down with the rest.
 *
 * @param {object}      owner  the sheet instance
 * @param {HTMLElement} panel
 * @returns {HTMLElement} `panel`
 */
export function adoptHoverPanel(owner, panel) {
	if (!owner || !panel) return panel;
	let panels = OWNED_PANELS.get(owner);
	if (!panels) OWNED_PANELS.set(owner, panels = new Set());
	panels.add(panel);
	return panel;
}

/**
 * Remove every hover panel `owner` adopted. Call it before each render builds its own (the
 * previous render's panels are stale) and from `close()` — a closed sheet never re-renders, so
 * nothing else would ever reach them.
 *
 * @param {object} owner  the sheet instance
 */
export function removeHoverPanels(owner) {
	const panels = owner && OWNED_PANELS.get(owner);
	if (!panels) return;
	for (const panel of panels) panel.remove();
	panels.clear();
}

/**
 * The basic-move hover panel: a fixed panel on <body> showing a move row's name and its hidden
 * `.stonetop-basic-move-desc` while the pointer is over the row, sat to the row's LEFT (the rows
 * live in a right-hand sidebar). Shared by the character sheet's sidebar and the steading's
 * classic move rows, which had grown near-verbatim copies of it.
 *
 * A custom panel rather than `data-tooltip` because the descriptions are rich HTML and
 * Foundry's TooltipManager escapes content.
 *
 * The panel is adopted by `owner`, so `removeHoverPanels(owner)` is its teardown.
 *
 * @param {object}      owner        the sheet instance
 * @param {HTMLElement} root         the sheet's rendered root
 * @param {string}      rowSelector  the move rows to wire
 * @returns {HTMLElement} the panel
 */
export function wireBasicMoveHoverPanel(owner, root, rowSelector) {
	const panel = document.createElement("div");
	panel.className = "stonetop-basic-move-panel";
	panel.hidden = true;
	document.body.appendChild(panel);
	adoptHoverPanel(owner, panel);

	for (const li of root.querySelectorAll(rowSelector)) {
		li.addEventListener("mouseenter", () => {
			const descEl = li.querySelector(".stonetop-basic-move-desc");
			if (!descEl) return;
			const nameText = li.querySelector(".stonetop-move-name")?.textContent?.trim() ?? "";
			// Built through the DOM so the name is never treated as HTML.
			const nameEl = document.createElement("strong");
			nameEl.className = "stonetop-basic-move-panel-name";
			nameEl.textContent = nameText;
			panel.replaceChildren(nameEl, ...Array.from(descEl.cloneNode(true).childNodes));
			// Run on the PANEL rather than on the clone because the spread above keeps the
			// clone's children and discards its `.stonetop-basic-move-desc` wrapper.
			prepareMoveHoverBody(panel);
			panel.hidden = false;
			const rect = li.getBoundingClientRect();
			panel.style.top   = `${Math.max(4, Math.min(rect.top, window.innerHeight - panel.offsetHeight - 8))}px`;
			panel.style.right = `${window.innerWidth - rect.left + 8}px`;
		});
		li.addEventListener("mouseleave", () => { panel.hidden = true; });
	}
	return panel;
}
