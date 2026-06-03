export class CharacterBackgrounds {
	constructor(flags) {
		this._flags = flags;
	}

	get selectedSlug() {
		return this._flags.getFlag("selected") ?? "";
	}

	get choices() {
		return this._flags.getFlag("choices") ?? {};
	}

	get setupResources() {
		return this._flags.getFlag("setupResources") ?? {};
	}

	get setupTexts() {
		return this._flags.getFlag("setupTexts") ?? {};
	}

	async selectBackground(slug) {
		await this._flags.setFlag("selected", slug);
	}

	async addChoice(choice) {
		const current = this.choices;
		await this._flags.setFlag("choices", { ...current, [choice.slug]: choice.isChecked });
	}

	async setSetupResource(key, value) {
		await this._flags.setFlag("setupResources", { ...this.setupResources, [key]: value });
	}
}
