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
	DebilitySnapshotBuilder,
	InstinctOptionSnapshotBuilder,
	InstinctSection,
	InventoryItemSnapshotBuilder,
	InventorySegmentSnapshot,
	InventorySnapshot,
	LoadOptionSnapshot,
	LoadSnapshotBuilder,
	MoveCategorySnapshotBuilder,
	MoveGroupSnapshot,
	MovelistBuilder,
	MoveSnapshotBuilder,
	OriginOptionSnapshot,
	OriginSection,
	OtherItemSnapshotBuilder,
	OutfitSnapshotBuilder,
	PlaybookSnapshotBuilder,
	PossessionItemSnapshotBuilder,
	PossessionsSnapshot,
	RequirementSnapshot,
	ResourceBuilder,
	StatSnapshot,
	ValueMax,
	VitalsSnapshotBuilder,
} from "../../model/CharacterSnapshot.js";
import {PlaybookMoveEntry} from "./PlaybookMoveEntry.js";
import {MoveResources} from "./MoveResources.js";
import {StonetopFlags, STONETOP_SCOPE, resolvedFlags, resolvedFlagProperty} from "./StonetopFlags.js";
import {heroDisplayName, WBH_HERO_FLAG} from "./WouldBeHeroAsterisk.js";
import {CharacterBackgrounds} from "./CharacterBackgrounds.js";
import {CharacterInstincts} from "./CharacterInstincts.js";
import {CharacterAppearance} from "./CharacterAppearance.js";
import {CharacterOrigin} from "./CharacterOrigin.js";
import {CharacterPossessions} from "./CharacterPossessions.js";
import {CharacterInventory} from "./CharacterInventory.js";
import {CharacterArcana} from "./CharacterArcana.js";
import {CharacterLore} from "./CharacterLore.js";
import {CharacterPostDeath, buildLoreSection} from "./CharacterPostDeath.js";
import {FoundryRepositoryFactory} from "./repositories/FoundryRepositoryFactory.js";
import {capitalizeFirst} from "../../utils/strings.js";
import {getStonetopSteadingActor} from "../../utils/world.js";
import {normalizeRollType} from "../../utils/roll-types.js";
import {maxDie, stepDie} from "../../utils/damage-die.js";

const OTHER_MOVE_TYPES = ["background", "special", "follower", "homefront"];
const ROLL_LABELS_BY_TYPE = {
	str: "STR",
	dex: "DEX",
	int: "INT",
	wis: "WIS",
	con: "CON",
	cha: "CHA",
};
const HOMEFRONT_ROLL_LABELS_BY_NAME = {
	"Deploy": "Defenses",
	"Muster": "Population",
	"Pull Together": "Population",
	"Seasons Change": "Fortunes",
	"Trade & Barter": "Prosperity",
};
const ORIGIN_DESCRIPTIONS = {
	barrierPass: "<p>Blocked by a massive wall and gate, held by stoic, unfriendly folk who want little to do with strangers. They live on mountain goats and sheep, brook no trespass, and only rarely come down to trade ancient wonders for crops or livestock.</p>",
	gordinsDelve: "<p>A mining town in the Huffel Peaks. Folk make their way there when they are on the run or have nothing left back home, drawn by Maker-made passages that plunge beneath the mountains and by rare trade from the mask-wearing Ustrina.</p>",
	lygos: "<p>The towns of the arid south lie far beyond Marshedge. Trade is steady between them and the South Manmarch, but they are distant from Stonetop, about thirty days from Marshedge by road.</p>",
	manmarch: "<p>The <strong>North Manmarch</strong> is home to aggressive, warlike folk who dwell in wooden longhouses and are caught in an eternal cycle of blood-feud. The <strong>South Manmarch</strong> is more sparsely inhabited, with nomads hunting aurochs herds and trading with Marshedge and Lygos.</p>",
	marshedge: "<p>A proper town, with a wooden palisade, market, and town council. They grow hemp and wheat and gather wild rice and herbs from Ferrier's Fen, though Brennan and his old gang, the Claws, dominate the town watch.</p>",
	steplands: "<p>A rugged wilderness, home to the nomadic Hillfolk: horselords and shepherds, fierce to outsiders. They trade horses, wool, and salt, revile Gordin's Delve for prying sacred metals from the earth, and warn travelers away from ancient burial mounds.</p>",
	stonetop: "<p>A tight-knit village of about three hundred souls, built around a massive standing stone at the edge of the Great Wood. Everyone is expected to pull their weight, take their turn at guard duty, and help protect the community when danger comes.</p>",
	wild: "<p>The area around Stonetop includes the Great Wood, the Flats, and other dangerous places beyond the roads. The Forest Folk have vanished, crinwin grow bolder, and hunters bring back stories of fresh ruins, strange spirits, and twisted things in the trees.</p>",
};

function _normalizeSheetRollMode(rollMode) {
	return ["adv", "dis"].includes(rollMode) ? rollMode : "normal";
}

// Slugs whose resource max equals 4+Prosperity. Matches the `prosperityResource`
// flag in the JSON source; acts as the runtime fallback until the pack is
// recompiled with that flag present in the LevelDB.
const _PROSPERITY_RESOURCE_SLUGS = new Set(["supplies", "more-supplies", "even-more-supplies"]);

// Resolve "x piercing" against the steading's Prosperity for display. With Prosperity
// 1+ it shows the actual value ("2 piercing"); at 0, no steading (null), or negative,
// the literal "x piercing" trait is left in place so it always shows on the sheet.
function _transformPiercingNote(note, prosperity) {
	if (!note || !note.includes('x <em>piercing</em>')) return note;
	if (prosperity === null) return note; // no steading → leave literal "x piercing"
	if (prosperity <= -1) return note.replace('x <em>piercing</em>', '<em>crude</em>');
	return note.replace('x <em>piercing</em>', `${Math.min(prosperity, 2)} <em>piercing</em>`);
}

// Maximum number of regular inventory slots for each load level.
// OutfitMoveDialog._loadLevelFor uses these same thresholds (inverted).
const LOAD_LEVEL_LIMITS = { light: 3, normal: 6, heavy: 9 };

export class StonetopCharacter {
	constructor(actor, repos) {
		this._actor = actor;
		this._playbookRepo        = repos.playbook;
		this._moveRepo            = repos.moves;
		this._inventoryRepo       = repos.inventory;
		this._postDeathInsertRepo = repos.postDeathInsert;
		this._background = new CharacterBackgrounds(new StonetopFlags(actor, "background"));
		this._instinct = new CharacterInstincts(new StonetopFlags(actor, "instinct"));
		this._appearance = new CharacterAppearance(new StonetopFlags(actor, "appearance"));
		this._origin = new CharacterOrigin(new StonetopFlags(actor, "origin"));
		this._moveResources = new MoveResources(new StonetopFlags(actor, "moves"));
		this._possessions = new CharacterPossessions(new StonetopFlags(actor, "possessions"));
		this._inventory = new CharacterInventory(new StonetopFlags(actor, "inventory"));
		this._arcana = new CharacterArcana(new StonetopFlags(actor, "arcana"), repos.arcana);
		this._lore = new CharacterLore(new StonetopFlags(actor, "lore"));
		this._postDeath = new CharacterPostDeath(
			new StonetopFlags(actor, "postDeathInsert"),
			new CharacterInstincts(new StonetopFlags(actor, "postDeathInstinct")),
			new CharacterLore(new StonetopFlags(actor, "postDeathLore")),
			repos.postDeathInsert,
			repos.moves,
		);
	}

	static create(actor) {
		return new StonetopCharacter(actor, new FoundryRepositoryFactory());
	}

	get type() { return this._actor.type; }
	get background() { return this._background; }
	get instinct() { return this._instinct; }
	get appearance() { return this._appearance; }
	get origin() { return this._origin; }
	get moveResources() { return this._moveResources; }
	get possessions() { return this._possessions; }

	get _characterLevel() { return this._actor.system?.attributes?.level?.value ?? 1; }

	// Potential-for-Greatness stat slot: choosing a stat writes +1 to that stored
	// stat (and reverts the previously chosen one), recording the level it was
	// marked on. Newly filled slots auto-fill the current level.
	async setStatSlot(moveName, optionSlug, index, newStat) {
		const entries = _markEntries(this._moveResources.getMarks()[moveName]?.[optionSlug]);
		while (entries.length <= index) entries.push({ stat: "", level: null });
		const oldStat = entries[index].stat ?? "";
		if (oldStat === newStat) return;
		const stats = this._actor.system?.stats ?? {};
		const updates = {};
		if (oldStat && stats[oldStat]) updates[`system.stats.${oldStat}.value`] = (stats[oldStat].value ?? 0) - 1;
		if (newStat && stats[newStat]) updates[`system.stats.${newStat}.value`] = (stats[newStat].value ?? 0) + 1;
		entries[index] = { stat: newStat, level: newStat ? (oldStat ? entries[index].level : this._characterLevel) : null };
		// One document write: the stat deltas and the mark record together.
		await this._actor.update({ ...updates, ...this._moveResources.markUpdate(moveName, optionSlug, entries) });
	}

