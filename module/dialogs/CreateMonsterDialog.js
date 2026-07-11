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

const DEFAULTS = { organization: "group", size: "medium", armorBase: 0 };

export class CreateMonsterDialog extends StonetopDialog {
	constructor({ name = "", folder = null } = {}, options = {}) {
		super(options);
		this._name = name;
		this._folder = folder;
		this._resolve = null;
	}

	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id: "stonetop-create-monster",
			title: "Make a Monster",
			template: "systems/stonetop_pwd/templates/dialogs/create-monster.hbs",
			classes: ["stonetop", "stonetop-create-monster-dialog"],
			width: 760,
			height: 700,
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
		return {
			name: this._name,
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
		const form = html[0].querySelector(".create-monster");

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

		html.find(".cm-cancel").on("click", () => this.close());
		html.find(".cm-create").on("click", () => this._submit(form));
	}

	_recompute(form) {
		const derived = computeMonster(this._readSelections(form));
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
	_readSelections(form) {
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
			moves:        checks("move"),
		};
	}

	async _submit(form) {
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
			return;
		}

		invalidateMonsterRefIndex();
		created?.sheet?.render(true);
		this._finish(created ?? null);
	}

	_buildActorData(sel, derived) {
		const name = sel.name || this._name || "New Monster";
		const img = creatureTypeIcon(sel.creatureType) ?? undefined;
		const sizeTag = SIZES.find(s => s.id === sel.size)?.tag ?? "";

		const items = sel.moves
			.map(id => MOVE_SUGGESTIONS.find(m => m.id === id))
			.filter(Boolean)
			.map(m => ({
				name: m.name,
				type: "monsterMove",
				system: { description: `<p>${m.description}</p>`, rollFormula: "" },
			}));

		return {
			name,
			type: "monster",
			folder: this._folder ?? undefined,
			img,
			system: {
				attributes: {
					hp:       { value: derived.hp, max: derived.hp },
					armor:    { value: derived.armorValue, source: derived.armorSource },
					damage:   { value: derived.damageValue, rollFormula: derived.rollFormula },
					instinct: { value: sel.instinct },
				},
				concept:      sel.concept,
				organization: sel.organization,
				creatureType: sel.creatureType,
				size:         sizeTag,
				tags:         derived.tags,
				qualities:    "",
				notes:        "",
				count:        derived.count,
				entry:        "",
			},
			prototypeToken: {
				name,
				actorLink: false,
				disposition: CONST.TOKEN_DISPOSITIONS.HOSTILE,
				texture: img ? { src: img } : undefined,
			},
			items,
		};
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
