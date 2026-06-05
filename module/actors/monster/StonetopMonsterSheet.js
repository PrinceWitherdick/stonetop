const MONSTER_LORE_FIELDS = [
	{ key: "questions",   label: "stonetop.monster.questions" },
	{ key: "lore",        label: "stonetop.monster.lore" },
	{ key: "origins",     label: "stonetop.monster.origins" },
	{ key: "discoveries", label: "stonetop.monster.discoveries" },
];

const MONSTER_PREP_LINE_FIELDS = [
	{ key: "hooks", label: "stonetop.monster.hooks" },
];

const MONSTER_LINE_FIELDS = [...MONSTER_LORE_FIELDS, ...MONSTER_PREP_LINE_FIELDS];

const MONSTER_RICH_TEXT_FIELDS = [
	{ key: "description", enrichedKey: "enrichedDescription" },
	{ key: "qualities",   enrichedKey: "enrichedQualities" },
	{ key: "dangers",     enrichedKey: "enrichedDangers" },
];

function _splitLines(value, editMode) {
	const text = value ?? "";
	if (!text) return editMode ? [""] : [];

	const lines = String(text).split(/\r?\n/);
	return editMode ? lines : lines.filter(line => line.trim());
}

function _normalizeTag(value) {
	return String(value ?? "").trim().toLocaleLowerCase();
}

function _displayMonsterTags(system) {
	const hiddenTags = new Set([
		_normalizeTag(system?.grouping),
		_normalizeTag(system?.size),
	].filter(Boolean));

	return String(system?.tags ?? "")
		.split(",")
		.map(tag => tag.trim())
		.filter(tag => tag && !hiddenTags.has(_normalizeTag(tag)))
		.join(", ");
}

async function _enrichHTML(value) {
	const textEditor = globalThis.foundry?.applications?.ux?.TextEditor;
	if (!textEditor?.enrichHTML) return value ?? "";
	return textEditor.enrichHTML(value ?? "");
}

