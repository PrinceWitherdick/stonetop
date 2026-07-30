// Add / edit one entry in the wound ledger (Book I, "Harm & Healing" — the 3rd and 4th
// harm types the sheet tracks beside HP and debilities).
//
// Laid out as a left-rail guided sheet like the first-session Welcome guide and the
// Make-a-Monster worksheet: the rail (shared `.stonetop-guide-toc`) switches which group
// of fields is showing, client-side, so the window stays short and the form keeps every
// value as the player moves around. What used to be one eight-field wall is now four
// panels — the wound itself, its treatment, what it costs while it lasts, and the
// Make-a-Plan tick boxes — each with the rules context for the fields it holds.
//
// Opened from the sheet's wound line (`_openWoundDialog` in StonetopCharacterSheet).
// Follows StonetopDialog's result protocol: `promise()` resolves to the collected wound
// data, or null if the player cancelled.
import { StonetopDialog } from "../../../utils/stonetop-dialog.js";
import { applyGuideRail, guideRailStep } from "../../../utils/guide-rail.js";
import { WOUND_STATUS_OPTIONS, WOUND_ORIGIN_OPTIONS, WOUND_STATUS_GLYPH, WOUND_STATUS_LABEL } from "../wound-display.js";

// The editor's panels, in the order a wound is lived through: what it is → how it's
// treated → what it costs you meanwhile → how you adapt if it never heals. `key` matches
// a `<section data-tab>` in the template and its rail button; `icon` is a Font Awesome 6
// glyph for the rail and banner.
const SECTIONS = [
	{ key: "wound",     title: "The wound",      icon: "fa-droplet" },
	{ key: "treatment", title: "Treatment",      icon: "fa-bandage" },
	{ key: "lasting",   title: "Lasting effects", icon: "fa-bolt" },
	{ key: "plan",      title: "Make a Plan",    icon: "fa-list-check" },
];

