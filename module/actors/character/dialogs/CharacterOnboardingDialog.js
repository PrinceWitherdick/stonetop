// Descriptions for animal companion trait tags — checked before compendium lookup.
import { majorArcanaImg } from "../../../arcana-icons.js";
import { parseMovePickCount } from "../StonetopCharacter.js";

const SEEKER_ARCANA_SLUGS = ["collection", "arcana-major", "arcana-minor"];

export const ANIMAL_COMPANION_TRAIT_GLOSSARY = {
	"agile":           "Acts with grace and nimbleness; can slip through tight spaces and dodge with ease.",
	"adorable":        "Disarmingly cute; people are more likely to be charmed than threatened.",
	"aggressive":      "Attacks first, asks questions later; prone to charging into danger.",
	"annoying":        "Tends to make noise, steal food, or cause minor mischief at the worst times.",
	"attack-bird":     "Can dive and slash at a target's face or eyes with surprising ferocity.",
	"beautiful":       "Striking appearance that draws attention and admiration.",
	"burrowing":       "Can dig through earth and loose soil to move underground or escape confinement.",
	"calm":            "Unflappable under pressure; rarely startled or panicked.",
	"cautious":        "Won't take unnecessary risks; hangs back until a course of action is clear.",
	"clever":          "Understands complex commands and can solve simple problems on its own.",
	"climber":         "At home scaling trees, cliffs, or walls; rarely stopped by vertical obstacles.",
	"dextrous":        "Nimble with its paws or hands; can manipulate objects and work simple latches.",
	"easy-going":      "Laid-back and even-tempered; gets along with just about everyone.",
	"enduring":        "Can sustain strenuous effort far longer than expected without flagging.",
	"fast":            "Moves quickly over open ground; can outrun most threats without difficulty.",
	"fierce":          "Attacks with aggression and doesn't back down; enemies take it seriously.",
	"gluttonous":      "Compelled to eat whenever food is present; can be distracted or baited with it.",
	"hardy":           "Handles harsh weather, rough terrain, and lean times without complaint.",
	"keen-eared":      "Exceptional hearing; detects sounds long before others notice them.",
	"keen-eyed":       "Exceptional eyesight; spots movement and detail at great distances.",
	"keen-nosed":      "Exceptional sense of smell; can track by scent and detect hidden creatures or objects.",
	"large":           "Bigger than a typical member of its kind; harder to ignore, easier to spot.",
	"mimic":           "Can reproduce sounds it has heard, including voices and environmental noises.",
	"pack-hunter":     "Coordinates naturally with allies; gains an edge when acting alongside others.",
	"patient":         "Waits calmly for exactly the right moment before striking or acting.",
	"powerful":        "Exceptional strength; can haul heavy loads or force its way through barriers.",
	"protective":      "Will place itself between danger and its allies, even at personal risk.",
	"quick":           "Fast reflexes; acts before most opponents have a chance to respond.",
	"sharp-eyed":      "Keen sight; consistently spots things that others overlook.",
	"stealthy":        "Moves silently and stays out of sight; excellent at following without being detected.",
	"stinky":          "Produces a strong, unpleasant odor that deters predators and ruins a good meal.",
	"swift":           "Exceptionally fast; outpaces almost anything in a straight run.",
	"terrifying":      "Its presence alone frightens enemies; the cowardly may flee at the sight of it.",
	"thieving":        "Inclined to snatch shiny objects, food, or anything left unattended.",
	"tiny":            "Small enough to go unnoticed or squeeze through impossibly tight gaps.",
	"tireless":        "Doesn't fatigue from sustained effort; keeps going long after others would quit.",
	"tough":           "Resilient and hard to hurt; shrugs off blows that would fell lesser creatures.",
};

export class CharacterOnboardingDialog extends Application {
	constructor(playbookDoc, onComplete, options = {}) {
		const { onBack, onSave, initialSelections, startAtStep = null, ...appOptions } = options;
		super(appOptions);
		this._playbookDoc        = playbookDoc;
		this._onComplete         = onComplete;
		this._onBack             = onBack ?? null;
		this._onSave             = onSave ?? null;
		// Pre-seed cache with glossary so getData() and _lookupWord share one lookup path.
		this._wordCache = new Map(Object.entries(ANIMAL_COMPANION_TRAIT_GLOSSARY));
		this._hoveredAnchor      = null;

		const f = playbookDoc.flags?.stonetop ?? {};
		this._backgrounds        = f.backgrounds        ?? [];
		this._rawInstincts       = f.instincts           ?? [];
		this._rawAppearance      = f.appearance          ?? [];
		this._origins            = f.origin              ?? [];
		this._rawPossessions     = f.specialPossessions  ?? null;
		this._rawInvocations     = f.invocations         ?? null;
		this._rawCrew            = f.crew                ?? null;
		this._rawAnimalCompanion = f.animalCompanion     ?? null;
		this._rawLore            = f.lore               ?? [];
		this._movePickCount  = this._parseMovePickCount();
		this._movesCache              = null;
		this._arcanaCache             = null;
		this._arcanaCachePromise      = null;
		this._combineSeekerArcana     = this._shouldCombineSeekerArcana();
		this._statScores     = this._parseStatScores();
		this._statPoolCount  = {};
		for (const v of this._statScores) this._statPoolCount[v] = (this._statPoolCount[v] ?? 0) + 1;

		// _selections must be initialized before _buildSteps(), which calls
		// _getInitiatesData() and reads this._selections.backgroundSlug.
		this._selections = {
			backgroundSlug:  "",
			instinctValue:   "",
			appearance:      {},
			originRegion:    "",
			name:            "",
			stats:           { str: null, dex: null, con: null, int: null, wis: null, cha: null },
			possessions:     [],
			moves:           [],
			invocations:     [],
			initiates:       [],
			initiateDetails: {},
			crew:            { name: "", tags: [], instinct: "", cost: "" },
			animalCompanion: { type: "", kind: "", traits: [], name: "", instinct: "", cost: "" },
			lore:            { picks: {}, texts: {} },
			arcana:          { major: "", minorDraw: [], minorRoles: { mastered: "", found: "", lead: "" } },
			backgroundChoices: {},
			backgroundSetup: { choices: {}, texts: {}, neighborTraits: {}, neighborPicks: {} },
		};

		if (initialSelections) {
			foundry.utils.mergeObject(this._selections, initialSelections, { inplace: true });
		}

		this._ensureBackgroundMoveChoices();
		this._ensureBackgroundSetup();
		this._steps = this._buildSteps();
		this._step = startAtStep === "first-incomplete"
			? this._firstIncompleteStepIndex()
			: Math.max(0, this._steps.indexOf(startAtStep ?? ""));
	}

	// ── Step management ───────────────────────────────────────────────

	_buildSteps() {
		const steps = [];
		const combineSeekerArcana = this._combineSeekerArcana;
		if (this._backgrounds.length)   steps.push("background");
		if (this._rawInstincts.length)  steps.push("instinct");
		if (this._rawAppearance.length) steps.push("appearance");
		if (this._origins.length)       steps.push("origin");
		steps.push("stats");
		if ((this._rawPossessions?.pickCount ?? 0) > 0 && this._rawPossessions?.options?.length) {
			steps.push("possession");
		}
		if (this._movePickCount > 0) steps.push("moves");
		// Insert steps
		if ((this._rawInvocations?.startingCount ?? 0) > 0 && this._rawInvocations?.options?.length) {
			steps.push("invocations");
		}
		if (this._getInitiatesData()) steps.push("initiates");
		if (this._rawCrew?.availableTags?.length)          steps.push("crew");
		if (this._rawAnimalCompanion?.types?.length)       steps.push("animalCompanion");
		if (combineSeekerArcana) { steps.push("seekerArcana"); steps.push("seekerArcanaMinor"); }
		for (let i = 0; i < this._rawLore.length; i++) {
			if (combineSeekerArcana && this._isSeekerArcanaSection(this._rawLore[i])) continue;
			steps.push(`lore:${i}`);
		}
		return steps;
	}

	// Rebuild steps when a selection changes which conditional steps appear
	// (e.g. picking Initiate background adds the initiates step).
	_rebuildDynamicSteps() {
		const currentType = this._steps[this._step];
		this._steps = this._buildSteps();
		const newIdx = this._steps.indexOf(currentType);
		this._step = newIdx >= 0 ? newIdx : Math.min(this._step, this._steps.length - 1);
	}

	// Returns the Initiate background's choices object when the Initiate
	// background is selected; null otherwise.
	_getInitiatesData() {
		if (this._selections.backgroundSlug !== "initiate") return null;
		const bg = this._backgrounds.find(b => b.slug === "initiate");
		return bg?.choices?.options?.length ? bg.choices : null;
	}

	// Normalize the choices.count array into [min, max] with safe defaults.
	_initiatesCountRange(choices) {
		const arr = choices?.count;
		if (!arr?.length) return [2, 3];
		return [Math.min(...arr), Math.max(...arr)];
	}

	// ── Move helpers ──────────────────────────────────────────────────

	_isGordinsDelve(region) {
		return String(region ?? "").toLowerCase().includes("gordin");
	}

	_originNameGroups() {
		return this._origins
			.filter(o => !this._isGordinsDelve(o.region) && o.names?.length)
			.map(o => ({ region: o.region, names: o.names }));
	}

	_appearanceLineLabel(options, lineIdx) {
		const text = options.map(o => String(o ?? "").toLowerCase()).join(" ");
		if (text.includes("voice") || text.includes("spoken")) return "Voice";
		if (/(robe|clothes|cloak|gear|fur|leather|groomed|shaggy|threadbare|polish|badge)/.test(text)) return "Garb";
		if (/(body|frame|curvy|strapping|thin|solid|willowy|lithe|heavyset|gangly|ripped|stocky|wiry|compact|lean|wolfish|bony|limbed|big|scrawny|sinewy|slender|thick)/.test(text)) return "Build";
		if (/(scar|nose|missing|fingers|hands|frown|jaw|smirk|eyes|back)/.test(text)) return "Feature";
		if (/(step|stride|strut)/.test(text)) return "Bearing";
		return lineIdx === 0 ? "Appearance" : "Look";
	}