export function createStonetopMonsterSheetClass(Base) {
	return class StonetopMonsterSheet extends Base {
		_editMode = false;

		static get defaultOptions() {
			return foundry.utils.mergeObject(super.defaultOptions, {
				classes: ["stonetop", "sheet", "actor", "monster"],
				width:   760,
				height:  720,
				tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "overview" }],
			});
		}

		get template() {
			return "systems/stonetop_pwd/templates/actor/monster.hbs";
		}

		async _render(force, options) {
			await super._render(force, options);
			this._injectHeaderToggle();
			this._stripHeaderChrome();
			this.element[0]?.classList.toggle("stonetop-edit-mode", this._editMode);
			this._debugFonts();
		}

		_debugFonts() {
			const root = this.element[0];
			if (!root) return;
			const desc = root.querySelector(".stonetop-monster-readonly-text");
			if (!desc) return;
			const cs = getComputedStyle(desc);
			console.log("[stonetop] monster description font-family:", cs.fontFamily);
			console.log("[stonetop] --font-stonetop resolves to:", cs.getPropertyValue("--font-stonetop").trim());
			console.log("[stonetop] --font-primary resolves to:  ", cs.getPropertyValue("--font-primary").trim());
			const p = desc.querySelector("p");
			if (p) console.log("[stonetop] description <p> font-family:", getComputedStyle(p).fontFamily);
		}

		_stripHeaderChrome() {
			const header = this.element[0]?.querySelector(".window-header");
			if (!header) return;

			header.querySelectorAll(".document-id-link").forEach(el => el.remove());
		}

		_injectHeaderToggle() {
			const header = this.element[0]?.querySelector(".window-header");
			if (!header || !this.isEditable) return;

			header.querySelector(".stonetop-header-toggle")?.remove();

			const label = document.createElement("label");
			label.className = "stonetop-edit-toggle stonetop-header-toggle";
			label.title = this._editMode ? "Lock Sheet" : "Edit Monster";

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
			return super._getHeaderButtons().filter(b => b.class !== "configure-sheet");
		}

		async getData() {
			const context = await super.getData();
			context.system ??= this.actor.system;
			context.stonetop ??= {};
			context.stonetop.editMode = this._editMode;
			context.stonetop.displayTags = _displayMonsterTags(context.system);
			for (const field of MONSTER_RICH_TEXT_FIELDS) {
				context.stonetop[field.enrichedKey] = await _enrichHTML(context.system?.[field.key]);
			}
			context.stonetop.loreSections = MONSTER_LORE_FIELDS.map(field => ({
				...field,
				lines: _splitLines(context.system?.[field.key], this._editMode),
			}));
			context.stonetop.prepLineSections = MONSTER_PREP_LINE_FIELDS.map(field => ({
				...field,
				lines: _splitLines(context.system?.[field.key], this._editMode),
			}));
			context.monsterMoves = this.actor.items
				.filter(i => i.type === "monsterMove")
				.map(i => ({ id: i.id, name: i.name, system: i.system }))
				.sort((a, b) => {
					const aRollable = !!a.system?.rollFormula;
					const bRollable = !!b.system?.rollFormula;
					if (aRollable !== bRollable) return aRollable ? -1 : 1;
					return a.name.localeCompare(b.name);
				});
			return context;
		}

		activateListeners(html) {
			super.activateListeners(html);
			if (!this.isEditable) return;

			html[0].addEventListener("click", async ev => {
				if (ev.target.closest(".stonetop-monster-damage-roll")) {
					const formula = this.actor.system?.attributes?.damage?.rollFormula;
					if (!formula) return;
					const roll = await new Roll(formula).evaluate();
					await roll.toMessage({
						speaker:  ChatMessage.getSpeaker({ actor: this.actor }),
						flavor:   `<strong>${this.actor.name} — Damage</strong>`,
						rollMode: game.settings.get("core", "rollMode"),
					});

				} else if (ev.target.closest(".stonetop-monster-move-roll")) {
					const li   = ev.target.closest("[data-item-id]");
					const item = this.actor.items.get(li?.dataset?.itemId);
					await item?.roll();

				} else if (ev.target.closest(".stonetop-monster-add-move")) {
					if (!this._editMode) return;
					await this.actor.createEmbeddedDocuments("Item", [{
						name: "New Move",
						type: "monsterMove",
					}]);

				} else if (ev.target.closest(".stonetop-monster-delete-move")) {
					if (!this._editMode) return;
					const li   = ev.target.closest("[data-item-id]");
					const item = this.actor.items.get(li?.dataset?.itemId);
					if (!item) return;
					const confirmed = await Dialog.confirm({
						title:   "Delete Move",
						content: `<p>Delete <strong>${item.name}</strong>?</p>`,
					});
					if (confirmed) await item.delete();

				} else if (ev.target.closest(".stonetop-monster-move-name")) {
					if (!this._editMode) return;
					const li   = ev.target.closest("[data-item-id]");
					const item = this.actor.items.get(li?.dataset?.itemId);
					item?.sheet?.render(true);

				} else if (ev.target.closest(".stonetop-monster-add-line")) {
					if (!this._editMode) return;
					const field = ev.target.closest(".stonetop-monster-add-line")?.dataset?.field;
					await this._addLineField(field);
				}
			});

			html[0].addEventListener("change", async ev => {
				const editor = ev.target.closest(".stonetop-monster-rich-editor");
				if (editor) {
					if (!this._editMode) return;
					const field = editor.dataset?.field;
					await this._updateRichTextField(field, editor.value);
					return;
				}

				const input = ev.target.closest(".stonetop-monster-line-input");
				if (!input || !this._editMode) return;

				const field = input.closest("[data-monster-line-field]")?.dataset?.monsterLineField;
				await this._updateLineField(html[0], field);
			});
		}

		async _addLineField(field) {
			if (!MONSTER_LINE_FIELDS.some(entry => entry.key === field)) return;

			const current = this.actor.system?.[field] ?? "";
			await this.actor.update({
				[`system.${field}`]: `${current}\n`,
			});
		}

		async _updateLineField(root, field) {
			if (!MONSTER_LINE_FIELDS.some(entry => entry.key === field)) return;

			const section = root.querySelector(`[data-monster-line-field="${field}"]`);
			if (!section) return;

			const lines = Array
				.from(section.querySelectorAll(".stonetop-monster-line-input"))
				.map(input => input.value);

			await this.actor.update({ [`system.${field}`]: lines.join("\n") });
		}

		async _updateRichTextField(field, value) {
			if (!MONSTER_RICH_TEXT_FIELDS.some(entry => entry.key === field)) return;
			await this.actor.update({ [`system.${field}`]: value ?? "" });
		}
	};
}
