import { StonetopDialog } from "../../../utils/stonetop-dialog.js";
import { wirePickTally } from "../../../utils/pick-tally.js";
import { format, localize } from "../../../utils/i18n.js";

// What a summoned follower's card asks before it joins the Followers tab: the beautiful scroll's
// "Pick 2 additional tags, an instinct, 2 additional moves, and its cost" (Book II p.527), and the
// name its unlock asked the player to give it. One group per `choices` entry (arcana-summons.js),
// capped at its pick; the boxes open on what the card already has ticked.
//
// The same ask puts right a follower summoned before its picks were asked for (summon-repair.js):
// it says what is off, opens on what the follower carries, and offers to keep it as it is.
//
// Resolves (StonetopDialog's promise protocol) to `{ action: "save", name, picks: { [field]:
// [value, ...] } }` on the save button, `{ action: "keep" }` on "Keep it as it is" (repair only),
// and to null on the last button, Escape or the X.
export class ArcanaSummonDialog extends StonetopDialog {
	/**
	 * @param {object} follower  the ARCANA_SUMMONS follower entry
	 * @param {object[]} groups  summonChoiceGroups(follower, card), or summonRepair's groups
	 * @param {object} [ask]
	 * @param {string} [ask.cardTitle]  the arcanum's name, for a new summon's lead
	 * @param {{name: string, issues: object[]}} [ask.repair]  set when putting a follower right
	 */
	constructor(follower, groups, { cardTitle = "", repair = null } = {}, options = {}) {
		// A repair's footer holds three buttons, which wrap at the new summon's width.
		super(repair ? { width: 540, ...options } : options);
		this._follower  = follower;
		this._groups    = groups ?? [];
		this._cardTitle = cardTitle;
		this._repair    = repair;
	}

	/** Ask a new summon's picks. */
	static ask(follower, groups, cardTitle) {
		return new ArcanaSummonDialog(follower, groups, { cardTitle }).promise();
	}

	/** Ask the picks that put right `name`, a follower summoned before they were asked for. */
	static repair(follower, groups, { name, issues }) {
		return new ArcanaSummonDialog(follower, groups, { repair: { name, issues } }).promise();
	}

	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id:        "stonetop-arcana-summon-dialog",
			template:  "systems/stonetop-pwd/templates/dialogs/arcana-summon.hbs",
			width:     440,
			height:    "auto",
			resizable: true,
			// The possession-choices editor's chrome: the same small boxed checkbox list.
			classes:   ["stonetop", "stonetop-possession-choices-dialog", "stonetop-arcana-summon-dialog"],
		});
	}

	get title() {
		return this._repair
			? format("stonetop.character.followers.summon.repair.title", { name: this._repair.name })
			: format("stonetop.character.followers.summon.title", { name: this._follower?.name ?? "" });
	}

	get _autoHeight() { return true; }

	getData() {
		const repair = this._repair;
		const name   = repair?.name ?? this._follower?.name ?? "";
		const T = key => `stonetop.character.followers.summon.${key}`;
		return {
			lead: repair
				? format(T("repair.lead"), { name })
				: (this._cardTitle ? format(T("lead"), { card: this._cardTitle }) : ""),
			issues: (repair?.issues ?? []).map(i => format(T(`repair.${i.kind}`), {
				have: i.have, pick: i.pick, missing: i.pick - i.have, label: String(i.label).toLowerCase(),
			})),
			askName:   !repair && !!this._follower?.askName,
			nameLabel: localize(T("nameLabel")),
			namePlaceholder: name,
			groups:    this._groups.map((group, i) => ({
				key:     String(i),
				field:   group.field,
				heading: format(T("pickHeading"), { label: group.label, count: group.pick }),
				note:    group.over ? format(T("repair.overNote"), { pick: group.pick }) : "",
				pick:    group.pick,
				options: group.options,
			})),
			addLabel:  repair ? localize(T("repair.save")) : format(T("add"), { name }),
			keepLabel: repair ? localize(T("repair.keep")) : "",
			skipLabel: localize(repair ? T("repair.later") : T("skip")),
		};
	}

	activateListeners(html) {
		super.activateListeners(html);
		const root = html[0];
		root.querySelectorAll("[data-summon-choice]").forEach(list => {
			wirePickTally(list, Number(list.dataset.pickMax) || null, { enforce: true });
		});
		html.find('[data-action="add"]').on("click", () => this._resolveWith({
			action: "save",
			name:   root.querySelector("[data-summon-name]")?.value?.trim() ?? "",
			picks:  this._picks(root),
		}));
		html.find('[data-action="keep"]').on("click", () => this._resolveWith({ action: "keep" }));
		html.find('[data-action="skip"]').on("click", () => this._resolveWith(null));
	}

	/** What is ticked, by group field. */
	_picks(root) {
		const picks = {};
		root.querySelectorAll("[data-summon-choice]").forEach(list => {
			picks[list.dataset.field] = [...list.querySelectorAll('input[type="checkbox"]:checked')].map(box => box.value);
		});
		return picks;
	}
}
