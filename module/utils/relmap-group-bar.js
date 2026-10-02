// The bar a group raises: what it is called, what colour and shape its outline is, who is in it,
// and the button that rubs it out.
//
// THE TIE BAR'S SMALLER SIBLING (utils/relmap-tie-bar.js), and it keeps the same house rules for the
// same reasons. What the two do the same -- living in the viewport, holding the name back a breath
// before it is written (TIE_WRITE_DELAY_MS) so that typing "The hunters" is one broadcast and one
// step of the undo rather than eleven, being placed over a point of a board that pans, claiming its
// keys from core -- is written once, in utils/relmap-board-bar.js. What is here is only what a group
// asks that a line does not.

import { RelmapBoardBar, markChosen } from "./relmap-board-bar.js";
import { TIE_WRITE_DELAY_MS } from "./relmap-tie-bar.js";

/** The gap between the group's name and the bar over it, how close the bar may come to the
 * viewport's edge, and how far below the name it drops when there is no room for it above (a name
 * is one line), in screen pixels. */
const GROUP_BAR_SPACING = Object.freeze({ gap: 12, edge: 6, drop: 22 });

/** The presses that are one of several, walked with the arrow keys. */
const GROUP_RADIOS = ["ink", "shape"];

/** The one answer this bar holds back before writing: the name, for the tie bar's caption's reason. */
const GROUP_HELD = Object.freeze({
	name: { ms: TIE_WRITE_DELAY_MS, flush: bar => bar.flush() },
});

/** Mark which one of a row of radio presses is set, and give only that one the tab stop. */
const markRadio = (buttons, value) => markChosen(buttons, value, { may: false, key: "relmapGbarValue" });

export class RelmapGroupBar extends RelmapBoardBar {
	/**
	 * @param {HTMLElement} root  the window's root element.
	 * @param {object} handlers
	 * @param {Function} handlers.surface  `() => ZoomPanSurface|null`.
	 * @param {Function} handlers.groupAt  `id => {group, members, at}|null`: the group as it stands
	 *        now, who is in it, and where its name sits on the board in percentages. Null when it is
	 *        gone, which closes the bar.
	 * @param {Function} handlers.onField  `(id, fields) => Promise`: write the name, ink or shape.
	 * @param {Function} handlers.onMembers `(id, "add"|"take") => void`: put the selected people in,
	 *        or take them out.
	 * @param {Function} handlers.onDrop   `id => void`: rub the group out. Its people stay.
	 * @param {Function} handlers.onPicked `id => void`: mark which outline this bar belongs to, or
	 *        none for "".
	 * @param {Function} handlers.selected `() => string[]`: who is selected on the board.
	 * @param {Function} handlers.canEdit  `() => boolean`.
	 */
	constructor(root, {
		surface, groupAt, onField, onMembers, onDrop, onPicked, selected, canEdit = () => true,
	} = {}) {
		super(root, {
			bar: ".stonetop-relmap-groupbar",
			press: "relmap-gbar",
			writing: { field: "name", key: "name" },
			held: GROUP_HELD,
			spacing: GROUP_BAR_SPACING,
		}, { surface, onField, onPicked, canEdit });
		this._groupAt = groupAt ?? (() => null);
		this._onMembers = onMembers ?? (() => {});
		this._onDrop = onDrop ?? (() => {});
		this._selected = selected ?? (() => []);

		this.name = this._field;
		this.add = this.el?.querySelector?.("[data-relmap-gbar='add']") ?? null;
		this.take = this.el?.querySelector?.("[data-relmap-gbar='take']") ?? null;
		this._wire();
	}

	_wire() {
		if (!this.el) return;
		for (const button of this.el.querySelectorAll("[data-relmap-gbar]")) {
			const what = button.dataset.relmapGbar;
			if (what === "name") continue;
			this._on(button, "click", ev => {
				ev.preventDefault();
				ev.stopPropagation();
				this._press(what, button.dataset.relmapGbarValue ?? "");
			});
		}
		if (this.name) {
			this._on(this.name, "input", () => this._defer("name"));
			this._on(this.name, "blur", () => this.flush());
			this._on(this.name, "change", ev => ev.stopPropagation());
		}
		super._wire();
	}

	_key(ev) {
		// Arrow keys inside one of the radio rows move the focus along it, wrapping, without choosing:
		// every choice here is a write to a board the whole table is watching. An arrow anywhere else
		// on the bar (the name field's caret) is stopped there as well, and still not the scene's.
		if (this._rove(ev, GROUP_RADIOS)) return;
		if (ev.key === "Escape") {
			ev.preventDefault();
			ev.stopPropagation();
			// The name goes back to what the document has: Escape is the way out of a sentence the
			// reader has thought better of, not a second way of saving it.
			this._forgetWriting();
			this.dismiss();
			return;
		}
		if (ev.key === "Enter" && ev.target === this.name) {
			ev.preventDefault();
			ev.stopPropagation();
			this.flush();
			this.dismiss();
			return;
		}
		// EVERY OTHER KEY IS THE BAR'S, the tie bar's rule and for its reason: a button outside a form
		// is not focus as far as core is concerned, so a digit on a swatch ran a hotbar macro and the
		// letters panned the scene. Stopped whole rather than key by key, and NOT prevented, so the
		// button or the field under the key still does what it does with it.
		ev.stopPropagation();
	}

