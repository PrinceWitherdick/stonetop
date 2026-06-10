const key = "backgroundChoices";
export class MoveResources {
	_flags;

	constructor(flags) {
		this._flags = flags;
	}

	/**
	 * @param {MoveResourceButton} moveResourceButton
	 * @returns {Promise<void>}
	 */
	async add(moveResourceButton) {
		const newValue = moveResourceButton.isChecked() ? moveResourceButton.index : moveResourceButton.index + 1;
		const current = this.getMoveResources();
		await this._addMoveResource(current, moveResourceButton.moveName, newValue);
	}

	getMoveResources() {
		return this._flags.getFlag(key) ?? {};
	}

	async _addMoveResource(current, moveName, newValue) {
		await this._flags.setFlag(key, {...current, [moveName]: newValue});
	}

	// Per-option checkbox marks for moves like "Potential for Greatness":
	// { [moveName]: { [optionSlug]: checkedCount } }
	getMarks() {
		return this._flags.getFlag("moveMarks") ?? {};
	}

	async setMark(moveName, optionSlug, count) {
		await this._writeMark(moveName, optionSlug, count);
	}

	// Per-slot choice (e.g. which stat each "Potential for Greatness" mark boosts):
	// stored as an array at moveMarks[moveName][optionSlug].
	async setMarkChoice(moveName, optionSlug, index, value) {
		const prev = this.getMarks()[moveName]?.[optionSlug];
		const arr = Array.isArray(prev) ? [...prev] : [];
		arr[index] = value;
		await this._writeMark(moveName, optionSlug, arr);
	}

	async _writeMark(moveName, optionSlug, value) {
		const current = this.getMarks();
		await this._flags.setFlag("moveMarks", {
			...current,
			[moveName]: { ...(current[moveName] ?? {}), [optionSlug]: value },
		});
	}
}
