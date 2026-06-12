import { escHtml, isDefaultImg } from "../../utils/strings.js";

const ENTRY_RICH_TEXT_FIELDS = [
	{ key: "description", enrichedKey: "enrichedDescription" },
	{ key: "dangers",     enrichedKey: "enrichedDangers" },
	{ key: "nests",       enrichedKey: "enrichedNests" },
];

const ENTRY_PREP_LINE_FIELDS = [
	{ key: "hooks",       label: "stonetop.bestiary.hooks" },
	{ key: "origins",     label: "stonetop.bestiary.origins" },
];
const ENTRY_LINE_FIELDS = [...ENTRY_PREP_LINE_FIELDS];

const ENTRY_QA_FIELDS = [
	{ key: "questions", label: "stonetop.bestiary.questions" },
	{ key: "lore",      label: "stonetop.bestiary.lore" },
];

// Render the lightweight inline markup we allow in prep/impression text:
// **bold** -> <strong>bold</strong>. Everything else is HTML-escaped so the
// stored text stays plain and editable while reading nicely.
function _inlineMarkup(text) {
	return escHtml(text).replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>");
}

function _splitLines(value, editMode) {
	const text = value ?? "";
	if (!text) return editMode ? [{ text: "", html: "" }] : [];
	const lines = String(text).split(/\r?\n/);
	const kept = editMode ? lines : lines.filter(line => line.trim());
	return kept.map(line => ({ text: line, html: _inlineMarkup(line) }));
}

function _qaPairs(value, editMode) {
	const pairs = Array.isArray(value)
		? value.map(p => {
			const prompt = p?.prompt ?? "";
			const answer = p?.answer ?? "";
			// A leading **bold** run (e.g. "**Something interesting:**") is a header
			// shown on its own line above the question; the rest is the question body.
			const lead = /^\s*\*\*(.+?)\*\*\s*([\s\S]*)$/.exec(prompt);
			return {
				prompt,
				answer,
				lead: lead ? lead[1] : "",
				promptHtml: _inlineMarkup(lead ? lead[2] : prompt),
				answerHtml: _inlineMarkup(answer),
			};
		})
		: [];
	if (editMode) return pairs;
	return pairs.filter(p => p.prompt.trim() || p.answer.trim());
}

// True if a value carries meaningful content. Strips HTML tags/entities so an
// "empty" rich-text field (e.g. "<p></p>") doesn't count as present.
function _hasText(value) {
	return String(value ?? "")
		.replace(/<[^>]*>/g, "")
		.replace(/&nbsp;/gi, " ")
		.trim().length > 0;
}

// A Discoveries entry is a series of sub-sections, each with a heading, optional
// body prose, and an optional bullet list. Items are edited as one-per-line text.
function _discoveryGroups(value, editMode) {
	const groups = Array.isArray(value) ? value : [];
	const mapped = groups.map(g => {
		const heading  = g?.heading ?? "";
		const body     = g?.body ?? "";
		const itemsArr = Array.isArray(g?.items) ? g.items : [];
		const keptItems = editMode ? itemsArr : itemsArr.filter(i => (i ?? "").trim());
		return {
			heading,
			headingHtml: _inlineMarkup(heading),
			body,
			bodyHtml: _inlineMarkup(body),
			itemsText: editMode ? itemsArr.join("\n") : "",
			items: keptItems.map(i => ({ text: i, html: _inlineMarkup(i) })),
		};
	});
	if (editMode) return mapped;
	return mapped.filter(g => g.heading.trim() || g.body.trim() || g.items.length);
}

async function _enrichHTML(value) {
	const textEditor = globalThis.foundry?.applications?.ux?.TextEditor;
	if (!textEditor?.enrichHTML) return value ?? "";
	return textEditor.enrichHTML(value ?? "");
}

