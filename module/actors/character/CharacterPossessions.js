export class CharacterPossessions {
	constructor(flags) {
		this._flags = flags;
	}

	get selected()    { return new Set(this._flags.getFlag("selected") ?? []); }
	get uses()        { return this._flags.getFlag("uses") ?? {}; }
	get maxUses()     { return this._flags.getFlag("maxUses") ?? {}; }
	get subChoices()  { return this._flags.getFlag("subChoices") ?? {}; }
	get choiceUses()  { return this._flags.getFlag("choiceUses") ?? {}; }
	// Player-written "something else (discuss with GM)" possessions — items not on the
	// playbook's list, stored as { slug, label } since there's no option to match by slug.
	get custom()      { return this._flags.getFlag("custom") ?? []; }

	async select(slug) {
		const s = this.selected;
		s.add(slug);
		await this._flags.setFlag("selected", [...s]);
	}

	async deselect(slug) {
		const s = this.selected;
		s.delete(slug);
		await this._flags.setFlag("selected", [...s]);
	}

	async setUses(slug, count) {
		await this._flags.setFlag("uses", { ...this.uses, [slug]: count });
	}

	async addSubChoice(possessionSlug, choiceSlug) {
		const current = this.subChoices;
		const existing = current[possessionSlug] ?? [];
		if (existing.includes(choiceSlug)) return;
		await this._flags.setFlag("subChoices", { ...current, [possessionSlug]: [...existing, choiceSlug] });
	}

	// Replace a possession's whole sub-choice list (used when re-applying onboarding, so
	// sub-choices the player deselected are dropped rather than left behind by add-only writes).
	async setSubChoices(possessionSlug, choiceSlugs) {
		await this._flags.setFlag("subChoices", { ...this.subChoices, [possessionSlug]: [...choiceSlugs] });
	}

	async removeSubChoice(possessionSlug, choiceSlug) {
		const current = this.subChoices;
		const existing = current[possessionSlug] ?? [];
		await this._flags.setFlag("subChoices", { ...current, [possessionSlug]: existing.filter(s => s !== choiceSlug) });
	}

	async selectExclusive(possessionSlug, choiceSlug, exclusiveSlugs) {
		const current = this.subChoices;
		const existing = current[possessionSlug] ?? [];
		const filtered = existing.filter(s => !exclusiveSlugs.includes(s));
		const updated = filtered.includes(choiceSlug) ? filtered : [...filtered, choiceSlug];
		await this._flags.setFlag("subChoices", { ...current, [possessionSlug]: updated });
	}

	async setChoiceUses(possessionSlug, choiceSlug, count) {
		const key = `${possessionSlug}:${choiceSlug}`;
		await this._flags.setFlag("choiceUses", { ...this.choiceUses, [key]: count });
	}

	// Free text the player wrote into a sub-option's fill-in blank (the Would-Be Hero's
	// "A shield, bearing ___'s crest"), keyed possessionSlug:choiceSlug like choiceUses.
	get choiceTexts()  { return this._flags.getFlag("choiceTexts") ?? {}; }

	getChoiceText(possessionSlug, choiceSlug) {
		return this.choiceTexts[`${possessionSlug}:${choiceSlug}`] ?? "";
	}

	async setChoiceText(possessionSlug, choiceSlug, value) {
		const key = `${possessionSlug}:${choiceSlug}`;
		await this._flags.setFlag("choiceTexts", { ...this.choiceTexts, [key]: value });
	}

	// Replace the whole write-in list from a set of labels, assigning each a `custom-N`
	// slug. Blank labels are dropped. Replacing (rather than appending) keeps re-running
	// onboarding idempotent: the same write-in maps back to the same single entry.
	async setCustom(labels) {
		const entries = [];
		let n = 1;
		for (const label of labels ?? []) {
			const trimmed = String(label ?? "").trim();
			if (!trimmed) continue;
			entries.push({ slug: `custom-${n}`, label: trimmed });
			n++;
		}
		await this._flags.setFlag("custom", entries);
	}

	async removeCustom(slug) {
		await this._flags.setFlag("custom", this.custom.filter(c => c.slug !== slug));
	}
}