	// Checkbox mark options (e.g. max HP, damage die): set how many are checked,
	// auto-filling the current level on newly checked marks.
	async setCountMark(moveName, optionSlug, newCount) {
		const entries = _markEntries(this._moveResources.getMarks()[moveName]?.[optionSlug]);
		while (entries.length < newCount) entries.push({ stat: "", level: this._characterLevel });
		entries.length = Math.max(0, newCount);
		await this._actor.update(this._moveResources.markUpdate(moveName, optionSlug, entries));
	}

	// Edit-mode override of the level recorded for a given mark slot.
	async setMarkLevel(moveName, optionSlug, index, level) {
		const entries = _markEntries(this._moveResources.getMarks()[moveName]?.[optionSlug]);
		if (!entries[index]) return;
		entries[index] = { ...entries[index], level: Number.isFinite(level) && level > 0 ? level : null };
		await this._actor.update(this._moveResources.markUpdate(moveName, optionSlug, entries));
	}

	async updateName(name) {
		const previousName = this._actor.name ?? "";
		const prototypeTokenName = this._actor.prototypeToken?.name;
		const updates = { name };
		if (!prototypeTokenName || prototypeTokenName === previousName) {
			updates["prototypeToken.name"] = name;
		}
		await this._actor.update(updates);
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
		const ownedAllByName = this._buildOwnedMovesMap();
		const moves    = await this._buildMovesSection(playbookData, ownedAllByName, actorLevel);
		const inventory = await this._buildInventorySection(playbookData, ownedAllByName, actorLevel);
		const allOutfitItems = await this._inventoryRepo.getAll();
		const postDeath = await this._postDeath.buildSnapshot();
		const pdiLabel  = postDeath.activeInsert?.name ?? null;
		const moveBonuses = await this._ownedMoveBonuses(playbookData, ownedAllByName);
		// Armor counts standard items plus any special items the character has added —
		// never an unadded special item whose checked flag happens to linger.
		const addedSet = new Set(this._inventory.addedSpecial);
		const armorItems = allOutfitItems.filter(i => !i.special || addedSet.has(i.slug));
		const armor = this._inventory.calculateArmor(armorItems) + moveBonuses.armor;
		const arcanaLore = (playbookData?.lore ?? []).some(e => e.arcanaImage || (e.options ?? []).some(o => o.arcanaRole))
			? await this._arcana.buildLoreDisplay()
			: null;
		return new CharacterSnapshotBuilder()
			.withName(actor.name)
			.withPlaybook(playbookData ? _buildPlaybookSection(playbookData, this._background, this._instinct, this._appearance, this._origin, this._lore, actor.name, arcanaLore, !!this._actor.getFlag(STONETOP_SCOPE, WBH_HERO_FLAG)) : null)
			.withDebilities(_buildDebilitiesSection(actor))
			.withStats(_buildStatsSection(actor))
			.withVitals(_buildVitalsSection(actor, playbookData, armor, moveBonuses))
			.withMoves(moves)
			.withMovelist(_buildMovelist(moves, inventory.other, pdiLabel))
			.withInventory(inventory)
			.withArcana(await this._arcana.buildSnapshot(actor.system.stats ?? {}, this._inventory.checked, this._inventory.resources))
			.withPostDeathInsert(postDeath)
			.withRollMode(_normalizeSheetRollMode(resolvedFlags(actor).rollMode))
			.withCrewBonuses(_buildCrewStats(playbookData?.crew, moveBonuses))
			.build();
	}

	// Sum the max-HP and armor bonuses granted by owned playbook moves (e.g. the
	// Heavy's Carved Out of Wood / Cut from Granite). Read from the move definitions
	// so it works regardless of when the owned copy was added.
	async _ownedMoveBonuses(playbookData, ownedAllByName) {
		const totals = { hp: 0, armor: 0, crewHp: 0, damageDie: null, crewDamageSteps: 0, crewDamageCap: "d10", crewRollSteps: 0 };
		if (!playbookData) return totals;
		const defs  = await this._moveRepo.getPlaybookMoves(playbookData.name);
		const marks = this._moveResources.getMarks();
		for (const m of defs) {
			if (!ownedAllByName.has(m.name)) continue;
			totals.hp    += m.hpBonus    || 0;
			totals.armor += m.armorBonus || 0;
			// Per-option marks (e.g. Potential for Greatness): apply each checked box.
			const moveMarks = marks[m.name] ?? {};
			for (const opt of (m.markOptions ?? [])) {
				// Stat-choice marks (e.g. Potential for Greatness) store an array of
				// chosen stats and are applied directly to the stored stats on change,
				// not derived here — multiplying by the array would yield NaN.
				if (opt.choice === "stat") continue;
				const count = _markEntries(moveMarks[opt.slug]).length;
				if (!count) continue;
				totals.hp     += (opt.hp     || 0) * count;
				totals.armor  += (opt.armor  || 0) * count;
				totals.crewHp += (opt.crewHp || 0) * count;
				if (opt.damageDie) totals.damageDie = maxDie(totals.damageDie, opt.damageDie);
				totals.crewDamageSteps += (opt.crewDamageStep || 0) * count;
				if (opt.crewDamageCap) totals.crewDamageCap = opt.crewDamageCap;
				totals.crewRollSteps += (opt.crewRoll || 0) * count;
			}
		}
		return totals;
	}

	async _buildMovesSection(playbookData, ownedAllByName, actorLevel) {
		const categories = [];

		if (playbookData) {
			const background = playbookData.backgrounds?.find(b => b.slug === this._background.selectedSlug);
			const bgMoveNames = new Set(background?.moves ?? []);
			const bgSlugs = new Set([...bgMoveNames].map(_toSlug));
			const entries = await this._moveRepo.getPlaybookMoves(playbookData.name);
			if (entries.length > 0) {
				const sorted = this.sortPlaybookMoves(
					this.buildMovelistContext(entries, ownedAllByName, bgMoveNames, actorLevel, playbookData.name)
				);
				const moveResourcesMap = this._moveResources.getMoveResources();
				const moveMarksMap     = this._moveResources.getMarks();
				const moveBackgroundAnswers = resolvedFlags(this._actor).moves?.backgroundAnswers ?? {};
				const improvedStatChoices   = resolvedFlags(this._actor).improvedStatChoices ?? {};
				const source = { type: "playbook", slug: playbookData.slug };
				categories.push(new MoveCategorySnapshotBuilder()
					.withKey("playbook")
					.withTitle(`${playbookData.name} Moves`)
					.withNote(playbookData.startingMovesNote ?? null)
					.withMoves(_sortOwnedFirst(sorted.map(m => _buildMoveEntry(m, source, moveResourcesMap, bgSlugs, moveBackgroundAnswers, improvedStatChoices, moveMarksMap))))
					.build()
				);
			}
		}

		const basicEntries = (await this._moveRepo.getBasicMoves()).sort((a, b) => {
			if (a.name === "Aid") return -1;
			if (b.name === "Aid") return 1;
			return a.name.localeCompare(b.name);
		});
		const basicCategory = _buildCompendiumMoveCategory(basicEntries, { key: "basic", title: "Basic Moves" }, ownedAllByName);
		if (basicCategory) categories.push(basicCategory);

		const expeditionEntries = (await this._moveRepo.getExpeditionMoves()).sort((a, b) => a.name.localeCompare(b.name));
		const expeditionCategory = _buildCompendiumMoveCategory(expeditionEntries, { key: "expedition", title: "Expedition Moves" }, ownedAllByName);
		if (expeditionCategory) categories.push(expeditionCategory);

		for (const moveType of OTHER_MOVE_TYPES) {
			const items = this._actor.items.filter(i => i.type === "move" && i.system?.moveType === moveType);
			if (items.length > 0) {
				categories.push(new MoveCategorySnapshotBuilder()
					.withKey(moveType)
					.withTitle(capitalizeFirst(moveType) + " Moves")
					.withNote(null)
					.withMoves(items.map(i => new MoveSnapshotBuilder()
						.withId(i._id)
						.withCompendiumId(i._id)
						.withOwnedId(i._id)
						.withName(i.name)
						.withDescription(i.system?.description ?? "")
						.withRollType(i.system?.rollType ?? null)
						.withRollLabel(_rollLabelForMove(i.name, i.system?.rollType, i.system))
						.withIsStarting(false)
						.withSource({ type: moveType })
						.withSourceLabel(null)
						.withOwned(true)
						.withOwnedIds([i._id])
						.withLocked(false)
						.withRequirement(null)
						.withRequiresLabel(null)
						.withResource(null)
						.withRepeat(null)
						.withRepeatable(false)
						.build()
					))
					.build()
				);
			}
		}

		const postDeathItems = this._actor.items.filter(i => i.type === "move" && i.system?.moveType === "post-death");
		if (postDeathItems.length > 0) {
			categories.push(new MoveCategorySnapshotBuilder()
				.withKey("post-death")
				.withTitle("Post-Death Moves")
				.withNote(null)
				.withMoves(postDeathItems.map(i => new MoveSnapshotBuilder()
					.withId(i._id)
					.withCompendiumId(i._id)
					.withOwnedId(i._id)
					.withName(i.name)
					.withDescription(i.system?.description ?? "")
					.withRollType(i.system?.rollType ?? null)
					.withRollLabel(_rollLabelForMove(i.name, i.system?.rollType, i.system))
					.withIsStarting(true)
					.withSource({ type: "post-death" })
					.withSourceLabel(null)
					.withOwned(true)
					.withOwnedIds([i._id])
					.withLocked(false)
					.withRequirement(null)
					.withRequiresLabel(null)
					.withResource(null)
					.withRepeat(null)
					.withRepeatable(false)
					.build()
				))
				.build()
			);
		}

		return categories;
	}

