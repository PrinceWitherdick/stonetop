import {
	LoreOptionSnapshotBuilder,
	LoreEntrySnapshotBuilder,
	LoreSection,
	AppearanceLineSnapshot,
	AppearanceOptionSnapshot,
	AppearanceSection,
	BackgroundChoiceOptionSnapshot,
	BackgroundChoicesSnapshotBuilder,
	BackgroundOptionSnapshotBuilder,
	BackgroundSection,
	CharacterSnapshotBuilder,
	InstinctOptionSnapshotBuilder,
	InstinctSection,
	OriginOptionSnapshot,
	OriginSection,
	PlaybookSnapshotBuilder,
	ValueMax,
	VitalsSnapshotBuilder,
} from "../../model/CharacterSnapshot.js";
import {MoveResources} from "./MoveResources.js";
import {CharacterMoves} from "./CharacterMoves.js";
import {StonetopFlags} from "./StonetopFlags.js";
import {CharacterBackgrounds} from "./CharacterBackgrounds.js";
import {CharacterInstincts} from "./CharacterInstincts.js";
import {CharacterAppearance} from "./CharacterAppearance.js";
import {CharacterOrigin} from "./CharacterOrigin.js";
import {CharacterPossessions} from "./CharacterPossessions.js";
import {CharacterInventory} from "./CharacterInventory.js";
import {CharacterArcana} from "./CharacterArcana.js";
import {CharacterLore} from "./CharacterLore.js";
import {CharacterPostDeath, buildLoreSection} from "./CharacterPostDeath.js";
import {CharacterStats} from "./CharacterStats.js";
import {FoundryRepositoryFactory} from "./repositories/FoundryRepositoryFactory.js";

export class StonetopCharacter {
	constructor(actor, repos) {
		this._actor = actor;
		this._playbookRepo = repos.playbook;
		this._background = new CharacterBackgrounds(new StonetopFlags(actor, "background"));
		this._instinct = new CharacterInstincts(new StonetopFlags(actor, "instinct"));
		this._appearance = new CharacterAppearance(new StonetopFlags(actor, "appearance"));
		this._origin = new CharacterOrigin(new StonetopFlags(actor, "origin"));
		this._moveResources = new MoveResources(new StonetopFlags(actor, "moves"));
		this._moves = new CharacterMoves(repos.moves, this._moveResources, actor);
		this._possessions = new CharacterPossessions(new StonetopFlags(actor, "possessions"));
		this._arcana = new CharacterArcana(new StonetopFlags(actor, "arcana"), repos.arcana);
		this._inventory = new CharacterInventory(new StonetopFlags(actor, "inventory"), repos.inventory, this._arcana, this._possessions, actor);
		this._lore = new CharacterLore(new StonetopFlags(actor, "lore"));
		this._postDeath = new CharacterPostDeath(
			new StonetopFlags(actor, "postDeathInsert"),
			new CharacterInstincts(new StonetopFlags(actor, "postDeathInstinct")),
			new CharacterLore(new StonetopFlags(actor, "postDeathLore")),
			repos.postDeathInsert,
			repos.moves,
			actor,
		);
		this._stats = new CharacterStats(actor);
	}

	static create(actor) {
		return new StonetopCharacter(actor, new FoundryRepositoryFactory());
	}

	get type() {
		return this._actor.type;
	}

	get background() {
		return this._background;
	}

	get instinct() {
		return this._instinct;
	}

	get appearance() {
		return this._appearance;
	}

	get origin() {
		return this._origin;
	}

	get possessions() {
		return this._possessions;
	}

	async updateName(name) {
		await this._actor.update({name});
	}

	async playbook() {
		const slug = this._actor.system?.playbook?.slug;
		if (!slug) return null;
		return this._playbookRepo.findBySlug(slug);
	}

