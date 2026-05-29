import {MoveResourceButton} from "./elements/move-resource-button.js";
import {BackgroundInputChoice} from "./elements/background-input-choice.js";
import {PossessionUseButton} from "./elements/possession-use-button.js";
import {OutfitMoveDialog} from "./dialogs/OutfitMoveDialog.js";
import {PlaybookPickerDialog} from "./dialogs/PlaybookPickerDialog.js";
import {CharacterOnboardingDialog} from "./dialogs/CharacterOnboardingDialog.js";

const STAT_TOOLTIPS = {
	str: "Your physical power and ability to use it. Roll +STR to Clash, or to Defy Danger with raw might or power.",
	dex: "Your grace and fine motor control. Roll +DEX to Let Fly, or to Defy Danger with speed, agility, finesse.",
	int: "Your memory, learning, and quick thinking. Roll +INT to Know Things, or to Defy Danger via expertise or a clever plan.",
	wis: "Your intuition, self-control, and awareness. Roll +WIS to Seek Insight, or when you rely on your willpower or senses to Defy Danger.",
	con: "Your stamina, grit, determination, and endurance. Roll +CON to Defend, or to Defy Danger by holding steady or enduring hardship.",
	cha: "Your ability to charm and connect with others, and to get a read on what others want. Roll +CHA to Persuade, or to Defy Danger socially.",
};