	async _buildInventorySection(playbookData, ownedAllByName, actorLevel) {
		const checked        = this._inventory.checked;
		const resources      = this._inventory.resources;
		const rPool          = this._inventory.regularPool;
		const sPool          = this._inventory.smallPool;
		const loadLevel      = this._inventory.loadLevel;
		const allItems       = await this._inventoryRepo.getAll();
		const steadingActor  = this.getSteadingActor();
		const smallItemLimit = this.getSmallItemLimit(steadingActor);
		const steadingName   = steadingActor?.name ?? null;
		const prosperity     = smallItemLimit !== null ? smallItemLimit - 4 : null;

		const mapItem = (outfitItem) => {
			const res    = outfitItem.resource;
			const isProsperityResource = outfitItem.prosperityResource
				|| _PROSPERITY_RESOURCE_SLUGS.has(outfitItem.slug);
			const resMax = (isProsperityResource && smallItemLimit !== null)
				? smallItemLimit
				: res?.max;
			return new InventoryItemSnapshotBuilder()
				.withSlug(outfitItem.slug)
				.withName(outfitItem.name)
				.withNote(_transformPiercingNote(outfitItem.note, prosperity))
				.withWeight(outfitItem.weight)
				.withChecked(checked[outfitItem.slug] ?? false)
				.withResource(res ? new ResourceBuilder()
					.withCurrent(Math.min(resources[outfitItem.slug] ?? 0, resMax ?? 0))
					.withMax(resMax)
					.withTitle(res.title ?? null)
					.withLabels(res.labels ?? [])
					.build() : null)
				.withIsCustom(false)
				.withOwnedId(null)
				.withTwoCol(outfitItem.twoCol)
				.withBreakBefore(outfitItem.breakBefore)
				.build();
		};

		const customItems = this._actor.items.filter(i =>
			i.type === "move" && i.system?.moveType === "inventory-custom"
		);
		const mapCustomItem = item => new InventoryItemSnapshotBuilder()
			.withSlug(item._id)
			.withName(item.name)
			.withNote(null)
			.withWeight(item.system.weight ?? 1)
			.withChecked(checked[item._id] ?? false)
			.withResource(null)
			.withIsCustom(true)
			.withOwnedId(item._id)
			.withTwoCol(false)
			.withBreakBefore(false)
			.build();

		// Special (handout) items are kept off the default checklist; they appear only
		// once the player adds them via the "Add Special Item" picker.
		const addedSpecialSet = new Set(this._inventory.addedSpecial);
		const mapAddedSpecial = i => { const s = mapItem(i); s.isAddedSpecial = true; return s; };
		const addedSpecial = allItems.filter(i => i.special && addedSpecialSet.has(i.slug));
		const standardItems = allItems.filter(i => !i.special);

		const arcanaItems = await this._arcana.weightedInventoryItems();
		const arcanaSection = arcanaItems.filter(i => i.inventoryColumn === "arcana").map(mapItem);
		const allSmall = standardItems.filter(i => i.inventoryColumn === "small");
		const regularNonArcana = [
			...standardItems.filter(i => i.inventoryColumn === "regular").map(mapItem),
			...addedSpecial.filter(i => i.inventoryColumn === "regular").map(mapAddedSpecial),
			...customItems.filter(i => i.system.inventoryColumn === "regular").map(mapCustomItem),
		];
		const regularArcana = arcanaItems.filter(i => i.inventoryColumn === "regular").map(mapItem);
		if (regularArcana.length > 0 && regularNonArcana.length > 0) regularArcana[0].breakBefore = true;
		const flatRegular = [...regularNonArcana, ...regularArcana];

		let possessions = null;
		if (playbookData?.specialPossessions) {
			const maxUsesMap = this.computePossessionMaxUses(playbookData.specialPossessions, ownedAllByName, actorLevel);
			possessions = this._buildPossessionsSnapshot(playbookData.specialPossessions, maxUsesMap);
		}

		const other = this._actor.items
			.filter(i => i.type === "move" && i.system?.moveType === "other")
			.map(i => new OtherItemSnapshotBuilder()
				.withId(i._id)
				.withName(i.name)
				.withDescription(i.system?.description ?? null)
				.withMoveType(i.system?.moveType ?? null)
				.withOwnedId(i._id)
				.build()
			);

		const load = new LoadSnapshotBuilder()
			.withInstruction(_loc("stonetop.inventory.outfit.heading"))
			.withSelected(loadLevel ?? null)
			.withLoadLevelLight(loadLevel === "light")
			.withLoadLevelNormal(loadLevel === "normal")
			.withLoadLevelHeavy(loadLevel === "heavy")
			.withOptions([
				new LoadOptionSnapshot("light",  "Light",  _loc("stonetop.inventory.outfit.light")),
				new LoadOptionSnapshot("normal", "Normal", _loc("stonetop.inventory.outfit.normal")),
				new LoadOptionSnapshot("heavy",  "Heavy",  _loc("stonetop.inventory.outfit.heavy")),
			])
			.build();

		// When a Stonetop steading exists, the small pool is derived from how many
		// small items are currently selected, so it always stays in sync automatically.
		const addedSmall = addedSpecial.filter(i => i.inventoryColumn === "small");
		const smallItemSlugs = new Set([
			...allSmall.map(i => i.slug),
			...addedSmall.map(i => i.slug),
			...customItems.filter(i => i.system.inventoryColumn === "small").map(i => i._id),
			...arcanaItems.filter(i => i.inventoryColumn === "small").map(i => i.slug),
		]);
		const smallPoolMax     = smallItemLimit ?? 9;
		const smallPoolCurrent = smallItemLimit !== null
			? Math.max(0, smallItemLimit - [...smallItemSlugs].filter(s => !!checked[s]).length)
			: sPool;

		const regularPoolMax = LOAD_LEVEL_LIMITS[loadLevel] ?? LOAD_LEVEL_LIMITS.heavy;
		const checkedRegularWeight = flatRegular
			.filter(item => item.checked)
			.reduce((sum, item) => sum + (item.weight ?? 0), 0);
		const regularPoolCurrent = Math.max(0, regularPoolMax - checkedRegularWeight);
		const regularPoolEmpty = regularPoolCurrent === 0;
		flatRegular.forEach(item => { item.disabled = !item.checked && regularPoolEmpty; });

		const smallItems = [
			...allSmall.filter(i => !i.smallGrid).map(mapItem),
			...addedSmall.filter(i => !i.smallGrid).map(mapAddedSpecial),
			...customItems.filter(i => i.system.inventoryColumn === "small").map(mapCustomItem),
			...arcanaItems.filter(i => i.inventoryColumn === "small").map(mapItem),
		];
		const smallGridItems = allSmall.filter(i => i.smallGrid).map(mapItem);
		const smallPoolEmpty = smallPoolCurrent === 0;
		[...smallItems, ...smallGridItems].forEach(item => { item.disabled = !item.checked && smallPoolEmpty; });

		const outfit = new OutfitSnapshotBuilder()
			.withLoad(load)
			.withRegularItems(flatRegular)
			.withRegularSegments(_segmentByTwoCol(flatRegular))
			.withRegularPool(new ResourceBuilder().withCurrent(regularPoolCurrent).withMax(regularPoolMax).withTitle(null).withLabels([]).build())
			.withSmallItems(smallItems)
			.withSmallGridItems(smallGridItems)
			.withSmallPool(new ResourceBuilder().withCurrent(smallPoolCurrent).withMax(smallPoolMax).withTitle(null).withLabels([]).build())
			.withArcanaItems(arcanaSection)
			.withSmallItemLimit(smallItemLimit)
			.withSteadingName(steadingName)
			.build();

		return new InventorySnapshot(outfit, possessions, other);
	}