	_press(what, value) {
		if (!this.id || !this._canEdit()) return;
		const id = this.id;
		if (what === "drop") {
			// Nothing half-typed is written onto a group that is about to go: it would be a second
			// change recorded a moment before the first, and one press of undo would not undo both.
			this._forgetWriting();
			this.close();
			this._onDrop(id);
			return;
		}
		if (what === "add" || what === "take") {
			this._onMembers(id, what);
			return;
		}
		if (!GROUP_RADIOS.includes(what)) return;
		// Painted before the write, so the press shows at once rather than after the round trip.
		markRadio(this.el.querySelectorAll(`[data-relmap-gbar='${what}']`), value);
		this._onField(id, { [what]: value });
	}

	// ── Opening ─────────────────────────────────────────────────────────────

	/**
	 * Take hold of one group.
	 *
	 * @param {string} id
	 * @param {object} [opts]
	 * @param {HTMLElement} [opts.returnTo]  where the focus goes back to on Escape.
	 * @param {boolean} [opts.focusName]  put the caret in the name field. A group just drawn is
	 *        named next, so it is; a group clicked to recolour is not, or the click would pull the
	 *        focus off the board the reader is working on.
	 */
	open(id, { returnTo = null, focusName = false } = {}) {
		if (!this.el || !id) return false;
		const held = this._groupAt(id);
		if (!held) return false;
		if (this.id && this.id !== id) this.flush();
		this.id = id;
		this._returnTo = returnTo ?? null;
		this._at = held.at ?? null;
		this._box = null;
		this._fill(held);
		this.el.hidden = false;
		this._onPicked(id);
		this.place();
		if (focusName && this.name && this._canEdit()) {
			this.name.focus?.();
			const end = this.name.value?.length ?? 0;
			this.name.setSelectionRange?.(end, end);
		}
		return true;
	}

	_fill(held) {
		const group = held.group ?? {};
		const may = this._canEdit();
		if (this.name) {
			this.name.value = group.name ?? "";
			this._saved = this.name.value;
			this.name.disabled = !may;
		}
		this._disarm("name");
		for (const button of this.el?.querySelectorAll?.("[data-relmap-gbar]") ?? []) {
			if (button !== this.name) button.disabled = !may;
		}
		this._paint(held);
	}

	/** Everything on the bar that says what this group IS, and who of the selection can move. */
	_paint(held) {
		const group = held.group ?? {};
		markRadio(this.el?.querySelectorAll?.("[data-relmap-gbar='ink']") ?? [], group.ink);
		markRadio(this.el?.querySelectorAll?.("[data-relmap-gbar='shape']") ?? [], group.shape);
		this._paintMembers(held.members ?? []);
	}

	/**
	 * Show "Add the 2 selected" and "Take the 1 selected out" only when they would DO something,
	 * with the count in the words. A button that adds nobody is a press that looks broken.
	 *
	 * ⚠ AND THE BAR'S BOX IS THROWN AWAY WITH THEM. These two coming and going are the one thing
	 * that changes this bar's width while it is up, and `place` measures it once per opening: a box
	 * kept from before would seat a bar two buttons wider by the width it used to be.
	 */
	_paintMembers(members) {
		const inside = new Set(members);
		const chosen = this._selected() ?? [];
		const adding = chosen.filter(id => !inside.has(id)).length;
		const taking = chosen.filter(id => inside.has(id)).length;
		this._sayCount(this.add, adding);
		this._sayCount(this.take, taking);
		this._box = null;
	}

	_sayCount(button, count) {
		if (!button) return;
		button.hidden = !count;
		const said = String(button.dataset?.relmapSaid ?? "").replace("{count}", String(count));
		button.setAttribute?.("aria-label", said);
		button.setAttribute?.("data-tooltip", said);
		const words = button.querySelector?.("[data-relmap-gbar-words]");
		if (words) words.textContent = said;
	}

	/** The selection changed while the bar was up: re-say the two membership buttons. */
	selectionChanged() {
		if (!this.isOpen) return;
		const held = this._groupAt(this.id);
		if (held) this._paintMembers(held.members ?? []);
		this.place();
	}

	/**
	 * The board has been repainted underneath. The group may have moved, been recoloured by somebody
	 * else, or been rubbed out; the NAME FIELD is never refilled, for the tie bar's reason: the
	 * reader typing in it has the newer words.
	 */
	refresh() {
		if (!this.isOpen) return;
		const held = this._groupAt(this.id);
		if (!held) { this.discard(); return; }
		this._at = held.at ?? this._at;
		this._paint(held);
		this._onPicked(this.id);
		this.place();
	}

	destroy() {
		super.destroy();
		this.name = null;
		this.add = null;
		this.take = null;
	}
}
