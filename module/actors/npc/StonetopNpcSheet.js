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
import { wirePortraitPopout, updateRichTextField, updateMoveField } from "../../utils/stat-block-edit.js";
import { getOpenSheetsInEditMode } from "../../settings.js";
import { enrichHTML } from "../../utils/foundry-compat.js";
import { buildRelationshipRows, wireRelationshipTable, relationshipDropResult, relationshipDropNotice, wireRelationshipDropHighlight } from "../../utils/relationship-hearts.js";
import { relationshipViewContext, wireRelationshipBoard } from "../../utils/relationship-board.js";
import { getDragEventData } from "../../utils/foundry-compat.js";
import { openLedgerDialog } from "../../utils/ledger-dialog.js";
import { NpcLedger } from "./NpcLedger.js";
import { npcStatusMeta, NPC_STATUSES } from "../../data-models/npc-status.js";
import { partyCharacters } from "../../utils/playbook-actors.js";

// Rich-text (HTMLField) fields edited inline via prose-mirror on the sheet.
const NPC_RICH_TEXT_FIELDS = [
	{ key: "connections", enrichedKey: "enrichedConnections" },
	{ key: "motivations", enrichedKey: "enrichedMotivations" },
	{ key: "notes",       enrichedKey: "enrichedNotes" },
];

// The only fields an inline edit may write to an npcMove item — its name and its
// two schema fields — so a stray data-field can't write anywhere else.
const NPC_MOVE_EDITABLE_FIELDS = new Set(["name", "system.description", "system.rollFormula"]);

