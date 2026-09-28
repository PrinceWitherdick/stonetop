import { StonetopDialog } from "../../../utils/stonetop-dialog.js";
import { wirePickTally } from "../../../utils/pick-tally.js";
import { StonetopAutocomplete } from "../../../utils/autocomplete.js";
import { TRAITS } from "../../../data/steading-members.js";
import { joinNames, normalizePlaybookGlyphs, stripHtmlToText } from "../../../utils/strings.js";
import { format, localize } from "../../../utils/i18n.js";

// What a background that names neighbors asks, when the background is chosen on the Details tab
// rather than through onboarding (which asks it on its own background step). Two shapes:
//  - the "pick N more": the Judge's Missionary, "Add these Judges to the Neighbors section of the
//    steading playbook (pick 2 more)". Devin and Haeris are fixed; this asks for the two more.
//  - a trait for each fixed neighbor carrying a `traitKey`: the Ranger's Wide Wanderer, "Add each
//    of the following to the Neighbors list ..., choosing 1 trait for each". The same free-type
//    field onboarding draws, with the same suggestions (steading-members.js TRAITS, the list
//    onboarding's own copy holds) and the same roll-a-trait die.
//
// Generic: one group per `setup.neighborChoices` entry, capped at its `count` (an over-cap tick
// lets the earliest go, as every pick list in the system does). The fixed neighbors are named in
// the lead but are the caller's to file: they go on the roster whichever button is pressed.
//
// Resolves (StonetopDialog's promise protocol) to `{ picks: { [choiceKey]: [value, ...] },
// traits: { [traitKey]: trait } }` on "Add", and to null on the other button, Escape or the X.
/**
 * A background's "pick N more neighbors" groups as a picker draws them, onboarding's step and this
 * dialog alike: the printed words through the one glyph normaliser, a count of 1 where the playbook
 * names none, and each option `selected` when `picked[choice.key]` holds it.
 *
 * @param {object} setup  the background's `setup`
 * @param {Record<string, string[]>} [picked]
 */
export function neighborChoiceGroups(setup, picked = {}) {
	return (setup?.neighborChoices ?? []).map(choice => {
		const selected = picked?.[choice.key] ?? [];
		return {
			key: choice.key,
			label: normalizePlaybookGlyphs(choice.label ?? choice.key),
			count: Number(choice.count ?? 1),
			selectedCount: selected.length,
			options: (choice.options ?? []).map(option => ({
				value: option.value,
				name: normalizePlaybookGlyphs(option.name ?? option.value),
				origin: normalizePlaybookGlyphs(option.origin ?? ""),
				trait: normalizePlaybookGlyphs(option.trait ?? ""),
				selected: selected.includes(option.value),
			})),
		};
	});
}

/**
 * The picks worth storing (`background.neighborPicks`): only the groups this background prints, and only
 * those with something picked.
 */
export function storedNeighborPicks(setup, picked = {}) {
	const out = {};
	for (const choice of setup?.neighborChoices ?? []) {
		const values = picked?.[choice.key] ?? [];
		if (values.length) out[choice.key] = values;
	}
	return out;
}

/** The fixed neighbors a background asks a trait for (`traitKey`: the Ranger's Wide Wanderer). */
export function traitedNeighbors(setup) {
	return (setup?.neighbors ?? []).filter(n => n?.traitKey);
}

/**
 * The traits worth storing (`background.neighborTraits`, where onboarding stores them): only the
 * keys this background prints, trimmed, and only those written.
 */
export function storedNeighborTraits(setup, traits = {}) {
	const out = {};
	for (const neighbor of traitedNeighbors(setup)) {
		const value = String(traits?.[neighbor.traitKey] ?? "").trim();
		if (value) out[neighbor.traitKey] = value;
	}
	return out;
}

/**
 * A trait at random for the roll-a-trait die, from `pool` less the traits already `taken` (the
 * other fields' values, any case), so five rolls give five different people. A pool the taken
 * traits exhaust falls back to the whole of it. `random` is Math.random's shape.
 */
export function randomNeighborTrait(taken = [], pool = TRAITS, random = Math.random) {
	const used = new Set([...taken].map(t => String(t ?? "").trim().toLowerCase()).filter(Boolean));
	const open = pool.filter(trait => !used.has(trait.toLowerCase()));
	const options = open.length ? open : pool;
	return options[Math.floor(random() * options.length)];
}

export class BackgroundNeighborsDialog extends StonetopDialog {
	constructor(background, preTicked = {}, traits = {}, options = {}) {
		super(options);
		this._background = background;
		this._preTicked  = preTicked ?? {};
		this._traits     = traits ?? {};
	}

