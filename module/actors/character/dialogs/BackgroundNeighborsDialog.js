import { StonetopDialog } from "../../../utils/stonetop-dialog.js";
import { wirePickTally } from "../../../utils/pick-tally.js";
import { joinNames, normalizePlaybookGlyphs, stripHtmlToText } from "../../../utils/strings.js";
import { format, localize } from "../../../utils/i18n.js";

// The "pick N more" half of a background that names neighbors, asked when the background is
// chosen on the Details tab rather than through onboarding (which asks it on its own background
// step). The Judge's Missionary: "Add these Judges to the Neighbors section of the steading
// playbook (pick 2 more)". Devin and Haeris are fixed; this asks for the two more.
//
// Generic: one group per `setup.neighborChoices` entry, capped at its `count` (an over-cap tick
// lets the earliest go, as every pick list in the system does). The fixed neighbors are named in
// the lead but are the caller's to file: they go on the roster whichever button is pressed.
//
// Resolves (StonetopDialog's promise protocol) to `{ [choiceKey]: [value, ...] }` on "Add", and
// to null on the other button, Escape or the X.
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

export class BackgroundNeighborsDialog extends StonetopDialog {
	constructor(background, preTicked = {}, options = {}) {
		super(options);
		this._background = background;
		this._preTicked  = preTicked ?? {};
	}

	/**
	 * Ask for `background`'s neighbor picks, pre-ticking `preTicked` (a stored earlier answer).
	 * @returns {Promise<object|null>}
	 */
	static ask(background, preTicked = {}) {
		if (!background?.setup?.neighborChoices?.length) return Promise.resolve(null);
		return new BackgroundNeighborsDialog(background, preTicked).promise();
	}

	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id:        "stonetop-background-neighbors-dialog",
			template:  "systems/stonetop-pwd/templates/dialogs/background-neighbors.hbs",
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
		const fixed = this._fixedNames();
		return {
			lead: fixed.length
				? format("stonetop.backgroundNeighbors.fixed", { names: joinNames(fixed) })
				: "",
			groups: neighborChoiceGroups(this._background?.setup, this._preTicked),
			addLabel:  localize("stonetop.backgroundNeighbors.add"),
			skipLabel: fixed.length
				? format("stonetop.backgroundNeighbors.skipFixed", { names: joinNames(fixed) })
				: localize("stonetop.backgroundNeighbors.skip"),
		};
	}

	activateListeners(html) {
		super.activateListeners(html);
		const root = html[0];
		root.querySelectorAll("[data-neighbor-choice]").forEach(list => {
			wirePickTally(list, Number(list.dataset.pickMax) || null, { enforce: true });
		});
		html.find('[data-action="add"]').on("click", () => this._resolveWith(this._picks(root)));
		html.find('[data-action="skip"]').on("click", () => this._resolveWith(null));
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
