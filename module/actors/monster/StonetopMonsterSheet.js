import { CREATURE_TYPE_CHOICES, creatureTypeIcon, creatureTypeLabel } from "../../bestiary/creature-types.js";
import { unlockForEditing, relockIfWeUnlocked } from "../../utils/compendium-edit.js";
import { buildCodexContext, onCodexClick, onCodexChange } from "../bestiary/codex.js";

// Per-organization combat budget (Book I, "Dangers", pp.396-398).
const ORGANIZATION_DEFAULTS = {
	horde:    { hp: 3,  die: "d6"  },
	group:    { hp: 6,  die: "d8"  },
	solitary: { hp: 12, die: "d10" },
};

const ORGANIZATION_CHOICES = {
	horde:    "stonetop.monster.organizationHorde",
	group:    "stonetop.monster.organizationGroup",
	solitary: "stonetop.monster.organizationSolitary",
};

const MONSTER_RICH_TEXT_FIELDS = [
	{ key: "qualities", enrichedKey: "enrichedQualities" },
];

function _normalizeTag(value) {
	return String(value ?? "").trim().toLocaleLowerCase();
}

function _hasPortrait(img) {
	const defaultToken = globalThis.foundry?.CONST?.DEFAULT_TOKEN
		?? globalThis.CONST?.DEFAULT_TOKEN
		?? "icons/svg/mystery-man.svg";
	return !!img && img !== defaultToken;
}

