import { CREATURE_TYPE_CHOICES, creatureTypeIcon, creatureTypeLabel } from "../../bestiary/creature-types.js";
import { rollDamage } from "../../utils/roll-engine.js";
import { relockIfWeUnlocked } from "../../utils/compendium-edit.js";
import { hideBrokenPortrait, stripHeaderChrome, injectHeaderToggle } from "../../utils/sheet-chrome.js";
import { isDefaultImg } from "../../utils/strings.js";

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
	{ key: "notes",     enrichedKey: "enrichedNotes" },
];

function _normalizeTag(value) {
	return String(value ?? "").trim().toLocaleLowerCase();
}

const DAMAGE_DIE = /\d*d\d+(?:\s*[+-]\s*\d+)?/i;

/**
 * Split a monster's free-text Damage value into its separate attack modes, each
 * carrying its own dice expression for a roll button.
 *
 * A comma only separates modes when each side is a complete attack with its own
 * die — e.g. "fingers d8 (close), maw d10+2 (hand, messy)" is two modes. Commas
 * can also just list verbs or tags within a single mode: "claws, bite, hug d10+4
 * (hand, messy, 1 piercing)" is ONE mode. So we split at paren depth 0, then
 * accumulate parts until one carries a die — that completes the mode.
 *
 * @param {string} value
 * @returns {{ text: string, formula: string }[]}
 */
