export class CharacterOnboardingDialog extends Application {
	constructor(playbookDoc, onComplete, options = {}) {
		super(options);
		this._playbookDoc        = playbookDoc;
		this._onComplete         = onComplete;
		this._wordCache          = new Map();
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
		this._movePickCount      = this._parseMovePickCount();
		this._movesCache         = null;

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
			crew:            { name: "", tags: [], instinct: "", cost: "" },
			animalCompanion: { type: "", traits: [], name: "", instinct: "", cost: "" },
		};

		this._steps = this._buildSteps();
		this._step  = 0;
	}

	// ── Step management ───────────────────────────────────────────────

	_buildSteps() {
		const steps = [];
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

	_parseMovePickCount() {
		const note = this._playbookDoc.flags?.stonetop?.moves?.startingMovesNote ?? "";
		const m = note.match(/\b(\d+)\s+(?:more\s+|other\s+)?(?:move[s]?\s+)?of\s+your\s+choice/i);
		return m ? parseInt(m[1], 10) : 0;
	}

	async _loadPlaybookMoves() {
		const pack = game.packs.get("stonetop.playbook-moves");
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
		const required = this._parseStatScores().slice().sort((a, b) => a - b);
		const assigned = Object.values(this._selections.stats);
		if (assigned.some(v => v === null)) return false;
		const actual = assigned.map(Number).sort((a, b) => a - b);
		return required.length === actual.length && required.every((v, i) => v === actual[i]);
	}

	// ── Completion check ──────────────────────────────────────────────

	_isStepComplete() {
		const ac = this._selections.animalCompanion;
		switch (this._steps[this._step]) {
			case "background":     return !!this._selections.backgroundSlug;
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
				return this._selections.initiates.length >= min;
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
				       ac.traits.length >= typeData.pickCount &&
				       !!ac.instinct && !!ac.cost;
			}
			default: return true;
		}
	}

	// ── Foundry Application boilerplate ──────────────────────────────

	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id:        "stonetop-character-onboarding",
			template:  "modules/stonetop/templates/dialogs/character-onboarding.hbs",
			width:     660,
			height:    640,
			resizable: true,
			classes:   ["stonetop", "stonetop-onboarding"],
		});
	}

	get title() {
		return `New Character — ${this._playbookDoc.name}`;
	}

	// ── getData ───────────────────────────────────────────────────────

	async getData() {
		const stepType = this._steps[this._step] ?? null;
		const isFirst  = this._step === 0;
		const isLast   = this._step === this._steps.length - 1 || this._steps.length === 0;

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

		// ── Background ────────────────────────────────────────────────
		if (stepType === "background") {
			backgrounds = this._backgrounds.map(bg => ({
				slug:        bg.slug,
				label:       bg.label,
				description: bg.description ?? "",
				selected:    this._selections.backgroundSlug === bg.slug,
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
			appearanceLines = this._rawAppearance.map((opts, lineIdx) => ({
				lineIdx,
				options: opts.map(value => ({
					value,
					selected: this._selections.appearance[lineIdx] === value,
				})),
			}));
		}

		// ── Origin ────────────────────────────────────────────────────
		if (stepType === "origin") {
			origins = this._origins.map(o => ({
				region:   o.region,
				names:    o.names ?? [],
				selected: this._selections.originRegion === o.region,
			}));
		}

		// ── Stats ─────────────────────────────────────────────────────
		if (stepType === "stats") {
			const scores = this._parseStatScores();
			const poolCount = {};
			for (const v of scores) poolCount[v] = (poolCount[v] ?? 0) + 1;

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
					name:        doc.name,
					description: doc.system?.description ?? "",
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
						slug: opt.slug, label: opt.label, description: opt.description ?? "",
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
					label:       opt.label,
					description: opt.description ?? "",
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
				options: (bg?.options ?? []).map(opt => ({
					slug:        opt.slug,
					label:       opt.label,
					description: opt.description ?? "",
					isSelected:  chosen.has(opt.slug),
					disabled:    !chosen.has(opt.slug) && atLimit,
				})),
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
				bgTag,
				additionalTagCount: limit,
				selectedTagCount:   chosen.size,
				tags: (raw.availableTags ?? []).map(tag => {
					const isAuto     = tag === bgTag;
					const isSelected = isAuto || chosen.has(tag);
					return {
						slug: tag, label: tag, isAuto, isSelected,
						disabled: isAuto || (!isSelected && atLimit),
					};
				}),
				instincts: (raw.instincts ?? []).map(v => ({
					value: v, selected: this._selections.crew.instinct === v,
				})),
				costs: (raw.costs ?? []).map(v => ({
					value: v, selected: this._selections.crew.cost === v,
				})),
			};
		}

		// ── Animal Companion ─────────────────────────────────────────
		if (stepType === "animalCompanion") {
			const raw         = this._rawAnimalCompanion;
			const selType     = this._selections.animalCompanion.type;
			const typeData    = raw.types?.find(t => t.slug === selType) ?? null;
			const chosenTraits = new Set(this._selections.animalCompanion.traits);
			const traitAtLimit = chosenTraits.size >= (typeData?.pickCount ?? 0);
			acData = {
				types: (raw.types ?? []).map(t => ({
					slug: t.slug, label: t.label, examples: t.examples ?? "",
					hp: t.hp, armor: t.armor, damage: t.damage,
					selected: t.slug === selType,
				})),
				selectedType: typeData ? {
					slug:          typeData.slug,
					label:         typeData.label,
					hp:            typeData.hp,
					armor:         typeData.armor,
					damage:        typeData.damage,
					pickCount:     typeData.pickCount,
					selectedCount: chosenTraits.size,
					traits: (typeData.traits ?? []).map(trait => ({
						slug: trait, label: trait,
						isSelected: chosenTraits.has(trait),
						disabled:   !chosenTraits.has(trait) && traitAtLimit,
					})),
				} : null,
				instincts: (raw.instincts ?? []).map(v => ({
					value: v, selected: this._selections.animalCompanion.instinct === v,
				})),
				costs: (raw.costs ?? []).map(v => ({
					value: v, selected: this._selections.animalCompanion.cost === v,
				})),
				companionName: this._selections.animalCompanion.name,
			};
		}

		return {
			playbookName:      this._playbookDoc.name,
			playbookImg:       this._playbookDoc.img,
			stepType,
			stepNumber:        this._step + 1,
			stepCount:         this._steps.length,
			isFirst, isLast,
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
			isAnimalCompanion: stepType === "animalCompanion",
			progressDots,
			backgrounds, instincts, appearanceLines, origins,
			selectedInstinct:  this._selections.instinctValue,
			selectedName:      this._selections.name,
			statBoxes, statScores, statScoresDisplay,
			possession,
			moveOptions, movePickNote,
			movePickCount:      this._movePickCount,
			moveSelectedCount:  this._selections.moves.length,
			invocationData, initiatesData, crewData, acData,
			stepComplete:       this._isStepComplete(),
		};
	}

	// ── Listeners ─────────────────────────────────────────────────────

	activateListeners(html) {
		super.activateListeners(html);

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
			this._selections.backgroundSlug = ev.currentTarget.value;
			this._selections.initiates = []; // reset if background changes
			this._rebuildDynamicSteps();
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
			const row = ev.currentTarget.closest(".stonetop-onboarding-appearance-row");
			if (row) {
				row.querySelectorAll(".stonetop-onboarding-appearance-option").forEach(el => el.classList.remove("is-selected"));
				ev.currentTarget.closest(".stonetop-onboarding-appearance-option")?.classList.add("is-selected");
			}
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
			const scores = this._parseStatScores();
			const poolCount = {};
			for (const v of scores) poolCount[v] = (poolCount[v] ?? 0) + 1;
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

		html.find("[name^='onboard-stat-']").on("change", ev => {
			const key = ev.currentTarget.name.replace("onboard-stat-", "");
			const raw = ev.currentTarget.value;
			this._selections.stats[key] = raw === "" ? null : Number(raw);
			ev.currentTarget.closest(".stonetop-onboarding-stat-box")
				?.classList.toggle("is-filled", raw !== "");
			_updateStatDropdowns();
			_refreshNextButton();
		});

		// ── Special Possessions ───────────────────────────────────────
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
			this.render(false);
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

		// ── Name chips ────────────────────────────────────────────────
		html.find(".onboard-name-chip").on("click", ev => {
			const name = ev.currentTarget.dataset.name;
			this._selections.name = name;
			html.find(".onboard-name-input").val(name);
		});

		// ── Bold-word hover tooltips ───────────────────────────────────
		html.find(".stonetop-onboarding-card-desc strong").each((_, el) => {
			el.classList.add("stonetop-onboarding-lookup");
		});
		html.find(".stonetop-onboarding-lookup")
			.on("mouseenter", async ev => {
				const anchor = ev.currentTarget;
				this._hoveredAnchor = anchor;
				const text = anchor.textContent.trim();
				const description = await this._lookupWord(text);
				if (this._hoveredAnchor !== anchor) return;
				if (description) this._showWordTooltip(anchor, text, description);
			})
			.on("mouseleave", () => {
				this._hoveredAnchor = null;
				this._removeTooltip();
			});

		_refreshNextButton();
	}

	// ── Navigation ────────────────────────────────────────────────────

	_skip() {
		this._removeTooltip();
		const next = this._step + 1;
		if (next >= this._steps.length) return;
		this._step = next;
		this.render(false);
	}

	_navigate(dir) {
		this._removeTooltip();
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

	async close(options) {
		this._removeTooltip();
		return super.close(options);
	}

	// ── Word tooltip ──────────────────────────────────────────────────

	_removeTooltip() {
		document.querySelector(".stonetop-word-tooltip")?.remove();
	}

	_showWordTooltip(anchor, text, description) {
		this._removeTooltip();
		const tip = document.createElement("div");
		tip.className = "stonetop-word-tooltip";
		tip.innerHTML =
			`<p class="stonetop-word-tooltip-name">${text}</p>` +
			`<div class="stonetop-word-tooltip-desc">${description}</div>`;
		document.body.appendChild(tip);

		const ar = anchor.getBoundingClientRect();
		const tr = tip.getBoundingClientRect();
		let top  = ar.top - tr.height - 6;
		let left = ar.left;
		if (top < 8) top = ar.bottom + 6;
		const maxLeft = window.innerWidth - tr.width - 8;
		if (left > maxLeft) left = maxLeft;
		if (left < 8)       left = 8;
		tip.style.top  = `${top}px`;
		tip.style.left = `${left}px`;
	}

	async _lookupWord(text) {
		const key = text.toLowerCase();
		if (this._wordCache.has(key)) return this._wordCache.get(key);
		const packs = game.packs.filter(
			p => p.metadata.packageName === "stonetop" && p.metadata.type === "Item"
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