function _displayMonsterTags(system) {
	const hidden = new Set([
		_normalizeTag(system?.organization),
		_normalizeTag(system?.size),
	].filter(Boolean));

	return String(system?.tags ?? "")
		.split(",")
		.map(tag => tag.trim())
		.filter(tag => tag && !hidden.has(_normalizeTag(tag)))
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
		_weUnlockedPack = false;

		static get defaultOptions() {
			return foundry.utils.mergeObject(super.defaultOptions, {
				classes: ["stonetop", "sheet", "actor", "monster"],
				width:   760,
				height:  720,
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
			this._hideBrokenPortrait();
		}

		_hideBrokenPortrait() {
			if (this._editMode) return;
			const img = this.element[0]?.querySelector(".stonetop-portrait");
			if (!img) return;
			const header = img.closest(".stonetop-monster-header");
			const drop = () => {
				img.remove();
				header?.classList.add("stonetop-monster-header--no-portrait");
			};
			if (img.complete && img.naturalWidth === 0) {
				drop();
				return;
			}
			img.addEventListener("error", drop, { once: true });
		}

		_stripHeaderChrome() {
			const header = this.element[0]?.querySelector(".window-header");
			if (!header) return;
			header.querySelectorAll(".document-id-link").forEach(el => el.remove());
		}

		_injectHeaderToggle() {
			const header = this.element[0]?.querySelector(".window-header");
			if (!header || !this.actor.isOwner) return;

			header.querySelector(".stonetop-header-toggle")?.remove();

			// Locked == viewed from a locked compendium. Show a lock affordance;
			// toggling it on unlocks the pack so the fields become editable.
			const locked = !this.isEditable;

			const label = document.createElement("label");
			label.className = "stonetop-edit-toggle stonetop-header-toggle";
			label.title = locked
				? "Unlock & edit (unlocks the compendium)"
				: (this._editMode ? "Lock stat block" : "Edit stat block");

			const checkbox = document.createElement("input");
			checkbox.type = "checkbox";
			checkbox.checked = this._editMode;
			checkbox.addEventListener("change", () => this._onToggleEdit(checkbox));

			const track = document.createElement("span");
			track.className = "stonetop-toggle-track";
			const thumb = document.createElement("span");
			thumb.className = "stonetop-toggle-thumb";
			const icon = document.createElement("i");
			icon.className = locked ? "fas fa-lock" : "fas fa-wrench";
			thumb.appendChild(icon);
			track.appendChild(thumb);

			label.appendChild(checkbox);
			label.appendChild(track);

			const title = header.querySelector(".window-title");
			header.insertBefore(label, title);
		}

		async _onToggleEdit(checkbox) {
			const turningOn = checkbox.checked;
			if (turningOn && !this.isEditable) {
				if (!await unlockForEditing(this)) { checkbox.checked = false; return; }
			}
			// Set the mode before re-locking: relocking the pack triggers an async
			// re-render, and if _editMode were still true that render would paint
			// edit-mode markup into a now-locked form (disabled inputs everywhere).
			this._editMode = turningOn;
			if (!turningOn) await relockIfWeUnlocked(this);
			this.render(false);
		}

		async close(options) {
			await relockIfWeUnlocked(this);
			return super.close(options);
		}

		_getHeaderButtons() {
			return super._getHeaderButtons().filter(b => b.class !== "configure-sheet");
		}

		async getData() {
			const context = await super.getData();
			const system = context.system ??= this.actor.system;
			context.stonetop ??= {};
			const st = context.stonetop;

			st.editMode    = this._editMode;
			st.displayTags = _displayMonsterTags(system);

			// Creature type + its icon, which doubles as the default portrait when
			// the stat block has no custom art (Book I "Monster types", p.392).
			st.creatureTypeChoices = CREATURE_TYPE_CHOICES;
			st.creatureTypeLabel   = creatureTypeLabel(system?.creatureType);
			const realImg  = _hasPortrait(this.actor.img) ? this.actor.img : null;
			const typeIcon = creatureTypeIcon(system?.creatureType);
			st.displayImg   = realImg ?? typeIcon ?? null;
			st.hasPortrait  = !!st.displayImg;

			for (const field of MONSTER_RICH_TEXT_FIELDS) {
				st[field.enrichedKey] = await _enrichHTML(system?.[field.key]);
			}

			// Codex flavor carried directly on a lone stat block (description, Q&A,
			// prep, discoveries, nests, dangers) — shown only when populated.
			Object.assign(st, await buildCodexContext(system, this._editMode));

			// Organization-driven combat budget.
			const org = _normalizeTag(system?.organization);
			st.organizationChoices = ORGANIZATION_CHOICES;
			st.organizationLabel   = ORGANIZATION_CHOICES[org] ?? "";
			const def = ORGANIZATION_DEFAULTS[org];
			st.budgetNote = def ? `${def.hp} HP each · ${def.die} damage` : "";

			// Group abstraction helper.
			const count = Number(system?.count) || 0;
			st.abstracted = count > 1;
			if (st.abstracted) {
				const hpMax = Number(system?.attributes?.hp?.max) || 0;
				const half  = Math.ceil(count / 2);
				st.casualtyNote = hpMax
					? `≈ ${half} of ${count} out at ${Math.floor(hpMax / 2)} HP`
					: `≈ ${half} of ${count} out at half HP`;
			}

			// Linked bestiary entry ("Open Entry" affordance).
			if (system?.entry) {
				try {
					const doc = await fromUuid(system.entry);
					if (doc) st.entryLink = { name: doc.name, uuid: system.entry };
				} catch (_e) { /* stale link — ignore */ }
			}

			// Preserve the book's move order — don't sort.
			context.monsterMoves = this.actor.items
				.filter(i => i.type === "monsterMove")
				.map(i => ({ id: i.id, name: i.name, system: i.system }));
			return context;
		}

		activateListeners(html) {
			super.activateListeners(html);
			this._bindOutnumberCalc(html[0]);

			// Navigation works even when the sheet is read-only (e.g. viewed from
			// the compendium): open the linked Bestiary Entry on click.
			html[0].addEventListener("click", async ev => {
				const link = ev.target.closest(".stonetop-monster-entry-link");
				if (!link) return;
				ev.preventDefault();
				const doc = link.dataset.entryUuid ? await fromUuid(link.dataset.entryUuid).catch(() => null) : null;
				doc?.sheet?.render(true);
			});

			if (!this.isEditable) return;

			html[0].addEventListener("click", async ev => {
				if (await onCodexClick(this, ev)) return;

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

				} else if (ev.target.closest(".stonetop-monster-reset-defaults")) {
					if (!this._editMode) return;
					await this._resetOrganizationDefaults();
				}
			});

			html[0].addEventListener("change", async ev => {
				const editor = ev.target.closest(".stonetop-monster-rich-editor");
				if (editor && this._editMode) {
					await this._updateRichTextField(editor.dataset?.field, editor.value);
					return;
				}
				await onCodexChange(this, ev);
			});
		}

		/** Live outnumber-bonus readout: +1 dmg/armor per full multiplier past 1x. */
		_bindOutnumberCalc(root) {
			const input  = root?.querySelector(".stonetop-monster-outnumber-foes");
			const result = root?.querySelector(".stonetop-monster-outnumber-result");
			if (!input || !result) return;

			const update = () => {
				const count = Number(result.dataset.count) || 0;
				const foes  = Number(input.value) || 0;
				const bonus = foes > 0 ? Math.max(0, Math.floor(count / foes) - 1) : 0;
				result.textContent = `+${bonus} / +${bonus}`;
			};
			input.addEventListener("input", update);
		}

		async _resetOrganizationDefaults() {
			const org = _normalizeTag(this.actor.system?.organization);
			const def = ORGANIZATION_DEFAULTS[org];
			if (!def) return;
			await this.actor.update({
				"system.attributes.hp.value":            def.hp,
				"system.attributes.hp.max":              def.hp,
				"system.attributes.damage.rollFormula":  def.die,
			});
		}

		async _updateRichTextField(field, value) {
			if (!MONSTER_RICH_TEXT_FIELDS.some(entry => entry.key === field)) return;
			await this.actor.update({ [`system.${field}`]: value ?? "" });
		}
	};
}