	/**
	 * Ask for `background`'s neighbor picks and traits, pre-filling `preTicked` and `traits` (a
	 * stored earlier answer). Opens only when there is something to ask.
	 * @returns {Promise<{picks: object, traits: object}|null>}
	 */
	static ask(background, preTicked = {}, traits = {}) {
		const setup = background?.setup;
		if (!setup?.neighborChoices?.length && !traitedNeighbors(setup).length) return Promise.resolve(null);
		return new BackgroundNeighborsDialog(background, preTicked, traits).promise();
	}

	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id:        "stonetop-background-neighbors-dialog",
			template:  "systems/stonetop_pwd/templates/dialogs/background-neighbors.hbs",
			width:     440,
			height:    "auto",
			resizable: true,
			// The possession-choices editor's chrome: the same small boxed checkbox list.
			classes:   ["stonetop", "stonetop-possession-choices-dialog", "stonetop-background-neighbors-dialog"],
		});
	}

	get title() {
		return format("stonetop.backgroundNeighbors.title", { background: this._backgroundLabel() });
	}

	get _autoHeight() { return true; }

	_backgroundLabel() {
		return stripHtmlToText(this._background?.label ?? "") || this._background?.slug || "";
	}

	_fixedNames() {
		return (this._background?.setup?.neighbors ?? []).map(n => n.name).filter(Boolean);
	}

	getData() {
		const setup = this._background?.setup;
		const fixed = this._fixedNames();
		const groups = neighborChoiceGroups(setup, this._preTicked);
		const neighbors = traitedNeighbors(setup).map(neighbor => ({
			name:       normalizePlaybookGlyphs(neighbor.name ?? ""),
			origin:     normalizePlaybookGlyphs(neighbor.origin ?? ""),
			traitKey:   neighbor.traitKey,
			traitLabel: normalizePlaybookGlyphs(neighbor.traitLabel ?? "Trait"),
			trait:      this._traits?.[neighbor.traitKey] ?? "",
		}));
		// With nothing to pick, the other button still files everyone, only with no traits.
		const skipLabel = !groups.length && neighbors.length
			? localize("stonetop.backgroundNeighbors.skipTraits")
			: fixed.length
				? format("stonetop.backgroundNeighbors.skipFixed", { names: joinNames(fixed) })
				: localize("stonetop.backgroundNeighbors.skip");
		return {
			lead: fixed.length
				? format("stonetop.backgroundNeighbors.fixed", { names: joinNames(fixed) })
				: "",
			traitsLead: neighbors.length ? localize("stonetop.backgroundNeighbors.traitsLead") : "",
			neighbors,
			groups,
			addLabel:  localize("stonetop.backgroundNeighbors.add"),
			skipLabel,
		};
	}

	activateListeners(html) {
		super.activateListeners(html);
		const root = html[0];
		root.querySelectorAll("[data-neighbor-choice]").forEach(list => {
			wirePickTally(list, Number(list.dataset.pickMax) || null, { enforce: true });
		});
		// A fresh render replaces the inputs, so drop any stale popup first.
		StonetopAutocomplete.close();
		root.querySelectorAll("[data-neighbor-trait]").forEach(input => StonetopAutocomplete.attach(input, TRAITS));
		html.find('[data-action="roll-trait"]').on("click", ev => {
			ev.preventDefault();
			const input = ev.currentTarget.parentElement?.querySelector("[data-neighbor-trait]");
			if (!input) return;
			input.value = randomNeighborTrait([...root.querySelectorAll("[data-neighbor-trait]")].map(el => el.value));
			StonetopAutocomplete.close();
		});
		html.find('[data-action="add"]').on("click", () => this._resolveWith({ picks: this._picks(root), traits: this._traitValues(root) }));
		html.find('[data-action="skip"]').on("click", () => this._resolveWith(null));
	}

	async close(options) {
		StonetopAutocomplete.close();
		return super.close(options);
	}

	/** What is written in each trait field, by trait key. */
	_traitValues(root) {
		const traits = {};
		root.querySelectorAll("[data-neighbor-trait]").forEach(input => {
			const value = input.value.trim();
			if (value) traits[input.dataset.neighborTrait] = value;
		});
		return traits;
	}

	/** What is ticked, by choice key. */
	_picks(root) {
		const picks = {};
		root.querySelectorAll("[data-neighbor-choice]").forEach(list => {
			picks[list.dataset.neighborChoice] = [...list.querySelectorAll('input[type="checkbox"]:checked')]
				.map(box => box.value);
		});
		return picks;
	}
}
