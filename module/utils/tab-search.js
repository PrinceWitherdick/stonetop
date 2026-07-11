/**
 * Collapsible magnifying-glass tab filter (see templates/actor/partials/tab-search-control.hbs
 * and the `.stonetop-tab-search` CSS). A round icon button sits beside a section's header text
 * and expands into a filter box on click; typing hides non-matching items live, client-side.
 *
 * `scope` is the element that holds BOTH the `.stonetop-tab-search` control and the items it
 * filters. It also carries `.is-searching` while a term is active, which some tabs key CSS off
 * to keep matches from being hidden by another rule (Moves' "hide un-learned", Arcana's collapsed
 * sections). Matching items stay; the rest get `.stonetop-search-hidden` (a class, not the `hidden`
 * prop, so the CSS `!important` beats an item's own `display:flex`). Group / section headers are
 * intentionally left in place, since the search box lives inside one and hiding an "empty" header
 * could hide the box itself.
 *
 * Scope the control to whatever container you want it to filter: a whole tab (`.tab.moves`) or a
 * single column / section within one (`.stonetop-inventory-regular`), so sibling sections each get
 * their own independent filter.
 *
 * @param {HTMLElement|null} scope           Container holding the control and the items.
 * @param {object} opts
 * @param {string} opts.itemSel              Selector, resolved within `scope`, for filterable items.
 * @param {(el: HTMLElement) => string} opts.textFor  Returns the searchable text for one item.
 */
export function wireTabSearch(scope, {itemSel, textFor}) {
	const box    = scope?.querySelector(".stonetop-tab-search");
	const input  = box?.querySelector(".stonetop-tab-search-input");
	const toggle = box?.querySelector(".stonetop-tab-search-toggle");
	if (!scope || !box || !input || !toggle) return;

	const items = [...scope.querySelectorAll(itemSel)];
	// The search index (per-item text, which may need a nested DOM walk) is built lazily on first
	// use, not on every render (the box is almost never open). Editing an item re-renders the sheet,
	// which rebuilds these elements and drops the cache, so it never goes stale against live inputs.
	const apply = () => {
		const term = input.value.trim().toLowerCase();
		scope.classList.toggle("is-searching", !!term);
		for (const item of items) {
			if (term && item._stSearchText === undefined)
				item._stSearchText = (textFor(item) ?? "").toLowerCase();
			item.classList.toggle("stonetop-search-hidden", !!term && !item._stSearchText.includes(term));
		}
	};
	input.addEventListener("input", apply);

	// The Arcana control sits inside a click-to-collapse <summary>; keep its own clicks / keys from
	// bubbling up and toggling that collapse.
	box.addEventListener("click", ev => ev.stopPropagation());
	box.addEventListener("keydown", ev => ev.stopPropagation());
	// preventDefault on mousedown so clicking the button never pulls focus off the input; otherwise
	// the blur-to-collapse below would fight the toggle.
	toggle.addEventListener("mousedown", ev => ev.preventDefault());
	toggle.addEventListener("click", () => {
		if (box.classList.contains("is-open")) {
			box.classList.remove("is-open");
			if (input.value) { input.value = ""; apply(); }
			input.blur();
		} else {
			box.classList.add("is-open");
			input.focus();
		}
	});
	input.addEventListener("keydown", ev => {
		if (ev.key !== "Escape") return;
		input.value = ""; apply();
		box.classList.remove("is-open");
		input.blur();
	});
	// Clicking away collapses an empty box; one holding a live term stays open.
	input.addEventListener("blur", () => { if (!input.value.trim()) box.classList.remove("is-open"); });
}
