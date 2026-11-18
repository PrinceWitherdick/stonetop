import { StonetopDialog } from "../../../utils/stonetop-dialog.js";
import { StonetopAutocomplete } from "../../../utils/autocomplete.js";
import { CREW_INDIVIDUAL_NAMES, CREW_INDIVIDUAL_TAGS, CREW_INDIVIDUAL_TRAITS } from "../../../data/steading-members.js";

// ── CrewMemberNameDialog ─────────────────────────────────────────────────────
// "Name this Crew Member": an anonymous member of the crew stands out and becomes a named
// individual (Crew insert, p.144). Opened from each member's "Name them" button on the Roster in
// edit mode. Asks for a name, a tag and any of the insert's traits, and resolves (promise()) to
// `{ name, tag, traits }`, or null when closed or saved without a name. The write is the sheet's
// (follower-fate.js#crewMemberPromotionUpdate), which carries the member's HP and face across.
//
// A trait can have blanks in it: "missing eye/finger/hand/__" or "__'s kid/sibling/parent/cousin/__".
// tokenizeTrait splits one into its text, its standalone blanks (`__`) and its slash-option groups;
// ticking the chip opens a field for each slot (a free-type combo for a slash group, its choices as
// suggestions), and filledTrait puts the answers back in. The rules live in the pure helpers below,
// which the tests drive.
//
// The window keeps the markup the v1 Dialog it replaced drew — `.dialog-content` around the form,
// `.dialog-buttons` around a lone Save keyed `save`, and the `dialog` window class — because the
// `.stonetop-individual-dialog` rules in stonetop.css and the shared `.vtt .stonetop.dialog
// .dialog-buttons button` skin are written against exactly that.

/** The Crew insert's suggestion lists, falling back to the shared ones (data/steading-members.js) for any it lacks. */
export function crewNameLists(individualOptions = {}) {
	const pick = (list, fallback) => (Array.isArray(list) && list.length ? list : fallback);
	return {
		names:  pick(individualOptions?.names,  CREW_INDIVIDUAL_NAMES),
		tags:   pick(individualOptions?.tags,   CREW_INDIVIDUAL_TAGS),
		traits: pick(individualOptions?.traits, CREW_INDIVIDUAL_TRAITS),
	};
}

/**
 * Split a trait into text, standalone blanks and slash-option groups, in order:
 *   "missing eye/finger/hand/__"  → [text "missing", text " ", opts [eye, finger, hand, __]]
 *   "__'s kid/sibling/__"         → [blank, text "'s", text " ", opts [kid, sibling, __]]
 * Greedy: a standalone `__`, then a slash group, then a word, then a run of whitespace.
 *
 * @param {string} str
 * @returns {Array<{type: "text", text: string}|{type: "blank"}|{type: "opts", opts: string[]}>}
 */
export function tokenizeTrait(str) {
	const tokens = [];
	const re = /__|(?:[^\s/]+(?:\/[^\s/]+)+)|[^\s/]+|\s+/g;
	let m;
	while ((m = re.exec(String(str ?? ""))) !== null) {
		if (m[0] === "__")           tokens.push({ type: "blank" });
		else if (m[0].includes("/")) tokens.push({ type: "opts", opts: m[0].split("/") });
		else                         tokens.push({ type: "text", text: m[0] });
	}
	return tokens;
}

/**
 * What the template draws for each trait chip. A trait with no slots is a plain chip; one with slots
 * is drawn part by part, each slot numbered (`slot`) in the order filledTrait reads them back. A
 * slash group's choices become its combo's suggestions (`__` is not one of them), its datalist id
 * kept unique by the trait's index.
 */
export function crewNameTraitChips(traits = []) {
	return traits.map((trait, traitIndex) => {
		const tokens = tokenizeTrait(trait);
		const simple = tokens.every(tok => tok.type === "text");
		let slot = 0;
		const parts = simple ? [] : tokens.map(tok => {
			if (tok.type === "text") return { text: tok.text };
			const s = slot++;
			if (tok.type === "blank") return { blank: true, slot: s };
			return {
				opts:    true,
				slot:    s,
				display: tok.opts.map(o => (o === "__" ? "___" : o)).join("/"),
				listId:  `trait-opts-${traitIndex}-${s}`,
				options: tok.opts.filter(o => o !== "__"),
			};
		});
		return { value: trait, simple, parts };
	});
}

/**
 * A ticked trait with its slots filled in from `slotValues` (by slot number). A blank left empty
 * stays `__`; a slash group left empty takes its first real choice.
 */
export function filledTrait(trait, slotValues = []) {
	let slot = 0;
	let out = "";
	for (const tok of tokenizeTrait(trait)) {
		if (tok.type === "text") { out += tok.text; continue; }
		const typed = String(slotValues[slot++] ?? "").trim();
		if (tok.type === "blank") out += typed || "__";
		else out += typed || tok.opts.find(o => o !== "__") || tok.opts[0];
	}
	return out;
}

