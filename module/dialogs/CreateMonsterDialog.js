// Guided "make a monster" worksheet (Book I, "Dangers", pp.392-398). Walks the
// GM through the book's fill-in tables on one page — organization, size, tags,
// HP/armor/damage modifiers, instinct, and a move checklist — with a live stat
// summary that recomputes as boxes are ticked. On submit it creates a fully
// populated `monster` actor and opens its stat block; the description and lore
// (steps 10-11) are authored there.
//
// Opened from the preCreateActor interception in StonetopSingleton.js when a GM
// creates a blank Monster from the "Create Actor" dialog.
import { StonetopDialog } from "../utils/stonetop-dialog.js";
import { CREATURE_TYPE_CHOICES, creatureTypeIcon } from "../bestiary/creature-types.js";
import { invalidateMonsterRefIndex } from "../bestiary/monster-ref-index.js";
import {
	computeMonster,
	buildMonsterActorData,
	ORGANIZATIONS,
	SIZES,
	NATURE_TAGS,
	NOTABLE_TAGS,
	HP_MODIFIERS,
	ARMOR_BASES,
	ARMOR_MODIFIERS,
	DAMAGE_RANGE_TAGS,
	DAMAGE_EFFECT_TAGS,
	DAMAGE_MODIFIERS,
	MOVE_SUGGESTIONS,
} from "../data/monster-builder.js";
import { formatCustomMoveDescription } from "../utils/custom-move-text.js";
import { applyGuideRail } from "../utils/guide-rail.js";

const DEFAULTS = { organization: "group", size: "medium", armorBase: 0 };

// The worksheet's sections, in book order, driving the left rail (like Run an
// Expedition). Each `key` matches a `<section data-tab>` in the template and the
// rail button's `data-tab`; `icon` is a Font Awesome 6 glyph for the rail/banner.
// Steps 10-11 (description, lore) aren't here — they're authored on the stat block.
const SECTIONS = [
	{ key: "concept",  title: "Concept & name", icon: "fa-feather-pointed" },
	{ key: "tags",     title: "Tags",           icon: "fa-tags" },
	{ key: "hp",       title: "Hit points",     icon: "fa-heart" },
	{ key: "armor",    title: "Armor",          icon: "fa-shield-halved" },
	{ key: "damage",   title: "Damage",         icon: "fa-burst" },
	{ key: "instinct", title: "Instinct",       icon: "fa-brain" },
	{ key: "moves",    title: "Moves",          icon: "fa-bolt" },
];

