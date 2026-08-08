export class CharacterLore {
	constructor(flags) {
		this._flags = flags;
	}

	get counts() {
		return this._flags.getFlag("counts") ?? {};
	}

	getCount(loreSlug, optionSlug) {
		return this.counts[`${loreSlug}:${optionSlug}`] ?? 0;
	}

	async setCount(loreSlug, optionSlug, count) {
		await this.setCounts(loreSlug, { [optionSlug]: count });
	}

	/**
	 * Set several of one section's counts at once — for a "choose 1" group, where taking an option
	 * also clears its siblings.
	 *
	 * ONE write for the lot. Done one at a time they had to be awaited in sequence, because each
	 * rewrites the whole counts object from a spread of what it last read and two in flight would
	 * clobber each other; and each one cost its own server round trip and its own re-render of
	 * every open sheet. Building the whole object first removes both problems at once.
	 */
	async setCounts(loreSlug, counts) {
		const changes = {};
		for (const [optionSlug, count] of Object.entries(counts)) changes[`${loreSlug}:${optionSlug}`] = count;
		await this._flags.setFlag("counts", { ...this.counts, ...changes });
	}

	get texts() {
		return this._flags.getFlag("texts") ?? {};
	}

	getText(loreSlug, optionSlug) {
		return this.texts[`${loreSlug}:${optionSlug}`] ?? "";
	}

	async setText(loreSlug, optionSlug, value) {
		const key = `${loreSlug}:${optionSlug}`;
		await this._flags.setFlag("texts", { ...this.texts, [key]: value });
	}

	/**
	 * Drop every count and text whose key isn't in `validKeys` — for when the thing this lore
	 * belongs to has been swapped for a different one and its answers no longer mean anything.
	 *
	 * Deleted through `batch`, not by writing a filtered object back: an object flag value MERGES
	 * on write, so a filtered copy would leave every dropped key exactly where it was. Removing a
	 * sub-key needs Foundry's `-=key` syntax, which is what batch's `deletes` builds. One
	 * actor.update for the lot, so it costs one re-render rather than one per key.
	 *
	 * Returns how many were dropped, so a caller can tell whether anything happened.
	 */
	async pruneTo(validKeys) {
		const counts = Object.keys(this.counts).filter(k => !validKeys.has(k));
		const texts  = Object.keys(this.texts).filter(k => !validKeys.has(k));
		if (!counts.length && !texts.length) return 0;
		await this._flags.batch({ deletes: { counts, texts } });
		return counts.length + texts.length;
	}
}