export function createStonetopCharacterSheetClass(Base) {
	return class StonetopCharacterSheet extends Base {
		_stonetopCharacter;
		_editMode = false;

		constructor(...args) {
			super(...args);
			this._stonetopCharacter = this.actor.typedActor;
		}

		static get defaultOptions() {
			return foundry.utils.mergeObject(super.defaultOptions, {
				classes: ["pbta", "stonetop", "sheet", "actor", "character"],
				width: 1680,
				height: 1050,
				tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "moves" }],
				dragDrop: [{ dragSelector: ".items-list .item" }],
			});
		}

		get template() {
			return "modules/stonetop/templates/actor/character.hbs";
		}

		async _render(force, options) {
			await super._render(force, options);
			this._injectHeaderToggle();
			this.element[0]?.classList.toggle("stonetop-edit-mode", this._editMode);
		}

		_injectHeaderToggle() {
			const header = this.element[0]?.querySelector(".window-header");
			if (!header || !this.isEditable) return;

			header.querySelector(".stonetop-header-toggle")?.remove();

			const label = document.createElement("label");
			label.className = "stonetop-edit-toggle stonetop-header-toggle";
			label.title = this._editMode ? "Lock Sheet" : "Edit Character";
			const checkbox = document.createElement("input");
			checkbox.type = "checkbox";
			checkbox.checked = this._editMode;
			checkbox.addEventListener("change", () => {
				this._editMode = !this._editMode;
				this.render(false);
			});

			const track = document.createElement("span");
			track.className = "stonetop-toggle-track";
			const thumb = document.createElement("span");
			thumb.className = "stonetop-toggle-thumb";
			const icon = document.createElement("i");
			icon.className = "fas fa-wrench";
			thumb.appendChild(icon);
			track.appendChild(thumb);

			label.appendChild(checkbox);
			label.appendChild(track);

			const title = header.querySelector(".window-title");
			header.insertBefore(label, title);
		}

		_getHeaderButtons() {
			const buttons  = super._getHeaderButtons();
			const steading = this._stonetopCharacter?.getSteadingActor();
			const sheetIdx = buttons.findIndex(b => b.class === "configure-sheet");
			const insertAt = sheetIdx >= 0 ? sheetIdx : 0;
			buttons.splice(insertAt, 0, {
				label:   steading?.name ?? "",
				class:   "stonetop-open-steading" + (steading ? "" : " stonetop-open-steading--unset"),
				icon:    "fas fa-map-marker-alt",
				onclick: () => {
					if (steading) steading.sheet.render(true, { focus: true });
					else ui.notifications.warn(game.i18n.localize("stonetop.steading.notLinked"));
				},
			});
			buttons.splice(insertAt, 0, {
				label:   game.i18n.localize("stonetop.newCharacter.buttonLabel"),
				class:   "stonetop-new-character",
				icon:    "fas fa-user-plus",
				onclick: () => this._onNewCharacter(),
			});
			return buttons;
		}

		async getData() {
			const context = await super.getData();
			context.stonetop = await this._stonetopCharacter.buildSnapshot();
			context.stonetop.hideUnselected = this.actor.getFlag('stonetop', 'hideUnselected') ?? false;
			context.stonetop.editMode = this._editMode;
			context.stonetop.showPostDeath = !!context.stonetop.postDeathInsert?.activeSlug;
			// reassign stonetop to system
			context.system.attributes.armor.value = context.stonetop.vitals.armor
			context.system.attributes.xp.max = context.stonetop.vitals.xp.max
			// Followers tab — build data from flags + playbook definition.
			// Pass smallItemLimit from the already-computed snapshot so crew gear
			// uses the exact same prosperity value as outfit inventory items.
			const playbookDoc = await this._stonetopCharacter.playbook();
			context.stonetop.followers    = this._buildFollowersData(playbookDoc, context.stonetop.inventory?.smallItemLimit ?? null);
			context.stonetop.hasFollowers = !!(
				context.stonetop.followers.animalCompanion ||
				context.stonetop.followers.crew ||
				context.stonetop.followers.initiates?.length
			);
			return context;
		}

		_buildFollowersData(playbookDoc, smallItemLimit = null) {
			const pf    = playbookDoc?.flags?.stonetop ?? {};
			const sf    = this.actor.flags?.stonetop   ?? {};

			// ── Animal Companion (Ranger) ──────────────────────────────
			let animalCompanion = null;
			const acSlug = sf.animalCompanion?.type;
			if (acSlug) {
				const typeData = (pf.animalCompanion?.types ?? []).find(t => t.slug === acSlug);
				animalCompanion = {
					name:     sf.animalCompanion?.name     ?? "",
					type:     typeData?.label              ?? acSlug,
					hp:       typeData?.hp                 ?? "—",
					armor:    typeData?.armor              ?? "—",
					damage:   typeData?.damage             ?? "—",
					traits:   sf.animalCompanion?.traits   ?? [],
					instinct: sf.animalCompanion?.instinct ?? "",
					cost:     sf.animalCompanion?.cost     ?? "",
				};
			}

			// ── Crew (Marshal) ─────────────────────────────────────────
			// Hardcoded fallback until LevelDB pack is rebuilt with the marshal.json inventory changes.
			const CREW_INVENTORY_FALLBACK = [
				{ slug: "hatchet",     label: "<strong>Hatchet</strong>, iron (<em>hand, thrown</em>, x <em>piercing</em>)",                       weight: 1 },
				{ slug: "spear",       label: "<strong>Spear</strong>, iron (<em>close</em>, x <em>piercing</em>)",                                weight: 1 },
				{ slug: "bow-arrows",  label: "<strong>Bow &amp; iron arrows</strong> (<em>near</em>, x <em>piercing</em>, ○ low ammo, ○ all out)", weight: 1 },
				{ slug: "shield",      label: "<strong>Shield</strong> (+1 armor, +1 Readiness on 7+ to Defend)",                         weight: 2 },
				{ slug: "thick-hides", label: "<strong>Thick hides</strong> (1 armor, <em>warm</em>)",                                    weight: 2 },
				{ slug: "cloak",       label: "<strong>Cloak</strong> (<em>warm</em>)",                                                   weight: 1 },
			];
			let crew = null;
			if (sf.crew?.tags?.length || sf.crew?.instinct || sf.crew?.cost || sf.crew?.name || sf.crew?.individuals?.length) {
				const loyaltyMax      = 3;
				const loyaltyVal      = sf.crew?.loyalty ?? 0;
				const gearFlags       = sf.crew?.gear ?? {};
				const inventoryDef    = pf.crew?.inventory?.length ? pf.crew.inventory : CREW_INVENTORY_FALLBACK;
				// Supplies: 6 independent sets, each with (4+Prosperity) circles.
				// smallItemLimit comes from buildSnapshot() — same value driving outfit inventory.
				const pipsPerSet      = smallItemLimit ?? 5;
				const prosperity      = smallItemLimit !== null ? smallItemLimit - 4 : null;
				const suppliesRaw     = sf.crew?.supplies;
				const suppliesArr     = Array.isArray(suppliesRaw) ? suppliesRaw : Array(6).fill(0);
				// Same piercing substitution used for outfit items on the character sheet.
				// Crew gear labels use plain "x piercing"; outfit item notes use "x <em>piercing</em>".
				const applyPiercing   = (label) => {
					if (!label?.includes('x piercing')) return label;
					if (prosperity === null) return label;
					const html      = label.includes('x <em>piercing</em>');
					const token     = html ? 'x <em>piercing</em>' : 'x piercing';
					const removalRe = html ? /(, )?x <em>piercing<\/em>(, )?/ : /(, )?x piercing(, )?/;
					if (prosperity <= -1) return label.replace(token, html ? '<em>crude</em>' : 'crude');
					if (prosperity === 0)  return label.replace(removalRe, (_, pre, post) => post ? (pre ?? '') : '').trim();
					const val = Math.min(prosperity, 2);
					return label.replace(token, html ? `${val} <em>piercing</em>` : `${val} piercing`);
				};
				crew = {
					name:      sf.crew.name     ?? "",
					tags:      sf.crew.tags     ?? [],
					instinct:  sf.crew.instinct ?? "",
					cost:      sf.crew.cost     ?? "",
					loyalty:   Array.from({ length: loyaltyMax }, (_, i) => ({ filled: i < loyaltyVal, index: i })),
					gear:      inventoryDef.map(item => {
						const flagVal     = gearFlags[item.slug];
						// backward-compat: old boolean true → all pips filled
						const filledCount = typeof flagVal === "number" ? flagVal : (flagVal ? item.weight : 0);
						return {
							...item,
							label:   applyPiercing(item.label),
							checked: filledCount >= item.weight,
							pips:    Array.from({ length: item.weight }, (_, i) => ({ index: i, filled: i < filledCount })),
						};
					}),
					supplySets: Array.from({ length: 6 }, (_, setIdx) => {
						const filled = suppliesArr[setIdx] ?? 0;
						return {
							index: setIdx,
							pips:  Array.from({ length: pipsPerSet }, (_, pipIdx) => ({
								setIndex: setIdx,
								pipIndex: pipIdx,
								filled:   pipIdx < filled,
							})),
						};
					}),
					individuals:       (sf.crew?.individuals ?? []).map((ind, idx) => ({ ...ind, index: idx })),
					individualOptions: pf.crew?.individualOptions ?? {},
				};
			}

			// ── Initiates of Danu (Blessed + Initiate background) ──────
			let initiates = null;
			const bgChoices  = sf.background?.choices ?? {};
			const initiateBg = (pf.backgrounds ?? []).find(b => b.slug === "initiate");
			if (initiateBg?.choices?.options?.length) {
				const selected = initiateBg.choices.options.filter(opt => bgChoices[opt.slug]);
				if (selected.length) {
					initiates = selected.map(opt => ({
						slug:     opt.slug,
						label:    opt.label,
						subtitle: opt.subtitle  ?? "",
						hp:       opt.hp        ?? "—",
						armor:    opt.armor     ?? "—",
						damage:   opt.damage    ?? "—",
					}));
				}
			}

			return { animalCompanion, crew, initiates };
		}

		activateListeners(html) {
			super.activateListeners(html);

			html[0].addEventListener("dragover", (ev) => ev.preventDefault());
			html[0].addEventListener("drop", async (ev) => {
				ev.stopImmediatePropagation();
				const data = TextEditor.getDragEventData(ev);
				if (!data) return;
				if (data?.type === "Actor") {
					const doc = await fromUuid(data.uuid);
					if (doc?.system?.customType === "stonetop") {
						await this.actor.setFlag("stonetop", "steadingId", doc.id);
						this.render(false);
					}
					return;
				}
				if (data?.type === "Item") {
					if (data.uuid) {
						const doc = await fromUuid(data.uuid);
						if (doc?.type === "playbook") {
							await this._onDropPlaybook(doc);
							return;
						}
					}
					this._onDropItem(ev, data);
				}
			}, true);

			const dropZone = html[0].querySelector(".stonetop-playbook-drop-zone");
			if (dropZone) {
				dropZone.addEventListener("dragenter", () => dropZone.classList.add("drag-over"));
				dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
				dropZone.addEventListener("drop", () => dropZone.classList.remove("drag-over"));
			}

			html.find(".cell--stats .stat-value").each((_, el) => {
				el.value = el.value.replace(/^\+/, "");
			});
			html.find(".cell--stats .stat[data-stat]").each((_, el) => {
				$(el).append(`<span class="stonetop-stat-abbr">(${el.dataset.stat.toUpperCase()})</span>`);
				const tooltip = STAT_TOOLTIPS[el.dataset.stat];
				if (tooltip) {
					el.dataset.tooltip = tooltip;
					el.dataset.tooltipDirection = "DOWN";
				}
			});

			html.find(".stonetop-hide-unselected-check").on("change", async (ev) => {
				await this.actor.setFlag('stonetop', 'hideUnselected', ev.currentTarget.checked);
			});

			html[0].querySelector(".stonetop-portrait")?.addEventListener("click", ev => {
				if (this._editMode) return;
				ev.preventDefault();
				ev.stopPropagation();
				new ImagePopout(this.actor.img, { title: this.actor.name }).render(true);
			});

			html[0].addEventListener("click", ev => {
				if (this._editMode) return;
				const nameEl = ev.target.closest(".stonetop-item-name");
				if (!nameEl) return;
				ev.preventDefault();
				const li = nameEl.closest("li");
				const name = nameEl.textContent.trim();
				const description = li.querySelector(".stonetop-item-description")?.innerHTML ?? "";
				const playbookName = html[0].querySelector(".stonetop-playbook-drop-zone:not(.empty)")?.textContent?.trim() ?? "";
				const speaker = ChatMessage.getSpeaker({ actor: this.actor });
				speaker.alias = playbookName ? `${this.actor.name} ${playbookName}` : this.actor.name;
				ChatMessage.create({
					content: `<div class="stonetop-chat-move"><h3 class="stonetop-chat-move-name">${name}</h3><div class="stonetop-chat-move-description">${description}</div></div>`,
					speaker,
				});
			});

			if (!this.isEditable) return;

			if (this._editMode) {
				html.find("[name=stonetop-background]").on("change", this._onBackgroundChange.bind(this));
				html.find("[name=stonetop-instinct]").on("change", ev => {
					const val = ev.currentTarget.value;
					html.find(".stonetop-instinct-custom").val(val);
					this._stonetopCharacter.instinct.select(val);
				});
				html.find(".stonetop-instinct-custom").on("change", ev =>
					this._stonetopCharacter.instinct.select(ev.currentTarget.value.trim())
				);
				html.find(".stonetop-appearance-radio").on("change", this._onAppearanceChange.bind(this));
				html.find("[name=stonetop-origin]").on("change", ev =>
					this._stonetopCharacter.origin.select(ev.currentTarget.value)
				);
				html.find(".stonetop-origin-name-check").on("change", this._onOriginNameClick.bind(this));
				html.find(".stonetop-move-check").on("change", this._onMoveCheck.bind(this));
				html.find(".stonetop-repeat-check").on("change", this._onRepeatCheck.bind(this));
				html.find(".stonetop-bg-choice").on("change", this._onBgChoiceChange.bind(this));
			}
			html[0].addEventListener("click", ev => {
				const btn = ev.target.closest(".stonetop-item-resource-check");
				if (!btn) return;
				ev.stopPropagation();
				ev.stopImmediatePropagation();
				if (btn.dataset.moveName !== undefined) {
					this._onMoveResourceChange({ currentTarget: btn });
				} else {
					this._onPossessionUseChange({ currentTarget: btn });
				}
			}, true);
			html.find(".stonetop-inventory-item-check").on("change", this._onInventoryItemCheck.bind(this));
			html[0].addEventListener("click", ev => {
				const btn = ev.target.closest(".stonetop-inventory-resource-btn");
				if (!btn) return;
				this._onInventoryResource({ currentTarget: btn });
			}, true);
			html.find(".stonetop-inv-add-btn").on("click", this._onAddInventoryItem.bind(this));
			html.find(".stonetop-inv-delete").on("click", this._onDeleteCustomInventoryItem.bind(this));
			html.find(".stonetop-outfit-load-radio").on("change", this._onOutfitLoad.bind(this));
			html.find(".stonetop-possession-check").on("change", this._onPossessionCheck.bind(this));
			html.find(".stonetop-possession-sub-check").on("change", this._onPossessionSubCheck.bind(this));
			html.find(".stonetop-possession-sub-radio").on("change", this._onPossessionSubRadio.bind(this));
			html.find(".stonetop-regular-pool-btn").on("change", this._onRegularPool.bind(this));
			html.find(".stonetop-outfit-open-btn").on("click", this._onOutfitOpen.bind(this));

			// ── Followers tab: crew interactions ──────────────────────────
			// Crew name (editable in edit mode on Followers tab)
			html.find(".stonetop-crew-name-input").on("change", async ev => {
				await this.actor.setFlag("stonetop", "crew.name", ev.currentTarget.value.trim());
			});
			// Crew loyalty pips
			html.find(".stonetop-crew-loyalty-pip").on("click", async ev => {
				const idx = Number(ev.currentTarget.dataset.index);
				const current = this.actor.getFlag("stonetop", "crew.loyalty") ?? 0;
				// clicking a filled pip clears up to that pip; clicking empty fills up to it
				const newVal = current === idx + 1 ? idx : idx + 1;
				await this.actor.setFlag("stonetop", "crew.loyalty", newVal);
				this.render(false);
			});
			// Crew gear pip circles — each pip is independently selectable;
			// clicking pip N fills up to N+1 circles (or down to N if unchecking)
			html.find(".stonetop-crew-gear-check").on("change", async ev => {
				const { slug, pip } = ev.currentTarget.dataset;
				const pipIdx  = Number(pip);
				const checked = ev.currentTarget.checked;
				const gear    = foundry.utils.deepClone(this.actor.getFlag("stonetop", "crew.gear") ?? {});
				gear[slug]    = checked ? pipIdx + 1 : pipIdx;
				await this.actor.setFlag("stonetop", "crew.gear", gear);
				this.render(false);
			});
			// Crew supplies pip circles — 6 independent sets stored as an array of counts
			html.find(".stonetop-crew-supplies-pip").on("change", async ev => {
				const setIdx = Number(ev.currentTarget.dataset.set);
				const pipIdx = Number(ev.currentTarget.dataset.pip);
				const newVal = ev.currentTarget.checked ? pipIdx + 1 : pipIdx;
				const current = this.actor.getFlag("stonetop", "crew.supplies");
				const arr = Array.isArray(current) ? [...current] : Array(6).fill(0);
				while (arr.length < 6) arr.push(0);
				arr[setIdx] = newVal;
				await this.actor.setFlag("stonetop", "crew.supplies", arr);
				this.render(false);
			});
			// Delete individual crew member
			html.find(".stonetop-crew-delete-individual").on("click", async ev => {
				const idx = Number(ev.currentTarget.dataset.index);
				const individuals = [...(this.actor.getFlag("stonetop", "crew.individuals") ?? [])];
				individuals.splice(idx, 1);
				await this.actor.setFlag("stonetop", "crew.individuals", individuals);
				this.render(false);
			});
			// Create individual crew member
			html.find(".stonetop-crew-create-individual").on("click", async () => {
				// Crew individual options are defined here rather than read from the
				// LevelDB pack so they are always available without a rebuild step.
				const CREW_INDIVIDUAL_NAMES  = ["Aled","Culhwch","Eira","Gerat","Glaw","Harri","Lowri","Mervyn","Nesta"];
				const CREW_INDIVIDUAL_TAGS   = ["animal-lover","big","bully","cynical","drunkard","eager","gambler","greedy","grumpy","gullible","hearthrob","honest","kind","little","naive","old","popular","proud","reckless","rookie","shameless","sharp-eyed","short-tempered"];
				const CREW_INDIVIDUAL_TRAITS = ["__'s kid/sibling/parent/cousin/__","bald","crush on __","grudge against __","hates __","idolizes __","jokes a lot","messy","missing eye/finger/hand/__","misses their kids","nightmares","recently married","religious","scars","skinny","sharp-tongued","sings","snores","tells tall tales","too serious","whistler","whittler"];

				// Fall back to playbook data if present (post-rebuild), otherwise use constants above.
				const playbookDoc = await this._stonetopCharacter.playbook();
				const indOpts     = playbookDoc?.flags?.stonetop?.crew?.individualOptions ?? {};
				const names  = indOpts.names?.length  ? indOpts.names  : CREW_INDIVIDUAL_NAMES;
				const tags   = indOpts.tags?.length   ? indOpts.tags   : CREW_INDIVIDUAL_TAGS;
				const traits = indOpts.traits?.length ? indOpts.traits : CREW_INDIVIDUAL_TRAITS;

				const namesHtml = names.map(n => `<option value="${n}">`).join("");
				const tagsHtml  = tags.map(t => `<option value="${t}">${t}</option>`).join("");

				// ── Trait tokenizer ───────────────────────────────────────
				// Splits a trait into: text | standalone __ | slash-option group
				// e.g. "missing eye/finger/hand/__" →
				//   [text:"missing "], [opts:["eye","finger","hand","__"]]
				// e.g. "__'s kid/sibling/parent/cousin/__" →
				//   [blank], [text:"'s "], [opts:["kid","sibling","parent","cousin","__"]]
				const tokenize = str => {
					const tokens = [];
					// Greedy: standalone __, then slash-group, then whitespace, then word
					const re = /__|(?:[^\s/]+(?:\/[^\s/]+)+)|[^\s/]+|\s+/g;
					let m;
					while ((m = re.exec(str)) !== null) {
						if (m[0] === "__")         tokens.push({ type: "blank" });
						else if (m[0].includes("/")) tokens.push({ type: "opts", opts: m[0].split("/") });
						else                         tokens.push({ type: "text", text: m[0] });
					}
					return tokens;
				};

				// Build one chip's inner HTML from its tokens, tracking slot indices
				const buildChipInner = (tokens, safeVal) => {
					let html    = `<input type="checkbox" name="traits" value="${safeVal}">`;
					let slotIdx = 0;
					for (const tok of tokens) {
						if (tok.type === "text") {
							html += `<span class="stonetop-trait-text">${tok.text}</span>`;
						} else if (tok.type === "blank") {
							const s = slotIdx++;
							html += `<span class="stonetop-trait-blank">___</span>`;
							html += `<input type="text" class="stonetop-trait-fill" data-slot="${s}" style="display:none" placeholder="…">`;
						} else { // opts
							const s       = slotIdx++;
							const hasCust = tok.opts.includes("__");
							const display = tok.opts.map(o => o === "__" ? "___" : o).join("/");
							const optHtml = tok.opts.map(o =>
								o === "__" ? `<option value="__">___ (type your own)</option>`
								           : `<option value="${o}">${o}</option>`
							).join("");
							html += `<span class="stonetop-trait-blank">${display}</span>`;
							html += `<select class="stonetop-trait-select" data-slot="${s}" style="display:none">
								<option value="">— pick one —</option>${optHtml}
							</select>`;
							if (hasCust) {
								html += `<input type="text" class="stonetop-trait-custom" data-slot="${s}" style="display:none" placeholder="custom…">`;
							}
						}
					}
					return html;
				};

				const traitsHtml = traits.map(t => {
					const safeVal = t.replace(/"/g, "&quot;");
					const tokens  = tokenize(t);
					const simple  = tokens.every(tok => tok.type === "text");
					if (simple) {
						return `<span class="stonetop-trait-chip-group">
							<label class="stonetop-individual-trait-chip">
								<input type="checkbox" name="traits" value="${safeVal}"> ${t}
							</label>
						</span>`;
					}
					return `<span class="stonetop-trait-chip-group" data-trait="${safeVal}">
						<label class="stonetop-individual-trait-chip">
							${buildChipInner(tokens, safeVal)}
						</label>
					</span>`;
				}).join("");

				const content = `
					<form class="stonetop-individual-form">
						<div class="form-group">
							<label>Name</label>
							<input type="text" name="ind-name" list="ind-names" placeholder="Enter a name…">
							<datalist id="ind-names">${namesHtml}</datalist>
						</div>
						<div class="form-group">
							<label>Tag</label>
							<select name="ind-tag"><option value="">— choose one —</option>${tagsHtml}</select>
						</div>
						<div class="form-group stonetop-individual-traits-group">
							<label>Traits <em>(choose one or more)</em></label>
							<div class="stonetop-individual-traits-grid">${traitsHtml}</div>
						</div>
					</form>`;

				new Dialog({
					title:   "Add Crew Individual",
					content,
					buttons: {
						add: {
							icon:  "<i class='fas fa-user-plus'></i>",
							label: "Add",
							callback: async (dlgHtml) => {
								const name = dlgHtml.find("[name='ind-name']").val().trim();
								if (!name) return;
								const tag    = dlgHtml.find("[name='ind-tag']").val();
								const traits = [];
								dlgHtml.find("[name='traits']:checked").each((_, cb) => {
									const group  = cb.closest(".stonetop-trait-chip-group");
									const tokens = tokenize(cb.value);
									let slotIdx  = 0;
									let result   = "";
									for (const tok of tokens) {
										if (tok.type === "text") {
											result += tok.text;
										} else if (tok.type === "blank") {
											const s  = slotIdx++;
											const el = group.querySelector(`.stonetop-trait-fill[data-slot="${s}"]`);
											result  += el?.value.trim() || "__";
										} else { // opts
											const s   = slotIdx++;
											const sel = group.querySelector(`.stonetop-trait-select[data-slot="${s}"]`);
											if (sel?.value === "__") {
												const cust = group.querySelector(`.stonetop-trait-custom[data-slot="${s}"]`);
												result += cust?.value.trim() || "__";
											} else {
												result += sel?.value || tok.opts[0];
											}
										}
									}
									traits.push(result);
								});
								const current = this.actor.getFlag("stonetop", "crew.individuals") ?? [];
								await this.actor.setFlag("stonetop", "crew.individuals",
									[...current, { name, tag, traits }]);
								this.render(false);
							},
						},
						cancel: { label: "Cancel" },
					},
					default: "add",
					render: (dlgHtml) => {
						// Checkbox toggle: expand/collapse the chip
						dlgHtml.find("[name='traits']").on("change", ev => {
							const group   = ev.currentTarget.closest(".stonetop-trait-chip-group");
							const checked = ev.currentTarget.checked;
							group?.classList.toggle("is-selected", checked);
							group?.querySelectorAll(".stonetop-trait-blank").forEach(el =>
								el.style.display = checked ? "none" : ""
							);
							group?.querySelectorAll(".stonetop-trait-fill, .stonetop-trait-select").forEach(el => {
								el.style.display = checked ? "inline-block" : "none";
								if (!checked) el.value = "";
							});
							group?.querySelectorAll(".stonetop-trait-custom").forEach(el => {
								el.style.display = "none";
								el.value = "";
							});
						});
						// Select → show custom input when "__ (type your own)" chosen
						dlgHtml[0].addEventListener("change", ev => {
							const sel = ev.target;
							if (!sel.classList.contains("stonetop-trait-select")) return;
							const group  = sel.closest(".stonetop-trait-chip-group");
							const custom = group?.querySelector(`.stonetop-trait-custom[data-slot="${sel.dataset.slot}"]`);
							if (!custom) return;
							custom.style.display = sel.value === "__" ? "inline-block" : "none";
							if (sel.value !== "__") custom.value = "";
						});
					},
				}, { width: 540, height: 580, classes: ["dialog", "stonetop-individual-dialog"] }).render(true);
			});
			html.find(".stonetop-inventory-reset-btn").on("click", this._onInventoryReset.bind(this));
			html.find(".stonetop-basic-move-open").on("click", async ev => {
				const { compendiumId } = ev.currentTarget.dataset;
				const pack = game.packs.get("stonetop.basic-moves");
				if (!pack || !compendiumId) return;
				const doc = await pack.getDocument(compendiumId);
				if (doc) doc.sheet.render(true);
			});
			html.find(".stonetop-other-move-delete").on("click", async ev => {
				const { itemId } = ev.currentTarget.dataset;
				await this._stonetopCharacter.removeMove(itemId);
			});

			html[0].addEventListener("click", ev => {
				const title = ev.target.closest(".stonetop-arcanum-title--clickable");
				if (!title) return;
				ev.stopPropagation();
				const { slug, flipped } = title.dataset;
				this._stonetopCharacter.getArcanumChatContent(slug, flipped === "true").then(content => {
					if (!content) return;
					ChatMessage.create({
						content,
						speaker: ChatMessage.getSpeaker({ actor: this.actor }),
						rollMode: game.settings.get("core", "rollMode"),
					});
				});
			}, true);

			html[0].addEventListener("click", ev => {
				const btn = ev.target.closest(".stonetop-arcanum-identify-btn");
				if (!btn) return;
				ev.stopPropagation();
				const { slug } = btn.dataset;
				Dialog.confirm({
					title: game.i18n.localize("stonetop.arcana.identifyTitle"),
					content: `<p>${game.i18n.localize("stonetop.arcana.identifyConfirm")}</p>`,
					yes: () => this._stonetopCharacter.identifyArcanum(slug).then(() => this.render(false)),
				});
			}, true);

			html[0].addEventListener("click", ev => {
				const btn = ev.target.closest(".stonetop-arcanum-flip-btn");
				if (!btn) return;
				ev.stopPropagation();
				const { slug, flipped } = btn.dataset;
				if (flipped === "true") {
					this._stonetopCharacter.unflipArcanum(slug).then(() => this.render(false));
				} else {
					this._stonetopCharacter.flipArcanum(slug).then(() => this.render(false));
				}
			}, true);

			html[0].addEventListener("click", ev => {
				const btn = ev.target.closest(".stonetop-arcanum-resource-btn");
				if (!btn) return;
				ev.stopPropagation();
				const { slug, index } = btn.dataset;
				const isChecked = btn.classList.contains("is-checked");
				const newVal = isChecked ? Number(index) : Number(index) + 1;
				this._stonetopCharacter.setArcanumResource(slug, newVal).then(() => this.render(false));
			}, true);

			html[0].addEventListener("click", ev => {
				const btn = ev.target.closest(".stonetop-arcanum-delete");
				if (!btn) return;
				ev.stopPropagation();
				const { slug } = btn.dataset;
				this._stonetopCharacter.removeArcanum(slug).then(() => this.render(true));
			}, true);

			html[0].addEventListener("change", ev => {
				const cb = ev.target.closest(".stonetop-arcanum-unlock-check");
				if (!cb) return;
				const { arcanumSlug, optionSlug, index } = cb.dataset;
				const newCount = cb.checked ? Number(index) + 1 : Number(index);
				this._stonetopCharacter.setArcanumUnlockCount(arcanumSlug, optionSlug, newCount);
			}, true);

			html[0].addEventListener("change", ev => {
				const cb = ev.target.closest(".stonetop-arcanum-box, .stonetop-arcanum-circle");
				if (!cb) return;
				ev.stopPropagation();
				const { arcanumSlug, context, index } = cb.dataset;
				this._stonetopCharacter.setArcanumBoxChecked(arcanumSlug, context, Number(index), cb.checked);
			}, true);

			html[0].addEventListener("change", ev => {
				const cb = ev.target.closest(".stonetop-lore-option-check");
				if (!cb || ev.target.closest("[data-pdi='lore']")) return;
				const { loreSlug, optionSlug, idx } = cb.dataset;
				const newCount = cb.checked ? Number(idx) + 1 : Number(idx);
				this._stonetopCharacter.setLoreOptionCount(loreSlug, optionSlug, newCount);
			}, true);

			html[0].addEventListener("change", ev => {
				const ta = ev.target.closest(".stonetop-lore-option-text");
				if (!ta || ev.target.closest("[data-pdi='lore']")) return;
				const { loreSlug, optionSlug } = ta.dataset;
				this._stonetopCharacter.setLoreOptionText(loreSlug, optionSlug, ta.value);
			}, true);

			html[0].addEventListener("click", ev => {
				const btn = ev.target.closest(".stonetop-pdi-activate");
				if (!btn) return;
				ev.stopPropagation();
				this._stonetopCharacter.setPostDeathInsert(btn.dataset.slug).then(() => this.render(false));
			}, true);

			html[0].addEventListener("click", ev => {
				const btn = ev.target.closest(".stonetop-pdi-remove");
				if (!btn) return;
				ev.stopPropagation();
				this._stonetopCharacter.setPostDeathInsert(null).then(() => this.render(false));
			}, true);

			html[0].addEventListener("change", ev => {
				const radio = ev.target.closest(".stonetop-pdi-instinct");
				if (!radio) return;
				this._stonetopCharacter.setPostDeathInstinct(radio.value);
			}, true);

			html[0].addEventListener("change", ev => {
				if (!ev.target.closest("[data-pdi='lore']")) return;
				const cb = ev.target.closest(".stonetop-lore-option-check");
				if (!cb) return;
				const { loreSlug, optionSlug, idx } = cb.dataset;
				const newCount = cb.checked ? Number(idx) + 1 : Number(idx);
				this._stonetopCharacter.setPostDeathLoreCount(loreSlug, optionSlug, newCount);
			}, true);

			html[0].addEventListener("change", ev => {
				if (!ev.target.closest("[data-pdi='lore']")) return;
				const ta = ev.target.closest(".stonetop-lore-option-text");
				if (!ta) return;
				const { loreSlug, optionSlug } = ta.dataset;
				this._stonetopCharacter.setPostDeathLoreText(loreSlug, optionSlug, ta.value);
			}, true);
		}

		async _onDropPlaybook(playbookDoc) {
			if (!this.isEditable) return;
			if (playbookDoc.pack === 'stonetop.post-death-inserts') {
				const slug = playbookDoc.system?.slug;
				if (slug) await this._stonetopCharacter.setPostDeathInsert(slug);
				this.render(false);
				return;
			}
			await this.actor.update({
				"system.playbook": {
					uuid: playbookDoc.uuid,
					name: playbookDoc.name,
					slug: playbookDoc.system?.slug ?? "",
				},
			});
			await this._stonetopCharacter.ensureStartingMoves();
			this.render(false);
		}

		async _onDropItemCreate(itemData) {
			const items  = Array.isArray(itemData) ? itemData : [itemData];
			const arcana = items.filter(i => i.type === "move" && i.system?.moveType === "arcanum");
			const moves  = items.filter(i => i.type === "move" && i.system?.moveType !== "arcanum");
			const others = items.filter(i => i.type !== "move");
			let anyAdded = false;
			for (const item of arcana) {
				const slug = item.flags?.stonetop?.slug;
				if (slug) {
					await this._stonetopCharacter.addArcanum(slug);
					anyAdded = true;
				}
			}
			for (const item of moves) {
				if (await this._stonetopCharacter.onDropMove(item)) anyAdded = true;
			}
			if (others.length) await super._onDropItemCreate(others);
			if (anyAdded) this.render(false);
		}

		async _onBackgroundChange(ev) {
			const slug = ev.currentTarget.value;
			await this._stonetopCharacter.background.selectBackground(slug);
			await this._stonetopCharacter.ensureStartingMoves();
		}

		async _onAppearanceChange(ev) {
			const el = ev.currentTarget;
			await this._stonetopCharacter.appearance.select(Number(el.dataset.line), el.value);
		}

		async _onOriginNameClick(ev) {
			await this._stonetopCharacter.updateName(ev.currentTarget.value);
		}

		async _onMoveCheck(ev) {
			const el = ev.currentTarget;
			if (el.checked) {
				await this._stonetopCharacter.addMove(el.dataset.compendiumId);
			} else {
				await this._stonetopCharacter.removeMove(el.dataset.ownedId);
			}
		}

		async _onRepeatCheck(ev) {
			const el = ev.currentTarget;
			if (el.checked) {
				await this._stonetopCharacter.addMove(el.dataset.compendiumId);
			} else {
				await this._stonetopCharacter.removeMove(el.dataset.ownedId);
			}
		}

		async _onMoveResourceChange(ev) {
			const button = new MoveResourceButton(ev);
			await this._stonetopCharacter.moveResources.add(button);
		}

		async _onBgChoiceChange(ev) {
			const choice = new BackgroundInputChoice(ev);
			await this._stonetopCharacter.background.addChoice(choice);
		}

		async _onPossessionCheck(ev) {
			const { slug } = ev.currentTarget.dataset;
			if (ev.currentTarget.checked) {
				await this._stonetopCharacter.selectPossession(slug);
			} else {
				await this._stonetopCharacter.deselectPossession(slug);
			}
		}

		async _onPossessionUseChange(ev) {
			const btn = new PossessionUseButton(ev);
			const newVal = btn.isChecked() ? btn.index : btn.index + 1;
			if (btn.choiceSlug) {
				await this._stonetopCharacter.setSubChoiceUses(btn.possessionSlug, btn.choiceSlug, newVal);
			} else {
				await this._stonetopCharacter.setPossessionUses(btn.possessionSlug, newVal);
			}
		}

		async _onPossessionSubCheck(ev) {
			const { possessionSlug, choiceSlug } = ev.currentTarget.dataset;
			if (ev.currentTarget.checked) {
				await this._stonetopCharacter.selectSubChoice(possessionSlug, choiceSlug);
			} else {
				await this._stonetopCharacter.deselectSubChoice(possessionSlug, choiceSlug);
			}
		}

		async _onPossessionSubRadio(ev) {
			const { possessionSlug, choiceSlug, siblingSlugsCsv } = ev.currentTarget.dataset;
			const exclusiveSlugs = siblingSlugsCsv ? siblingSlugsCsv.split(",") : [];
			await this._stonetopCharacter.selectSubChoiceExclusive(possessionSlug, choiceSlug, exclusiveSlugs);
		}

		async _onInventoryItemCheck(ev) {
			const slug      = ev.currentTarget.dataset.slug;
			const isChecked = ev.currentTarget.checked;
			await this._stonetopCharacter.setInventoryItemChecked(slug, isChecked);
			if (ev.currentTarget.closest(".stonetop-inventory-small")) {
				await this._stonetopCharacter.adjustSmallPool(isChecked);
			} else if (ev.currentTarget.closest(".stonetop-inventory-regular")) {
				const weight = Number(ev.currentTarget.dataset.weight ?? 1);
				await this._stonetopCharacter.adjustRegularPool(isChecked, weight);
			}
			this.render(false);
		}

		async _onInventoryResource(ev) {
			const { slug, index } = ev.currentTarget.dataset;
			const isChecked = ev.currentTarget.classList.contains("is-checked");
			const newVal = isChecked ? Number(index) : Number(index) + 1;
			await this._stonetopCharacter.setInventoryResource(slug, newVal);
			this.render(false);
		}

		async _onAddInventoryItem(ev) {
			const column = ev.currentTarget.dataset.column;
			const isRegular = column === "regular";
			const content = isRegular
				? `<div style="display:grid;gap:6px;padding:6px">
					<label>${game.i18n.localize("stonetop.inventory.addItemName")} <input name="name" type="text" style="width:100%"></label>
					<label>${game.i18n.localize("stonetop.inventory.addItemWeight")} <input name="weight" type="number" min="1" value="1" style="width:60px"></label>
				   </div>`
				: `<div style="padding:6px"><label>${game.i18n.localize("stonetop.inventory.addItemName")} <input name="name" type="text" style="width:100%"></label></div>`;
			new Dialog({
				title: isRegular ? game.i18n.localize("stonetop.inventory.addItem") : game.i18n.localize("stonetop.inventory.addSmallItem"),
				content,
				buttons: {
					add: {
						label: game.i18n.localize("stonetop.inventory.addItemConfirm"),
						callback: html => {
							const name = html.find("[name=name]").val().trim();
							if (!name) return;
							if (isRegular) {
								const weight = Math.max(1, parseInt(html.find("[name=weight]").val()) || 1);
								this._stonetopCharacter.addCustomInventoryItem(name, weight)
									.then(() => this.render(false));
							} else {
								this._stonetopCharacter.addCustomSmallItem(name)
									.then(() => this.render(false));
							}
						},
					},
					cancel: { label: game.i18n.localize("Cancel") },
				},
				default: "add",
			}).render(true);
		}

		async _onOutfitLoad(ev) {
			await this._stonetopCharacter.setInventoryLoadLevel(ev.currentTarget.value);
			this.render(false);
		}

		async _onRegularPool(ev) {
			const idx = Number(ev.currentTarget.dataset.index);
			await this._stonetopCharacter.setInventoryRegularPool(
				ev.currentTarget.checked ? idx + 1 : idx
			);
			this.render(false);
		}

		async _onSmallPool(ev) {
			const idx = Number(ev.currentTarget.dataset.index);
			await this._stonetopCharacter.setInventorySmallPool(
				ev.currentTarget.checked ? idx + 1 : idx
			);
			this.render(false);
		}

		async _onDeleteCustomInventoryItem(ev) {
			await this._stonetopCharacter.removeCustomInventoryItem(ev.currentTarget.dataset.ownedId);
		}

		async _onInventoryReset() {
			Dialog.confirm({
				title: game.i18n.localize("stonetop.inventory.resetTitle"),
				content: `<p>${game.i18n.localize("stonetop.inventory.resetConfirm")}</p>`,
				yes: async () => {
					await this._stonetopCharacter.resetInventorySelections();
					this.render(false);
				},
			});
		}

		async _onOutfitOpen() {
			const snapshot = await this._stonetopCharacter.buildSnapshot();
			new OutfitMoveDialog(
				this._stonetopCharacter,
				snapshot.inventory.outfit,
				() => this.render(false),
			).render(true);
		}

		async _onNewCharacter() {
			const existingPlaybook = this.actor.system?.playbook?.slug;
			const openPicker = () => {
				new PlaybookPickerDialog(async (playbookDoc) => {
					new CharacterOnboardingDialog(playbookDoc, async (selections) => {
						await this._applyPlaybookSelections(playbookDoc, selections);
					}).render(true);
				}).render(true);
			};
			if (existingPlaybook) {
				Dialog.confirm({
					title:   game.i18n.localize("stonetop.newCharacter.confirmTitle"),
					content: `<p>${game.i18n.localize("stonetop.newCharacter.confirmContent")}</p>`,
					yes:     openPicker,
				});
			} else {
				openPicker();
			}
		}

		async _applyPlaybookSelections(playbookDoc, selections) {
			// Set the playbook on the actor
			await this.actor.update({
				"system.playbook": {
					uuid: playbookDoc.uuid,
					name: playbookDoc.name,
					slug: playbookDoc.system?.slug ?? "",
				},
			});
			// Background must be saved before ensureStartingMoves reads it
			if (selections.backgroundSlug) {
				await this._stonetopCharacter.background.selectBackground(selections.backgroundSlug);
			}
			await this._stonetopCharacter.ensureStartingMoves();
			// Remaining selections
			if (selections.instinctValue) {
				await this._stonetopCharacter.instinct.select(selections.instinctValue);
			}
			for (const [lineIdx, value] of Object.entries(selections.appearance ?? {})) {
				if (value) await this._stonetopCharacter.appearance.select(Number(lineIdx), value);
			}
			if (selections.originRegion) {
				await this._stonetopCharacter.origin.select(selections.originRegion);
			}
			if (selections.name?.trim()) {
				await this._stonetopCharacter.updateName(selections.name.trim());
			}
			if (selections.stats) {
				const statUpdates = {};
				for (const [key, value] of Object.entries(selections.stats)) {
					if (value !== null && value !== undefined) {
						statUpdates[`system.stats.${key}.value`] = Number(value);
					}
				}
				if (Object.keys(statUpdates).length) await this.actor.update(statUpdates);
			}
			// Apply special possessions: preselected are always included,
			// plus whatever the player chose in the wizard.
			const rawPossessions = playbookDoc.flags?.stonetop?.specialPossessions;
			if (rawPossessions) {
				const slugsToSelect = [
					...(rawPossessions.preselected ?? []),
					...(selections.possessions ?? []),
				];
				for (const slug of slugsToSelect) {
					await this._stonetopCharacter.selectPossession(slug);
				}
			}
			for (const compendiumId of (selections.moves ?? [])) {
				await this._stonetopCharacter.addMove(compendiumId);
			}
			// ── Insert: Invocations (Lightbearer) ──────────────────
			if (selections.invocations?.length) {
				await this.actor.setFlag("stonetop", "invocations.selected", selections.invocations);
			}
			// ── Insert: Initiates of Danu (Blessed + Initiate bg) ──
			for (const slug of (selections.initiates ?? [])) {
				await this._stonetopCharacter.background.addChoice({ slug, isChecked: true });
			}
			// ── Insert: Crew (Marshal) ──────────────────────────────
			if (selections.crew?.instinct || selections.crew?.cost || selections.crew?.tags?.length || selections.crew?.name) {
				const bgTag  = playbookDoc.flags?.stonetop?.crew?.backgroundTags?.[selections.backgroundSlug] ?? null;
				const allTags = bgTag ? [bgTag, ...selections.crew.tags] : [...selections.crew.tags];
				await this.actor.setFlag("stonetop", "crew.name",     selections.crew.name?.trim() ?? "");
				await this.actor.setFlag("stonetop", "crew.tags",     allTags);
				await this.actor.setFlag("stonetop", "crew.instinct", selections.crew.instinct ?? "");
				await this.actor.setFlag("stonetop", "crew.cost",     selections.crew.cost     ?? "");
			}
			// ── Insert: Animal Companion (Ranger) ──────────────────
			if (selections.animalCompanion?.type) {
				const ac = selections.animalCompanion;
				await this.actor.setFlag("stonetop", "animalCompanion.type",     ac.type);
				await this.actor.setFlag("stonetop", "animalCompanion.traits",   ac.traits);
				await this.actor.setFlag("stonetop", "animalCompanion.instinct", ac.instinct ?? "");
				await this.actor.setFlag("stonetop", "animalCompanion.cost",     ac.cost     ?? "");
				if (ac.name?.trim()) {
					await this.actor.setFlag("stonetop", "animalCompanion.name", ac.name.trim());
				}
			}
			this.render(false);
		}
	};
}