/**
 * What the dialog resolves to: the new individual, or null with no name (saving nameless closes the
 * window and writes nothing, as it always has).
 *
 * @param {{name?: string, tag?: string, picks?: Array<{trait: string, slots?: string[]}>}} form
 * @returns {{name: string, tag: string, traits: string[]}|null}
 */
export function crewMemberNameResult({ name = "", tag = "", picks = [] } = {}) {
	const trimmed = String(name ?? "").trim();
	if (!trimmed) return null;
	return {
		name:   trimmed,
		tag:    String(tag ?? "").trim(),
		traits: picks.map(p => filledTrait(p.trait, p.slots)),
	};
}

/** Read the dialog's form off its root element into the shape crewMemberNameResult takes. */
export function readCrewMemberNameForm(root) {
	const value = sel => root.querySelector(sel)?.value ?? "";
	const picks = [...root.querySelectorAll("[name='traits']:checked")].map(cb => {
		const group = cb.closest(".stonetop-trait-chip-group");
		const slots = [];
		for (const el of group?.querySelectorAll(".stonetop-trait-fill, .stonetop-trait-select") ?? []) {
			slots[Number(el.dataset.slot)] = el.value;
		}
		return { trait: cb.value, slots };
	});
	return { name: value("[name='ind-name']"), tag: value("[name='ind-tag']"), picks };
}

export class CrewMemberNameDialog extends StonetopDialog {
	/**
	 * @param {{individualOptions?: object}} ctx  the Crew insert's `individualOptions` (crewSource)
	 */
	constructor({ individualOptions = {} } = {}, options = {}) {
		super(options);
		this._lists = crewNameLists(individualOptions);
	}

	// No fixed id: as with the v1 Dialog this replaced, each window gets its own, so naming two
	// members (or on two sheets) at once opens two windows rather than painting one into the other.
	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			title:    "Name this Crew Member",
			template: "systems/stonetop_pwd/templates/dialogs/crew-member-name.hbs",
			// height "auto", not a fixed 580: this dialog is three short fields and a chip list, so a
			// fixed height left ~226px of dead air between the traits and the footer. The trait grid
			// caps itself at 340px and scrolls, so "auto" cannot run away on a crew with a long trait
			// list. A window made taller still keeps Save in the bottom-right corner — that is what
			// the footer's margin-top:auto is for.
			width:    540,
			height:   "auto",
			// "stonetop" is what carries our window CHROME — the header bar, the content parchment,
			// the focus glow — all of which is scoped to that class so it cannot bleed onto core or
			// another module's windows. "dialog" is what the shared footer-button skin keys on.
			classes:  ["dialog", "stonetop", "stonetop-individual-dialog"],
		});
	}

	getData() {
		const { names, tags, traits } = this._lists;
		return { names, tags, traits: crewNameTraitChips(traits) };
	}

	activateListeners(html) {
		super.activateListeners(html);
		// Swap the name/tag/trait combos' native <datalist> popups (which lose their scrollbar when
		// long, crbug.com/375637) for our scrollable one. See utils/autocomplete.js.
		StonetopAutocomplete.upgradeAll(html);
		html.find("form").on("submit", ev => ev.preventDefault());

		// Ticking a chip with slots opens its fields; unticking shuts and clears them.
		html.find("[name='traits']").on("change", ev => {
			const group   = ev.currentTarget.closest(".stonetop-trait-chip-group");
			const checked = ev.currentTarget.checked;
			group?.classList.toggle("is-selected", checked);
			group?.querySelectorAll(".stonetop-trait-blank").forEach(el => { el.style.display = checked ? "none" : ""; });
			group?.querySelectorAll(".stonetop-trait-fill, .stonetop-trait-select").forEach(el => {
				el.style.display = checked ? "inline-block" : "none";
				if (!checked) el.value = "";
			});
		});

		// One button, keyed `save`. NOT `add`: that key is in the global affirmative list
		// (`.vtt .dialog .dialog-buttons [data-button="add"]`), which pushes its button to the far
		// LEFT with `margin-right: auto` so a Cancel can sit opposite it. With nothing to sit
		// opposite, that rule would strand the lone button on the left. Closing the window is the
		// cancel — the titlebar ✕ already does it.
		html.find(".dialog-button[data-button='save']").on("click", ev => {
			ev.preventDefault();
			this._save();
		});
		// Enter in a field saves, as the v1 Dialog's default button did — unless the autocomplete
		// popup has just taken it to pick a suggestion.
		html.on("keydown", ev => {
			if (ev.key !== "Enter" || ev.isDefaultPrevented()) return;
			ev.preventDefault();
			ev.stopPropagation();
			this._save();
		});
	}

	_save() {
		const root = this.element?.[0];
		if (root) this._resolveWith(crewMemberNameResult(readCrewMemberNameForm(root)));
	}
}
