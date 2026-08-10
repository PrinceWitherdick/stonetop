export class CharacterAppearance {
	constructor(flags) {
		this._flags = flags;
	}

	get saved() {
		return this._flags.getFlag("selected") ?? {};
	}

	/**
	 * Set one appearance line — a ticked suggestion or a written-in one, stored the same way
	 * either, because a line is just a string and the playbook's suggestions are only
	 * suggestions.
	 *
	 * Writes the ONE line's sub-key, never the whole map: the four lines sit on screen
	 * together and each has both a radio row and a write-in box, so a `{ ...saved }` spread
	 * would let a second line's write, composed from a map read before the first landed,
	 * put the first one back.
	 *
	 * An empty value CLEARS the line by dropping its key rather than storing "" — setFlag
	 * deep-merges, so an empty string would sit on the actor forever.
	 */
	async select(lineIdx, value) {
		const text = typeof value === "string" ? value.trim() : value;
		if (!text) { await this._flags.batch({ deletes: { selected: [lineIdx] } }); return; }
		await this._flags.setSubKey("selected", lineIdx, text);
	}
}
