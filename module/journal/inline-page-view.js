// Our AppV1 page sheets render two ways. Inline, the journal builds a separate view instance and
// calls its `_renderInner` + `activateListeners` itself, so that instance never gets an `_element`
// and `sheet.element` finds nothing; the sheets point it at the rendered view so their queries work.
//
// Popped out (the journal's page edit pencil), core has already set `_element` to the WINDOW
// FRAME by the time `activateListeners` runs, and it has to stay there. Overwriting it with the
// inner view makes Close slide up and remove only the contents: the header frame stays on screen
// for good, a title bar with a resize handle and nothing under it. The window registers itself in
// `ui.windows` before its listeners run, which is how the popout is told apart from the view.

/**
 * Point an inline page view's `element` at its rendered root, leaving a popped-out window alone.
 * @param {Application} sheet  The AppV1 page sheet, from its `activateListeners`.
 * @param {jQuery} html        The rendered inner HTML `activateListeners` was given.
 */
export function adoptInlineViewRoot(sheet, html) {
	if (isPoppedOut(sheet)) return;
	sheet._element = html;
}

const isPoppedOut = sheet => globalThis.ui?.windows?.[sheet.appId] === sheet;

// Somewhere a person types: a text field, or anywhere inside a ProseMirror editor (its toolbar
// included, so reaching for Bold doesn't count as leaving).
const TEXT_ENTRY = "textarea, input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), [contenteditable='true'], prose-mirror";
const isTextEntry = el => !!el?.closest?.(TEXT_ENTRY);

/**
 * Hold a popped-out page sheet's redraw while someone is typing in it, and run it once focus
 * leaves the window's fields. Call first thing in the sheet's `render`; true means "held, skip".
 *
 * Every field saves on its own blur, and the save redraws the window. Typing in one answer and
 * clicking into the next would otherwise land the redraw on the second field a moment after it
 * took focus, replacing it and throwing away what was typed there. Holding loses nothing: a save
 * reads the section's live fields, and the held redraw still runs when the typing stops.
 * @param {Application} sheet
 * @param {boolean} force  `render`'s own force flag; an explicit open is never held.
 */
export function holdRenderWhileTyping(sheet, force) {
	if (force || !sheet.rendered || !isPoppedOut(sheet)) return false;
	const root = sheet.element?.[0];
	if (!root?.contains(document.activeElement) || !isTextEntry(document.activeElement)) return false;
	if (sheet._heldRender) return true;
	sheet._heldRender = true;
	const onOut = ev => {
		if (root.contains(ev.relatedTarget) && isTextEntry(ev.relatedTarget)) return;
		root.removeEventListener("focusout", onOut);
		setTimeout(() => {
			sheet._heldRender = false;
			if (sheet.rendered) sheet.render(false);
		});
	};
	root.addEventListener("focusout", onOut);
	return true;
}

// The plain fields a section opens for editing. ProseMirror bodies are left out: they save only
// on Done or their own toolbar, so a redraw never lands in the middle of one.
const FIELD = "textarea, input[type=text]";
// A section of the page: indexed on location/chronicle pages, named on bestiary pages.
const SECTION = "[data-section-index], section[data-section]";
const sectionSelector = section => section.dataset.sectionIndex !== undefined
	? `[data-section-index="${section.dataset.sectionIndex}"]`
	: `section[data-section="${section.dataset.section}"]`;

/**
 * Carry the field someone is typing in across a redraw of the INLINE page view. Call from
 * `activateListeners` with the view's root.
 *
 * Inline, the journal owns the redraw: a field's blur save re-renders the page inside it, and
 * core swaps in a fresh page before this sheet hears about it, so it can't be held the way the
 * popout's is. Clicking from one answer into the next would otherwise lose the second one's
 * focus and whatever had been typed into it by the time the redraw landed. So the sheet keeps
 * note of the field being typed in (its section, its place in that section, text and caret),
 * and when the redraw replaces it, puts the typing back into its successor and focuses it. The
 * restored text isn't saved yet, so its blur saves it even if nothing more is typed.
 * @param {Application} sheet
 * @param {HTMLElement} root
 */
export function keepTypingAcrossRedraw(sheet, root) {
	if (!root) return;
	const was = sheet._typing;
	sheet._typing = null;
	if (was && !was.el.isConnected) restoreTyping(root, was);

	const note = ev => {
		const el = ev.target;
		const section = el?.matches?.(FIELD) ? el.closest(SECTION) : null;
		if (!section) return;
		sheet._typing = {
			el, section: sectionSelector(section),
			index: [...section.querySelectorAll(FIELD)].indexOf(el), cls: el.className,
			value: el.value, start: el.selectionStart, end: el.selectionEnd,
		};
	};
	for (const type of ["focusin", "input", "keyup", "mouseup"]) root.addEventListener(type, note);
	// Forget the field once the person really leaves it. A field the redraw removed is not
	// connected any more, which is exactly the case to keep.
	root.addEventListener("focusout", ev => {
		const el = ev.target;
		setTimeout(() => {
			if (sheet._typing?.el === el && el.isConnected && document.activeElement !== el) sheet._typing = null;
		});
	});
}

function restoreTyping(root, was) {
	const section = root.querySelector(was.section);
	const el = section ? section.querySelectorAll(FIELD)[was.index] : null;
	if (!el || el.className !== was.cls) return;
	const rendered = el.value;
	if (was.value !== rendered) {
		el.value = was.value;
		// A value set from code is not a change the browser reports on blur, so report it.
		el.addEventListener("blur", () => {
			if (el.value !== rendered) el.dispatchEvent(new Event("change", { bubbles: true }));
		}, { once: true });
	}
	el.focus({ preventScroll: true });
	el.setSelectionRange?.(was.start ?? el.value.length, was.end ?? el.value.length);
}