	async buildSnapshot() {
		const actor = this._actor;
		const actorLevel = actor.system?.attributes?.level?.value ?? 1;
		const playbookData = await this.playbook();
		const ownedAllByName = this._moves.buildOwnedMovesMap();
		const actorItems = [...actor.items];
		const moves = await this._moves.buildSnapshot(playbookData, this._background.selectedSlug, actorLevel);
		const inventory = await this._inventory.buildSnapshot(playbookData, ownedAllByName, actorLevel, actorItems);
		const armor = await this._inventory.getArmor();
		const postDeath = await this._postDeath.buildSnapshot();
		const pdiLabel = postDeath.activeInsert?.name ?? null;
		return new CharacterSnapshotBuilder()
			.withName(actor.name)
			.withPlaybook(playbookData ? _buildPlaybookSection(playbookData, this._background, this._instinct, this._appearance, this._origin, this._lore) : null)
			.withDebilities(this._stats.buildDebilitiesSnapshot())
			.withStats(this._stats.buildStatsSnapshot())
			.withVitals(_buildVitalsSection(actor, playbookData, armor))
			.withMoves(moves)
			.withMovelist(this._moves.buildMovelist(moves, inventory.other, pdiLabel))
			.withInventory(inventory)
			.withArcana(await this._arcana.buildSnapshot(actor.system.stats ?? {}, this._inventory.checked, this._inventory.resources))
			.withPostDeathInsert(postDeath)
			.withRollMode(actor.flags?.pbta?.rollMode ?? "normal")
			.build();
	}

	async setPostDeathInsert(slug) {
		await this._postDeath.setInsert(slug);
	}

	async setPostDeathInstinct(value) {
		await this._postDeath.instinct.select(value);
	}

	async setPostDeathLoreCount(loreSlug, optSlug, n) {
		await this._postDeath.lore.setCount(loreSlug, optSlug, n);
	}

	async setPostDeathLoreText(loreSlug, optSlug, value) {
		await this._postDeath.lore.setText(loreSlug, optSlug, value);
	}

	async setInventoryItemChecked(slug, isChecked) {
		await this._inventory.setItemChecked(slug, isChecked);
	}

	async setInventoryResource(slug, count) {
		await this._inventory.setResource(slug, count);
	}

	async setInventoryLoadLevel(level) {
		await this._inventory.setLoadLevel(level);
	}

	async setInventoryRegularPool(count) {
		await this._inventory.setRegularPool(count);
	}

	async setInventorySmallPool(count) {
		await this._inventory.setSmallPool(count);
	}

	async addMoveResource(button) {
		await this._moveResources.add(button);
	}

	async addCustomInventoryItem(name, weight) { await this._inventory.addCustomItem(name, weight); }
	async addCustomSmallItem(name)             { await this._inventory.addCustomSmallItem(name); }
	async removeCustomInventoryItem(itemId)    { await this._inventory.removeCustomItem(itemId); }

	async selectPossession(slug) {
		await this._possessions.select(slug);
	}

	async deselectPossession(slug) {
		await this._possessions.deselect(slug);
	}

	async setPossessionUses(slug, count) {
		await this._possessions.setUses(slug, count);
	}

	async selectSubChoice(possessionSlug, choiceSlug) {
		await this._possessions.addSubChoice(possessionSlug, choiceSlug);
	}

	async deselectSubChoice(possessionSlug, choiceSlug) {
		await this._possessions.removeSubChoice(possessionSlug, choiceSlug);
	}

	async selectSubChoiceExclusive(possessionSlug, choiceSlug, exclusiveSlugs) {
		await this._possessions.selectExclusive(possessionSlug, choiceSlug, exclusiveSlugs);
	}

	async setSubChoiceUses(possessionSlug, choiceSlug, count) {
		await this._possessions.setChoiceUses(possessionSlug, choiceSlug, count);
	}

	async ensureStartingMoves() {
		await this._moves.ensureStartingMoves(await this.playbook(), this._background.selectedSlug);
	}

	async addMove(compendiumId) {
		await this._moves.addMove(compendiumId);
	}

	async removeMove(ownedId) {
		await this._moves.removeMove(ownedId);
	}

	async _onCreateDescendantDocuments(documents) {
		const stonetopItem = documents.find(d => d.type === "playbook");
		if (!stonetopItem) return;
		const stonetopPlaybook = stonetopItem.asPlaybook();

		const hp = stonetopPlaybook.hp;
		const damage = stonetopPlaybook.damage;
		if (hp && damage) {
			await this._actor.update({
				"system.attributes.hp.max": hp,
				"system.attributes.hp.value": hp,
				"system.attributes.damage.value": damage,
			});
		}
		await this.ensureStartingMoves();
	}

	async onRoll(event)      { return this._stats.onRoll(event); }
	async onDropMove(itemData) { return this._moves.onDropMove(itemData); }