export class WoundDialog extends StonetopDialog {
	constructor({ isNew = true, wound = null, moveNames = [] } = {}, options = {}) {
		// A per-wound window id, so editing two wounds at once opens two windows rather
		// than two apps fighting over one DOM id (AppV1 keys the element by `options.id`).
		super({ id: `stonetop-wound-${wound?.id ?? "new"}`, ...options });
		this._isNew = isNew;
		this._wound = wound ?? {};
		this._moveNames = moveNames;
		this._activeTab = SECTIONS[0].key;
	}

	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id: "stonetop-wound-dialog",
			title: "Wound",
			template: "systems/stonetop-pwd/templates/dialogs/wound.hbs",
			classes: ["stonetop", "stonetop-wound-edit-dialog"],
			width: 620,
			// Fixed height so switching panels doesn't resize the window: tall enough that
			// the fullest panel (the wound itself, with its three status tiles) fits without
			// scrolling, and the panel column scrolls when a long tick-box list outgrows it.
			height: 545,
			resizable: true,
			scrollY: [".wd-main"],
		});
	}

	get title() {
		return this._isNew ? "Add Wound" : "Edit Wound";
	}

	getData() {
		const w = this._wound;
		const status = w.status ?? "problematic";
		const origin = w.origin ?? "wound";
		const activeIndex = Math.max(0, this._activeSectionIndex());
		return {
			isNew:        this._isNew,
			saveLabel:    this._isNew ? "Add wound" : "Save wound",
			text:            w.text ?? "",
			requirementNote: w.requirementNote ?? "",
			mechanicalTag:   w.mechanicalTag ?? "",
			planNote:        w.planNote ?? "",
			healed:          !!w.healed,
			statusOptions: WOUND_STATUS_OPTIONS.map(o => ({ ...o, selected: o.value === status })),
			originOptions: WOUND_ORIGIN_OPTIONS.map(o => ({ ...o, selected: o.value === origin })),
			reminderOptions: this._reminderOptions(w.reminderMove ?? ""),
			planRequirements: (w.planRequirements ?? []).map(r => ({ text: r.text ?? "", done: !!r.done })),
			// Left rail + banner. Only the first-render active state comes from here;
			// switching panels afterwards is client-side (see _selectTab), so the form keeps
			// its values without a re-render.
			sections:     SECTIONS.map((s, i) => ({ ...s, selected: i === activeIndex })),
			sectionCount: SECTIONS.length,
			active:       { ...SECTIONS[activeIndex], index: activeIndex + 1 },
			summary:      this._summary(w.text ?? "", status),
		};
	}

	// Live banner readout: the wound's name and what state it's in, so the two fields that
	// identify it stay visible from every panel.
	_summary(text, status) {
		return {
			name: text.trim() || (this._isNew ? "New wound" : "(unnamed wound)"),
			// The descriptive label the sheet's wound tooltip uses, not the tile's one-word
			// one — the banner has room to spell the state out.
			status: WOUND_STATUS_LABEL[status] ?? status,
			glyph:  WOUND_STATUS_GLYPH[status] ?? WOUND_STATUS_GLYPH.problematic,
		};
	}

	// Options for the "remind on" picker: none, all move rolls, then the moves by name.
	// ("All move rolls" not "All rolls" — the echo only rides 2d6+stat move rolls, not
	// damage/formula/Death's-Door rolls, so the label shouldn't overpromise.)
	_reminderOptions(selected) {
		const opts = [
			{ value: "",  label: "— no reminder —" },
			{ value: "*", label: "All move rolls" },
			...this._moveNames.map(name => ({ value: name, label: name })),
		];
		// If the stored reminder targets a move that's since been renamed or unlearned,
		// keep it as an explicit option so re-saving the wound doesn't silently drop the
		// (drifted) binding — the dropdown would otherwise have no matching value.
		if (selected && selected !== "*" && !this._moveNames.includes(selected)) {
			opts.push({ value: selected, label: `${selected} (not a current move)` });
		}
		return opts.map(o => ({ ...o, selected: o.value === selected }));
	}

	activateListeners(html) {
		super.activateListeners(html);
		// In an AppV1 Application `html[0]` IS the template's root — here the
		// `<form class="wound-dialog">` itself, not an ancestor — so take it directly
		// rather than querying for a descendant that will never match.
		const root = html[0];
		const form = root?.matches?.(".wound-dialog") ? root : root?.querySelector(".wound-dialog");
		if (!form) return;

		// Left-rail panels + Back/Next: switch which panel is shown, client-side. No
		// re-render, so every field keeps its value and focus.
		form.querySelectorAll(".wd-tab").forEach(btn =>
			btn.addEventListener("click", () => this._selectTab(form, btn.dataset.tab)));
		form.querySelector(".wd-back")?.addEventListener("click", () => this._step(form, -1));
		form.querySelector(".wd-next")?.addEventListener("click", () => this._step(form, 1));

		form.querySelector(".wd-save")?.addEventListener("click", () => this._save(form));
		form.querySelector(".wd-cancel")?.addEventListener("click", () => this.close());

		// Keep the banner's name/status readout in step with the two fields that drive it,
		// so they stay legible from the panels that don't hold them.
		form.querySelector('[name="text"]')?.addEventListener("input", () => this._syncSummary(form));
		form.querySelectorAll('input[name="status"]').forEach(radio =>
			radio.addEventListener("change", () => this._syncSummary(form)));

		// Enter anywhere in the form saves rather than reloading the page (the form has no
		// submit button, so a bare Enter would otherwise fall through to the browser).
		form.addEventListener("submit", ev => { ev.preventDefault(); this._save(form); });

		this._wireRequirements(form);
		// Seed the rail from the same path a click takes, so the Back/Next disabled state on
		// first paint can't drift from the one every later switch produces. Idempotent: the
		// template already rendered this panel active, so nothing visible changes.
		this._selectTab(form, this._activeTab);
	}

	// Make-a-Plan tick boxes (Book I p.530: "write the requirements down with tick
	// boxes… tick the boxes off"). Rows are cloned from the template in the .hbs and read
	// back off the live DOM on save.
	_wireRequirements(form) {
		form.querySelectorAll(".wd-req").forEach(row => this._wireRequirementRow(form, row));
		form.querySelector(".wd-req-add")?.addEventListener("click", () => this._addRequirement(form, { focus: true }));
		this._syncRequirementsEmpty(form);
	}

	_wireRequirementRow(form, row) {
		row.querySelector(".wd-req-remove")?.addEventListener("click", () => {
			row.remove();
			this._syncRequirementsEmpty(form);
		});
	}

	_addRequirement(form, { text = "", done = false, focus = false } = {}) {
		const list = form.querySelector(".wd-req-list");
		const row  = form.querySelector(".wd-req-tpl")?.content?.firstElementChild?.cloneNode(true);
		if (!list || !row) return null;
		row.querySelector(".wd-req-text").value = text;
		row.querySelector(".wd-req-done").checked = done;
		this._wireRequirementRow(form, row);
		list.appendChild(row);
		this._syncRequirementsEmpty(form);
		if (focus) row.querySelector(".wd-req-text")?.focus();
		return row;
	}

	// Show the "no requirements yet" placeholder only while the list is empty.
	_syncRequirementsEmpty(form) {
		const list = form.querySelector(".wd-req-list");
		if (list) list.classList.toggle("is-empty", list.querySelectorAll(".wd-req").length === 0);
	}

	_syncSummary(form) {
		const text = form.querySelector('[name="text"]')?.value ?? "";
		const s = this._summary(text, this._readStatus(form));
		const name = form.querySelector(".wd-summary-name");
		if (name) name.textContent = s.name;
		const label = form.querySelector(".wd-summary-status");
		if (label) label.textContent = s.status;
		const glyph = form.querySelector(".wd-summary-glyph");
		if (glyph) glyph.className = `fas ${s.glyph} wd-summary-glyph`;
	}

	/** Index of the currently-shown panel in the SECTIONS rail. */
	_activeSectionIndex() {
		return SECTIONS.findIndex(s => s.key === this._activeTab);
	}

	/** Walk the rail one panel at a time (Back/Next), stopping at the ends. */
	_step(form, delta) {
		const next = guideRailStep(SECTIONS, this._activeTab, delta);
		if (next) this._selectTab(form, next.key);
	}

	// Show one panel and light its rail entry, updating the banner (icon, title, count) and
	// the Back/Next disabled state to match. Purely DOM — the form is never re-rendered, so
	// switching panels preserves everything already typed.
	_selectTab(form, key) {
		const index = SECTIONS.findIndex(s => s.key === key);
		if (index < 0) return;
		this._activeTab = key;
		const active = SECTIONS[index];

		applyGuideRail(form, {
			key, dataKey: "tab",
			tabSelector: ".wd-tab",
			sectionSelector: ".wd-section",
			iconSelector: ".wd-banner-icon",
			icon: active.icon,
			iconExtraClass: "wd-banner-icon",
			mainSelector: ".wd-main",
			titleSelector: ".wd-banner-title", title: active.title,
			countSelector: ".wd-banner-count",
			backSelector: ".wd-back", nextSelector: ".wd-next",
			index, total: SECTIONS.length,
		});
	}

	// Status is a radio tile group, so read the checked one — a bare `[name="status"]`
	// lookup would always answer with the first tile's value.
	_readStatus(form) {
		return form.querySelector('input[name="status"]:checked')?.value ?? "problematic";
	}

	/** Read the whole form — every panel, not just the visible one — into a wound record. */
	_read(form) {
		const val = name => (form.querySelector(`[name="${name}"]`)?.value ?? "");
		return {
			text:            val("text").trim(),
			status:          this._readStatus(form),
			origin:          val("origin"),
			requirementNote: val("requirementNote").trim(),
			mechanicalTag:   val("mechanicalTag").trim(),
			reminderMove:    val("reminderMove"),
			planNote:        val("planNote").trim(),
			planRequirements: Array.from(form.querySelectorAll(".wd-req")).map(row => ({
				text: (row.querySelector(".wd-req-text")?.value ?? "").trim(),
				done: !!row.querySelector(".wd-req-done")?.checked,
			})).filter(r => r.text),
			healed:          !!form.querySelector('[name="healed"]')?.checked,
		};
	}

	_save(form) {
		this._resolveWith(this._read(form));
	}
}