	_buildPossessionsSnapshot(specialPossessions, maxUsesMap) {
		const { pickNote, pickCount, preselected = [], options } = specialPossessions;
		const selectedSlugs = this._possessions.selected;
		const usesMap = this._possessions.uses;
		const preselectedSet = new Set(preselected);

		let chosenCount = 0;
		const items = options.map(opt => {
			const isPre = preselectedSet.has(opt.slug);
			const isSelected = isPre || selectedSlugs.has(opt.slug);
			if (isSelected && !isPre) chosenCount++;
			const maxUses = maxUsesMap[opt.slug] ?? opt.resource?.max ?? null;
			const currentUses = isSelected ? (usesMap[opt.slug] ?? 0) : 0;
			const resourceDef = opt.resource ?? null;
			const resource = resourceDef ? new ResourceBuilder()
				.withCurrent(currentUses)
				.withMax(maxUses ?? resourceDef.max)
				.withTitle(resourceDef.title ?? null)
				.withLabels(resourceDef.labels ?? [])
				.build() : null;
			return new PossessionItemSnapshotBuilder()
				.withSlug(opt.slug)
				.withLabel(opt.label)
				.withDescription(opt.description ?? "")
				.withSelected(isSelected)
				.withChecked(isSelected)
				.withDisabled(isPre)
				.withPreselected(isPre)
				.withPreselectedSource(isPre ? "Starting move" : null)
				.withResource(resource)
				.withUsesLabel(resourceDef?.title ?? null)
				.withChoices(null)
				.withChoiceGroups(null)
				.build();
		});

		const isIncomplete = pickCount > 0 && chosenCount < pickCount;
		return new PossessionsSnapshot(pickCount, pickNote, items, isIncomplete);
	}

	async buildInventoryContext() {
		const checked = this._inventory.checked;
		const resources = this._inventory.resources;
		const loadLevel = this._inventory.loadLevel;
		const rPool = this._inventory.regularPool;
		const sPool = this._inventory.smallPool;
		const allItems = await this._inventoryRepo.getAll();

		const mapCompendium = (outfitItem) => ({
			slug: outfitItem.slug,
			label: outfitItem.name,
			note: outfitItem.note,
			isCustom: false,
			ownedId: null,
			checked: checked[outfitItem.slug] ?? false,
			breakBefore: outfitItem.breakBefore,
			smallGrid: false,
			twoCol: outfitItem.twoCol,
			resourceChecks: outfitItem.resource?.max
				? outfitItem.resource.labels.map((label, i) => ({
					label: label || null,
					checked: i < (resources[outfitItem.slug] ?? 0),
				}))
				: null,
			weightSlots: Array.from({ length: outfitItem.weight ?? 0 }, (_, i) => i),
		});

		const mapCustom = item => ({
			slug: item._id,
			label: item.name,
			note: null,
			isCustom: true,
			ownedId: item._id,
			checked: checked[item._id] ?? false,
			breakBefore: false,
			smallGrid: false,
			twoCol: false,
			resourceChecks: null,
			weightSlots: Array.from({ length: item.system.weight ?? 1 }, (_, i) => i),
		});

		const customItems = this._actor.items.filter(i =>
			i.type === "move" && i.system?.moveType === "inventory-custom"
		);

		const allRegular = allItems.filter(i => i.inventoryColumn === "regular");
		const allSmall   = allItems.filter(i => i.inventoryColumn === "small");

		const flatRegular = [
			...allRegular.map(mapCompendium),
			...customItems.filter(i => i.system.inventoryColumn === "regular").map(mapCustom),
		];

		return {
			regularItems: flatRegular,
			regularSegments: _segmentByTwoCol(flatRegular),
			smallItems: allSmall.filter(i => !i.smallGrid).map(mapCompendium).concat(
				customItems.filter(i => i.system.inventoryColumn === "small").map(mapCustom)
			),
			smallGridItems: allSmall.filter(i => i.smallGrid).map(mapCompendium),
			loadLevel,
			loadLevelLight:  loadLevel === "light",
			loadLevelNormal: loadLevel === "normal",
			loadLevelHeavy:  loadLevel === "heavy",
			regularPool: {
				groups: [
					Array.from({ length: 3 }, (_, i) => ({ checked: i < rPool, index: i })),
					Array.from({ length: 3 }, (_, i) => ({ checked: (i + 3) < rPool, index: i + 3 })),
					Array.from({ length: 3 }, (_, i) => ({ checked: (i + 6) < rPool, index: i + 6 })),
				],
			},
			smallPool: {
				groups: [
					Array.from({ length: 3 }, (_, i) => ({ checked: i < sPool, index: i })),
					Array.from({ length: 3 }, (_, i) => ({ checked: (i + 3) < sPool, index: i + 3 })),
					Array.from({ length: 3 }, (_, i) => ({ checked: (i + 6) < sPool, index: i + 6 })),
				],
			},
		};
	}

	async setPostDeathInsert(slug) {
		const toRemove = this._actor.items
			.filter(i => i.type === "move" && i.system?.moveType === "post-death")
			.map(i => i._id);
		if (toRemove.length > 0) {
			await this._actor.deleteEmbeddedDocuments("Item", toRemove);
		}
		await this._postDeath.setActiveSlug(slug);
		if (slug) {
			const entries = await this._moveRepo.getPostDeathMoves(slug);
			await this._actor.createEmbeddedDocuments("Item", entries.map(m => ({
				name: m.name,
				type: "move",
				system: { moveType: "post-death", rollType: m.rollType ?? "", description: m.description ?? "" },
			})));
		}
	}
	async setPostDeathInstinct(value)                    { await this._postDeath.instinct.select(value); }
	async setPostDeathLoreCount(loreSlug, optSlug, n)    { await this._postDeath.lore.setCount(loreSlug, optSlug, n); }
	async setPostDeathLoreText(loreSlug, optSlug, value) { await this._postDeath.lore.setText(loreSlug, optSlug, value); }

	async setInventoryItemChecked(slug, isChecked) { await this._inventory.setItemChecked(slug, isChecked); }
	async setInventoryResource(slug, count)         { await this._inventory.setResource(slug, count); }
	async setInventoryLoadLevel(level)              { await this._inventory.setLoadLevel(level); }
	async setInventoryRegularPool(count)            { await this._inventory.setRegularPool(count); }
	async setInventorySmallPool(count)              { await this._inventory.setSmallPool(count); }
	async removeSpecialItem(slug)                   { await this._inventory.removeSpecial(slug); }

	getSteadingActor() {
		const storedSteadingId = resolvedFlagProperty(this._actor, "steadingId");
		return (storedSteadingId ? game.actors?.get(storedSteadingId) : null)
			?? getStonetopSteadingActor();
	}

	getSmallItemLimit(steading = this.getSteadingActor()) {
		const rawProsperity = (steading ? resolvedFlagProperty(steading, "steading.system.attributes.prosperity.value") : null)
			?? steading?.system?.attributes?.prosperity?.value;
		if (rawProsperity == null) return null;
		const prosperity = Number(rawProsperity);
		return isNaN(prosperity) ? null : 4 + prosperity;
	}

	async adjustSmallPool(isChecked) {
		const limit = this.getSmallItemLimit();
		if (limit === null) return;
		const current = this._inventory.smallPool;
		const next = isChecked
			? Math.max(0, current - 1)
			: Math.min(limit, current + 1);
		await this._inventory.setSmallPool(next);
	}

	async adjustRegularPool(isChecked, weight) {
		const loadLevel = this._inventory.loadLevel;
		if (!loadLevel) return;
		const limit   = LOAD_LEVEL_LIMITS[loadLevel] ?? LOAD_LEVEL_LIMITS.heavy;
		const current = this._inventory.regularPool;
		const next    = isChecked
			? Math.max(0, current - weight)
			: Math.min(limit, current + weight);
		await this._inventory.setRegularPool(next);
	}

	async applyOutfit(checkedMap, loadLevel) {
		await Promise.all([
			this._inventory.setAllChecked(checkedMap),
			this._inventory.setLoadLevel(loadLevel),
		]);
	}

	async resetInventorySelections() {
		await this._inventory.resetSelections();
	}

	async addCustomInventoryItem(name, weight) {
		await this._actor.createEmbeddedDocuments("Item", [{
			name,
			type: "move",
			system: { moveType: "inventory-custom", inventoryColumn: "regular", weight: Math.max(1, weight) },
		}]);
	}

	async addCustomSmallItem(name) {
		await this._actor.createEmbeddedDocuments("Item", [{
			name,
			type: "move",
			system: { moveType: "inventory-custom", inventoryColumn: "small" },
		}]);
	}

