// Sheet for the "npc" Actor subtype — the person the PCs interact with (Book I,
// ch.14). Interaction-first: identity (name, pronouns, occupation, traits, up to 3
// impressions, INSTINCT) and drives (connections, motivations) are always present;
// the combat stat block is an optional overlay the GM enables only when the NPC
// might fight or take orders. GM moves are embedded `npcMove` items.
//
// Wears the same edit/lock header chrome as the monster/bestiary sheets (shared
// sheet-chrome helpers) so it reads as one system.
import { rollDamage } from "../../utils/roll-engine.js";
import { hideBrokenPortrait, stripHeaderChrome, injectHeaderToggle } from "../../utils/sheet-chrome.js";
import { isDefaultImg } from "../../utils/strings.js";
import { getOpenSheetsInEditMode } from "../../settings.js";
import { enrichHTML } from "../../utils/foundry-compat.js";
import { makeColumnsResizable } from "../../utils/resizable-columns.js";
import { makeColumnsSortable } from "../../utils/sortable-columns.js";
import { openLedgerDialog } from "../../utils/ledger-dialog.js";
import { NpcLedger } from "./NpcLedger.js";

// Rich-text (HTMLField) fields edited inline via prose-mirror on the sheet.
const NPC_RICH_TEXT_FIELDS = [
	{ key: "connections", enrichedKey: "enrichedConnections" },
	{ key: "motivations", enrichedKey: "enrichedMotivations" },
	{ key: "notes",       enrichedKey: "enrichedNotes" },
];

// The only fields an inline edit may write to an npcMove item — its name and its
// two schema fields — so a stray data-field can't write anywhere else.
const NPC_MOVE_EDITABLE_FIELDS = new Set(["name", "system.description", "system.rollFormula"]);

// Relationship hearts: one to five, defaulting to three, clamped to 1-5 (a
// relationship always has at least one heart — you can't drop it to zero).
const HEARTS_MAX     = 5;
const HEARTS_MIN     = 1;
const HEARTS_DEFAULT = 3;
const clampHearts = n => Math.max(HEARTS_MIN, Math.min(HEARTS_MAX, Math.trunc(Number(n))));

// A full-sentence feeling per rating, shown in the heart-row tooltip so hovering
// reads "Vera hates Aldric" rather than a bare "5/5". Each key is a {npc}/{pc}
// format string; indexed by (hearts - 1), i.e. 1 heart → hates.
const HEART_FEELING_KEYS = [
	"stonetop.npc.feels1", // 1 — hates
	"stonetop.npc.feels2", // 2 — dislikes
	"stonetop.npc.feels3", // 3 — neutral (default)
	"stonetop.npc.feels4", // 4 — likes
	"stonetop.npc.feels5", // 5 — loves
];
const relationSummary = (hearts, npcName, pcName) =>
	game.i18n.format(HEART_FEELING_KEYS[clampHearts(hearts) - 1], { npc: npcName, pc: pcName });

// A relationship entry is { hearts, notes }. Early builds stored a bare number, so
// read either shape and normalize. An absent entry defaults to 3 hearts, no notes.
function readRelationship(raw) {
	const obj = (raw && typeof raw === "object") ? raw : { hearts: raw };
	return { hearts: clampHearts(obj.hearts ?? HEARTS_DEFAULT), notes: obj.notes ?? "" };
}

