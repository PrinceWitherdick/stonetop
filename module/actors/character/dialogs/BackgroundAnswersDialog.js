import { StonetopDialog } from "../../../utils/stonetop-dialog.js";
import { normalizePlaybookGlyphs, stripHtmlToText } from "../../../utils/strings.js";
import { format, localize } from "../../../utils/i18n.js";
import { wellVersedTopicSummary } from "./well-versed-topics.js";

// What a background asks of a move when the background is chosen on the Details tab rather than
// through onboarding (which asks it on its own background step): the Seeker's Witch Hunter is
// "Well Versed in (pick 1) the Fae, the Things Below, or the Last Door and what lies beyond".
// Also opened from the card's cue while such an answer is still empty.
//
// Self-contained: the caller hands over `asks` (StonetopCharacter#backgroundAnswerAsks) and writes
// what comes back (StonetopCharacter#setBackgroundAnswer). One radio group per ask, the answer held
// now pre-picked.
//
// Resolves (StonetopDialog's promise protocol) to `{ [askKey]: value }` on "Choose this", and to
// null on "Choose later", Escape or the X.

/** The radio groups the dialog draws, one per ask, each option `selected` when it is the held answer. */
export function backgroundAnswerGroups(asks = []) {
	return asks.map(ask => ({
		key:   ask.key,
		label: normalizePlaybookGlyphs(ask.label ?? ask.key),
		options: (ask.options ?? []).map(value => ({
			value,
			label:    normalizePlaybookGlyphs(value),
			summary:  wellVersedTopicSummary(value) ?? "",
			selected: ask.value === value,
		})),
	}));
}

export class BackgroundAnswersDialog extends StonetopDialog {
	constructor(background, asks, options = {}) {
		super(options);
		this._background = background;
		this._asks       = asks ?? [];
	}

	/**
	 * Ask `asks` for `background`. Opens only when there is something to ask.
	 * @returns {Promise<Record<string, string>|null>}
	 */
	static ask(background, asks) {
		if (!asks?.length) return Promise.resolve(null);
		return new BackgroundAnswersDialog(background, asks).promise();
	}

	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id:        "stonetop-background-answers-dialog",
			template:  "systems/stonetop_pwd/templates/dialogs/background-answers.hbs",
			width:     440,
			height:    "auto",
			resizable: true,
			// The possession-choices editor's chrome, as the neighbors ask wears it.
			classes:   ["stonetop", "stonetop-possession-choices-dialog", "stonetop-background-answers-dialog"],
		});
	}

	get title() {
		const background = stripHtmlToText(this._background?.label ?? "") || this._background?.slug || "";
		return format("stonetop.backgroundAnswers.title", { background, label: this._asks[0]?.label ?? "" });
	}

	get _autoHeight() { return true; }

	getData() {
		return {
			lead:        localize("stonetop.backgroundAnswers.lead"),
			groups:      backgroundAnswerGroups(this._asks),
			chooseLabel: localize("stonetop.backgroundAnswers.choose"),
			laterLabel:  localize("stonetop.backgroundAnswers.later"),
		};
	}

	activateListeners(html) {
		super.activateListeners(html);
		const root = html[0];
		html.find('[data-action="choose"]').on("click", () => this._resolveWith(this._picks(root)));
		html.find('[data-action="later"]').on("click", () => this._resolveWith(null));
	}

	/** The picked value of each group, by ask key; a group left unpicked is absent. */
	_picks(root) {
		const picks = {};
		root.querySelectorAll("[data-background-answer]").forEach(group => {
			const picked = group.querySelector('input[type="radio"]:checked');
			if (picked) picks[group.dataset.backgroundAnswer] = picked.value;
		});
		return picks;
	}
}