	async removeCustomInventoryItem(itemId) {
		await this._actor.deleteEmbeddedDocuments("Item", [itemId]);
	}

	buildPossessionsContext(specialPossessions, selectedSlugs, usesMap, maxUsesMap, extraPreselected = [], subChoicesMap = {}, choiceUsesMap = {}) {
		if (!specialPossessions) return null;
		const { pickNote, options } = specialPossessions;
		const bgPreselectedSet = new Set(extraPreselected);
		const preselectedSet = new Set([...((specialPossessions.preselected) ?? []), ...extraPreselected]);

		return {
			pickNote,
			options: options.map(opt => {
				const isPre = preselectedSet.has(opt.slug);
				const isSelected = isPre || selectedSlugs.has(opt.slug);
				const preselectedSource = isPre ? (bgPreselectedSet.has(opt.slug) ? "Background" : "Starting move") : null;
				const maxUses = maxUsesMap[opt.slug] ?? opt.resource?.max ?? null;
				const pickedSubs = subChoicesMap[opt.slug] ?? [];
				return {
					slug: opt.slug,
					label: opt.label,
					description: opt.description ?? "",
					detailsSection: opt.detailsSection ?? null,
					checked: isSelected,
					preselected: isPre,
					preselectedSource,
					disabled: isPre,
					uses: maxUses,
					usesLabel: opt.resource?.title ?? null,
					usesChecks: isSelected && maxUses
						? Array.from({ length: maxUses }, (_, i) => ({ checked: i < (usesMap[opt.slug] ?? 0) }))
						: null,
					choices: isSelected && opt.choices ? {
						pickCount: opt.choices.pickCount,
						options: opt.choices.options.map(c => {
							const picked = pickedSubs.includes(c.slug);
							const cMaxUses = c.resource?.max ?? null;
							return {
								slug: c.slug,
								label: c.label,
								checked: picked,
								disabled: !picked && pickedSubs.length >= opt.choices.pickCount,
								uses: cMaxUses,
								usesChecks: picked && cMaxUses
									? Array.from({ length: cMaxUses }, (_, i) => ({
										checked: i < (choiceUsesMap[`${opt.slug}:${c.slug}`] ?? 0),
									}))
									: null,
							};
						}),
					} : null,
					choiceGroups: isSelected && opt.choiceGroups ? opt.choiceGroups.map((cg, cgIdx) => ({
						heading: cg.heading,
						note: cg.note ?? null,
						subgroups: cg.subgroups.map((sg, sgIdx) => {
							const groupId = `${opt.slug}-cg${cgIdx}-sg${sgIdx}`;
							const slugsCsv = sg.options.map(o => o.slug).join(",");
							return {
								groupId,
								slugsCsv,
								multiSelect: !!sg.multiSelect,
								options: sg.options.map(o => ({
									slug: o.slug,
									label: o.label,
									checked: pickedSubs.includes(o.slug),
								})),
							};
						}),
					})) : null,
				};
			}),
		};
	}

	computePossessionMaxUses(specialPossessions, ownedAllByName, level) {
		const result = { ...this._possessions.maxUses };
		for (const opt of (specialPossessions?.options ?? [])) {
			if (!opt.usesBonus) continue;
			let bonus = 0;
			if (opt.usesBonus.evenLevelBonus) {
				bonus += Math.floor(level / 2) * opt.usesBonus.evenLevelBonus;
			}
			for (const mb of (opt.usesBonus.moveBonus ?? [])) {
				const instances = ownedAllByName.get(mb.moveName)?.length ?? 0;
				bonus += instances * mb.perInstance;
			}
			if (bonus > 0) result[opt.slug] = (opt.resource?.max ?? 0) + bonus;
		}
		return result;
	}

	async selectPossession(slug)   { await this._possessions.select(slug); }
	async deselectPossession(slug) { await this._possessions.deselect(slug); }
	async setPossessionUses(slug, count) { await this._possessions.setUses(slug, count); }
	async selectSubChoice(possessionSlug, choiceSlug)   { await this._possessions.addSubChoice(possessionSlug, choiceSlug); }
	async deselectSubChoice(possessionSlug, choiceSlug) { await this._possessions.removeSubChoice(possessionSlug, choiceSlug); }
	async selectSubChoiceExclusive(possessionSlug, choiceSlug, exclusiveSlugs) { await this._possessions.selectExclusive(possessionSlug, choiceSlug, exclusiveSlugs); }
	async setSubChoiceUses(possessionSlug, choiceSlug, count) { await this._possessions.setChoiceUses(possessionSlug, choiceSlug, count); }

	async getMoves() {
		const playbookName = this._actor.system?.playbook?.name ?? null;
		const actorLevel = this._actor.system?.attributes?.level?.value ?? 1;
		const ownedAllByName = this._buildOwnedMovesMap();

		const playbookData = await this.playbook();
		const background = playbookData?.backgrounds?.find(b => b.slug === this._background.selectedSlug);
		const bgMoveNames = new Set(background?.moves ?? []);

		let playbookMoves = [];
		if (playbookName) {
			const entries = await this._moveRepo.getPlaybookMoves(playbookName);
			playbookMoves = this.sortPlaybookMoves(this.buildMovelistContext(entries, ownedAllByName, bgMoveNames, actorLevel, playbookName));

			const moveResourcesMap = this._moveResources.getMoveResources();
			for (const move of playbookMoves) {
				if (!move.resource) continue;
				move.resourceChecks = Array.from({ length: move.resource.max }, (_, i) => ({
					checked: i < (moveResourcesMap[move.name] ?? 0),
					label: move.resource.labels?.[i] ?? null,
				}));
			}
			playbookMoves = _sortOwnedFirst(playbookMoves);
		}

		const basicEntries = await this._moveRepo.getBasicMoves();
		const basicMoves = basicEntries.map(e => {
			const instances = ownedAllByName.get(e.name) ?? [];
			return {
				name: e.name,
				compendiumId: e.id,
				ownedId: instances[0]?._id ?? null,
				rollType: e.rollType,
				rollLabel: _rollLabelForMove(e.name, e.rollType, { moveType: "basic", description: e.description }),
				owned: instances.length > 0,
				description: e.description,
			};
		}).sort((a, b) => {
			if (a.name === "Aid") return -1;
			if (b.name === "Aid") return 1;
			return a.name.localeCompare(b.name);
		});
		const orderedBasicMoves = _sortOwnedFirst(basicMoves);

		const otherGroups = OTHER_MOVE_TYPES.reduce((acc, t) => {
			const items = this._actor.items.filter(i => i.type === "move" && i.system?.moveType === t);
			if (items.length) acc.push({
				key: t,
				label: capitalizeFirst(t) + " Moves",
				moves: items.map(i => ({
					name: i.name,
					ownedId: i._id,
					rollType: normalizeRollType(i.system?.rollType),
					rollLabel: _rollLabelForMove(i.name, i.system?.rollType, i.system),
				})),
			});
			return acc;
		}, []);

		const playbookMoveNameSet = new Set(playbookMoves.map(m => m.name));
		const otherMoves = this._actor.items
			.filter(i => {
				if (i.type !== "move") return false;
				if (i.system?.moveType === "other") return true;
				if (i.system?.moveType === "playbook" && !playbookMoveNameSet.has(i.name)) return true;
				return false;
			})
			.map(i => ({
				name: i.name,
				ownedId: i._id,
				rollType: normalizeRollType(i.system?.rollType),
				rollLabel: _rollLabelForMove(i.name, i.system?.rollType, i.system),
				description: i.system?.description ?? null,
			}));

		return { playbookMoves, basicMoves: orderedBasicMoves, otherGroups, otherMoves, startingMovesNote: playbookData?.startingMovesNote ?? null };
	}

	buildMovelistContext(entries, ownedAllByName, bgMoveNames, actorLevel, actorPlaybook) {
		return entries.map(e =>
			new PlaybookMoveEntry(e, ownedAllByName.get(e.name) ?? [], bgMoveNames, ownedAllByName, actorLevel, actorPlaybook)
		);
	}

	sortPlaybookMoves(moves) {
		const groups = new Map();
		for (const move of moves) {
			const key = move.minLevel ?? 0;
			if (!groups.has(key)) groups.set(key, []);
			groups.get(key).push(move);
		}
		const result = [];
		for (const level of [...groups.keys()].sort((a, b) => a - b)) {
			result.push(..._sortGroup(groups.get(level), new Set(groups.get(level).map(m => m.name))));
		}
		return result;
	}