	_normalizeOnboardingText(value) {
		const char = (...codes) => String.fromCodePoint(...codes);
		const replacements = [
			[[0xe2, 0x2014, 0x2039], [0x25cb]], // circle
			[[0xe2, 0x2014, 0x2021], [0x25c7]], // diamond
			[[0xe2, 0x2014, 0x2020], [0x25c6]], // filled diamond
			[[0xe2, 0x2013, 0x00a1], [0x25a1]], // square
			[[0x00c2, 0x00b7], [0x00b7]],       // middle dot
			[[0xe2, 0x20ac, 0x201d], [0x2014]], // em dash
			[[0xe2, 0x20ac, 0x201c], [0x2013]], // en dash
			[[0xe2, 0x20ac, 0x00a6], [0x2026]], // ellipsis
			[[0xe2, 0x20ac, 0x2122], [0x2019]], // apostrophe
			[[0xe2, 0x20ac, 0x0153], [0x201c]], // opening quote
			[[0xe2, 0x20ac, 0x009d], [0x201d]], // closing quote
		];
		let text = String(value ?? "");
		for (const [from, to] of replacements) {
			text = text.replaceAll(char(...from), char(...to));
		}
		return text;
	}

	_parseMovePickCount() {
		return parseMovePickCount(this._playbookDoc.flags?.stonetop?.moves?.startingMovesNote);
	}

	_parseLorePickMax(section) {
		const desc = String(section?.description ?? "").toLowerCase();
		if (/answer\s+at\s+least/.test(desc)) return Infinity;
		// "choose N–M" / "choose N-M" (en-dash U+2013 or regular hyphen)
		const rangeM = desc.match(/(?:choose|pick)\s+(\d+)\s*[–\-]\s*(\d+)/);
		if (rangeM) return parseInt(rangeM[2]);
		// "choose N or M"
		const orM = desc.match(/(?:choose|pick)\s+(\d+)\s+or\s+(\d+)/);
		if (orM) return parseInt(orM[2]);
		// "choose N, maybe M"
		const maybeM = desc.match(/(?:choose|pick)\s+(\d+)[,\s]+maybe\s+(\d+)/);
		if (maybeM) return parseInt(maybeM[2]);
		// "choose N"
		const singleM = desc.match(/(?:choose|pick)\s+(\d+)/);
		if (singleM) return parseInt(singleM[1]);
		// fallback: if all options are pick-type with max 1, assume pick 1
		const opts = section?.options ?? [];
		if (opts.length > 0 && opts.every(o => !o.type && (o.max ?? 1) === 1)) return 1;
		return Infinity;
	}

	_countLoreSectionPicks(sectionSlug) {
		let n = 0;
		for (const [key, val] of Object.entries(this._selections.lore.picks)) {
			if (key.startsWith(`${sectionSlug}:`) && val > 0) n++;
		}
		return n;
	}

	_isSeekerArcanaSection(section) {
		return SEEKER_ARCANA_SLUGS.includes(section?.slug);
	}

	_shouldCombineSeekerArcana() {
		const slugs = new Set(this._rawLore.map(section => section.slug));
		return SEEKER_ARCANA_SLUGS.every(slug => slugs.has(slug));
	}

	_applyBackgroundChange(slug) {
		this._selections.backgroundSlug = slug;
		this._selections.initiates = [];
		this._ensureBackgroundMoveChoices();
		this._ensureBackgroundSetup();
		this._ensureSeekerMajorSelection();
		this._rebuildDynamicSteps();
	}

	_selectedBackground() {
		return this._backgrounds.find(bg => bg.slug === this._selections.backgroundSlug) ?? null;
	}

	_backgroundMoveChoices(background = this._selectedBackground()) {
		return background?.moveChoices ?? [];
	}

	_moveChoiceKey(choice) {
		return choice?.move ?? choice?.slug ?? choice?.label ?? "";
	}

	_ensureBackgroundMoveChoices(background = this._selectedBackground()) {
		if (!background) return;
		for (const choice of this._backgroundMoveChoices(background)) {
			const key = this._moveChoiceKey(choice);
			if (!key) continue;
			if (choice.value) {
				this._selections.backgroundChoices[key] = {
					label: choice.label ?? key,
					value: choice.value,
				};
				continue;
			}
			const allowed = choice.options ?? [];
			const saved = this._selections.backgroundChoices[key]?.value ?? "";
			if (!allowed.includes(saved)) {
				this._selections.backgroundChoices[key] = {
					label: choice.label ?? key,
					value: "",
				};
			}
		}
	}

	_backgroundMoveChoiceData(background) {
		return this._backgroundMoveChoices(background).map(choice => {
			const key = this._moveChoiceKey(choice);
			const selectedValue = this._selections.backgroundChoices[key]?.value ?? choice.value ?? "";
			return {
				key,
				move: choice.move ?? key,
				label: this._normalizeOnboardingText(choice.label ?? key),
				value: this._normalizeOnboardingText(choice.value ?? ""),
				hasOptions: !!choice.options?.length,
				options: (choice.options ?? []).map(value => ({
					value,
					label: this._normalizeOnboardingText(value),
					selected: selectedValue === value,
				})),
			};
		});
	}

	_backgroundSetup(background = this._selectedBackground()) {
		return background?.setup ?? null;
	}

	_ensureBackgroundSetup(background = this._selectedBackground()) {
		const setup = this._backgroundSetup(background);
		if (!setup) return;
		for (const choice of (setup.choices ?? [])) {
			const key = choice.key;
			if (!key) continue;
			const allowed = new Set((choice.options ?? []).map(o => o.value));
			if (!allowed.has(this._selections.backgroundSetup.choices[key])) {
				this._selections.backgroundSetup.choices[key] = "";
			}
		}
		for (const text of (setup.texts ?? [])) {
			const key = text.key;
			if (key && this._selections.backgroundSetup.texts[key] === undefined) {
				this._selections.backgroundSetup.texts[key] = "";
			}
		}
		for (const neighbor of (setup.neighbors ?? [])) {
			const key = neighbor.traitKey;
			if (key && this._selections.backgroundSetup.neighborTraits[key] === undefined) {
				this._selections.backgroundSetup.neighborTraits[key] = "";
			}
		}
		for (const choice of (setup.neighborChoices ?? [])) {
			const key = choice.key;
			if (!key) continue;
			const allowed = new Set((choice.options ?? []).map(o => o.value));
			const current = this._selections.backgroundSetup.neighborPicks[key] ?? [];
			this._selections.backgroundSetup.neighborPicks[key] = current.filter(value => allowed.has(value));
		}
	}

	_backgroundSetupData(background) {
		const setup = this._backgroundSetup(background);
		if (!setup) return null;
		const choices = (setup.choices ?? []).map(choice => ({
			key: choice.key,
			label: this._normalizeOnboardingText(choice.label ?? choice.key),
			apply: choice.apply ?? "",
			options: (choice.options ?? []).map(option => ({
				value: option.value,
				label: this._normalizeOnboardingText(option.label ?? option.value),
				selected: this._selections.backgroundSetup.choices[choice.key] === option.value,
			})),
		}));
		const texts = (setup.texts ?? []).map(text => ({
			key: text.key,
			label: this._normalizeOnboardingText(text.label ?? text.key),
			placeholder: this._normalizeOnboardingText(text.placeholder ?? ""),
			value: this._selections.backgroundSetup.texts[text.key] ?? "",
		}));
		const neighbors = (setup.neighbors ?? []).map(neighbor => ({
			name: this._normalizeOnboardingText(neighbor.name ?? ""),
			origin: this._normalizeOnboardingText(neighbor.origin ?? ""),
			traitKey: neighbor.traitKey ?? "",
			traitLabel: this._normalizeOnboardingText(neighbor.traitLabel ?? "Trait"),
			trait: this._selections.backgroundSetup.neighborTraits[neighbor.traitKey] ?? "",
		}));
		const neighborChoices = (setup.neighborChoices ?? []).map(choice => {
			const selected = this._selections.backgroundSetup.neighborPicks[choice.key] ?? [];
			return {
				key: choice.key,
				label: this._normalizeOnboardingText(choice.label ?? choice.key),
				count: Number(choice.count ?? 1),
				selectedCount: selected.length,
				options: (choice.options ?? []).map(option => ({
					value: option.value,
					name: this._normalizeOnboardingText(option.name ?? option.value),
					origin: this._normalizeOnboardingText(option.origin ?? ""),
					trait: this._normalizeOnboardingText(option.trait ?? ""),
					selected: selected.includes(option.value),
				})),
			};
		});
		return choices.length || texts.length || neighbors.length || neighborChoices.length
			? { choices, texts, neighbors, neighborChoices }
			: null;
	}

	_seekerMajorArcanaSlugs(background = this._selectedBackground()) {
		return background?.majorArcana ?? [];
	}

	_ensureSeekerMajorSelection() {
		if (!this._combineSeekerArcana) return;
		const allowed = this._seekerMajorArcanaSlugs();
		if (!allowed.length) return;
		if (!allowed.includes(this._selections.arcana.major)) {
			this._selections.arcana.major = allowed[0];
		}
	}

	_shuffled(arr) {
		const out = [...arr];
		for (let i = out.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[out[i], out[j]] = [out[j], out[i]];
		}
		return out;
	}

	_drawSeekerMinorArcana(minorOptions) {
		this._selections.arcana.minorDraw = this._shuffled(minorOptions.map(option => option.slug)).slice(0, 3);
		this._selections.arcana.minorRoles = { mastered: "", found: "", lead: "" };
	}

	_ensureSeekerMinorDraw(minorOptions) {
		const available = new Set(minorOptions.map(option => option.slug));
		const current = this._selections.arcana.minorDraw.filter(slug => available.has(slug));
		if (current.length === 3) return;
		this._drawSeekerMinorArcana(minorOptions);
	}