export function createStonetopNpcSheetClass(Base) {
	return class StonetopNpcSheet extends Base {
		_editMode = false;

		constructor(...args) {
			super(...args);
			// Owners only. A resident NPC is ownership.default OBSERVER, so any player can
			// open one — and this preference is client-scoped, so a player who turned it on
			// would otherwise start every NPC in edit mode: seeing the relationship rows the
			// GM deliberately unticked, beside show/hide boxes core renders disabled. They
			// couldn't even turn it off, since injectHeaderToggle draws no toggle for a
			// non-owner. Edit mode is for whoever can actually edit.
			this._editMode = this.actor?.isOwner ? getOpenSheetsInEditMode() : false;
		}

		static get defaultOptions() {
			return foundry.utils.mergeObject(super.defaultOptions, {
				classes:   ["stonetop", "sheet", "actor", "npc"],
				width:     620,
				// Auto-height so the window fits the ACTIVE tab's content — a short tab
				// (Relationships/Notes) hugs its content instead of leaving a void below,
				// while a tall tab caps at the CSS max-height and scrolls (nav stays pinned).
				// _fitHeight() re-measures after a tab switch, which Foundry's Tabs doesn't do.
				height:    "auto",
				resizable: true,
				// Details is the always-present landing tab; the pinned quick-facts block
				// (Instinct, etc.) sits above the strip. Relationships/Stats tabs render
				// conditionally, so _render() falls back here if the active one vanishes.
				tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "details" }],
			});
		}

		get template() {
			return "systems/stonetop-pwd/templates/actor/npc.hbs";
		}

		async _render(force, options) {
			await super._render(force, options);
			this._injectHeaderToggle();
			stripHeaderChrome(this);
			this.element[0]?.classList.toggle("stonetop-edit-mode", this._editMode);
			hideBrokenPortrait(this, "stonetop-npc-header");
		}

		// Re-measure the auto-height window to the active tab's content. Foundry's Tabs
		// toggles the panel on a click but leaves the window at its old height, which would
		// leave a void below a short tab — so we refit after each switch.
		_fitHeight() {
			this.setPosition({ height: "auto" });
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

			// Up to 3 impression slots (p.454). Edit mode shows the filled slots plus a
			// single empty row to type into (min 1), trimming trailing blanks so a fresh
			// NPC isn't three empty lines; "Add Impression" reveals the next slot, capped
			// at 3. Blanks are dropped entirely in play mode.
			const impressions = Array.isArray(system?.impressions) ? system.impressions : [];
			const IMPRESSION_CAP = 3;
			let filled = 0;
			for (let i = 0; i < impressions.length && i < IMPRESSION_CAP; i++) {
				if (String(impressions[i] ?? "").trim()) filled = i + 1;
			}
			const rows = Math.max(1, Math.min(IMPRESSION_CAP, filled));
			st.impressionSlots     = Array.from({ length: rows }, (_, i) => impressions[i] ?? "");
			st.impressionsShown    = st.impressionSlots.filter(t => String(t).trim());
			st.canAddImpression    = rows < IMPRESSION_CAP;

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
			// The party starts visible; anyone dropped onto the table joins them (that's the
			// stored-ids source in buildRelationshipRows, which also lets this NPC rate
			// another NPC). Edit mode lists every candidate with a show/hide box; play mode
			// shows only the ticked ones.
			const relRows = this._buildRelationshipRows();
			st.relationships    = this._editMode ? relRows : relRows.filter(r => r.shown);
			st.hasRelationships = st.relationships.length > 0;
			// Whether anyone COULD be listed — the tab and the empty-state wording key off
			// this rather than the filtered count, so unticking everyone doesn't read the
			// same as a world with no player characters in it.
			st.hasRelationshipCandidates = relRows.length > 0;
			st.relationshipsAllHidden    = !st.hasRelationships && relRows.length > 0;
			// Show the section even with no characters (in edit mode) so it's discoverable;
			// a short empty-state explains what will populate it. Connections share this
			// tab, so written connections keep it reachable in a world with no PCs yet.
			st.showRelationships = st.hasRelationshipCandidates || st.hasConnections || this._editMode;
			st.canRate = this.isEditable;
			// Table or standings board, remembered per table in localStorage (not world data:
			// it's a reading preference, like the column widths beside it).
			st.rel = relationshipViewContext("npcRelationships", st.relationships);

			// GM moves (embedded npcMove items) — preserve authoring order.
			const npcMoves = this.actor.items.filter(i => i.type === "npcMove");
			context.npcMoves = await Promise.all(npcMoves.map(async i => ({
				id: i.id, name: i.name, system: i.system,
				enrichedDescription: this._editMode ? await enrichHTML(i.system?.description) : undefined,
			})));

			// Lifecycle status — an at-a-glance badge (dead / retired / away / …); blank
			// is the active default. `isInactive` dims + strikes the name for "gone" states.
			const statusMeta = npcStatusMeta(system?.status);
			st.status        = statusMeta;
			st.statusOptions = NPC_STATUSES.map(s => ({ ...s, selected: s.value === statusMeta.value }));
			st.isInactive    = statusMeta.inactive;

			// "Following" — the player character(s) who have recruited this NPC as a
			// follower: any custom-follower card whose sourceUuid points back at this actor
			// (the link the conversion sets). Lets the sheet show "Following: <PC>" and jump
			// to that PC's sheet, so a recruited NPC is no longer an orphan on either side.
			const npcUuid = this.actor.uuid;
			st.following = (game.actors?.contents ?? [])
				.filter(a => a.type === "character")
				.filter(pc => Object.values(pc.getFlag?.("stonetop-pwd", "customFollowers") ?? {})
					.some(f => f?.sourceUuid === npcUuid))
				.map(pc => ({ id: pc.id, name: pc.name }));
			st.isFollowing = st.following.length > 0;

			// Relationships and Stats render conditionally (see npc.hbs), so either can vanish
			// while it is the active tab — unticking "has game stats", or the last candidate
			// leaving the world. getData already knows the tab set, so clamp here rather than
			// probing the rendered nav afterwards: the first paint then shows a tab that
			// exists, instead of a blank body corrected after the user has seen it.
			const tabExists = { details: true, notes: true, relationships: st.showRelationships, stats: !!system?.hasStats };
			const activeTab = this._tabs?.[0]?.active;
			if (activeTab && !tabExists[activeTab]) this._tabs[0].active = "details";

			return context;
		}

		// Candidate rows for the Relationships tab: the player characters, plus anyone
		// already stored (how a dropped person persists as a row). Shared with the drop
		// handler so it judges "already listed?" against exactly what getData rendered.
		_buildRelationshipRows() {
			return buildRelationshipRows(this.actor, [{ actors: partyCharacters(), defaultShown: true }]);
		}

		activateListeners(html) {
			super.activateListeners(html);
			const root = html[0];

			// Auto-height: after Foundry's Tabs toggles the active panel, refit the window
			// to the new tab's content (rAF so the .active class settles before we measure).
			root.querySelectorAll(".sheet-tabs .item").forEach(item => {
				item.addEventListener("click", () => requestAnimationFrame(() => this._fitHeight()));
			});

			// Relationships table: resizable/sortable columns always; the hearts and
			// note field write only when the sheet is editable (shared with the
			// character sheet's Details-tab Relationships section).
			wireRelationshipTable(root, this.actor, { editable: this.isEditable });
			// Table/board toggle plus the board's lane controls. This window is auto-height,
			// so the board (taller than the table) needs a refit after the flip re-renders.
			wireRelationshipBoard(root, this.actor, {
				editable: this.isEditable,
				onViewChange: () => requestAnimationFrame(() => this._fitHeight()),
			});

			// Drop a person onto the Relationships tab to put them on the list — a stranger
			// (including another NPC) becomes a row, someone unticked is revealed.
			const relSection = root.querySelector(".stonetop-npc-relationships");
			const clearRelHighlight = wireRelationshipDropHighlight(relSection);
			if (relSection) {
				relSection.addEventListener("dragover", ev => ev.preventDefault());
				relSection.addEventListener("drop", async ev => {
					// Cancel the browser's default SYNCHRONOUSLY, before any await: an
					// un-cancelled drop over the note field pastes the drag payload JSON into
					// it, and stopping propagation here also cuts off core's own cancel.
					ev.preventDefault();
					ev.stopPropagation();
					clearRelHighlight();
					const data = getDragEventData(ev);
					if (data?.type !== "Actor" || !data.uuid) return;
					const doc = await fromUuid(data.uuid);
					const result = await relationshipDropResult(this.actor, doc, this._buildRelationshipRows(), {
						editable: this.isEditable,
					});
					const [level, message] = relationshipDropNotice(result, this.actor, doc);
					ui.notifications?.[level]?.(message);
				}, true);
			}

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

			// "Following" chips: open the leading PC's sheet (a view action; both modes).
			root.querySelectorAll(".stonetop-npc-following-pc").forEach(el => {
				el.addEventListener("click", ev => {
					ev.preventDefault();
					game.actors?.get(el.dataset.pcId)?.sheet?.render(true);
				});
			});

			// Enlarge a real portrait in play mode (edit mode leaves the file picker).
			wirePortraitPopout(this, root);

			if (!this.isEditable) return;

			root.addEventListener("click", async ev => {
				if (ev.target.closest(".stonetop-npc-add-impression")) {
					if (!this._editMode) return;
					this._addImpressionRow(root);

				} else if (ev.target.closest(".stonetop-npc-add-move")) {
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
			return updateRichTextField(this, NPC_RICH_TEXT_FIELDS, field, value);
		}

		async _updateMoveField(itemId, field, value) {
			return updateMoveField(this, NPC_MOVE_EDITABLE_FIELDS, itemId, field, value);
		}

		// Reveal the next impression slot (up to 3) by injecting an input row into the
		// DOM rather than re-rendering — the standard form submit persists it once the
		// GM types, and leaving it blank costs nothing (trailing blanks are trimmed on
		// the next render). Hides the "Add Impression" control once all three show.
		_addImpressionRow(root) {
			const list = root.querySelector(".stonetop-npc-impressions-edit");
			if (!list) return;
			const rows = list.querySelectorAll("li").length;
			if (rows >= 3) return;
			const li = document.createElement("li");
			const input = document.createElement("input");
			input.type = "text";
			input.className = "stonetop-npc-impression-input";
			input.name = `system.impressions.${rows}`;
			input.placeholder = game.i18n.localize("stonetop.npc.impressionPlaceholder");
			li.appendChild(input);
			list.appendChild(li);
			input.focus();
			if (rows + 1 >= 3) root.querySelector(".stonetop-npc-add-impression")?.closest(".stonetop-npc-add-controls")?.remove();
		}
	};
}