export function createStonetopNpcSheetClass(Base) {
	return class StonetopNpcSheet extends Base {
		_editMode = false;
		// Whether the Relationships section is collapsed. Kept on the instance (not the
		// DOM) so the state survives the re-renders a heart-click or note-edit triggers;
		// defaults to expanded and resets when the sheet is closed.
		_relationshipsCollapsed = false;

		constructor(...args) {
			super(...args);
			this._editMode = getOpenSheetsInEditMode();
		}

		static get defaultOptions() {
			return foundry.utils.mergeObject(super.defaultOptions, {
				classes:   ["stonetop", "sheet", "actor", "npc"],
				width:     620,
				height:    680,
				resizable: true,
			});
		}

		get template() {
			return "systems/stonetop_pwd/templates/actor/npc.hbs";
		}

		async _render(force, options) {
			await super._render(force, options);
			this._injectHeaderToggle();
			stripHeaderChrome(this);
			this.element[0]?.classList.toggle("stonetop-edit-mode", this._editMode);
			hideBrokenPortrait(this, "stonetop-npc-header");
		}

		_injectHeaderToggle() {
			injectHeaderToggle(this, "NPC");
		}

		// Add a "Ledger" header button that opens the change-history dialog (shared with
		// the steading sheet). Sits just before the token-config button, matching the
		// steading placement; Foundry's own configure-sheet button is stripped by chrome.
		_getHeaderButtons() {
			const buttons = super._getHeaderButtons().filter(b => b.class !== "configure-sheet");
			const tokenIdx = buttons.findIndex(b => b.class?.includes("token"));
			buttons.splice(tokenIdx >= 0 ? tokenIdx : 0, 0, {
				label:   "Ledger",
				class:   "stonetop-ledger-button",
				icon:    "fas fa-scroll",
				onclick: () => this._openLedgerDialog(),
			});
			return buttons;
		}

		_openLedgerDialog() {
			openLedgerDialog(this.actor, NpcLedger);
		}

		async getData() {
			const context = await super.getData();
			const system = context.system ??= this.actor.system;
			context.stonetop ??= {};
			const st = context.stonetop;

			st.editMode = this._editMode;

			// Portrait: the actor's art if it has any, else a person-icon placeholder
			// (rendered by the template) rather than a fabricated portrait.
			const realImg = isDefaultImg(this.actor.img) ? null : this.actor.img;
			st.displayImg  = realImg;
			st.hasPortrait = !!realImg;

			// Up to 3 impression slots, always three rows so edit mode shows a stable
			// grid; blanks are dropped in play mode.
			const impressions = Array.isArray(system?.impressions) ? system.impressions : [];
			st.impressionSlots  = [0, 1, 2].map(i => impressions[i] ?? "");
			st.impressionsShown = st.impressionSlots.filter(t => String(t).trim());

			// Rich-text fields + optional stat-block/threat cross-links are independent
			// async @UUID resolutions — enrich them in parallel rather than serially.
			const [enrichedFields, statBlockLink, threatLink] = await Promise.all([
				Promise.all(NPC_RICH_TEXT_FIELDS.map(field => enrichHTML(system?.[field.key]))),
				system?.statBlock ? enrichHTML(system.statBlock) : "",
				system?.threat    ? enrichHTML(system.threat)    : "",
			]);
			NPC_RICH_TEXT_FIELDS.forEach((field, i) => { st[field.enrichedKey] = enrichedFields[i]; });
			st.hasConnections = !!st.enrichedConnections?.trim();
			st.hasMotivations = !!st.enrichedMotivations?.trim();
			st.statBlockLink = statBlockLink;
			st.threatLink    = threatLink;

			// Relationships: every player character, with how much this NPC likes them as
			// a 1-5 heart rating (absent = the default 3). Hearts render as a masked SVG so
			// one silhouette shows filled/empty. Clickable when the sheet is editable.
			// List every character-type actor (the PCs); prefer the player-owned ones when
			// any exist, but fall back to all characters so the section still shows while a
			// GM is prepping before players are assigned.
			const rel = system?.relationships ?? {};
			const characters = (game.actors?.contents ?? []).filter(a => a.type === "character");
			const owned = characters.filter(a => a.hasPlayerOwner);
			const pcs = owned.length ? owned : characters;
			st.relationships = pcs.map(pc => {
				const { hearts, notes } = readRelationship(rel[pc.id]);
				return {
					id:   pc.id,
					name: pc.name,
					img:  isDefaultImg(pc.img) ? null : pc.img,
					hearts,
					notes,
					feeling: relationSummary(hearts, this.actor.name, pc.name),
					// 1..5 slots, each flagged filled so the template needs no math helper.
					heartSlots: Array.from({ length: HEARTS_MAX }, (_, i) => ({ position: i + 1, filled: i < hearts })),
				};
			});
			st.hasRelationships = st.relationships.length > 0;
			// Show the section even with no characters (in edit mode) so it's discoverable;
			// a short empty-state explains what will populate it.
			st.showRelationships = st.hasRelationships || this._editMode;
			st.relationshipsCollapsed = this._relationshipsCollapsed;
			st.canRate = this.isEditable;

			// GM moves (embedded npcMove items) — preserve authoring order.
			const npcMoves = this.actor.items.filter(i => i.type === "npcMove");
			context.npcMoves = await Promise.all(npcMoves.map(async i => ({
				id: i.id, name: i.name, system: i.system,
				enrichedDescription: this._editMode ? await enrichHTML(i.system?.description) : undefined,
			})));

			return context;
		}

		activateListeners(html) {
			super.activateListeners(html);
			const root = html[0];

			// Relationships table: drag-resize + click-to-sort columns, same as the
			// steading Residents tab (shared utils; preferences persist in localStorage).
			// View features, so wired regardless of edit/ownership.
			root.querySelectorAll(".steading-residents-table[data-resize-key]").forEach(table => {
				makeColumnsResizable(table, table.dataset.resizeKey);
				makeColumnsSortable(table, table.dataset.resizeKey);
			});

			// Relationships collapse: mirror the native <details> open state onto the
			// instance so it survives the re-render a heart-click / note-edit triggers.
			root.querySelector(".stonetop-npc-relationships")?.addEventListener("toggle", ev => {
				this._relationshipsCollapsed = !ev.currentTarget.open;
			});

			// Play-mode actions (work even from a read-only compendium view): roll a
			// move, roll damage, or post a move to chat.
			root.addEventListener("click", async ev => {
				const dmgRoll = ev.target.closest(".stonetop-npc-damage-roll");
				if (dmgRoll) {
					const formula = this.actor.system?.attributes?.damage?.rollFormula;
					if (!formula) return;
					await rollDamage(formula, this.actor, {
						label: this.actor.system?.attributes?.damage?.value || "Damage",
					});
					return;
				}
				const moveRoll = ev.target.closest(".stonetop-npc-move-roll");
				if (moveRoll) {
					const li   = ev.target.closest("[data-item-id]");
					const item = this.actor.items.get(li?.dataset?.itemId);
					await item?.roll();
					return;
				}
				if (!this._editMode) {
					const moveName = ev.target.closest(".stonetop-npc-move-name");
					if (moveName) {
						const li   = ev.target.closest("[data-item-id]");
						const item = this.actor.items.get(li?.dataset?.itemId);
						await item?.roll();
					}
				}
			});

			// Enlarge a real portrait in play mode (edit mode leaves the file picker).
			root.querySelector(".stonetop-portrait")?.addEventListener("click", ev => {
				if (this._editMode || isDefaultImg(this.actor.img)) return;
				ev.preventDefault();
				ev.stopPropagation();
				new ImagePopout(this.actor.img, { title: this.actor.name }).render(true);
			});

			if (!this.isEditable) return;

			root.addEventListener("click", async ev => {
				// Relationship hearts — clickable in either mode (a live affinity tracker).
				// Clicking heart N sets the rating to N; clicking the current rating's last
				// filled heart drops it by one, down to the 1-heart minimum (clampHearts) —
				// a relationship always keeps at least one heart; it can't be zeroed out.
				const heart = ev.target.closest(".stonetop-npc-heart");
				if (heart) {
					const row = ev.target.closest("[data-pc-id]");
					const pcId = row?.dataset?.pcId;
					const position = Number(heart.dataset.position);
					if (!pcId || !position) return;
					const { hearts, notes } = readRelationship(this.actor.system?.relationships?.[pcId]);
					const next = position === hearts ? position - 1 : position;
					// Write the whole entry (never a nested key) so a legacy bare-number
					// value is cleanly replaced by the { hearts, notes } object.
					await this.actor.update({ [`system.relationships.${pcId}`]: { hearts: clampHearts(next), notes } });
					return;
				}
				if (ev.target.closest(".stonetop-npc-add-move")) {
					if (!this._editMode) return;
					await this.actor.createEmbeddedDocuments("Item", [{ name: "New Move", type: "npcMove" }]);

				} else if (ev.target.closest(".stonetop-npc-delete-move")) {
					if (!this._editMode) return;
					const li   = ev.target.closest("[data-item-id]");
					const item = this.actor.items.get(li?.dataset?.itemId);
					if (!item) return;
					const confirmed = await Dialog.confirm({
						title:   "Delete Move",
						content: `<p>Delete <strong>${item.name}</strong>?</p>`,
					});
					if (confirmed) await item.delete();
				}
			});

			root.addEventListener("change", async ev => {
				// Per-relationship notes (one row per player character).
				const relNote = ev.target.closest(".stonetop-npc-rel-note-input");
				if (relNote) {
					const pcId = relNote.dataset?.pcId;
					if (!pcId) return;
					const { hearts } = readRelationship(this.actor.system?.relationships?.[pcId]);
					await this.actor.update({ [`system.relationships.${pcId}`]: { hearts, notes: relNote.value ?? "" } });
					return;
				}
				// Inline npcMove edits (name / formula / description).
				const moveField = ev.target.closest(".stonetop-npc-move-field");
				if (moveField) {
					if (!this._editMode) return;
					const li = ev.target.closest("[data-item-id]");
					await this._updateMoveField(li?.dataset?.itemId, moveField.dataset?.field, moveField.value);
					return;
				}
				// Rich-text fields: Notes stays editable in play mode; the rest only in edit mode.
				const editor = ev.target.closest(".stonetop-npc-rich-editor");
				if (!editor) return;
				if (editor.dataset?.field === "notes" || this._editMode) {
					await this._updateRichTextField(editor.dataset?.field, editor.value);
				}
			});
		}

		async _updateRichTextField(field, value) {
			if (!NPC_RICH_TEXT_FIELDS.some(entry => entry.key === field)) return;
			await this.actor.update({ [`system.${field}`]: value ?? "" });
		}

		async _updateMoveField(itemId, field, value) {
			if (!NPC_MOVE_EDITABLE_FIELDS.has(field)) return;
			const item = this.actor.items.get(itemId);
			if (!item) return;
			await item.update({ [field]: value ?? "" });
		}
	};
}
