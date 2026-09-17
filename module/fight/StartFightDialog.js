// "Start a fight" / "Add to the fight": the people picker, asking who is in the fight.
//
// THE PICKER'S OWN WINDOW (dialogs/PersonPickerDialog.js), because the question has the same shape:
// several answers off long lists, found by typing a name. Two things are the fight's own:
//  • THE BUTTON COUNTS SIDES. "Start the fight: 4 heroes, 6 foes" says who is about to fight whom,
//    which a count of people would not.
//  • THE ANSWER CARRIES THE SIDES AND THE LINE-UP. Each pick comes back with the side the window
//    filed it under, and "Line everyone up" rides along from the options row.

import { PersonPickerDialog } from "../dialogs/PersonPickerDialog.js";
import { format } from "../utils/i18n.js";
import { HEROES, FOES } from "./engagements.js";

const KEY = "stonetop.fight.startWindow";

export class StartFightDialog extends PersonPickerDialog {
	/**
	 * @param {object} p  PersonPickerDialog's options, plus:
	 * @param {Map<string, "heroes"|"foes">} p.sides  the side of every id offered
	 * @param {"start"|"add"} [p.mode]
	 */
	constructor({ sides = new Map(), mode = "start", ...rest } = {}, options = {}) {
		super({ ...rest, multiple: true }, options);
		this._sides = sides instanceof Map ? sides : new Map(Object.entries(sides ?? {}));
		this._mode = mode === "add" ? "add" : "start";
	}

	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			classes: ["stonetop", "stonetop-person-picker-app", "stonetop-start-fight-app"],
			width: 560,
		});
	}

	/** "Start the fight: 4 heroes, 6 foes", leaving out a side nobody is ticked on. */
	_chooseLabel(picked) {
		if (!picked.length) return this._buttonLabel;
		const heroes = picked.filter(id => this._sides.get(id) === HEROES).length;
		const foes = picked.length - heroes;
		const parts = [];
		if (heroes) parts.push(format(`${KEY}.${heroes === 1 ? "hero" : "heroes"}`, { count: heroes }));
		if (foes) parts.push(format(`${KEY}.${foes === 1 ? "foe" : "foes"}`, { count: foes }));
		return format(`${KEY}.${this._mode === "add" ? "confirmAdd" : "confirmStart"}`, { who: parts.join(", ") });
	}

	/** Settle on `{picks: [{id, side, name}], lineUp}`. Nobody ticked is not an answer. */
	_choose(root) {
		const picked = this._picked(root);
		if (!picked.length) return;
		const { lineUp = false } = this._toggleValues(root);
		this._resolveWith({
			picks: picked.map(id => ({ id, side: this._sides.get(id) === HEROES ? HEROES : FOES, name: this._names.get(id) ?? "" })),
			lineUp,
		});
	}
}