	async addArcanum(slug) {
		await this._arcana.addArcanum(slug);
	}

	async removeArcanum(slug) {
		await this._arcana.removeArcanum(slug);
	}

	async flipArcanum(slug) {
		await this._arcana.flipArcanum(slug);
	}

	async unflipArcanum(slug) {
		await this._arcana.unflipArcanum(slug);
	}

	async setArcanumUnlockCount(arcanumSlug, optionSlug, count) {
		await this._arcana.setUnlockCount(arcanumSlug, optionSlug, count);
	}

	async setArcanumBackOptionCount(arcanumSlug, optionSlug, count) {
		await this._arcana.setBackOptionCount(arcanumSlug, optionSlug, count);
	}

	async setArcanumResource(slug, count) {
		await this._inventory.setResource(slug, count);
	}

	async setLoreOptionCount(loreSlug, optionSlug, count) {
		await this._lore.setCount(loreSlug, optionSlug, count);
	}

	async setLoreOptionText(loreSlug, optionSlug, value) {
		await this._lore.setText(loreSlug, optionSlug, value);
	}
}

// ── Snapshot helpers ──────────────────────────────────────────────────────────

function _toSlug(name) {
	return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function _buildVitalsSection(actor, playbookData, armorValue) {
	const attrs = actor.system?.attributes ?? {};
	const level = attrs.level?.value ?? 1;
	return new VitalsSnapshotBuilder()
		.withHp(playbookData ? new ValueMax(attrs.hp?.value ?? 0, playbookData.hp ?? 0) : new ValueMax(0, 0))
		.withDamage(playbookData?.damage ?? null)
		.withArmor(armorValue)
		.withLevel(level)
		.withXp(new ValueMax(attrs.xp?.value ?? 0, 6 + level * 2))
		.build();
}

function _buildPlaybookSection(playbookData, background, instinct, appearance, origin, lore) {
	const savedBg = background.selectedSlug || null;
	const savedChoices = background.choices;
	const savedInstinct = instinct.selectedValue || null;
	const savedAppearance = appearance.saved;
	const savedOrigin = origin.selected || null;

	const bgOptions = (playbookData.backgrounds ?? []).map(b => {
		const choices = b.choices ? new BackgroundChoicesSnapshotBuilder()
			.withLabel(b.choices.label)
			.withCount(b.choices.count)
			.withCountLabel(b.choices.count.join(" or "))
			.withOptions(b.choices.options.map(o =>
				new BackgroundChoiceOptionSnapshot(o.slug, o.label, !!(savedChoices?.[o.slug]))
			))
			.withSaved(savedChoices)
			.build() : null;
		return new BackgroundOptionSnapshotBuilder()
			.withSlug(b.slug)
			.withLabel(b.label)
			.withDescription(b.description ?? "")
			.withSelected(b.slug === savedBg)
			.withMoves((b.moves ?? []).map(_toSlug))
			.withChoices(choices)
			.build();
	});

	const instinctOptions = (playbookData.instincts ?? []).map(({word, description}) => {
		const value = `${word} — ${description}`;
		return new InstinctOptionSnapshotBuilder()
			.withWord(word)
			.withDescription(description)
			.withValue(value)
			.withSelected(savedInstinct === value)
			.build();
	});

	const appearanceOptions = (playbookData.appearance ?? []).map((opts, i) =>
		new AppearanceLineSnapshot(i, opts.map(v =>
			new AppearanceOptionSnapshot(v, (savedAppearance?.[i]) === v)
		))
	);

	const originOptions = (playbookData.origin ?? []).map(({region, names}) =>
		new OriginOptionSnapshot(region, names, region === savedOrigin)
	);

	return new PlaybookSnapshotBuilder()
		.withSlug(playbookData.slug)
		.withName(playbookData.name)
		.withImg(playbookData.img ?? null)
		.withDescription(playbookData.description ?? null)
		.withStatsNote(playbookData.statsNote ?? null)
		.withLore(buildLoreSection(playbookData.lore ?? [], lore))
		.withBackground(new BackgroundSection(savedBg, bgOptions))
		.withInstinct(new InstinctSection(savedInstinct, instinctOptions))
		.withAppearance(new AppearanceSection(appearanceOptions))
		.withOrigin(new OriginSection(savedOrigin, originOptions))
		.build();
}