	async ensureStartingMoves() {
		const playbookName = this._actor.system?.playbook?.name;
		if (!playbookName) return;

		const entries = await this._moveRepo.getPlaybookMoves(playbookName);
		const ownedNames = new Set(this._actor.items.filter(i => i.type === "move").map(i => i.name));

		const playbookData = await this.playbook();
		const background = playbookData?.backgrounds?.find(b => b.slug === this._background.selectedSlug);
		const bgMoveNames = new Set(background?.moves ?? []);

		const missing = entries.filter(e =>
			(e.isStarting || bgMoveNames.has(e.name)) && !ownedNames.has(e.name)
		);
		if (missing.length) {
			const docs = await Promise.all(missing.map(e => this._moveRepo.getPlaybookMoveDocument(e.id)));
			await this._actor.createEmbeddedDocuments("Item", docs.filter(Boolean).map(d => d.toObject()));
		}

		const [basicEntries, expeditionEntries] = await Promise.all([
			this._moveRepo.getBasicMoves(),
			this._moveRepo.getExpeditionMoves(),
		]);
		const missingUniversal = [
			...basicEntries.filter(e => !ownedNames.has(e.name)),
			...expeditionEntries.filter(e => !ownedNames.has(e.name)),
		];
		if (missingUniversal.length) {
			const docs = await Promise.all(missingUniversal.map(e => this._moveRepo.getBasicMoveDocument(e.id)));
			await this._actor.createEmbeddedDocuments("Item", docs.filter(Boolean).map(d => d.toObject()));
		}
	}

	async addMove(compendiumId, { skipIfOwned = false } = {}) {
		const doc = await this._moveRepo.getPlaybookMoveDocument(compendiumId);
		if (!doc) return;
		if (skipIfOwned && this._actor.items.some(i => i.type === "move" && i.name === doc.name)) return;
		await this._actor.createEmbeddedDocuments("Item", [doc.toObject()]);
	}

	async addPlaybookMoveByName(playbookName, moveName) {
		if (!playbookName || !moveName) return;
		const ownedNames = new Set(this._actor.items.filter(i => i.type === "move").map(i => i.name));
		if (ownedNames.has(moveName)) return;
		const entries = await this._moveRepo.getPlaybookMoves(playbookName);
		const entry = entries.find(e => e.name === moveName);
		if (entry) await this.addMove(entry.id);
	}

