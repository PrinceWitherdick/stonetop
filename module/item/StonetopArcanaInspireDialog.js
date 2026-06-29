import { FrontOnOpen } from "../utils/front-on-open.js";
import {
	ORIGINS, NATURES, FORM_FIELDS, detailFieldsForNature,
	rollOnTable, seedDescriptionHtml,
} from "../data/artifact-creation-tables.js";

// Ordered step keys. The detail step's fields depend on the chosen nature, but the step
// is always present (every nature opens at least one detail table).
const STEPS = ["origin", "nature", "detail", "form", "review"];

const STEP_TITLES = {
	origin:  "Origin & theme",
	nature:  "Nature",
	detail:  "Details",
	form:    "Form",
	review:  "Review & create",
};

/**
 * The Artifact Creation inspiration wizard. Walks the Book II pick-or-roll tables
 * (origin → nature → detail → form), then builds a homebrew arcanum pre-filled with the
 * rolled results. The dialog is data-driven from artifact-creation-tables.js and stays
 * agnostic of how the card is created: it hands the choices to an `onCreate` callback.
 */
export class StonetopArcanaInspireDialog extends Application {
	/**
	 * @param {object}   [opts]
	 * @param {Function} opts.onCreate - async ({ name, major, front }) → Item. Creates the
	 *                                    card and wires it to wherever the wizard was opened.
	 */
	constructor({ onCreate } = {}, options = {}) {
		super(options);
		this._onCreate = onCreate;
		this._step  = "origin";
		// Chosen entry index per field key (origin / nature / detail fields / size / form).
		this._picks = {};
		this._name  = "";
		this._major = false;
		this._frontOnOpen = new FrontOnOpen(this);
	}

	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id:        "stonetop-arcana-inspire-dialog",
			template:  "systems/stonetop_pwd/templates/dialogs/arcana-inspire.hbs",
			title:     "Arcana — Inspire me",
			width:     560,
			height:    "auto",
			resizable: true,
			classes:   ["stonetop", "stonetop-arcana-inspire-dialog"],
		});
	}

	// Re-center on the previous step's center when a step change resizes the window, so
	// the modal grows/shrinks in place rather than jumping (mirrors LevelUpDialog).
	async _render(force, options) {
		const p = this.position;
		const prevCenter = [p?.left, p?.top, p?.width, p?.height].every(Number.isFinite)
			? { x: p.left + p.width / 2, y: p.top + p.height / 2 }
			: null;
		await super._render(force, options);
		this._frontOnOpen.apply();
		this.setPosition({ height: "auto" });
		if (prevCenter) {
			this.setPosition({
				left: prevCenter.x - this.position.width / 2,
				top:  prevCenter.y - this.position.height / 2,
			});
		}
	}

	async close(options = {}) {
		this._frontOnOpen.stop();
		return super.close(options);
	}

	_natureKey() {
		const idx = this._picks.nature;
		return Number.isInteger(idx) ? NATURES[idx]?.key : null;
	}

	// The fields shown on a given step (detail branches on the chosen nature).
	_fieldsForStep(step) {
		if (step === "origin") return [{ key: "origin", label: "Origin / theme", table: ORIGINS }];
		if (step === "nature") return [{ key: "nature", label: "Nature", table: NATURES }];
		if (step === "detail") return detailFieldsForNature(this._natureKey());
		if (step === "form")   return FORM_FIELDS;
		return [];
	}

	// Every field in display order, used to assemble the seed and review list.
	_orderedFields() {
		return [
			...this._fieldsForStep("origin"),
			...this._fieldsForStep("nature"),
			...this._fieldsForStep("detail"),
			...this._fieldsForStep("form"),
		];
	}

	// The chosen result lines ({ label, text }) for every field that has a pick.
	_chosenLines() {
		return this._orderedFields()
			.map(f => {
				const idx = this._picks[f.key];
				const entry = Number.isInteger(idx) ? f.table[idx] : null;
				return entry ? { label: f.label, text: entry.text } : null;
			})
			.filter(Boolean);
	}

	getData() {
		const stepIdx  = STEPS.indexOf(this._step);
		const isReview = this._step === "review";
		const data = {
			step:      this._step,
			stepTitle: STEP_TITLES[this._step],
			stepNum:   stepIdx + 1,
			stepTotal: STEPS.length,
			isReview,
			isFirst:   stepIdx === 0,
			isLast:    isReview,
		};

		if (isReview) {
			data.name  = this._name;
			data.major = this._major;
			data.lines = this._chosenLines();
			return data;
		}

		data.fields = this._fieldsForStep(this._step).map(f => ({
			key:   f.key,
			label: f.label,
			options: f.table.map((entry, i) => ({
				value:    String(i),
				label:    entry.text,
				selected: this._picks[f.key] === i,
			})),
			chosen: Number.isInteger(this._picks[f.key]),
		}));
		return data;
	}

	activateListeners(html) {
		super.activateListeners(html);
		this._frontOnOpen.start();
		const root = html[0];

		// Field selects → remember the pick (no re-render; the value is already shown).
		root.querySelectorAll("[data-inspire-field]").forEach(sel =>
			sel.addEventListener("change", () => {
				const v = sel.value;
				this._picks[sel.dataset.inspireField] = v === "" ? undefined : Number(v);
			}));

		// Per-field roll.
		root.querySelectorAll(".stonetop-inspire-roll").forEach(btn =>
			btn.addEventListener("click", () => this._rollField(btn.dataset.field)));
		// Roll every field on the step.
		root.querySelector(".stonetop-inspire-roll-all")?.addEventListener("click", () => this._rollAll());

		// Review-step inputs.
		root.querySelector("[name=arcName]")?.addEventListener("input", ev => { this._name = ev.target.value; });
		root.querySelectorAll("[name=arcTier]").forEach(r =>
			r.addEventListener("change", ev => { this._major = ev.target.value === "major"; }));

		// Navigation.
		root.querySelector(".stonetop-inspire-back")?.addEventListener("click", () => this._goBack());
		root.querySelector(".stonetop-inspire-next")?.addEventListener("click", () => this._goNext());
		root.querySelector(".stonetop-inspire-create")?.addEventListener("click", () => this._create());
		root.querySelector(".stonetop-inspire-cancel")?.addEventListener("click", () => this.close());
	}

	_rollField(key) {
		const field = this._fieldsForStep(this._step).find(f => f.key === key);
		if (!field) return;
		const entry = rollOnTable(field.table);
		this._picks[key] = field.table.indexOf(entry);
		this.render(false);
	}

	_rollAll() {
		for (const f of this._fieldsForStep(this._step)) {
			const entry = rollOnTable(f.table);
			this._picks[f.key] = f.table.indexOf(entry);
		}
		this.render(false);
	}

	// Origin and nature must be chosen before moving on (nature branches the detail step).
	_requirePickToAdvance() {
		if ((this._step === "origin" || this._step === "nature") && !Number.isInteger(this._picks[this._step])) {
			ui.notifications?.warn(this._step === "origin" ? "Pick or roll an origin first." : "Pick or roll a nature first.");
			return false;
		}
		return true;
	}

	_goBack() {
		const idx = STEPS.indexOf(this._step);
		if (idx > 0) { this._step = STEPS[idx - 1]; this.render(false); }
	}

	_goNext() {
		if (!this._requirePickToAdvance()) return;
		const idx = STEPS.indexOf(this._step);
		if (idx < STEPS.length - 1) { this._step = STEPS[idx + 1]; this.render(false); }
	}

	async _create() {
		const name = this._name.trim();
		if (!name) {
			ui.notifications?.warn("Name your arcanum first.");
			this.element[0]?.querySelector("[name=arcName]")?.focus();
			return;
		}
		const description = seedDescriptionHtml(this._chosenLines());
		await this._onCreate?.({ name, major: this._major, front: description ? { description } : undefined });
		this.close();
	}
}