function _parseDamageModes(value) {
	const raw = String(value ?? "").trim();
	if (!raw) return [];

	// Split on top-level commas (commas inside (...) tag lists are not separators).
	const parts = [];
	let depth = 0;
	let start = 0;
	for (let i = 0; i < raw.length; i++) {
		const ch = raw[i];
		if (ch === "(") depth++;
		else if (ch === ")") depth = Math.max(0, depth - 1);
		else if (ch === "," && depth === 0) {
			parts.push(raw.slice(start, i));
			start = i + 1;
		}
	}
	parts.push(raw.slice(start));

	// Group parts into modes: a die-bearing part completes the current mode.
	const modes = [];
	let buffer = "";
	for (const part of parts) {
		buffer = buffer ? `${buffer},${part}` : part;
		if (DAMAGE_DIE.test(buffer)) {
			modes.push(buffer);
			buffer = "";
		}
	}
	// Trailing descriptor with no die — fold into the previous mode, else stand alone.
	if (buffer.trim()) {
		if (modes.length) modes[modes.length - 1] += `,${buffer}`;
		else modes.push(buffer);
	}

	return modes
		.map(text => text.trim())
		.filter(Boolean)
		.map(text => {
			const match = text.match(DAMAGE_DIE);
			return { text, formula: match ? match[0].replace(/\s+/g, "") : "" };
		});
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
				// Fit the window to its content — these lean stat blocks vary a lot in
				// length, so a fixed height left big empty gaps. A CSS cap (.window-app
				// .monster .window-content max-height) keeps a move-heavy monster from
				// running off the bottom of the screen.
				height:  "auto",
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
			hideBrokenPortrait(this, "stonetop-monster-header");
		}

		_stripHeaderChrome() {
			stripHeaderChrome(this);
		}

		_injectHeaderToggle() {
			injectHeaderToggle(this, "monster");
		}

		async close(options) {
			await relockIfWeUnlocked(this);
			return super.close(options);
		}

		_getHeaderButtons() {
			const buttons = super._getHeaderButtons().filter(b => b.class !== "configure-sheet");
			// A "Journal" button (the linked bestiary entry) just before Prototype Token.
			if (this.actor.system?.entry) {
				const journal = {
					label: "Journal",
					class: "stonetop-open-entry",
					icon:  "fas fa-book",
					onclick: () => this._openEntryFromHeader(),
				};
				const tokenIdx = buttons.findIndex(b => b.class === "configure-token");
				if (tokenIdx >= 0) buttons.splice(tokenIdx, 0, journal);
				else buttons.unshift(journal);
			}
			return buttons;
		}

		/**
		 * Resolve `system.entry` and open it. The bestiary is migrating from actors
		 * to journal pages, so it may resolve to a JournalEntryPage (open its journal
		 * scrolled to that page), a whole JournalEntry, or a legacy bestiary actor —
		 * open each in its natural sheet.
		 */
		async _openEntryFromHeader() {
			const uuid = this.actor.system?.entry;
			const doc = uuid ? await fromUuid(uuid).catch(() => null) : null;
			if (!doc) return;
			if (doc.documentName === "JournalEntryPage") {
				doc.parent?.sheet?.render(true, { pageId: doc.id });
				return;
			}
			doc.sheet?.render(true);
		}

		async getData() {
			const context = await super.getData();
			const system = context.system ??= this.actor.system;
			context.stonetop ??= {};
			const st = context.stonetop;

			st.editMode    = this._editMode;
			st.displayTags = _displayMonsterTags(system);
			st.damageModes = _parseDamageModes(system?.attributes?.damage?.value);
			st.multiDamage = st.damageModes.length > 1;

			// Creature type + its icon, which doubles as the default portrait when
			// the stat block has no custom art (Book I "Monster types", p.392).
			st.creatureTypeChoices = CREATURE_TYPE_CHOICES;
			st.creatureTypeLabel   = creatureTypeLabel(system?.creatureType);
			const realImg  = isDefaultImg(this.actor.img) ? null : this.actor.img;
			const typeIcon = creatureTypeIcon(system?.creatureType);
			st.displayImg   = realImg ?? typeIcon ?? null;
			st.hasPortrait  = !!st.displayImg;

			for (const field of MONSTER_RICH_TEXT_FIELDS) {
				st[field.enrichedKey] = await _enrichHTML(system?.[field.key]);
			}

			// Organization label + choices for the header (organization also drives
			// the HP/damage defaults applied by the reset-defaults button).
			const org = _normalizeTag(system?.organization);
			st.organizationChoices = ORGANIZATION_CHOICES;
			st.organizationLabel   = ORGANIZATION_CHOICES[org] ?? "";

			// Preserve the book's move order — don't sort.
			context.monsterMoves = this.actor.items
				.filter(i => i.type === "monsterMove")
				.map(i => ({ id: i.id, name: i.name, system: i.system }));
			return context;
		}

		activateListeners(html) {
			super.activateListeners(html);

			// Rolling works even when the sheet is read-only (e.g. viewed from the
			// compendium): roll a move or roll damage on click. Play actions, not edits.
			html[0].addEventListener("click", async ev => {
				const dmgRoll = ev.target.closest(".stonetop-monster-damage-roll");
				if (dmgRoll) {
					const formula = dmgRoll.dataset.rollFormula || this.actor.system?.attributes?.damage?.rollFormula;
					if (!formula) return;
					// Route through the shared roll-engine so the monster's damage posts
					// in the same Stonetop roll-card shell as character/follower damage,
					// not a bare Foundry roll card. The speaker alias names the monster,
					// so the card header is just "Damage".
					await rollDamage(formula, this.actor, { label: "Damage" });

				} else if (ev.target.closest(".stonetop-monster-move-roll")) {
					const li   = ev.target.closest("[data-item-id]");
					const item = this.actor.items.get(li?.dataset?.itemId);
					await item?.roll();

				} else if (!this._editMode && ev.target.closest(".stonetop-monster-move-name")) {
					// Play mode: clicking the name posts the move to chat (with its
					// roll if it has one), like move names on the character sheet.
					const li   = ev.target.closest("[data-item-id]");
					const item = this.actor.items.get(li?.dataset?.itemId);
					await item?.roll();
				}
			});

			if (!this.isEditable) return;

			html[0].addEventListener("click", async ev => {
				if (ev.target.closest(".stonetop-monster-add-move")) {
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
				if (!editor) return;
				// Notes stays editable in play mode; the other rich fields only in edit mode.
				if (editor.dataset?.field === "notes" || this._editMode) {
					await this._updateRichTextField(editor.dataset?.field, editor.value);
				}
			});
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