	async removeMove(ownedId) {
		if (ownedId) await this._actor.deleteEmbeddedDocuments("Item", [ownedId]);
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

	async onRoll(event, { statOverride = null } = {}) {
		const itemId = event.currentTarget.closest(".item")?.dataset.itemId;
		if (!itemId) return false;
		const item = this._actor.items.get(itemId);
		const stat = statOverride ?? normalizeRollType(item?.system?.rollType);
		if (!stat) return false;

		const isDescription = event.currentTarget.getAttribute("data-show") === "description";
		const descriptionOnly = isDescription || (item.type === "npcMove" && !item.system.rollFormula);

		const rollMode = this.rollMode;
		const forward  = descriptionOnly ? 0 : this._actor.system?.attributes?.forward?.value ?? 0;
		const ongoing  = descriptionOnly ? 0 : this._actor.system?.attributes?.ongoing?.value ?? 0;

		const modifier    = forward + ongoing;
		const rollOptions = { rollMode, modifier, forward, ongoing, statOverride: stat };

		await item.roll({ ...this.applyDebilityRollMode(stat, rollOptions), descriptionOnly });

		if (forward !== 0) {
			await this._actor.update({ "system.attributes.forward.value": 0 });
		}
		return true;
	}

	async onDirectStatRoll(stat, extraOptions = {}) {
		const { rollStat } = await import("../../utils/roll-engine.js");
		const rollMode = this.rollMode;
		const forward  = this._actor.system?.attributes?.forward?.value ?? 0;
		const ongoing  = this._actor.system?.attributes?.ongoing?.value ?? 0;
		const modifier = forward + ongoing;

		await rollStat(stat, this._actor, this.applyDebilityRollMode(stat, {
			rollMode,
			modifier,
			forward,
			ongoing,
			...extraOptions,
		}));

		if (forward !== 0) {
			await this._actor.update({ "system.attributes.forward.value": 0 });
		}
	}

	async onDropMove(itemData) {
		const alreadyOwned = !!this._actor.items.find(i => i.type === "move" && i.name === itemData.name);
		if (alreadyOwned) return false;

		const actorPlaybook = this._actor.system?.playbook?.name ?? null;
		const itemPlaybook = itemData.system?.playbook ?? null;
		if (itemData.system?.moveType === "playbook" && itemPlaybook && itemPlaybook !== actorPlaybook) {
			itemData = { ...itemData, system: { ...itemData.system, moveType: "other" } };
		}

		await this._actor.createEmbeddedDocuments("Item", [itemData]);
		return true;
	}

	applyDebilityRollMode(stat, options) {
		const debilityOptions = this._actor.system.attributes?.debilities?.options ?? {};
		const activeEntry = Object.entries(debilityOptions).find(
			([key, opt]) => {
				if (!opt.value) return false;
				const affectedStats = Array.isArray(opt.stat) ? opt.stat : _DEBILITY_DEF_BY_KEY[key]?.stats;
				return affectedStats?.includes(stat);
			}
		);
		if (!activeEntry) return options;
		const [key] = activeEntry;
		const def = _DEBILITY_DEF_BY_KEY[key];
		const base = { ...options, stonetopDebility: def?.name ?? key, stonetopDebilityTooltip: def?.description ?? "" };
		if (options.rollMode === "adv") return { ...base, rollMode: "normal" };
		return { ...base, rollMode: "dis" };
	}

	get rollMode() {
		return _normalizeSheetRollMode(resolvedFlags(this._actor).rollMode);
	}

	async setRollMode(rollMode) {
		await this._actor.setFlag(STONETOP_SCOPE, "rollMode", _normalizeSheetRollMode(rollMode));
	}
	async addArcanum(slug)                           { await this._arcana.addArcanum(slug); }
	async removeArcanum(slug)                        { await this._arcana.removeArcanum(slug); }
	async identifyArcanum(slug)                      { await this._arcana.identifyArcanum(slug); }
	async getArcanumChatContent(slug, flipped)       { return this._arcana.getArcanumChatContent(slug, flipped); }
	async flipArcanum(slug)     { await this._arcana.flipArcanum(slug); }
	async setMinorArcanumRole(role, slug) { await this._arcana.setMinorRole(role, slug); }
	async unflipArcanum(slug)   { await this._arcana.unflipArcanum(slug); }
	async setArcanumUnlockCount(arcanumSlug, optionSlug, count)          { await this._arcana.setUnlockCount(arcanumSlug, optionSlug, count); }
	async setArcanumBackOptionCount(arcanumSlug, optionSlug, count)      { await this._arcana.setBackOptionCount(arcanumSlug, optionSlug, count); }
	async setArcanumBoxChecked(slug, context, index, checked)            { await this._arcana.setArcanumBoxChecked(slug, context, index, checked); }
	async setArcanumResource(slug, count)                                { await this._inventory.setResource(slug, count); }
	async setLoreOptionCount(loreSlug, optionSlug, count)           { await this._lore.setCount(loreSlug, optionSlug, count); }
	async setLoreOptionText(loreSlug, optionSlug, value)            { await this._lore.setText(loreSlug, optionSlug, value); }

	async getLevelUpData() {
		const actor      = this._actor;
		const level      = actor.system?.attributes?.level?.value ?? 1;
		const xp         = actor.system?.attributes?.xp?.value ?? 0;
		const cost       = 6 + level * 2;
		const newLevel   = level + 1;
		const playbookData   = await this.playbook();
		const ownedAllByName = this._buildOwnedMovesMap();

		let availableMoves = [];
		let lockedMoves    = [];
		if (playbookData?.name) {
			const background  = playbookData.backgrounds?.find(b => b.slug === this._background.selectedSlug);
			const bgMoveNames = new Set(background?.moves ?? []);
			const entries     = await this._moveRepo.getPlaybookMoves(playbookData.name);
			const all = this.sortPlaybookMoves(
				this.buildMovelistContext(entries, ownedAllByName, bgMoveNames, newLevel, playbookData.name)
			).filter(e => !e.owned);
			availableMoves = all.filter(e => !e.locked);
			lockedMoves    = all.filter(e => e.locked);
		}

		let needsInvocation     = false;
		let availableInvocations = [];
		if (newLevel % 2 === 0 && playbookData?.invocations?.options?.length) {
			const selected = new Set(actor.getFlag("stonetop_pwd", "invocations.selected") ?? []);
			availableInvocations = playbookData.invocations.options.filter(o => !selected.has(o.slug));
			needsInvocation = availableInvocations.length > 0;
		}

		return {
			level, xp, cost, newLevel,
			xpRemaining: xp - cost,
			availableMoves,
			lockedMoves,
			needsInvocation,
			availableInvocations,
		};
	}

	async applyLevelUp(selectedMoveCompendiumId, selectedInvocationSlug) {
		const level = this._actor.system?.attributes?.level?.value ?? 1;
		const xp    = this._actor.system?.attributes?.xp?.value ?? 0;
		const cost  = 6 + level * 2;
		await this._actor.update({
			"system.attributes.level.value": level + 1,
			"system.attributes.xp.value":   Math.max(0, xp - cost),
		});
		if (selectedMoveCompendiumId) {
			await this.addMove(selectedMoveCompendiumId);
		}
		if (selectedInvocationSlug) {
			const current = this._actor.getFlag("stonetop_pwd", "invocations.selected") ?? [];
			await this._actor.setFlag("stonetop_pwd", "invocations.selected", [...current, selectedInvocationSlug]);
		}
	}

	_buildOwnedMovesMap() {
		const map = new Map();
		for (const item of this._actor.items.filter(i => i.type === "move")) {
			if (!map.has(item.name)) map.set(item.name, []);
			map.get(item.name).push(item);
		}
		return map;
	}
}

// ── Snapshot helpers ──────────────────────────────────────────────────────────

function _loc(key) {
	return typeof game !== "undefined" ? game.i18n.localize(key) : key;
}

function _toSlug(name) {
	return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const _STAT_DEFS = {
	str: { name: "Strength",     abbr: "STR" },
	dex: { name: "Dexterity",    abbr: "DEX" },
	con: { name: "Constitution", abbr: "CON" },
	int: { name: "Intelligence", abbr: "INT" },
	wis: { name: "Wisdom",       abbr: "WIS" },
	cha: { name: "Charisma",     abbr: "CHA" },
};

const _DEBILITY_DEFS = [
	{ key: "weakened",  name: "Weakened",  stats: ["str", "dex"], description: "Fatigued, tired, sluggish, shaky. Disadvantage on +STR or +DEX rolls." },
	{ key: "dazed",     name: "Dazed",     stats: ["int", "wis"], description: "Out of it, befuddled, not thinking clearly. Disadvantage on +INT or +WIS rolls." },
	{ key: "miserable", name: "Miserable", stats: ["con", "cha"], description: "Greatly distressed, angry, unwell, in pain. Disadvantage on +CON or +CHA rolls." },
];
const _DEBILITY_DEF_BY_KEY = Object.fromEntries(_DEBILITY_DEFS.map(d => [d.key, d]));

function _buildStatsSection(actor) {
	const rawStats = actor.system?.stats ?? {};
	return Object.fromEntries(
		Object.entries(_STAT_DEFS).map(([key, { name, abbr }]) => [
			key,
			new StatSnapshot(rawStats[key]?.value ?? 0, name, abbr),
		])
	);
}

function _buildDebilitiesSection(actor) {
	const opts = actor.system?.attributes?.debilities?.options ?? {};
	return _DEBILITY_DEFS.map(({ key, name, stats }) =>
		new DebilitySnapshotBuilder()
			.withKey(key)
			.withName(name)
			.withActive(!!(opts[key]?.value))
			.withStats(stats)
			.build()
	);
}


function _buildVitalsSection(actor, playbookData, armorValue, moveBonuses = {}) {
	const attrs = actor.system?.attributes ?? {};
	const level = attrs.level?.value ?? 1;
	const hpBonus = moveBonuses.hp ?? 0;
	const damage = playbookData
		? (moveBonuses.damageDie ? maxDie(playbookData.damage, moveBonuses.damageDie) : playbookData.damage)
		: null;
	return new VitalsSnapshotBuilder()
		.withHp(playbookData ? new ValueMax(attrs.hp?.value ?? 0, (playbookData.hp ?? 0) + hpBonus) : new ValueMax(0, 0))
		.withDamage(damage)
		.withArmor(armorValue)
		.withLevel(level)
		.withXp(new ValueMax(attrs.xp?.value ?? 0, 6 + level * 2))
		.build();
}

// Final per-Crew-member stats: the playbook's data-driven base plus the bonuses
// from marked Marshal moves (Heroes to the Last / Veteran Crew).
function _buildCrewStats(crew, moveBonuses) {
	return {
		memberHp:  (crew?.hp ?? 6) + (moveBonuses.crewHp ?? 0),
		armor:     crew?.armor ?? 0,
		damageDie: stepDie(crew?.damageDie ?? "d6", moveBonuses.crewDamageSteps ?? 0, moveBonuses.crewDamageCap),
		rollMod:   (crew?.roll ?? 1) + (moveBonuses.crewRollSteps ?? 0),
	};
}

function _originDescriptionForRegion(region) {
	const key = _normalizeOriginRegion(region);
	if (!key) return "";
	if (key.includes("barrier pass")) return ORIGIN_DESCRIPTIONS.barrierPass;
	if (key.includes("gordin")) return ORIGIN_DESCRIPTIONS.gordinsDelve;
	if (key.includes("lygos") || key.includes("southern") || key.includes("south")) return ORIGIN_DESCRIPTIONS.lygos;
	if (key.includes("manmarch")) return ORIGIN_DESCRIPTIONS.manmarch;
	if (key.includes("marshedge")) return ORIGIN_DESCRIPTIONS.marshedge;
	if (key.includes("steplands") || key.includes("hillfolk")) return ORIGIN_DESCRIPTIONS.steplands;
	if (key.includes("stonetop")) return ORIGIN_DESCRIPTIONS.stonetop;
	if (key.includes("wild")) return ORIGIN_DESCRIPTIONS.wild;
	return "";
}

function _normalizeOriginRegion(region) {
	return String(region ?? "")
		.toLowerCase()
		.replace(/['’]/g, "")
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

function _buildPlaybookSection(playbookData, background, instinct, appearance, origin, lore, actorName, arcanaDisplay = null, becameHero = false) {
	const savedBg      = background.selectedSlug || null;
	const savedChoices = background.choices;
	const savedSetupTexts = background.setupTexts ?? {};
	const savedSetupResources = background.setupResources ?? {};
	const savedInstinct = instinct.selectedValue || null;
	const savedAppearance = appearance.saved;
	const savedOrigin  = origin.selected || null;

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
			.withSetupTexts((b.setup?.texts ?? []).map(t => ({
				key: t.key,
				label: t.label ?? t.key,
				value: savedSetupTexts[t.key] ?? "",
			})))
			.withSetupResources((b.setup?.resources ?? []).map(r => {
				const max = r.max ?? 1;
				const current = savedSetupResources[r.key] ?? r.value ?? 0;
				return {
					key: r.key,
					label: r.label ?? r.key,
					current,
					max,
					checks: Array.from({ length: max }, (_, i) => ({
						index: i,
						checked: i < current,
					})),
				};
			}))
			.build();
	});

	const instinctOptions = (playbookData.instincts ?? []).map(({ word, description }) => {
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

	const originOptions = (playbookData.origin ?? []).map(({ region, names }) =>
		new OriginOptionSnapshot(
			region,
			names.map(name => ({ name, checked: name === actorName })),
			region === savedOrigin,
			_originDescriptionForRegion(region)
		)
	);

	return new PlaybookSnapshotBuilder()
		.withSlug(playbookData.slug)
		.withName(heroDisplayName(playbookData.name, becameHero))
		.withImg(playbookData.img ?? null)
		.withDescription(playbookData.description ?? null)
		.withStatsNote(playbookData.statsNote ?? null)
		.withLore(buildLoreSection(playbookData.lore ?? [], lore, arcanaDisplay))
		.withBackground(new BackgroundSection(savedBg, bgOptions))
		.withInstinct(new InstinctSection(savedInstinct, instinctOptions))
		.withAppearance(new AppearanceSection(appearanceOptions))
		.withOrigin(new OriginSection(savedOrigin, originOptions))
		.build();
}

// Normalize a stored mark value into an array of { stat, level } entries.
// Handles legacy shapes: a plain count (number) or an array of stat strings.
function _markEntries(stored) {
	if (Array.isArray(stored)) {
		return stored.map(e => (e && typeof e === "object")
			? { stat: e.stat ?? "", level: e.level ?? null }
			: { stat: typeof e === "string" ? e : "", level: null });
	}
	if (typeof stored === "number") return Array.from({ length: stored }, () => ({ stat: "", level: null }));
	return [];
}

// Build a move's mark options for display: stat-choice options (Potential for
// Greatness) get a stat dropdown per slot; the rest get checkbox arrays. Each
// filled slot / checked mark carries the level it was marked on.
function _buildMarkOptions(entry, markCounts) {
	if (!entry.markOptions?.length) return null;
	const statList = Object.entries(_STAT_DEFS).map(([key, { abbr }]) => ({ key, abbr }));
	return entry.markOptions.map(opt => {
		const entries = _markEntries(markCounts[opt.slug]);
		const marks = opt.marks ?? 1;
		if (opt.choice === "stat") {
			const statSlots = Array.from({ length: marks }, (_, i) => {
				const sel = entries[i]?.stat ?? "";
				return {
					index: i,
					level: entries[i]?.level ?? null,
					options: [{ key: "", abbr: "—", selected: sel === "" },
						...statList.map(s => ({ key: s.key, abbr: s.abbr, selected: sel === s.key }))],
				};
			});
			return { slug: opt.slug, label: opt.label, choice: "stat", statSlots };
		}
		const count = entries.length;
		return {
			slug:   opt.slug,
			label:  opt.label,
			checks: Array.from({ length: marks }, (_, i) => ({
				index: i,
				checked: i < count,
				level: entries[i]?.level ?? null,
			})),
		};
	});
}

function _buildMoveEntry(entry, source, moveResourcesMap, bgSlugs = new Set(), moveBackgroundAnswers = {}, improvedStatChoices = {}, moveMarksMap = {}) {
	const resourceDef = entry.resource;
	const resource = resourceDef ? new ResourceBuilder()
		.withCurrent(moveResourcesMap[entry.name] ?? 0)
		.withMax(resourceDef.max)
		.withTitle(resourceDef.title ?? null)
		.withLabels(resourceDef.labels ?? [])
		.build() : null;
	const repeat = entry.repeatable
		? { max: entry.repeatChecks.length, current: entry.ownedIds.length }
		: null;
	const requirement = entry.requiresLabel
		? new RequirementSnapshot(entry.requiresLabel, !entry.locked)
		: null;
	const sourceLabel = entry.isStarting ? (bgSlugs.has(_toSlug(entry.name)) ? "Background" : "Starting move") : null;

	const markOptions = _buildMarkOptions(entry, moveMarksMap[entry.name] ?? {});

	const statChoices = (entry.name === "Improved Stat" && entry.ownedIds.length > 0)
		? entry.ownedIds
			.map(ownedId => {
				const statKey = improvedStatChoices[ownedId] ?? null;
				if (!statKey) return null;
				return { ownedId, statKey, statAbbr: _STAT_DEFS[statKey]?.abbr ?? statKey.toUpperCase() };
			})
			.filter(Boolean)
		: null;

	return new MoveSnapshotBuilder()
		.withId(entry.compendiumId)
		.withCompendiumId(entry.compendiumId)
		.withOwnedId(entry.ownedIds[0] ?? null)
		.withName(entry.name)
		.withDescription(entry.description)
		.withRollType(entry.rollType)
		.withRollLabel(_rollLabelForMove(entry.name, entry.rollType, entry))
		.withIsStarting(entry.isStarting)
		.withSource(source)
		.withSourceLabel(sourceLabel)
		.withOwned(entry.owned)
		.withOwnedIds(entry.ownedIds)
		.withLocked(entry.locked)
		.withRequirement(requirement)
		.withRequiresLabel(requirement?.label ?? null)
		.withResource(resource)
		.withRepeat(repeat)
		.withRepeatable(repeat !== null)
		.withBackgroundAnswer(moveBackgroundAnswers[entry.name] ?? null)
		.withStatChoices(statChoices)
		.withMarkOptions(markOptions)
		.withAsterisk(!!entry.asterisk)
		.build();
}

// ── Snapshot helpers ──────────────────────────────────────────────────────────

/**
 * Builds a move category snapshot for a universal, compendium-sourced move list
 * (e.g. Basic Moves, Expedition Moves) — every entry is shown to every actor,
 * with ownership/roll info layered on from `ownedAllByName`.
 */
function _buildCompendiumMoveCategory(entries, { key, title }, ownedAllByName) {
	if (entries.length === 0) return null;
	return new MoveCategorySnapshotBuilder()
		.withKey(key)
		.withTitle(title)
		.withNote(null)
		.withMoves(_sortOwnedFirst(entries.map(e => {
			const instances = ownedAllByName.get(e.name) ?? [];
			return new MoveSnapshotBuilder()
				.withId(e.id)
				.withCompendiumId(e.id)
				.withOwnedId(instances[0]?._id ?? null)
				.withName(e.name)
				.withDescription(e.description ?? "")
				.withRollType(e.rollType)
				.withRollLabel(_rollLabelForMove(e.name, e.rollType, { moveType: key, description: e.description }))
				.withIsStarting(false)
				.withSource({ type: key })
				.withSourceLabel(null)
				.withOwned(instances.length > 0)
				.withOwnedIds(instances.map(i => i._id))
				.withLocked(false)
				.withRequirement(null)
				.withRequiresLabel(null)
				.withResource(null)
				.withRepeat(null)
				.withRepeatable(false)
				.build();
		})))
		.build();
}

function _rollLabelForMove(name, rollType, data = {}) {
	const normalizedRollType = normalizeRollType(rollType);
	if (!normalizedRollType) return null;
	if (data.moveType === "homefront" && HOMEFRONT_ROLL_LABELS_BY_NAME[name]) {
		return HOMEFRONT_ROLL_LABELS_BY_NAME[name];
	}
	if (data.moveType === "homefront") {
		const match = String(data.description ?? "").match(/roll\s+\+([A-Za-z][A-Za-z ]*)/i);
		if (match) return match[1].trim();
	}
	if ((data.moveType === "basic" || data.moveType === "expedition") && normalizedRollType === "ask") return "ANY";
	return ROLL_LABELS_BY_TYPE[normalizedRollType] ?? null;
}

function _buildMovelist(categories, other, pdiLabel = null) {
	const playbookCat   = categories.find(c => c.key === "playbook");
	const basicCat      = categories.find(c => c.key === "basic");
	const expeditionCat = categories.find(c => c.key === "expedition");
	const postDeathCat  = categories.find(c => c.key === "post-death");
	const otherCats     = categories.filter(c => !["basic", "playbook", "expedition", "post-death"].includes(c.key));
	const postDeathGroup = postDeathCat && pdiLabel
		? { label: pdiLabel, moves: postDeathCat.moves }
		: null;
	const startingNote = playbookCat?.note ?? null;
	const pickCount    = parseMovePickCount(startingNote);
	const chosenCount    = (playbookCat?.moves ?? []).filter(m => m.sourceLabel === null && m.owned).length;
	const movesIncomplete = pickCount > 0 && chosenCount < pickCount;

	return new MovelistBuilder()
		.withPlaybookMoves(playbookCat?.moves ?? [])
		.withBasicMoves(basicCat?.moves ?? [])
		.withExpeditionMoves(expeditionCat?.moves ?? [])
		.withOtherGroups(otherCats.map(cat => new MoveGroupSnapshot(cat.key, cat.title, cat.moves)))
		.withOtherMoves(other)
		.withStartingMovesNote(startingNote)
		.withPostDeathGroup(postDeathGroup)
		.withMovesIncomplete(movesIncomplete)
		.build();
}


export function parseMovePickCount(note) {
	const m = (note ?? "").match(/\b(\d+)\s+(?:more\s+|other\s+)?(?:move[s]?\s+)?of\s+your\s+choice/i);
	return m ? parseInt(m[1], 10) : 0;
}

function _segmentByTwoCol(items) {
	const segments = [];
	let current = null;
	let currentType = null;
	for (const item of items) {
		const type = item.twoCol ? "grid" : "list";
		if (!current || currentType !== type) {
			current = new InventorySegmentSnapshot(type === "grid", item.breakBefore ?? false, []);
			segments.push(current);
			currentType = type;
		}
		current.items.push(item);
	}
	return segments;
}

function _sortGroup(moves, groupNames) {
	const dependents = new Map();
	const roots = [];
	for (const move of moves) {
		if (!move.requires || !groupNames.has(move.requires)) {
			roots.push(move);
		} else {
			if (!dependents.has(move.requires)) dependents.set(move.requires, []);
			dependents.get(move.requires).push(move);
		}
	}
	roots.sort((a, b) => a.name.localeCompare(b.name));
	for (const deps of dependents.values()) deps.sort((a, b) => a.name.localeCompare(b.name));
	const result = [];
	const visited = new Set();

	function visit(move) {
		if (visited.has(move.name)) return;
		visited.add(move.name);
		result.push(move);
		for (const child of dependents.get(move.name) ?? []) visit(child);
	}

	for (const root of roots) visit(root);
	moves.filter(m => !visited.has(m.name)).sort((a, b) => a.name.localeCompare(b.name)).forEach(m => result.push(m));
	return result;
}

function _sortOwnedFirst(moves) {
	const tier = m => m.owned ? 0 : m.locked ? 2 : 1;
	return [...moves].sort((a, b) => {
		const tierDiff = tier(a) - tier(b);
		if (tierDiff !== 0) return tierDiff;
		return a.name.localeCompare(b.name);
	});
}
