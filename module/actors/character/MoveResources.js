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

	/**
	 * Drop one move's stored track, for a move that is gone for good. Only meaningful for
	 * a key that will never come back: a custom move's key is its item id, and ids aren't
	 * reused, so the entry would sit in the flag forever. A shipped move keyed by NAME is
	 * deliberately left alone — re-adding it should restore the count where it left off.
	 * No-op when nothing is stored, so removing a track-less move costs no document write.
	 * @param {string} moveKey
	 */
	async clear(moveKey) {
		if (!moveKey || !(moveKey in this.getMoveResources())) return;
		await this._flags.batch({ deletes: { [key]: [moveKey] } });
	}

	// Per-option marks for moves like "Potential for Greatness":
	// { [moveName]: { [optionSlug]: value } }
	getMarks() {
		return this._flags.getFlag("moveMarks") ?? {};
	}

	// actor.update() fragment that writes one option's marks, so callers can batch
	// it into a single document update alongside other changes (e.g. stat deltas).
	markUpdate(moveName, optionSlug, value) {
		const current = this.getMarks();
		return this._flags.updateData("moveMarks", {
			...current,
			[moveName]: { ...(current[moveName] ?? {}), [optionSlug]: value },
		});
	}
}