	_loreSectionData(section, index = this._rawLore.indexOf(section)) {
		const opts          = section.options ?? [];
		const isTextSection = opts.length > 0 && opts.every(o => o.type === "text");
		const isPickSection = opts.length > 0 && !isTextSection;
		const { picks, texts } = this._selections.lore;
		const previousSection = index > 0 ? this._rawLore[index - 1] : null;
		const previousSelectedOptions = isTextSection && previousSection
			? (previousSection.options ?? [])
				.filter(opt => (picks[`${previousSection.slug}:${opt.slug}`] ?? 0) > 0)
				.map(opt => this._normalizeOnboardingText(opt.description ?? ""))
				.filter(Boolean)
			: [];
		const pickMax      = isPickSection ? this._parseLorePickMax(section) : Infinity;
		const selectedPickCount = isPickSection ? this._countLoreSectionPicks(section.slug) : 0;
		const atLimit      = pickMax < Infinity && selectedPickCount >= pickMax;
		return {
			sectionSlug:        section.slug,
			title:              this._normalizeOnboardingText(section.title ?? ""),
			description:        this._normalizeOnboardingText(section.description ?? ""),
			contextTitle:        previousSelectedOptions.length ? this._normalizeOnboardingText(previousSection.title ?? "") : "",
			contextAnswers:      previousSelectedOptions,
			isPickSection,
			isTextSection,
			hasOptions:         opts.length > 0,
			pickMax:            pickMax === Infinity ? null : pickMax,
			selectedPickCount,
			options: opts.map(opt => {
				if (opt.type === "text") {
					return {
						slug:        opt.slug,
						sectionSlug: section.slug,
						description: this._normalizeOnboardingText(opt.description ?? ""),
						type:        "text",
						value:       texts[`${section.slug}:${opt.slug}`] ?? "",
					};
				}
				const key   = `${section.slug}:${opt.slug}`;
				const count = picks[key] ?? 0;
				return {
					slug:        opt.slug,
					sectionSlug: section.slug,
					description: this._normalizeOnboardingText(opt.description ?? ""),
					type:        "pick",
					max:         opt.max ?? 1,
					count,
					isSelected:  count > 0,
					disabled:    !count && atLimit,
				};
			}),
		};
	}

	_firstParagraph(html) {
		const div = document.createElement("div");
		div.innerHTML = String(html ?? "");
		const p = div.querySelector("p");
		// If no <p> found, fall back to first non-empty line rather than the whole text.
		const raw = p
			? p.textContent
			: (div.textContent.split(/\n+/).find(l => l.trim()) ?? div.textContent);
		return this._normalizeOnboardingText(raw.trim());
	}

	_animalCompanionKindOptions(typeData) {
		const examples = this._normalizeOnboardingText(typeData?.examples ?? "")
			.replace(/[.…]+$/g, "");
		return examples
			.split(",")
			.map(value => value.trim())
			.filter(Boolean);
	}

	async _loadArcanaOptions() {
		if (this._arcanaCache) return this._arcanaCache;
		if (this._arcanaCachePromise) return this._arcanaCachePromise;
		this._arcanaCachePromise = (async () => {
			const pack = game.packs.get("stonetop_pwd.stonetop-items");
			if (!pack) return { major: [], minor: [] };
			await pack.getIndex({ fields: ["system.moveType"] });
			const entries = pack.index.filter(entry => entry.system?.moveType === "arcanum");
			const docs = await Promise.all(entries.map(entry => pack.getDocument(entry._id)));
			const options = docs.filter(Boolean).flatMap(doc => {
				const flags = doc.flags?.stonetop ?? {};
				const slug  = flags.slug;
				if (!slug) return [];
				return [{
					slug,
					name:        this._normalizeOnboardingText(doc.name ?? flags.front?.title ?? slug),
					description: this._firstParagraph(flags.front?.description ?? ""),
					img:         doc.img && doc.img !== "icons/svg/item-bag.svg" ? doc.img : null,
					isMajor:     majorArcanaImg(slug) !== null,
				}];
			});
			this._arcanaCache = {
				major: options.filter(o => o.isMajor).sort((a, b) => a.name.localeCompare(b.name)),
				minor: options.filter(o => !o.isMajor).sort((a, b) => a.name.localeCompare(b.name)),
			};
			return this._arcanaCache;
		})();
		return this._arcanaCachePromise;
	}

	async _seekerArcanaChoiceData() {
		const arcana = await this._loadArcanaOptions();
		this._ensureSeekerMajorSelection();
		this._ensureSeekerMinorDraw(arcana.minor);
		const selectedMajor = this._selections.arcana.major;
		const allowedMajor = new Set(this._seekerMajorArcanaSlugs());
		const minorDraw = new Set(this._selections.arcana.minorDraw);
		const { minorRoles } = this._selections.arcana;
		return {
			majorSelected: selectedMajor,
			minorAssignedCount: Object.values(minorRoles).filter(Boolean).length,
			minorPickCount: this._selections.arcana.minorDraw.length,
			major: arcana.major.filter(option => allowedMajor.has(option.slug)).map(option => ({
				...option,
				selected: option.slug === selectedMajor,
			})),
			minor: arcana.minor.filter(option => minorDraw.has(option.slug)).map(option => ({
				...option,
				role: Object.entries(minorRoles).find(([, slug]) => slug === option.slug)?.[0] ?? "",
				})),
		};
	}

	async _loadPlaybookMoves() {
		const pack = game.packs.get("stonetop_pwd.stonetop-items");
		if (!pack) return [];
		await pack.getIndex({ fields: ["system.playbook", "system.isStartingMove", "system.requirement"] });
		const relevant = pack.index.filter(e => e.system?.playbook === this._playbookDoc.name);
		const docs = await Promise.all(relevant.map(e => pack.getDocument(e._id)));
		return docs.filter(Boolean);
	}

	// ── Stat helpers ──────────────────────────────────────────────────

	_parseStatScores() {
		const note = this._playbookDoc.flags?.stonetop?.statsNote ?? "";
		const matches = note.match(/[+-]?\d+/g);
		return matches ? matches.map(Number) : [2, 1, 1, 0, 0, -1];
	}

	_validateStats() {
		const required = this._statScores.slice().sort((a, b) => a - b);
		const assigned = Object.values(this._selections.stats);
		if (assigned.some(v => v === null)) return false;
		const actual = assigned.map(Number).sort((a, b) => a - b);
		return required.length === actual.length && required.every((v, i) => v === actual[i]);
	}

	// ── Completion check ──────────────────────────────────────────────

	_isStepComplete(stepType = this._steps[this._step]) {
		const ac = this._selections.animalCompanion;
		switch (stepType) {
			case "background": {
				const bg = this._selectedBackground();
				if (!bg) return false;
				const moveChoicesComplete = this._backgroundMoveChoices(bg).every(choice => {
					if (!choice.options?.length) return true;
					const key = this._moveChoiceKey(choice);
					return !!this._selections.backgroundChoices[key]?.value;
				});
				const setup = this._backgroundSetup(bg);
				const setupChoicesComplete = (setup?.choices ?? []).every(choice =>
					!!this._selections.backgroundSetup.choices[choice.key]
				);
				const setupTextsComplete = (setup?.texts ?? []).every(text =>
					!!this._selections.backgroundSetup.texts[text.key]?.trim()
				);
				const neighborTraitsComplete = (setup?.neighbors ?? []).every(neighbor =>
					!neighbor.traitKey || !!this._selections.backgroundSetup.neighborTraits[neighbor.traitKey]?.trim()
				);
				const neighborChoicesComplete = (setup?.neighborChoices ?? []).every(choice => {
					const count = Number(choice.count ?? 1);
					return (this._selections.backgroundSetup.neighborPicks[choice.key] ?? []).length === count;
				});
				return moveChoicesComplete && setupChoicesComplete && setupTextsComplete &&
					neighborTraitsComplete && neighborChoicesComplete;
			}
			case "instinct":       return !!this._selections.instinctValue.trim();
			case "appearance":     return this._rawAppearance.every((_, i) => !!this._selections.appearance[i]);
			case "origin":         return !!this._selections.originRegion;
			case "stats":          return this._validateStats();
			case "possession":     return this._selections.possessions.length === (this._rawPossessions?.pickCount ?? 0);
			case "moves":          return this._selections.moves.length === this._movePickCount;
			case "invocations":    return this._selections.invocations.length === (this._rawInvocations?.startingCount ?? 0);
			case "initiates": {
				const d = this._getInitiatesData();
				const [min] = this._initiatesCountRange(d);
				if (this._selections.initiates.length < min) return false;
				const selected = (d?.options ?? []).filter(o => this._selections.initiates.includes(o.slug));
				return selected.every(opt => {
					if (!(opt.choiceRows?.length)) return true;
					const det = this._selections.initiateDetails[opt.slug] ?? {};
					return opt.choiceRows.every((row, rowIdx) => {
						const val = row.type === "pronoun" ? det.pronoun : det.rows?.[rowIdx];
						return !!val?.trim();
					});
				});
			}
			case "crew": {
				const tagLimit = this._rawCrew?.additionalTagCount ?? 2;
				return this._selections.crew.tags.length >= tagLimit &&
				       !!this._selections.crew.instinct &&
				       !!this._selections.crew.cost;
			}
			case "animalCompanion": {
				if (!ac.type) return false;
				const typeData = this._rawAnimalCompanion?.types?.find(t => t.slug === ac.type);
				return !!typeData &&
				       !!ac.kind?.trim() &&
				       ac.traits.length >= typeData.pickCount &&
				       !!ac.instinct && !!ac.cost;
			}
			case "seekerArcana":
				return !!this._selections.arcana.major;
			case "seekerArcanaMinor":
				return Object.values(this._selections.arcana.minorRoles).filter(Boolean).length === 3;
			default: return true;
		}
	}

	// ── Resume helpers ───────────────────────────────────────────────

	_parseLorePickMin(section) {
		const desc = String(section?.description ?? "").toLowerCase();
		const rangeM = desc.match(/(?:choose|pick)\s+(\d+)\s*[\u2013\-]\s*(\d+)/);
		if (rangeM) return parseInt(rangeM[1], 10);
		const orM = desc.match(/(?:choose|pick)\s+(\d+)\s+or\s+(\d+)/);
		if (orM) return parseInt(orM[1], 10);
		const maybeM = desc.match(/(?:choose|pick)\s+(\d+)[,\s]+maybe\s+(\d+)/);
		if (maybeM) return parseInt(maybeM[1], 10);
		const singleM = desc.match(/(?:choose|pick)\s+(\d+)/);
		if (singleM) return parseInt(singleM[1], 10);
		const opts = section?.options ?? [];
		if (opts.length > 0 && opts.every(o => !o.type && (o.max ?? 1) === 1)) return 1;
		return 0;
	}

	_isLoreSectionAnswered(section) {
		const opts = section?.options ?? [];
		if (!opts.length) return true;
		const textOptions = opts.filter(o => o.type === "text");
		if (textOptions.length) {
			return textOptions.every(opt =>
				!!this._selections.lore.texts[`${section.slug}:${opt.slug}`]?.trim()
			);
		}
		const min = this._parseLorePickMin(section);
		return min <= 0 || this._countLoreSectionPicks(section.slug) >= min;
	}