export class CreateMonsterDialog extends StonetopDialog {
	constructor({ name = "", folder = null } = {}, options = {}) {
		super(options);
		this._name = name;
		this._folder = folder;
		this._resolve = null;
		this._activeTab = SECTIONS[0].key;
	}

	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id: "stonetop-create-monster",
			title: "Make a Monster",
			template: "systems/stonetop_pwd/templates/dialogs/create-monster.hbs",
			classes: ["stonetop", "stonetop-create-monster-dialog"],
			width: 760,
			// Fixed height so switching tabs doesn't resize the window; the section
			// column scrolls when a tab (Tags, Moves) runs long.
			height: 620,
			resizable: true,
			scrollY: [".cm-main"],
		});
	}

	/** Open the dialog and resolve to the created monster Actor (or null if cancelled). */
	promise() {
		return new Promise(resolve => { this._resolve = resolve; this.render(true); });
	}

	getData() {
		const opt = (list, selectedId) => list.map(o => ({ ...o, selected: String(o.id) === String(selectedId) }));
		const derived = computeMonster(DEFAULTS);
		const activeIndex = Math.max(0, this._activeSectionIndex());
		return {
			name: this._name,
			// Left rail + banner. Only the first-render active state comes from here;
			// switching tabs afterwards is client-side (see _selectTab), so the form
			// keeps its values without a re-render.
			sections:      SECTIONS.map((s, i) => ({ ...s, index: i + 1, selected: i === activeIndex })),
			sectionCount:  SECTIONS.length,
			active:        { ...SECTIONS[activeIndex], index: activeIndex + 1 },
			organizations:    opt(ORGANIZATIONS, DEFAULTS.organization),
			sizes:            opt(SIZES, DEFAULTS.size),
			natureTags:       NATURE_TAGS,
			notableTags:      NOTABLE_TAGS,
			hpModifiers:      HP_MODIFIERS,
			armorBases:       opt(ARMOR_BASES, DEFAULTS.armorBase),
			armorModifiers:   ARMOR_MODIFIERS,
			damageRangeTags:  DAMAGE_RANGE_TAGS,
			damageEffectTags: DAMAGE_EFFECT_TAGS,
			damageModifiers:  DAMAGE_MODIFIERS,
			moveSuggestions:  MOVE_SUGGESTIONS,
			creatureTypes:    Object.entries(CREATURE_TYPE_CHOICES).map(([slug, label]) => ({ slug, label })),
			summary:          this._summary(derived),
		};
	}

	// Shape the derived stat block for the summary panel.
	_summary(d) {
		const armor = d.armorSource ? `${d.armorValue} (${d.armorSource})` : String(d.armorValue);
		const rangeAdvice = d.rangeAdvice === "add"
			? "Its size adds a range to the attack."
			: d.rangeAdvice === "reduce"
				? "Its size reduces the attack's range by a step."
				: "";
		return { hp: d.hp, armor, damage: d.damageValue, tags: d.tags || "—", rangeAdvice };
	}

	activateListeners(html) {
		super.activateListeners(html);
		// In an AppV1 Application, `html[0]` IS the template's root — here the
		// `<form class="create-monster">` itself, not an ancestor. `querySelector`
		// only searches descendants, so the old `html[0].querySelector(".create-monster")`
		// returned null (the form matches itself, never a child) and crashed on the
		// first addEventListener. Take the root directly, tolerating either shape.
		const root = html[0];
		const form = root?.matches?.(".create-monster") ? root : root?.querySelector(".create-monster");
		if (!form) return;

		// The stat summary recomputes live from the form on every edit — no re-render,
		// so text fields keep focus and the worksheet keeps its scroll position. A short
		// debounce coalesces a run of keystrokes (and only the numbers change on typing,
		// not the radio/checkbox reads) into one recompute instead of one per key.
		const recompute = () => {
			clearTimeout(this._recomputeTimer);
			this._recomputeTimer = setTimeout(() => this._recompute(form), 50);
		};
		form.addEventListener("input", recompute);
		form.addEventListener("change", recompute);

		// Left-rail tabs: switch which worksheet section is shown, client-side. No
		// re-render, so every field keeps its value/focus and the live stat readout.
		form.querySelectorAll(".cm-tab").forEach(btn =>
			btn.addEventListener("click", () => this._selectTab(form, btn.dataset.tab)));

		// "Next" walks the section rail one step at a time (same client-side switch as
		// clicking a rail entry); it disables itself on the final section.
		form.querySelector(".cm-next")?.addEventListener("click", () => this._selectNext(form));
		form.querySelector(".cm-create")?.addEventListener("click", () => this._submit(form));
		this._wireMoves(form);
		this._syncNext(form);
	}

	// Moves section: the book prompts are quick-add buttons and every move is an
	// editable card (name + description). Cards are the authoritative move list read
	// at submit — the prompts just seed a card the GM can then rewrite in place.
	_wireMoves(form) {
		form.querySelectorAll(".cm-move-suggestion").forEach(btn =>
			btn.addEventListener("click", () => {
				const sug = MOVE_SUGGESTIONS.find(m => m.id === btn.dataset.suggestion);
				this._addMoveCard(form, { name: sug?.name ?? "", description: sug?.description ?? "", focus: true });
			}));
		form.querySelector(".cm-move-add")?.addEventListener("click", () =>
			this._addMoveCard(form, { focus: true }));
		this._syncMovesEmpty(form);
	}

	// Append one editable move card (cloned from the template in the .hbs), optionally
	// pre-filled from a book prompt and focused for immediate editing.
	_addMoveCard(form, { name = "", description = "", focus = false } = {}) {
		const list = form.querySelector(".cm-move-list");
		const tpl  = form.querySelector(".cm-move-tpl");
		const card = tpl?.content?.firstElementChild?.cloneNode(true);
		if (!list || !card) return null;
		card.querySelector(".cm-move-name").value = name;
		card.querySelector(".cm-move-desc").value = description;
		card.querySelector(".cm-move-remove")?.addEventListener("click", () => {
			card.remove();
			this._syncMovesEmpty(form);
		});
		list.appendChild(card);
		this._syncMovesEmpty(form);
		if (focus) card.querySelector(".cm-move-name")?.focus();
		return card;
	}

	// Show the "no moves yet" placeholder only while the list is empty.
	_syncMovesEmpty(form) {
		const list = form.querySelector(".cm-move-list");
		if (list) list.classList.toggle("is-empty", list.querySelectorAll(".cm-move-card").length === 0);
	}

	// Read the authored move cards, dropping any left entirely blank.
	_readMoves(form) {
		return Array.from(form.querySelectorAll(".cm-move-card")).map(card => ({
			name:        (card.querySelector(".cm-move-name")?.value ?? "").trim(),
			description: (card.querySelector(".cm-move-desc")?.value ?? "").trim(),
		})).filter(m => m.name || m.description);
	}

	// Index of the currently-shown section in the book-ordered SECTIONS rail.
	_activeSectionIndex() {
		return SECTIONS.findIndex(s => s.key === this._activeTab);
	}

	// Advance to the next worksheet section, if any.
	_selectNext(form) {
		const next = SECTIONS[this._activeSectionIndex() + 1];
		if (next) this._selectTab(form, next.key);
	}

	// Hide "Next" once there's nowhere left to advance (last section active).
	_syncNext(form) {
		const btn = form.querySelector(".cm-next");
		if (btn) btn.hidden = this._activeSectionIndex() >= SECTIONS.length - 1;
	}

	// Show one worksheet section and light its rail entry, updating the banner (icon,
	// title, count) to match. Purely DOM — the form is never re-rendered, so switching
	// tabs preserves everything the GM has already filled in.
	_selectTab(form, key) {
		const index = SECTIONS.findIndex(s => s.key === key);
		if (index < 0) return;
		this._activeTab = key;
		const active = SECTIONS[index];

		applyGuideRail(form, {
			key, dataKey: "tab",
			tabSelector: ".cm-tab",
			sectionSelector: ".cm-section",
			iconSelector: ".cm-banner-icon",
			icon: active.icon,
			iconExtraClass: "cm-banner-icon",
			mainSelector: ".cm-main",
		});

		const title = form.querySelector(".cm-banner-title");
		if (title) title.textContent = active.title;
		const count = form.querySelector(".cm-banner-count");
		if (count) count.textContent = `${index + 1} / ${SECTIONS.length}`;

		this._syncNext(form);
	}

	_recompute(form) {
		// The live summary never reads moves, so skip the move-card DOM walk on every keystroke.
		const derived = computeMonster(this._readSelections(form, { withMoves: false }));
		const s = this._summary(derived);
		const set = (sel, text) => { const el = form.querySelector(sel); if (el) el.textContent = text; };
		set(".cm-summary-hp", s.hp);
		set(".cm-summary-armor", s.armor);
		set(".cm-summary-damage", s.damage);
		set(".cm-summary-tags", s.tags);
		const advice = form.querySelector(".cm-summary-range");
		if (advice) {
			advice.textContent = s.rangeAdvice;
			advice.hidden = !s.rangeAdvice;
		}
	}

	/** Read the worksheet into the shape computeMonster() and _buildActorData() expect. */
	_readSelections(form, { withMoves = true } = {}) {
		const text   = name => (form.querySelector(`[name="${name}"]`)?.value ?? "").trim();
		const radio  = name => form.querySelector(`input[name="${name}"]:checked`)?.value ?? "";
		const checks = name => Array.from(form.querySelectorAll(`input[name="${name}"]:checked`)).map(i => i.value);
		return {
			concept:      text("concept"),
			name:         text("name"),
			instinct:     text("instinct"),
			creatureType: text("creatureType"),
			organization: radio("organization") || DEFAULTS.organization,
			size:         radio("size") || DEFAULTS.size,
			armorBase:    radio("armorBase") || 0,
			armorSource:  text("armorSource"),
			natureTags:   checks("nature"),
			notableTags:  checks("notable"),
			customTags:   text("customTags"),
			hpMods:       checks("hpMod"),
			armorMods:    checks("armorMod"),
			damageTags:   checks("damageTag"),
			damageMods:   checks("damageMod"),
			moves:        withMoves ? this._readMoves(form) : [],
		};
	}

	async _submit(form) {
		// Guard the async gap: Actor.create yields, and the button stays live until the
		// dialog closes, so a fast double-click would otherwise issue two creates (two
		// monsters, two stat-block sheets). One submit wins; disable the button for feedback.
		if (this._submitting) return;
		this._submitting = true;
		const createBtn = form.querySelector(".cm-create");
		if (createBtn) createBtn.disabled = true;

		const sel = this._readSelections(form);
		const derived = computeMonster(sel);
		const actorData = this._buildActorData(sel, derived);

		let created;
		try {
			// The `stonetopMonsterBuilt` flag tells the preCreateActor interception this
			// is the finished actor (not a bare "Create Actor" click) so it doesn't loop.
			created = await Actor.create(actorData, { stonetopMonsterBuilt: true });
		} catch (err) {
			console.error("Stonetop | failed to create monster from worksheet", err);
			ui.notifications?.error("Could not create the monster. See the console for details.");
			// Let the GM retry (the create failed, so nothing was made).
			this._submitting = false;
			if (createBtn) createBtn.disabled = false;
			return;
		}

		invalidateMonsterRefIndex();
		created?.sheet?.render(true);
		this._finish(created ?? null);
	}

	_buildActorData(sel, derived) {
		const name = sel.name || this._name || "New Monster";
		const items = sel.moves.map(m => ({
			name: m.name || "New move",
			type: "monsterMove",
			system: { description: formatCustomMoveDescription(m.description), rollFormula: "" },
		}));

		return buildMonsterActorData({
			name,
			img:          creatureTypeIcon(sel.creatureType) ?? undefined,
			folder:       this._folder,
			creatureType: sel.creatureType,
			hp:           derived.hp,
			armorValue:   derived.armorValue,
			armorSource:  derived.armorSource,
			damageValue:  derived.damageValue,
			rollFormula:  derived.rollFormula,
			instinct:     sel.instinct,
			concept:      sel.concept,
			organization: sel.organization,
			size:         SIZES.find(s => s.id === sel.size)?.tag ?? "",
			tags:         derived.tags,
			count:        derived.count,
			items,
		});
	}

	_finish(result) {
		const resolve = this._resolve;
		this._resolve = null;
		this.close();
		resolve?.(result);
	}

	async close(options = {}) {
		clearTimeout(this._recomputeTimer);
		// Closing without submitting (Cancel, Escape, X) resolves the promise to null.
		if (this._resolve) { const resolve = this._resolve; this._resolve = null; resolve(null); }
		// super.close() stops the FrontOnOpen lifecycle, then closes the app.
		return super.close(options);
	}
}