export function createStonetopBestiaryEntrySheetClass(Base) {
	return class StonetopBestiaryEntrySheet extends Base {
		_editMode = false;

		static get defaultOptions() {
			return foundry.utils.mergeObject(super.defaultOptions, {
				classes: ["stonetop", "sheet", "actor", "bestiary-entry"],
				width:   780,
				height:  760,
				tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "overview" }],
			});
		}

		get template() {
			return "systems/stonetop_pwd/templates/actor/bestiary-entry.hbs";
		}

		async _render(force, options) {
			await super._render(force, options);
			this._injectHeaderToggle();
			this._stripHeaderChrome();
			this.element[0]?.classList.toggle("stonetop-edit-mode", this._editMode);
			this._hideBrokenPortrait();
			this._hideBrokenStatBlockImgs();
		}

		_hideBrokenStatBlockImgs() {
			const imgs = this.element[0]?.querySelectorAll(".stonetop-entry-statblock-img");
			imgs?.forEach(img => {
				if (img.complete && img.naturalWidth === 0) { img.remove(); return; }
				img.addEventListener("error", () => img.remove(), { once: true });
			});
		}

		_hideBrokenPortrait() {
			if (this._editMode) return;
			const img = this.element[0]?.querySelector(".stonetop-portrait");
			if (!img) return;
			const header = img.closest(".stonetop-bestiary-header");
			const drop = () => {
				img.remove();
				header?.classList.add("stonetop-bestiary-header--no-portrait");
			};
			if (img.complete && img.naturalWidth === 0) { drop(); return; }
			img.addEventListener("error", drop, { once: true });
		}

		_stripHeaderChrome() {
			const header = this.element[0]?.querySelector(".window-header");
			header?.querySelectorAll(".document-id-link").forEach(el => el.remove());
		}

		_injectHeaderToggle() {
			const header = this.element[0]?.querySelector(".window-header");
			if (!header || !this.isEditable) return;
			header.querySelector(".stonetop-header-toggle")?.remove();

			const label = document.createElement("label");
			label.className = "stonetop-edit-toggle stonetop-header-toggle";
			label.title = this._editMode ? "Lock Entry" : "Edit Entry";

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

			header.insertBefore(label, header.querySelector(".window-title"));
		}

		_getHeaderButtons() {
			return super._getHeaderButtons().filter(b => b.class !== "configure-sheet");
		}

		async getData() {
			const context = await super.getData();
			const system = context.system ??= this.actor.system;
			context.stonetop ??= {};
			const st = context.stonetop;
			const edit = st.editMode = this._editMode;
			st.hasPortrait = !isDefaultImg(this.actor.img);

			// Independent enrichments — resolve in parallel (each may await @UUID links).
			await Promise.all(ENTRY_RICH_TEXT_FIELDS.map(async field => {
				st[field.enrichedKey] = await _enrichHTML(system?.[field.key]);
			}));

			st.prepLineSections = ENTRY_PREP_LINE_FIELDS.map(field => {
				const introField = `${field.key}Intro`;
				const introRaw = system?.[introField] ?? "";
				return {
					...field,
					lines: _splitLines(system?.[field.key], edit),
					introField,
					intro: introRaw,
					introHtml: _inlineMarkup(introRaw),
					show: edit || _hasText(system?.[field.key]) || _hasText(introRaw),
				};
			});

			st.qaSections = ENTRY_QA_FIELDS.map(field => {
				const pairs = _qaPairs(system?.[field.key], edit);
				return { ...field, pairs, show: edit || pairs.length > 0 };
			});

			st.discoveryGroups = _discoveryGroups(system?.discoveries, edit);
			st.statBlocks = await this._resolveStatBlocks(system?.statBlocks);

			// Per-section presence drives hide-when-empty in read mode; in edit mode
			// everything is shown so it can be filled in. The mapper outputs above
			// already drop empty entries in read mode, so a non-empty result == content.
			st.show = {
				description: edit || _hasText(system?.description),
				dangers:     edit || _hasText(system?.dangers),
				nests:       edit || _hasText(system?.nests),
			};
			// Tab visibility. Overview is always present (the landing tab); the rest
			// appear only when they hold content (always, in edit mode).
			st.showTab = {
				codex:       edit || st.qaSections.some(s => s.show),
				prep:        edit || st.prepLineSections.some(s => s.show),
				discoveries: edit || st.discoveryGroups.length > 0,
				statBlocks:  edit || st.statBlocks.length > 0,
				notes:       edit || _hasText(system?.notes),
			};

			return context;
		}

		async _resolveStatBlocks(uuids) {
			const list = Array.isArray(uuids) ? uuids : [];
			// Resolve independently-linked blocks in parallel, not one round-trip at a time.
			const docs = await Promise.all(list.map(uuid =>
				uuid === this.actor.uuid                       // never list the entry as its own stat block
					? null
					: fromUuid(uuid).catch(() => null)           // tolerate stale uuids
			));
			const resolved = [];
			docs.forEach((doc, i) => {
				if (!doc || doc.type !== "monster") return;
				const hp = doc.system?.attributes?.hp ?? {};
				resolved.push({
					uuid: list[i],
					name: doc.name,
					img: doc.img,
					hasImg: !isDefaultImg(doc.img),
					hpValue: hp.value ?? "",
					hpMax: hp.max ?? "",
					organization: doc.system?.organization ?? "",
				});
			});
			return resolved;
		}

		activateListeners(html) {
			super.activateListeners(html);
			const root = html[0];
			if (!this.isEditable) return;

			root.addEventListener("click", async ev => {
				const t = ev.target;

				if (t.closest(".stonetop-entry-add-line")) {
					if (!this._editMode) return;
					await this._addLine(t.closest(".stonetop-entry-add-line")?.dataset?.field);

				} else if (t.closest(".stonetop-entry-add-qa")) {
					if (!this._editMode) return;
					await this._addQa(t.closest(".stonetop-entry-add-qa")?.dataset?.field);

				} else if (t.closest(".stonetop-entry-remove-qa")) {
					if (!this._editMode) return;
					const row = t.closest("[data-qa-index]");
					await this._removeQa(row?.closest("[data-qa-field]")?.dataset?.qaField, Number(row?.dataset?.qaIndex));

				} else if (t.closest(".stonetop-discovery-add-group")) {
					if (!this._editMode) return;
					await this._addDiscoveryGroup();

				} else if (t.closest(".stonetop-discovery-remove-group")) {
					if (!this._editMode) return;
					await this._removeDiscoveryGroup(Number(t.closest("[data-discovery-index]")?.dataset?.discoveryIndex));

				} else if (t.closest(".stonetop-entry-create-statblock")) {
					if (!this._editMode) return;
					await this._createStatBlock();

				} else if (t.closest(".stonetop-entry-link-statblock")) {
					if (!this._editMode) return;
					await this._linkStatBlockDialog();

				} else if (t.closest(".stonetop-entry-open-statblock")) {
					const uuid = t.closest("[data-statblock-uuid]")?.dataset?.statblockUuid;
					const doc  = uuid ? await fromUuid(uuid) : null;
					doc?.sheet?.render(true);

				} else if (t.closest(".stonetop-entry-unlink-statblock")) {
					if (!this._editMode) return;
					const uuid = t.closest("[data-statblock-uuid]")?.dataset?.statblockUuid;
					await this._unlinkStatBlock(uuid);
				}
			});

			root.addEventListener("change", async ev => {
				const editor = ev.target.closest(".stonetop-entry-rich-editor");
				if (editor && this._editMode) {
					await this._updateRichTextField(editor.dataset?.field, editor.value);
					return;
				}

				const lineInput = ev.target.closest(".stonetop-entry-line-input");
				if (lineInput && this._editMode) {
					await this._updateLineField(root, lineInput.closest("[data-line-field]")?.dataset?.lineField);
					return;
				}

				const qaInput = ev.target.closest(".stonetop-entry-qa-input");
				if (qaInput && this._editMode) {
					await this._updateQaField(root, qaInput.closest("[data-qa-field]")?.dataset?.qaField);
					return;
				}

				const discoveryInput = ev.target.closest(".stonetop-discovery-input");
				if (discoveryInput && this._editMode) {
					await this._updateDiscoveries(root);
				}
			});
		}

		async _updateRichTextField(field, value) {
			if (!ENTRY_RICH_TEXT_FIELDS.some(f => f.key === field)) return;
			await this.actor.update({ [`system.${field}`]: value ?? "" });
		}

		async _addLine(field) {
			if (!ENTRY_LINE_FIELDS.some(f => f.key === field)) return;
			const current = this.actor.system?.[field] ?? "";
			await this.actor.update({ [`system.${field}`]: `${current}\n` });
		}

		async _updateLineField(root, field) {
			if (!ENTRY_LINE_FIELDS.some(f => f.key === field)) return;
			const section = root.querySelector(`[data-line-field="${field}"]`);
			if (!section) return;
			const lines = Array.from(section.querySelectorAll(".stonetop-entry-line-input")).map(i => i.value);
			await this.actor.update({ [`system.${field}`]: lines.join("\n") });
		}

		async _addQa(field) {
			if (!ENTRY_QA_FIELDS.some(f => f.key === field)) return;
			const current = Array.isArray(this.actor.system?.[field]) ? this.actor.system[field] : [];
			await this.actor.update({ [`system.${field}`]: [...current, { prompt: "", answer: "" }] });
		}

		async _removeQa(field, index) {
			if (!ENTRY_QA_FIELDS.some(f => f.key === field) || Number.isNaN(index)) return;
			const current = Array.isArray(this.actor.system?.[field]) ? [...this.actor.system[field]] : [];
			current.splice(index, 1);
			await this.actor.update({ [`system.${field}`]: current });
		}

		async _updateQaField(root, field) {
			if (!ENTRY_QA_FIELDS.some(f => f.key === field)) return;
			const section = root.querySelector(`[data-qa-field="${field}"]`);
			if (!section) return;
			const pairs = Array.from(section.querySelectorAll("[data-qa-index]")).map(row => ({
				prompt: row.querySelector(".stonetop-entry-qa-prompt")?.value ?? "",
				answer: row.querySelector(".stonetop-entry-qa-answer")?.value ?? "",
			}));
			await this.actor.update({ [`system.${field}`]: pairs });
		}

		async _addDiscoveryGroup() {
		const current = Array.isArray(this.actor.system?.discoveries) ? this.actor.system.discoveries : [];
		await this.actor.update({ "system.discoveries": [...current, { heading: "", body: "", items: [] }] });
	}

	async _removeDiscoveryGroup(index) {
		if (Number.isNaN(index)) return;
		const current = Array.isArray(this.actor.system?.discoveries) ? [...this.actor.system.discoveries] : [];
		current.splice(index, 1);
		await this.actor.update({ "system.discoveries": current });
	}

	async _updateDiscoveries(root) {
		const wrap = root.querySelector("[data-discovery-field]");
		if (!wrap) return;
		const groups = Array.from(wrap.querySelectorAll("[data-discovery-index]")).map(el => ({
			heading: el.querySelector(".stonetop-discovery-heading-input")?.value ?? "",
			body:    el.querySelector(".stonetop-discovery-body-input")?.value ?? "",
			items:   (el.querySelector(".stonetop-discovery-items-input")?.value ?? "")
				.split(/\r?\n/).filter(line => line.trim()),
		}));
		await this.actor.update({ "system.discoveries": groups });
	}

	/** The creature name without the " (Bestiary)" entry suffix. */
		_creatureName() {
			return this.actor.name.replace(/\s*\(Bestiary\)\s*$/i, "").trim() || this.actor.name;
		}

		async _createStatBlock() {
			const created = await Actor.create({
				name: this._creatureName(),
				type: "monster",
				folder: this.actor.folder?.id ?? null,
				"system.entry": this.actor.uuid,
			});
			if (!created) return;
			await this._appendStatBlock(created.uuid);
			created.sheet?.render(true);
		}

		async _linkStatBlockDialog() {
			const existing = new Set(Array.isArray(this.actor.system?.statBlocks) ? this.actor.system.statBlocks : []);
			const candidates = game.actors.filter(a => a.type === "monster" && !existing.has(a.uuid));
			if (!candidates.length) {
				ui.notifications?.warn("No unlinked monster stat blocks available.");
				return;
			}
			const options = candidates
				.map(a => `<option value="${a.uuid}">${escHtml(a.name)}</option>`)
				.join("");
			const content = `<p>Link an existing stat block to this entry:</p>
				<select class="stonetop-link-statblock-select" style="width:100%">${options}</select>`;
			const uuid = await Dialog.prompt({
				title: "Link Stat Block",
				content,
				label: "Link",
				callback: htmlEl => htmlEl.querySelector(".stonetop-link-statblock-select")?.value,
				rejectClose: false,
			});
			if (!uuid) return;
			await this._appendStatBlock(uuid);
			const doc = await fromUuid(uuid);
			if (doc && !doc.system?.entry) await doc.update({ "system.entry": this.actor.uuid });
		}

		async _appendStatBlock(uuid) {
			const current = Array.isArray(this.actor.system?.statBlocks) ? this.actor.system.statBlocks : [];
			if (current.includes(uuid)) return;
			await this.actor.update({ "system.statBlocks": [...current, uuid] });
		}

		async _unlinkStatBlock(uuid) {
			if (!uuid) return;
			const current = Array.isArray(this.actor.system?.statBlocks) ? this.actor.system.statBlocks : [];
			await this.actor.update({ "system.statBlocks": current.filter(u => u !== uuid) });
			const doc = await fromUuid(uuid);
			if (doc && doc.system?.entry === this.actor.uuid) await doc.update({ "system.entry": "" });
		}
	};
}