	_isStepAnsweredForResume(stepType) {
		const loreMatch = stepType?.match(/^lore:(\d+)$/);
		if (loreMatch) {
			const section = this._rawLore[parseInt(loreMatch[1], 10)];
			return this._isLoreSectionAnswered(section);
		}
		if (stepType === "origin") {
			return !!this._selections.originRegion && !!this._selections.name?.trim();
		}
		if (stepType === "seekerArcana") {
			const section = this._rawLore.find(s => s.slug === "arcana-major");
			return this._isStepComplete(stepType) && this._isLoreSectionAnswered(section);
		}
		if (stepType === "seekerArcanaMinor") {
			const section = this._rawLore.find(s => s.slug === "arcana-minor");
			return this._isStepComplete(stepType) && this._isLoreSectionAnswered(section);
		}
		return this._isStepComplete(stepType);
	}

	_isResumeQuestionStep(stepType) {
		return stepType?.startsWith("lore:") || [
			"background",
			"instinct",
			"appearance",
			"origin",
			"initiates",
			"crew",
			"animalCompanion",
			"seekerArcana",
			"seekerArcanaMinor",
		].includes(stepType);
	}

	_firstIncompleteStepIndex() {
		for (let i = 0; i < this._steps.length; i++) {
			if (!this._isResumeQuestionStep(this._steps[i])) continue;
			if (!this._isStepAnsweredForResume(this._steps[i])) return i;
		}
		return 0;
	}

