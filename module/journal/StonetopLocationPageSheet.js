import { qaPairs, hasText, enrichQaPairs } from "../actors/bestiary/codex.js";
import { applyJournalCheckboxes } from "../utils/journal-checkboxes.js";
import { bindSteadingImprovementDrag } from "./steading-improvement-cards.js";
import { applyJournalRollTables } from "../utils/journal-roll-tables.js";
import { isInCompendium, blockCompendiumEdit } from "../utils/compendium-edit-guard.js";

// Edit affordances on the location page; clicking any of these in a compendium gets
// the immutable-journal dialog instead of mutating the read-only document.
const LOCATION_EDIT_SELECTOR = ".stonetop-section-edit, .stonetop-section-done, .stonetop-entry-add-qa, .stonetop-entry-remove-qa";

// A gazetteer place rendered as a structured JournalEntryPage (subtype
// "location"), the locations counterpart of StonetopBestiaryPageSheet. The page
// holds an ordered `system.sections[]` (see LocationPageModel); each section is
// either rich `prose` or a `qa` prompt/answer list, and each gets its own inline
// edit pencil. Sections are addressed by their array INDEX (locations are
// heterogeneous, so there's no fixed field name to key on).
//
// Two ways to edit, mirroring the bestiary page:
//   • Inline per-section — the embedded read-only page shows a pencil on each
//     section header; clicking flips just that section into edit fields.
//   • Whole-page popout — the journal's page edit-pencil opens this sheet as a
//     window with every section editable at once (isEditable === true).
export function createStonetopLocationPageSheetClass(Base) {
	return class StonetopLocationPageSheet extends Base {
		_editingSections = new Set();

		static get defaultOptions() {
			return foundry.utils.mergeObject(super.defaultOptions, {
				classes: ["stonetop", "sheet", "journal-entry-page", "stonetop-bestiary-page", "stonetop-location-page"],
				width:   720,
				height:  800,
				submitOnChange: true,
				closeOnSubmit:  false,
			});
		}

		get _editMode() { return this.isEditable || this._editingSections.size > 0; }

		// Compendium journals are immutable reference content — never editable in place,
		// regardless of the pack's lock state. Edit attempts are redirected to a dialog
		// (see activateListeners) pointing the user at the world copy.
		get isEditable() { return super.isEditable && !isInCompendium(this.document); }

		get template() {
			return "systems/stonetop_pwd/templates/journal/location.hbs";
		}

		// The embedded page view renders with `editable: false`, which makes
		// FormApplication readonly every field. We gate editability per section in
		// the template (read markup has no inputs), so suppress the blanket lockdown.
		_disableFields(_form) {}

		async getData(options = {}) {
			const context = super.getData(options);
			const system = context.system = this.document.system;
			const owner = this.document.isOwner;
			const editable = this.isEditable; // popout = edit everything
			const st = context.stonetop = {};
			st.isEditable = editable;
			st.owner = owner;
			st.inlineOwner = owner && !editable; // per-section pencils inline only

			const textEditor = foundry.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
			const enrich = value => textEditor?.enrichHTML ? textEditor.enrichHTML(value ?? "", {}) : Promise.resolve(value ?? "");

			st.sections = await Promise.all((system.sections ?? []).map(async (s, index) => {
				const open = this._editingSections.has(index);
				const editing = editable || open;
				const isQa = s.kind === "qa";
				const filled = isQa
					? (s.pairs ?? []).some(p => p?.prompt || p?.answer)
					: hasText(s.body);
				// In read mode, enrich each prompt/answer so baked @UUID cross-links (e.g. a
				// place name linked in a Questions section) resolve and become clickable —
				// the same enrichment the prose sections get. Edit mode shows the raw value
				// in an input, so it's left unenriched.
				let pairs = isQa ? qaPairs(s.pairs, editing) : [];
				if (isQa && !editing) pairs = await enrichQaPairs(pairs, enrich);
				return {
					index,
					kind: s.kind,
					heading: s.heading,
					danger: !!s.danger,
					isQa,
					open,
					editing,
					visible: owner || filled, // non-owners only see filled sections
					body: isQa ? "" : (s.body ?? ""),      // raw source for the editor's `value`
					enrichedBody: isQa ? "" : await enrich(s.body), // enriched for read-only display
					pairs,
				};
			}));

			return context;
		}

		/**
		 * Re-render just this page. Inline, re-render this one page view inside the
		 * journal (cheap); in the popout, re-render the window. Used for the section
		 * pencil/done toggles, which change `_editingSections` without touching the
		 * document (content edits persist via update, which auto-re-renders).
		 */
		async _refresh() {
			if (this.isEditable) return this.render(false);
			const journal = this.document.parent?.sheet;
			if (journal?.rendered) return journal.render({ parts: [this.document.id] });
		}

		// Replace one section with `{...section, ...patch}`, persisting the whole
		// sections array (ArrayField updates are whole-array).
		async _patchSection(index, patch) {
			const sections = foundry.utils.deepClone(this.document.system.sections ?? []);
			if (!sections[index]) return;
			Object.assign(sections[index], patch);
			await this.document.update({ "system.sections": sections });
		}

		// Rebuild a `qa` section's pairs from its current edit inputs.
		_readPairs(root, index) {
			const section = root.querySelector(`[data-section-index="${index}"]`);
			if (!section) return [];
			return Array.from(section.querySelectorAll("[data-qa-index]")).map(row => ({
				prompt: row.querySelector(".stonetop-entry-qa-prompt")?.value ?? "",
				answer: row.querySelector(".stonetop-entry-qa-answer")?.value ?? "",
			}));
		}

		activateListeners(html) {
			super.activateListeners(html);
			// The embedded view sheet is rendered by the journal, which never sets
			// `_element`; point it at our root so queries work in both modes.
			this._element = html;
			const root = html[0];
			// Make the requirement/option check-lists tickable in view mode. The custom
			// page sheet fires `renderStonetopLocationPageSheet`, not the journal render
			// hooks that drive this elsewhere, so run the pass here. Before the owner
			// gate: non-owners still see the shared checked state (they just can't edit).
			applyJournalCheckboxes(this, html);
			// Roll the random tables from their "Roll" header (this custom sheet fires its
			// own render event, so the generic journal hook never reaches it — run it here).
			applyJournalRollTables(this, html);
			// Baked steading-improvement cards drag onto the Stonetop sheet (any viewer).
			bindSteadingImprovementDrag(html);
			if (!root || !this.document.isOwner) return;

			root.addEventListener("click", async ev => {
				const t = ev.target;

				// Immutable compendium copy: redirect any edit click to the explainer dialog.
				if (blockCompendiumEdit(this.document, ev, LOCATION_EDIT_SELECTOR)) return;

				// Per-section edit/done toggles.
				const edit = t.closest(".stonetop-section-edit");
				if (edit) { this._editingSections.add(Number(edit.dataset.section)); return this._refresh(); }

				const done = t.closest(".stonetop-section-done");
				if (done) {
					const index = Number(done.dataset.section);
					const section = done.closest("[data-section-index]");
					// Always-active rich editors only save via toolbar/Ctrl+S, not on
					// blur, so flush their live content before closing the section.
					const editor = section?.querySelector(".stonetop-entry-rich-editor");
					if (editor) await this._patchSection(index, { body: editor.value });
					this._editingSections.delete(index);
					return this._refresh();
				}

				// Q&A add/remove (structural; the document update re-renders the page).
				const add = t.closest(".stonetop-entry-add-qa");
				if (add) {
					if (!this._editMode) return;
					const index = Number(add.closest("[data-section-index]")?.dataset?.sectionIndex);
					const pairs = this._readPairs(root, index);
					pairs.push({ prompt: "", answer: "" });
					return this._patchSection(index, { pairs });
				}
				const remove = t.closest(".stonetop-entry-remove-qa");
				if (remove) {
					if (!this._editMode) return;
					const section = remove.closest("[data-section-index]");
					const index = Number(section?.dataset?.sectionIndex);
					const j = Number(remove.closest("[data-qa-index]")?.dataset?.qaIndex);
					const pairs = this._readPairs(root, index);
					if (!Number.isNaN(j)) pairs.splice(j, 1);
					return this._patchSection(index, { pairs });
				}
			});

			root.addEventListener("change", async ev => {
				if (!this._editMode) return;
				const t = ev.target;

				const editor = t.closest(".stonetop-entry-rich-editor");
				if (editor) {
					return this._patchSection(Number(editor.dataset.sectionIndex), { body: editor.value });
				}
				const qaInput = t.closest(".stonetop-entry-qa-input");
				if (qaInput) {
					const index = Number(qaInput.closest("[data-section-index]")?.dataset?.sectionIndex);
					return this._patchSection(index, { pairs: this._readPairs(root, index) });
				}
			});
		}
	};
}