	// ── Foundry Application boilerplate ──────────────────────────────

	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id:        "stonetop-character-onboarding",
			template:  "systems/stonetop_pwd/templates/dialogs/character-onboarding.hbs",
			width:     660,
			height:    640,
			resizable: true,
			classes:   ["stonetop", "stonetop-onboarding"],
		});
	}

	get title() {
		return `New Character — ${this._playbookDoc.name}`;
	}

	_getHeaderButtons() {
		const buttons = super._getHeaderButtons();
		if (this._onSave) {
			buttons.unshift({
				label:   game.i18n.localize("stonetop.onboarding.saveButton"),
				class:   "stonetop-onboarding-save-header",
				icon:    "fas fa-save",
				onclick: () => this._saveProgress(),
			});
		}
		return buttons;
	}

	// ── getData ───────────────────────────────────────────────────────

	async getData() {
		const stepType = this._steps[this._step] ?? null;
		const isFirst  = this._step === 0;
		const isLast   = this._step === this._steps.length - 1 || this._steps.length === 0;
		const hasBack  = !!this._onBack;

		const progressDots = this._steps.map((_, i) => ({
			active: i === this._step,
			done:   i < this._step,
		}));

		let backgrounds     = null;
		let instincts       = null;
		let appearanceLines = null;
		let origins         = null;
		let statBoxes         = null;
		let statScores        = null;
		let statScoresDisplay = "";
		let possession        = null;
		let moveOptions       = null;
		let movePickNote      = "";
		let invocationData    = null;
		let initiatesData     = null;
		let crewData          = null;
		let acData            = null;
		let loreSectionData   = null;
		let seekerArcanaData  = null;
		let seekerArcanaChoices = null;

		// ── Background ────────────────────────────────────────────────
		if (stepType === "background") {
			const arcana = this._combineSeekerArcana ? await this._loadArcanaOptions() : null;
			const majorBySlug = new Map((arcana?.major ?? []).map(option => [option.slug, option]));
			backgrounds = this._backgrounds.map(bg => ({
				slug:        bg.slug,
				label:       this._normalizeOnboardingText(bg.label),
				description: this._normalizeOnboardingText(bg.description),
				selected:    this._selections.backgroundSlug === bg.slug,
				moveChoices: this._backgroundMoveChoiceData(bg),
				setup: this._backgroundSetupData(bg),
				majorArcana: (bg.majorArcana ?? []).map(slug => {
					const option = majorBySlug.get(slug);
					return option ? {
						...option,
						backgroundSlug: bg.slug,
						selected: this._selections.arcana.major === slug,
					} : null;
				}).filter(Boolean),
			}));
		}

		// ── Instinct ──────────────────────────────────────────────────
		if (stepType === "instinct") {
			instincts = this._rawInstincts.map(inst => {
				const value = `${inst.word} — ${inst.description}`;
				return { word: inst.word, description: inst.description, value,
				         selected: this._selections.instinctValue === value };
			});
		}

		// ── Appearance ────────────────────────────────────────────────
		if (stepType === "appearance") {
			appearanceLines = this._rawAppearance.map((opts, lineIdx) => {
				const selected = this._selections.appearance[lineIdx] ?? "";
				const customSelected = !!selected && !opts.includes(selected);
				return {
					lineIdx,
					label: this._appearanceLineLabel(opts, lineIdx),
					customValue: customSelected ? selected : "",
					customSelected,
					options: opts.map(value => ({
						value,
						selected: selected === value,
					})),
				};
			});
		}

		// ── Origin ────────────────────────────────────────────────────
		if (stepType === "origin") {
			origins = this._origins.map(o => ({
				region:   o.region,
				names:    o.names ?? [],
				nameGroups: this._isGordinsDelve(o.region) ? this._originNameGroups() : [],
				isGordinsDelve: this._isGordinsDelve(o.region),
				selected: this._selections.originRegion === o.region,
			}));
		}

		// ── Stats ─────────────────────────────────────────────────────
		if (stepType === "stats") {
			const scores    = this._statScores;
			const poolCount = this._statPoolCount;

			statScores = [...scores].sort((a, b) => b - a)
				.map(v => v >= 0 ? `+${v}` : String(v));
			statScoresDisplay = statScores.join(", ");

			const STAT_DEFS = [
				{ key: "str", abbr: "STR", label: "Strength" },
				{ key: "dex", abbr: "DEX", label: "Dexterity" },
				{ key: "con", abbr: "CON", label: "Constitution" },
				{ key: "int", abbr: "INT", label: "Intelligence" },
				{ key: "wis", abbr: "WIS", label: "Wisdom" },
				{ key: "cha", abbr: "CHA", label: "Charisma" },
			];
			statBoxes = STAT_DEFS.map(s => {
				const assigned = this._selections.stats[s.key];
				const otherCount = {};
				for (const other of STAT_DEFS) {
					if (other.key === s.key) continue;
					const v = this._selections.stats[other.key];
					if (v !== null) otherCount[v] = (otherCount[v] ?? 0) + 1;
				}
				const validValues = Object.keys(poolCount)
					.map(Number)
					.filter(v => (poolCount[v] - (otherCount[v] ?? 0)) >= 1)
					.sort((a, b) => b - a);
				return {
					...s,
					assigned: assigned !== null,
					options: validValues.map(v => ({
						value:    v,
						label:    v >= 0 ? `+${v}` : String(v),
						selected: assigned === v,
					})),
				};
			});
		}

		// ── Moves ─────────────────────────────────────────────────────
		if (stepType === "moves") {
			if (!this._movesCache) this._movesCache = await this._loadPlaybookMoves();
			const selectedBg  = this._backgrounds.find(b => b.slug === this._selections.backgroundSlug);
			const bgMoveNames = new Set(selectedBg?.moves ?? []);
			const chosenIds   = new Set(this._selections.moves);
			const atLimit     = chosenIds.size >= this._movePickCount;
			const n           = this._movePickCount;
			movePickNote = `Choose ${n} starting ${n === 1 ? "move" : "moves"}`;

			const grantedNames = new Set([
				...this._movesCache.filter(d => d.system?.isStartingMove).map(d => d.name),
				...bgMoveNames,
			]);
			moveOptions = this._movesCache
				.filter(doc => {
					if (doc.system?.isStartingMove) return false;
					if (bgMoveNames.has(doc.name)) return false;
					if (doc.system?.requirement?.level > 1) return false;
					const reqMoves = doc.system?.requirement?.moves ?? [];
					if (reqMoves.length && !reqMoves.every(r => grantedNames.has(r))) return false;
					return true;
				})
				.map(doc => ({
					id:          doc.id,
					name:        this._normalizeOnboardingText(doc.name),
					description: this._normalizeOnboardingText(doc.system?.description),
					selected:    chosenIds.has(doc.id),
					disabled:    !chosenIds.has(doc.id) && atLimit,
				}));
		}

		// ── Possession ────────────────────────────────────────────────
		if (stepType === "possession") {
			const raw         = this._rawPossessions;
			const pickCount   = raw.pickCount ?? 0;
			const preselected = new Set(raw.preselected ?? []);
			const chosen      = new Set(this._selections.possessions);
			const atLimit     = chosen.size >= pickCount;
			possession = {
				pickNote:      raw.pickNote ?? `Pick ${pickCount}`,
				pickCount,
				selectedCount: chosen.size,
				options: (raw.options ?? []).map(opt => {
					const isPre = preselected.has(opt.slug);
					const isChosen = chosen.has(opt.slug);
					const isSelected = isPre || isChosen;
					return {
						slug: opt.slug,
						label: this._normalizeOnboardingText(opt.label),
						description: this._normalizeOnboardingText(opt.description),
						isPreselected: isPre, isSelected,
						disabled: isPre || (!isSelected && atLimit),
					};
				}),
			};
		}

		// ── Invocations ───────────────────────────────────────────────
		if (stepType === "invocations") {
			const raw   = this._rawInvocations;
			const count = raw.startingCount ?? 2;
			const chosen = new Set(this._selections.invocations);
			const atLimit = chosen.size >= count;
			invocationData = {
				startingCount: count,
				selectedCount: chosen.size,
				options: (raw.options ?? []).map(opt => ({
					slug:        opt.slug,
					label:       this._normalizeOnboardingText(opt.label),
					description: this._normalizeOnboardingText(opt.description),
					isSelected:  chosen.has(opt.slug),
					disabled:    !chosen.has(opt.slug) && atLimit,
				})),
			};
		}

		// ── Initiates ─────────────────────────────────────────────────
		if (stepType === "initiates") {
			const bg      = this._getInitiatesData();
			const [minCount, maxCount] = this._initiatesCountRange(bg);
			const chosen  = new Set(this._selections.initiates);
			const atLimit = chosen.size >= maxCount;
			initiatesData = {
				label:         bg?.label ?? "",
				minCount, maxCount,
				selectedCount: chosen.size,
				options: (bg?.options ?? []).map(opt => {
					const isSelected = chosen.has(opt.slug);
					const det = this._selections.initiateDetails[opt.slug] ?? {};
					return {
						slug:        opt.slug,
						label:       this._normalizeOnboardingText(opt.label),
						description: this._normalizeOnboardingText(opt.description),
						isSelected,
						disabled:    !isSelected && atLimit,
						choiceRows: (opt.choiceRows ?? []).map((row, rowIdx) => {
							const isPronoun  = row.type === "pronoun";
							const currentVal = isPronoun ? (det.pronoun ?? "") : (det.rows?.[rowIdx] ?? "");
							const optionValues = row.options.map(o => this._normalizeOnboardingText(o));
							const isCustom   = isPronoun && !!currentVal && !optionValues.includes(currentVal);
							return {
								rowIdx,
								slug:        opt.slug,
								isPronoun,
								label:       row.label ? this._normalizeOnboardingText(row.label) : null,
								allowCustom: isPronoun,
								customValue: isCustom ? currentVal : "",
								options: optionValues.map(value => {
									return {
										value,
										slug:    opt.slug,
										rowIdx,
										selected: !isCustom && currentVal === value,
									};
								}),
							};
						}),
					};
				}),
			};
		}

		// ── Crew ──────────────────────────────────────────────────────
		if (stepType === "crew") {
			const raw    = this._rawCrew;
			const bgTag  = raw.backgroundTags?.[this._selections.backgroundSlug] ?? null;
			const chosen = new Set(this._selections.crew.tags);
			const limit  = raw.additionalTagCount ?? 2;
			const atLimit = chosen.size >= limit;
			crewData = {
				name:               this._selections.crew.name,
				bgTag:              this._normalizeOnboardingText(bgTag),
				additionalTagCount: limit,
				selectedTagCount:   chosen.size,
				tags: (raw.availableTags ?? []).map(tag => {
					const isAuto     = tag === bgTag;
					const isSelected = isAuto || chosen.has(tag);
					return {
						slug: tag, label: this._normalizeOnboardingText(tag), isAuto, isSelected,
						disabled: isAuto || (!isSelected && atLimit),
					};
				}),
				instincts: (raw.instincts ?? []).map(v => {
					const value = this._normalizeOnboardingText(v);
					return { value, selected: this._selections.crew.instinct === value };
				}),
				costs: (raw.costs ?? []).map(v => {
					const value = this._normalizeOnboardingText(v);
					return { value, selected: this._selections.crew.cost === value };
				}),
			};
		}

		// ── Lore ──────────────────────────────────────────────────────
		const loreMatch = stepType?.match(/^lore:(\d+)$/);
		if (loreMatch) {
			const idx     = parseInt(loreMatch[1]);
			const section = this._rawLore[idx];
			if (section) loreSectionData = this._loreSectionData(section, idx);
		}

		if (stepType === "seekerArcana" || stepType === "seekerArcanaMinor") {
			seekerArcanaChoices = await this._seekerArcanaChoiceData();
			const collectionSection = this._rawLore.find(s => s.slug === "collection");
			seekerArcanaData = {
				title:       this._normalizeOnboardingText(collectionSection?.title ?? "Collection"),
				description: collectionSection ? this._normalizeOnboardingText(collectionSection.description ?? "") : "",
				sections: (stepType === "seekerArcana" ? ["arcana-major"] : ["arcana-minor"])
					.map(slug => this._rawLore.find(section => section.slug === slug))
					.filter(Boolean)
					.map(section => this._loreSectionData(section)),
			};
		}

		// ── Animal Companion ─────────────────────────────────────────
		if (stepType === "animalCompanion") {
			const raw         = this._rawAnimalCompanion;
			const selType     = this._selections.animalCompanion.type;
			const typeData    = raw.types?.find(t => t.slug === selType) ?? null;
			const chosenTraits = new Set(this._selections.animalCompanion.traits);
			const kind = this._selections.animalCompanion.kind;
			const kindOptionValues = this._animalCompanionKindOptions(typeData);
			const traitAtLimit = chosenTraits.size >= (typeData?.pickCount ?? 0);
			acData = {
				types: (raw.types ?? []).map(t => ({
					slug: t.slug, label: this._normalizeOnboardingText(t.label), examples: this._normalizeOnboardingText(t.examples),
					hp: t.hp, armor: t.armor, damage: t.damage,
					selected: t.slug === selType,
				})),
				selectedType: typeData ? {
					slug:          typeData.slug,
					label:         this._normalizeOnboardingText(typeData.label),
					hp:            typeData.hp,
					armor:         typeData.armor,
					damage:        typeData.damage,
					kind,
					customKind:    kindOptionValues.includes(kind) ? "" : kind,
					isCustomKind:  !!kind && !kindOptionValues.includes(kind),
					kindOptions:   kindOptionValues
						.map(value => ({ value, selected: kind === value })),
					pickCount:     typeData.pickCount,
					selectedCount: chosenTraits.size,
					traits: (typeData.traits ?? []).map(trait => ({
						slug:       trait,
						label:      this._normalizeOnboardingText(trait),
						hasTooltip: !!this._wordCache.get(trait.toLowerCase()),
						isSelected: chosenTraits.has(trait),
						disabled:   !chosenTraits.has(trait) && traitAtLimit,
					})),
				} : null,
				instincts: (raw.instincts ?? []).map(v => {
					const value = this._normalizeOnboardingText(v);
					return { value, selected: this._selections.animalCompanion.instinct === value };
				}),
				costs: (raw.costs ?? []).map(v => {
					const value = this._normalizeOnboardingText(v);
					return { value, selected: this._selections.animalCompanion.cost === value };
				}),
				companionName: this._selections.animalCompanion.name,
			};
		}

		return {
			playbookName:      this._playbookDoc.name,
			playbookImg:       this._playbookDoc.img,
			stepType,
			stepNumber:        this._step + 1,
			stepCount:         this._steps.length,
			isFirst, isLast, hasBack,
			showBack:          !isFirst || hasBack,
			isBackground:      stepType === "background",
			isInstinct:        stepType === "instinct",
			isAppearance:      stepType === "appearance",
			isOrigin:          stepType === "origin",
			isStats:           stepType === "stats",
			isPossession:      stepType === "possession",
			isMoves:           stepType === "moves",
			isInvocations:     stepType === "invocations",
			isInitiates:       stepType === "initiates",
			isCrew:            stepType === "crew",
			isAnimalCompanion:  stepType === "animalCompanion",
			isLore:            !!loreMatch,
			isSeekerArcana:      stepType === "seekerArcana",
			isSeekerArcanaMinor: stepType === "seekerArcanaMinor",
			progressDots,
			backgrounds, instincts, appearanceLines, origins,
			selectedInstinct:  this._selections.instinctValue,
			selectedName:      this._selections.name,
			statBoxes, statScores, statScoresDisplay,
			possession,
			moveOptions, movePickNote,
			movePickCount:      this._movePickCount,
			moveSelectedCount:  this._selections.moves.length,
			invocationData, initiatesData, crewData, acData, loreSectionData, seekerArcanaData, seekerArcanaChoices,
			stepComplete:       this._isStepComplete(),
		};
	}

	// ── Listeners ─────────────────────────────────────────────────────

	activateListeners(html) {
		super.activateListeners(html);

		html.find(".stonetop-onboarding-back-to-picker").on("click", () => this._goBack());
		html.find(".stonetop-onboarding-back").on("click", () => this._navigate(-1));
		html.find(".stonetop-onboarding-skip").on("click", () => this._skip());
		html.find(".stonetop-onboarding-next").on("click", () => this._navigate(1));
		html.find(".stonetop-onboarding-confirm").on("click", () => this._confirm());

		const _refreshNextButton = () => {
			html.find(".stonetop-onboarding-next, .stonetop-onboarding-confirm")
				.prop("disabled", !this._isStepComplete());
		};

		// ── Background ────────────────────────────────────────────────
		html.find("[name='onboard-background']").on("change", ev => {
			this._applyBackgroundChange(ev.currentTarget.value);
			_refreshNextButton();
		});

		html.find(".stonetop-onboarding-background-move-choices").on("click", ev => {
			ev.stopPropagation();
		});
		html.find(".stonetop-onboarding-background-choice-option").on("click", ev => {
			if (ev.target.type === "radio") return;
			const radio = ev.currentTarget.querySelector("input[type='radio']");
			if (radio && !radio.checked) {
				radio.checked = true;
				radio.dispatchEvent(new Event("change", { bubbles: true }));
			}
		});
		html.find(".stonetop-onboarding-background-choice-option input[type='radio']").on("change", ev => {
			const { backgroundSlug, choiceKey, choiceLabel } = ev.currentTarget.dataset;
			const prevBackground = this._selections.backgroundSlug;
			this._applyBackgroundChange(backgroundSlug);
			this._selections.backgroundChoices[choiceKey] = {
				label: choiceLabel,
				value: ev.currentTarget.value,
			};
			html.find(`[name='${ev.currentTarget.name}']`).each((_, radio) => {
				radio.closest(".stonetop-onboarding-background-choice-option")
					?.classList.toggle("is-selected", radio.checked);
			});
			if (prevBackground !== backgroundSlug) {
				html.find("[name='onboard-background']").each((_, radio) => {
					radio.checked = radio.value === backgroundSlug;
					radio.closest(".stonetop-onboarding-card")
						?.classList.toggle("is-selected", radio.value === backgroundSlug);
				});
			}
			_refreshNextButton();
		});

		html.find(".stonetop-onboarding-background-setup").on("click", ev => {
			ev.stopPropagation();
		});
		html.find(".stonetop-onboarding-background-setup-option").on("click", ev => {
			if (ev.target.type === "radio") return;
			const radio = ev.currentTarget.querySelector("input[type='radio']");
			if (radio && !radio.checked) {
				radio.checked = true;
				radio.dispatchEvent(new Event("change", { bubbles: true }));
			}
		});
		html.find(".stonetop-onboarding-background-setup-option input[type='radio']").on("change", ev => {
			const { backgroundSlug, choiceKey } = ev.currentTarget.dataset;
			const prevBackground = this._selections.backgroundSlug;
			this._applyBackgroundChange(backgroundSlug);
			this._selections.backgroundSetup.choices[choiceKey] = ev.currentTarget.value;
			html.find(`[name='${ev.currentTarget.name}']`).each((_, radio) => {
				radio.closest(".stonetop-onboarding-background-setup-option")
					?.classList.toggle("is-selected", radio.checked);
			});
			if (prevBackground !== backgroundSlug) {
				html.find("[name='onboard-background']").each((_, radio) => {
					radio.checked = radio.value === backgroundSlug;
					radio.closest(".stonetop-onboarding-card")
						?.classList.toggle("is-selected", radio.value === backgroundSlug);
				});
			}
			_refreshNextButton();
		});
		html.find(".onboard-background-setup-text").on("input", ev => {
			const { backgroundSlug, textKey } = ev.currentTarget.dataset;
			const prevBackground = this._selections.backgroundSlug;
			this._applyBackgroundChange(backgroundSlug);
			this._selections.backgroundSetup.texts[textKey] = ev.currentTarget.value;
			if (prevBackground !== backgroundSlug) {
				html.find("[name='onboard-background']").each((_, radio) => {
					radio.checked = radio.value === backgroundSlug;
					radio.closest(".stonetop-onboarding-card")
						?.classList.toggle("is-selected", radio.value === backgroundSlug);
				});
			}
			_refreshNextButton();
		});
		html.find(".onboard-background-neighbor-trait").on("input", ev => {
			const { backgroundSlug, traitKey } = ev.currentTarget.dataset;
			const prevBackground = this._selections.backgroundSlug;
			this._applyBackgroundChange(backgroundSlug);
			this._selections.backgroundSetup.neighborTraits[traitKey] = ev.currentTarget.value;
			if (prevBackground !== backgroundSlug) {
				html.find("[name='onboard-background']").each((_, radio) => {
					radio.checked = radio.value === backgroundSlug;
					radio.closest(".stonetop-onboarding-card")
						?.classList.toggle("is-selected", radio.value === backgroundSlug);
				});
			}
			_refreshNextButton();
		});
		html.find(".stonetop-onboarding-background-neighbor-option").on("click", ev => {
			if (ev.target.type === "checkbox") return;
			const checkbox = ev.currentTarget.querySelector("input[type='checkbox']");
			if (checkbox) {
				checkbox.checked = !checkbox.checked;
				checkbox.dispatchEvent(new Event("change", { bubbles: true }));
			}
		});
		html.find(".stonetop-onboarding-background-neighbor-option input[type='checkbox']").on("change", ev => {
			const { backgroundSlug, choiceKey } = ev.currentTarget.dataset;
			const max = Number(ev.currentTarget.dataset.choiceCount ?? 1);
			const prevBackground = this._selections.backgroundSlug;
			this._applyBackgroundChange(backgroundSlug);
			const current = this._selections.backgroundSetup.neighborPicks[choiceKey] ?? [];
			const value = ev.currentTarget.value;
			let next = ev.currentTarget.checked
				? [...current.filter(v => v !== value), value]
				: current.filter(v => v !== value);
			if (next.length > max) {
				const removed = next.shift();
				const removedInput = html[0].querySelector(
					`input[name='${ev.currentTarget.name}'][value='${removed}']`
				);
				if (removedInput) removedInput.checked = false;
			}
			this._selections.backgroundSetup.neighborPicks[choiceKey] = next;
			html.find(`[name='${ev.currentTarget.name}']`).each((_, checkbox) => {
				checkbox.closest(".stonetop-onboarding-background-neighbor-option")
					?.classList.toggle("is-selected", checkbox.checked);
			});
			if (prevBackground !== backgroundSlug) {
				html.find("[name='onboard-background']").each((_, radio) => {
					radio.checked = radio.value === backgroundSlug;
					radio.closest(".stonetop-onboarding-card")
						?.classList.toggle("is-selected", radio.value === backgroundSlug);
				});
			}
			_refreshNextButton();
		});

		// Arcana options are <span>s (not <label>s) because the background card is already
		// a <label> — nesting labels is invalid HTML. Stop the click from bubbling to the
		// background label, and forward it to the radio manually.
		html.find(".stonetop-onboarding-background-arcana").on("click", ev => {
			ev.stopPropagation();
		});
		html.find(".stonetop-onboarding-background-arcana .stonetop-onboarding-arcana-option").on("click", ev => {
			if (ev.target.type === "radio") return;
			const radio = ev.currentTarget.querySelector("input[type='radio']");
			if (radio && !radio.checked) {
				radio.checked = true;
				radio.dispatchEvent(new Event("change", { bubbles: true }));
			}
		});

		html.find("[name='onboard-background-major-arcanum']").on("change", ev => {
			const prevBackground = this._selections.backgroundSlug;
			const { backgroundSlug } = ev.currentTarget.dataset;
			this._applyBackgroundChange(backgroundSlug);
			this._selections.arcana.major = ev.currentTarget.value;

			// Update arcana is-selected without re-rendering.
			html.find("[name='onboard-background-major-arcanum']").each((_, radio) => {
				radio.closest(".stonetop-onboarding-arcana-option")
					?.classList.toggle("is-selected", radio.checked);
			});

			// If the background itself changed, sync the background card selection too.
			if (prevBackground !== backgroundSlug) {
				html.find("[name='onboard-background']").each((_, radio) => {
					radio.closest(".stonetop-onboarding-card")
						?.classList.toggle("is-selected", radio.value === backgroundSlug);
				});
			}

			_refreshNextButton();
		});

		// ── Instinct ──────────────────────────────────────────────────
		html.find("[name='onboard-instinct']").on("change", ev => {
			this._selections.instinctValue = ev.currentTarget.value;
			html.find(".onboard-instinct-custom").val(ev.currentTarget.value);
			_refreshNextButton();
		});
		html.find(".onboard-instinct-custom").on("input", ev => {
			this._selections.instinctValue = ev.currentTarget.value;
			html.find("[name='onboard-instinct']").prop("checked", false);
			html.find(".stonetop-onboarding-card").removeClass("is-selected");
			_refreshNextButton();
		});

		// ── Appearance ────────────────────────────────────────────────
		html.find("[name^='onboard-appearance-']").on("change", ev => {
			const lineIdx = Number(ev.currentTarget.name.replace("onboard-appearance-", ""));
			this._selections.appearance[lineIdx] = ev.currentTarget.value;
			this._setSelectedOption(ev.currentTarget.closest(".stonetop-onboarding-appearance-row"), ev.currentTarget);
			_refreshNextButton();
		});
		html.find(".onboard-appearance-custom").on("input", ev => {
			const lineIdx = Number(ev.currentTarget.dataset.line);
			this._selections.appearance[lineIdx] = ev.currentTarget.value.trim();
			const row = ev.currentTarget.closest(".stonetop-onboarding-appearance-row");
			const radio = row?.querySelector(".onboard-appearance-custom-radio");
			if (radio) {
				radio.value = ev.currentTarget.value.trim();
				radio.checked = true;
			}
			this._setSelectedOption(row, radio);
			_refreshNextButton();
		});
		html.find(".onboard-appearance-custom-radio").on("change", ev => {
			const lineIdx = Number(ev.currentTarget.dataset.line);
			const input = ev.currentTarget.closest(".stonetop-onboarding-appearance-custom")
				?.querySelector(".onboard-appearance-custom");
			this._selections.appearance[lineIdx] = input?.value.trim() ?? "";
			_refreshNextButton();
		});

		// ── Origin ────────────────────────────────────────────────────
		html.find("[name='onboard-origin']").on("change", ev => {
			this._selections.originRegion = ev.currentTarget.value;
			this.render(false);
		});

		// ── Name ──────────────────────────────────────────────────────
		html.find(".onboard-name-input").on("input", ev => {
			this._selections.name = ev.currentTarget.value;
		});

		// ── Stats ─────────────────────────────────────────────────────
		const _updateStatDropdowns = () => {
			const scores    = this._statScores;
			const poolCount = this._statPoolCount;
			const statKeys = ["str", "dex", "con", "int", "wis", "cha"];
			for (const key of statKeys) {
				const selectEl = html.find(`[name="onboard-stat-${key}"]`)[0];
				if (!selectEl) continue;
				const currentVal = this._selections.stats[key];
				const otherCount = {};
				for (const k of statKeys) {
					if (k === key) continue;
					const v = this._selections.stats[k];
					if (v !== null) otherCount[v] = (otherCount[v] ?? 0) + 1;
				}
				const validValues = Object.keys(poolCount)
					.map(Number)
					.filter(v => (poolCount[v] - (otherCount[v] ?? 0)) >= 1)
					.sort((a, b) => b - a);
				selectEl.innerHTML = '<option value="">—</option>' +
					validValues.map(v => {
						const lbl     = v >= 0 ? `+${v}` : String(v);
						const selAttr = currentVal === v ? ' selected' : '';
						return `<option value="${v}"${selAttr}>${lbl}</option>`;
					}).join('');
			}
		};
		const _updateStatScoreChips = () => {
			const usedCount = {};
			for (const value of Object.values(this._selections.stats)) {
				if (value === null) continue;
				usedCount[value] = (usedCount[value] ?? 0) + 1;
			}
			const shownCount = {};
			html.find(".stonetop-onboarding-stats-chip").each((_, chip) => {
				const value = Number(String(chip.dataset.score).replace("+", ""));
				shownCount[value] = (shownCount[value] ?? 0) + 1;
				const remaining = (this._statPoolCount[value] ?? 0) - (usedCount[value] ?? 0);
				chip.hidden = shownCount[value] > remaining;
			});
		};
		const _assignStat = (key, value) => {
			if (!key || value === null || value === undefined || Number.isNaN(value)) return false;
			const otherCount = {};
			for (const [otherKey, otherValue] of Object.entries(this._selections.stats)) {
				if (otherKey === key || otherValue === null) continue;
				otherCount[otherValue] = (otherCount[otherValue] ?? 0) + 1;
			}
			if ((this._statPoolCount[value] ?? 0) - (otherCount[value] ?? 0) < 1) return false;
			this._selections.stats[key] = value;
			const selectEl = html.find(`[name="onboard-stat-${key}"]`)[0];
			const box = selectEl?.closest(".stonetop-onboarding-stat-box")
				?? html.find(`.stonetop-onboarding-stat-box[data-stat-key="${key}"]`)[0];
			box?.classList.add("is-filled");
			_updateStatDropdowns();
			_updateStatScoreChips();
			if (selectEl) selectEl.value = String(value);
			_refreshNextButton();
			return true;
		};

		html.find("[name^='onboard-stat-']").on("change", ev => {
			const key = ev.currentTarget.name.replace("onboard-stat-", "");
			const raw = ev.currentTarget.value;
			this._selections.stats[key] = raw === "" ? null : Number(raw);
			ev.currentTarget.closest(".stonetop-onboarding-stat-box")
				?.classList.toggle("is-filled", raw !== "");
			_updateStatDropdowns();
			_updateStatScoreChips();
			_refreshNextButton();
		});

		html.find(".stonetop-onboarding-stats-reset").on("click", () => {
			for (const key of Object.keys(this._selections.stats)) this._selections.stats[key] = null;
			html.find(".stonetop-onboarding-stat-box").removeClass("is-filled is-drag-over");
			_updateStatDropdowns();
			_updateStatScoreChips();
			_refreshNextButton();
		});

		// ── Special Possessions ───────────────────────────────────────
		html.find(".stonetop-onboarding-stats-chip").on("dragstart", ev => {
			const score = ev.currentTarget.dataset.score;
			ev.originalEvent.dataTransfer.setData("text/plain", score);
			ev.originalEvent.dataTransfer.effectAllowed = "copy";
		});

		html.find(".stonetop-onboarding-stat-box")
			.on("dragover", ev => {
				ev.preventDefault();
				ev.currentTarget.classList.add("is-drag-over");
				ev.originalEvent.dataTransfer.dropEffect = "copy";
			})
			.on("dragleave", ev => {
				ev.currentTarget.classList.remove("is-drag-over");
			})
			.on("drop", ev => {
				ev.preventDefault();
				ev.currentTarget.classList.remove("is-drag-over");
				const raw = ev.originalEvent.dataTransfer.getData("text/plain");
				const value = Number(String(raw).replace("+", ""));
				_assignStat(ev.currentTarget.dataset.statKey, value);
			});
		_updateStatScoreChips();

		html.find("[name='onboard-possession']").on("change", ev => {
			const slug    = ev.currentTarget.value;
			const checked = ev.currentTarget.checked;
			const pickCount = this._rawPossessions?.pickCount ?? 0;
			if (checked) {
				if (this._selections.possessions.length < pickCount && !this._selections.possessions.includes(slug)) {
					this._selections.possessions.push(slug);
				} else { ev.currentTarget.checked = false; return; }
			} else {
				this._selections.possessions = this._selections.possessions.filter(s => s !== slug);
			}
			ev.currentTarget.closest(".stonetop-onboarding-card--possession")
				?.classList.toggle("is-selected", ev.currentTarget.checked);
			html.find(".stonetop-onboarding-possession-count").text(this._selections.possessions.length);
			const atLimit = this._selections.possessions.length >= pickCount;
			html.find("[name='onboard-possession']:not([data-preselected])").each((_, el) => {
				if (!el.checked) el.disabled = atLimit;
			});
			_refreshNextButton();
		});

		// ── Starting Moves ────────────────────────────────────────────
		html.find("[name='onboard-move']").on("change", ev => {
			const id      = ev.currentTarget.value;
			const checked = ev.currentTarget.checked;
			const limit   = this._movePickCount;
			if (checked) {
				if (this._selections.moves.length < limit && !this._selections.moves.includes(id)) {
					this._selections.moves.push(id);
				} else { ev.currentTarget.checked = false; return; }
			} else {
				this._selections.moves = this._selections.moves.filter(m => m !== id);
			}
			ev.currentTarget.closest(".stonetop-onboarding-card--move")
				?.classList.toggle("is-selected", ev.currentTarget.checked);
			html.find(".stonetop-onboarding-move-count").text(this._selections.moves.length);
			const atLimit = this._selections.moves.length >= limit;
			html.find("[name='onboard-move']:not(:checked)").prop("disabled", atLimit);
			_refreshNextButton();
		});

		// ── Invocations ───────────────────────────────────────────────
		html.find("[name='onboard-invocation']").on("change", ev => {
			const slug    = ev.currentTarget.value;
			const checked = ev.currentTarget.checked;
			const limit   = this._rawInvocations?.startingCount ?? 2;
			if (checked) {
				if (this._selections.invocations.length < limit && !this._selections.invocations.includes(slug)) {
					this._selections.invocations.push(slug);
				} else { ev.currentTarget.checked = false; return; }
			} else {
				this._selections.invocations = this._selections.invocations.filter(s => s !== slug);
			}
			ev.currentTarget.closest(".stonetop-onboarding-card--invocation")
				?.classList.toggle("is-selected", ev.currentTarget.checked);
			html.find(".stonetop-onboarding-invocation-count").text(this._selections.invocations.length);
			const atLimit = this._selections.invocations.length >= limit;
			html.find("[name='onboard-invocation']:not(:checked)").prop("disabled", atLimit);
			_refreshNextButton();
		});

		// ── Initiates ─────────────────────────────────────────────────
		html.find("[name='onboard-initiate']").on("change", ev => {
			const slug    = ev.currentTarget.value;
			const checked = ev.currentTarget.checked;
			const bg      = this._getInitiatesData();
			const [, maxCount] = this._initiatesCountRange(bg);
			if (checked) {
				if (this._selections.initiates.length < maxCount && !this._selections.initiates.includes(slug)) {
					this._selections.initiates.push(slug);
				} else { ev.currentTarget.checked = false; return; }
			} else {
				this._selections.initiates = this._selections.initiates.filter(s => s !== slug);
			}
			ev.currentTarget.closest(".stonetop-onboarding-card--initiate")
				?.classList.toggle("is-selected", ev.currentTarget.checked);
			html.find(".stonetop-onboarding-initiate-count").text(this._selections.initiates.length);
			const atLimit = this._selections.initiates.length >= maxCount;
			html.find("[name='onboard-initiate']:not(:checked)").prop("disabled", atLimit);
			_refreshNextButton();
		});

		// ── Initiate Details ─────────────────────────────────────────
		html.find("[data-onboard-initiate-radio]").on("change", ev => {
			const { slug, rowIdx } = ev.currentTarget.dataset;
			const rowI = Number(rowIdx);
			this._selections.initiateDetails[slug] ??= {};
			const det = this._selections.initiateDetails[slug];
			const isPronoun = ev.currentTarget.dataset.isPronoun === "true";
			if (isPronoun) {
				det.pronoun = ev.currentTarget.value;
				html.find(`.onboard-initiate-custom[data-slug="${slug}"]`).val("");
			} else {
				det.rows ??= {};
				det.rows[rowI] = ev.currentTarget.value;
			}
			this._setSelectedOption(ev.currentTarget.closest(".stonetop-onboarding-initiate-options"), ev.currentTarget);
			_refreshNextButton();
		});
		html.find(".onboard-initiate-custom").on("input", ev => {
			const { slug, rowIdx } = ev.currentTarget.dataset;
			this._selections.initiateDetails[slug] ??= {};
			this._selections.initiateDetails[slug].pronoun = ev.currentTarget.value;
			html.find(`[data-onboard-initiate-radio][data-slug="${slug}"][data-row-idx="${rowIdx}"]`)
				.prop("checked", false);
			this._setSelectedOption(ev.currentTarget.closest(".stonetop-onboarding-initiate-options"));
			_refreshNextButton();
		});

		// ── Crew ──────────────────────────────────────────────────────
		html.find(".onboard-crew-name").on("input", ev => {
			this._selections.crew.name = ev.currentTarget.value;
		});

		html.find("[name='onboard-crew-tag']").on("change", ev => {
			const tag     = ev.currentTarget.value;
			const checked = ev.currentTarget.checked;
			const limit   = this._rawCrew?.additionalTagCount ?? 2;
			if (checked) {
				if (this._selections.crew.tags.length < limit && !this._selections.crew.tags.includes(tag)) {
					this._selections.crew.tags.push(tag);
				} else { ev.currentTarget.checked = false; return; }
			} else {
				this._selections.crew.tags = this._selections.crew.tags.filter(t => t !== tag);
			}
			ev.currentTarget.closest(".stonetop-onboarding-tag-option")
				?.classList.toggle("is-selected", ev.currentTarget.checked);
			html.find(".stonetop-onboarding-crew-tag-count").text(this._selections.crew.tags.length);
			const atLimit = this._selections.crew.tags.length >= limit;
			html.find("[name='onboard-crew-tag']:not([data-auto])").each((_, el) => {
				if (!el.checked) el.disabled = atLimit;
			});
			_refreshNextButton();
		});
		html.find("[name='onboard-crew-instinct']").on("change", ev => {
			this._selections.crew.instinct = ev.currentTarget.value;
			_refreshNextButton();
		});
		html.find("[name='onboard-crew-cost']").on("change", ev => {
			this._selections.crew.cost = ev.currentTarget.value;
			_refreshNextButton();
		});

		// ── Animal Companion ─────────────────────────────────────────
		html.find("[name='onboard-ac-type']").on("change", ev => {
			this._selections.animalCompanion.type   = ev.currentTarget.value;
			this._selections.animalCompanion.traits = []; // reset traits on type change
			this._selections.animalCompanion.kind   = "";
			this.render(false);
		});
		const _refreshAnimalCompanionKind = () => {
			html.find(".stonetop-onboarding-ac-kind-options .stonetop-onboarding-appearance-option")
				.removeClass("is-selected");
			html.find("[name='onboard-ac-kind']:checked")
				.closest(".stonetop-onboarding-appearance-option")
				.addClass("is-selected");
		};
		html.find("[name='onboard-ac-kind']").on("change", ev => {
			const value = ev.currentTarget.value;
			this._selections.animalCompanion.kind = value === "custom"
				? html.find(".onboard-ac-kind-custom-input").val().trim()
				: value;
			_refreshAnimalCompanionKind();
			_refreshNextButton();
		});
		html.find(".onboard-ac-kind-custom-input").on("input", ev => {
			const value = ev.currentTarget.value.trim();
			this._selections.animalCompanion.kind = value;
			html.find("[name='onboard-ac-kind'][value='custom']").prop("checked", true);
			_refreshAnimalCompanionKind();
			_refreshNextButton();
		});
		html.find("[name='onboard-ac-trait']").on("change", ev => {
			const trait   = ev.currentTarget.value;
			const checked = ev.currentTarget.checked;
			const typeData = this._rawAnimalCompanion?.types?.find(t => t.slug === this._selections.animalCompanion.type);
			const limit = typeData?.pickCount ?? 0;
			if (checked) {
				if (this._selections.animalCompanion.traits.length < limit && !this._selections.animalCompanion.traits.includes(trait)) {
					this._selections.animalCompanion.traits.push(trait);
				} else { ev.currentTarget.checked = false; return; }
			} else {
				this._selections.animalCompanion.traits = this._selections.animalCompanion.traits.filter(t => t !== trait);
			}
			ev.currentTarget.closest(".stonetop-onboarding-tag-option")
				?.classList.toggle("is-selected", ev.currentTarget.checked);
			html.find(".stonetop-onboarding-ac-trait-count").text(this._selections.animalCompanion.traits.length);
			const atLimit = this._selections.animalCompanion.traits.length >= limit;
			html.find("[name='onboard-ac-trait']:not(:checked)").prop("disabled", atLimit);
			_refreshNextButton();
		});
		html.find("[name='onboard-ac-instinct']").on("change", ev => {
			this._selections.animalCompanion.instinct = ev.currentTarget.value;
			_refreshNextButton();
		});
		html.find("[name='onboard-ac-cost']").on("change", ev => {
			this._selections.animalCompanion.cost = ev.currentTarget.value;
			_refreshNextButton();
		});
		html.find(".onboard-ac-name").on("input", ev => {
			this._selections.animalCompanion.name = ev.currentTarget.value;
		});

		// ── Lore picks ────────────────────────────────────────────────
		html.find("[name^='onboard-lore-pick-']").on("change", ev => {
			const { section, option } = ev.currentTarget.dataset;
			const key     = `${section}:${option}`;
			const checked = ev.currentTarget.checked;
			const rawSec  = this._rawLore.find(s => s.slug === section);
			const pickMax = this._parseLorePickMax(rawSec);

			if (checked) {
				const current = this._countLoreSectionPicks(section);
				if (current >= pickMax) {
					ev.currentTarget.checked = false;
					return;
				}
				this._selections.lore.picks[key] = 1;
			} else {
				this._selections.lore.picks[key] = 0;
			}

			ev.currentTarget.closest(".stonetop-onboarding-lore-pick")
				?.classList.toggle("is-selected", ev.currentTarget.checked);

			const newCount = this._countLoreSectionPicks(section);
			const atLimit  = pickMax < Infinity && newCount >= pickMax;
			html.find(`[name='onboard-lore-pick-${section}']`).each((_, el) => {
				if (!el.checked) el.disabled = atLimit;
				el.closest(".stonetop-onboarding-lore-pick")
					?.classList.toggle("stonetop-onboarding-lore-pick--disabled", !el.checked && atLimit);
			});
			html.find(".stonetop-onboarding-lore-pick-count").text(newCount);
			_refreshNextButton();
		});

		// ── Lore texts ────────────────────────────────────────────────
		html.find(".onboard-lore-text").on("input", ev => {
			const { section, option } = ev.currentTarget.dataset;
			const key = `${section}:${option}`;
			this._selections.lore.texts[key] = ev.currentTarget.value;
			_refreshNextButton();
		});

		// ── Name chips ────────────────────────────────────────────────
		html.find("[name='onboard-seeker-major-arcanum']").on("change", ev => {
			this._selections.arcana.major = ev.currentTarget.value;
			html.find("[name='onboard-seeker-major-arcanum']").each((_, el) => {
				el.closest(".stonetop-onboarding-arcana-option")
					?.classList.toggle("is-selected", el.checked);
			});
			_refreshNextButton();
		});

		html.find("[name^='onboard-seeker-minor-role-']").on("change", ev => {
			const slug = ev.currentTarget.dataset.slug;
			const role = ev.currentTarget.value;

			// Clear conflicting old assignments and uncheck their radios in the DOM.
			for (const [key, value] of Object.entries(this._selections.arcana.minorRoles)) {
				if ((key === role || value === slug) && value) {
					const old = html.find(`[name='onboard-seeker-minor-role-${value}'][value='${key}']`)[0];
					if (old) old.checked = false;
					this._selections.arcana.minorRoles[key] = "";
				}
			}
			this._selections.arcana.minorRoles[role] = slug;

			// Update is-selected on each minor card without re-rendering.
			html.find(".stonetop-onboarding-arcana-option--minor-role").each((_, el) => {
				const anyChecked = Array.from(el.querySelectorAll("input[type='radio']")).some(r => r.checked);
				el.classList.toggle("is-selected", anyChecked);
			});
			const assigned = Object.values(this._selections.arcana.minorRoles).filter(Boolean).length;
			html.find(".stonetop-onboarding-seeker-minor-count").text(assigned);
			_refreshNextButton();
		});

		html.find(".stonetop-onboarding-redraw-minor").on("click", async () => {
			const stepEl = html.find(".stonetop-onboarding-step")[0];
			const scrollTop = stepEl?.scrollTop ?? 0;
			const arcana = await this._loadArcanaOptions();
			this._drawSeekerMinorArcana(arcana.minor);
			await this.render(false);
			if (stepEl) stepEl.scrollTop = scrollTop;
		});

		html.find(".onboard-name-chip").on("click", ev => {
			const name = ev.currentTarget.dataset.name;
			this._selections.name = name;
			html.find(".onboard-name-input").val(name);
		});

		// ── Arcana preview tooltips (fixed-position to escape modal overflow) ──
		html.find(".stonetop-onboarding-arcana-option")
			.on("mouseenter", ev => this._showArcanaPreview(ev.currentTarget))
			.on("mouseleave", () => this._removeArcanaPreview());

		// ── Bold-word hover tooltips ───────────────────────────────────
		const bindWordTooltip = (el) => {
			if (el.dataset.tooltipBound) return;
			el.dataset.tooltipBound = "1";
			el.classList.add("stonetop-onboarding-lookup");
			el.addEventListener("mouseenter", async ev => {
				const anchor = ev.currentTarget;
				this._hoveredAnchor = anchor;
				const text = anchor.textContent.trim();
				const description = await this._lookupWord(text);
				if (this._hoveredAnchor !== anchor) return;
				if (description) this._showWordTooltip(anchor, text, description);
			});
			el.addEventListener("mouseleave", () => {
				this._hoveredAnchor = null;
				this._removeTooltip();
			});
		};

		html.find(".stonetop-onboarding-lookup").each((_, el) => bindWordTooltip(el));

		const pendingLookups = [];
		html.find(".stonetop-onboarding-card-desc strong").each((_, el) => {
			const text = el.textContent.trim();
			const key = text.toLowerCase();
			const cached = this._wordCache.get(key);
			if (cached) {
				bindWordTooltip(el);
			} else if (cached !== null) {
				pendingLookups.push([el, text]);
			}
		});

		void Promise.all(pendingLookups.map(async ([el, text]) => {
			const description = await this._lookupWord(text);
			if (description && el.isConnected) bindWordTooltip(el);
		}));

		_refreshNextButton();
	}

	// ── Shared DOM helpers ────────────────────────────────────────────

	_setSelectedOption(container, selectedEl = null) {
		if (!container) return;
		container.querySelectorAll(".stonetop-onboarding-appearance-option")
			.forEach(el => el.classList.remove("is-selected"));
		selectedEl?.closest(".stonetop-onboarding-appearance-option")?.classList.add("is-selected");
	}

	// ── Navigation ────────────────────────────────────────────────────

	_clearPopups() {
		this._removeTooltip();
		this._removeArcanaPreview();
	}

	async _goBack() {
		this._clearPopups();
		await this.close();
		if (this._onBack) this._onBack();
	}

	async _skip() {
		this._clearPopups();
		const next = this._step + 1;
		if (next >= this._steps.length) {
			if (this._onComplete) await this._onComplete(this._selections);
			this.close();
			return;
		}
		this._step = next;
		this.render(false);
	}

	_navigate(dir) {
		this._clearPopups();
		if (dir > 0 && !this._isStepComplete()) return;
		const next = this._step + dir;
		if (next < 0 || next >= this._steps.length) return;
		this._step = next;
		this.render(false);
	}

	async _confirm() {
		if (!this._isStepComplete()) return;
		if (this._onComplete) await this._onComplete(this._selections);
		this.close();
	}

	async _saveProgress() {
		this._clearPopups();
		if (this._onSave) await this._onSave(this._selections);
		new Dialog({
			title: game.i18n.localize("stonetop.onboarding.savedTitle"),
			content: `<p>${game.i18n.localize("stonetop.onboarding.savedContent")}</p>`,
			buttons: {
				close: {
					label: game.i18n.localize("stonetop.onboarding.closeForNow"),
					callback: () => this.close(),
				},
				continue: {
					label: game.i18n.localize("stonetop.onboarding.continueEditing"),
				},
			},
			default: "continue",
		}).render(true);
	}

	async close(options) {
		this._clearPopups();
		return super.close(options);
	}

	// ── Word tooltip ──────────────────────────────────────────────────

	_removeTooltip() {
		document.querySelector(".stonetop-word-tooltip")?.remove();
	}

	_removeArcanaPreview() {
		document.querySelector(".stonetop-arcana-preview-popup")?.remove();
	}

	_showArcanaPreview(anchor) {
		this._removeArcanaPreview();
		const source = anchor.querySelector(".stonetop-onboarding-arcana-preview");
		if (!source?.children.length) return;
		const popup = document.createElement("div");
		popup.className = "stonetop-arcana-preview-popup";
		popup.innerHTML = source.innerHTML;
		// Centre horizontally on the card; extra vertical gap clears the modal header.
		this._positionPopup(popup, anchor, { align: "center", gap: 100 });
	}

	_showWordTooltip(anchor, text, description) {
		this._removeTooltip();
		const tip = document.createElement("div");
		tip.className = "stonetop-word-tooltip";
		tip.innerHTML =
			`<p class="stonetop-word-tooltip-name">${text}</p>` +
			`<div class="stonetop-word-tooltip-desc">${description}</div>`;
		this._positionPopup(tip, anchor, { gap: 6, flipBelow: true });
	}

	_positionPopup(el, anchor, { align = "left", gap = 6, flipBelow = false } = {}) {
		document.body.appendChild(el);
		const ar = anchor.getBoundingClientRect();
		const pr = el.getBoundingClientRect();
		let top  = ar.top - pr.height - gap;
		let left = align === "center"
			? ar.left + ar.width / 2 - pr.width / 2
			: ar.left;
		if (flipBelow && top < 8) top = ar.bottom + gap;
		left = Math.max(8, Math.min(left, window.innerWidth - pr.width - 8));
		el.style.top  = `${top}px`;
		el.style.left = `${left}px`;
	}

	async _lookupWord(text) {
		const key = text.toLowerCase();
		if (this._wordCache.has(key)) return this._wordCache.get(key);
		const packs = game.packs.filter(
			p => p.metadata.packageName === "stonetop_pwd" && p.metadata.type === "Item"
		);
		for (const pack of packs) {
			await pack.getIndex();
			const entry = pack.index.find(e => e.name.toLowerCase() === key);
			if (!entry) continue;
			const doc  = await pack.getDocument(entry._id);
			const desc = doc?.system?.description ?? null;
			this._wordCache.set(key, desc);
			return desc;
		}
		this._wordCache.set(key, null);
		return null;
	}
}
