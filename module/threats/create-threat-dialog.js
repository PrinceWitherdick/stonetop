// Guided "write up a threat" dialog (Book I, "Writing a threat"). Pick one of the
// eight types and its canned GM moves appear as a checklist; name it, give it an
// instinct and a proximity. Returns a seed via promise(); the fuller doom track /
// stakes / description are authored in the page editor that opens right after.
import { FrontOnOpen } from "../utils/front-on-open.js";
import { THREAT_TYPES, THREAT_PROXIMITIES, threatType, THREAT_PROXIMITY_IDS, DEFAULT_THREAT_TYPE, DEFAULT_PROXIMITY } from "./threat-types.js";

export class CreateThreatDialog extends Application {
	constructor(steadingActor, { defaultProximity, ...options } = {}) {
		super(options);
		this.steadingActor = steadingActor;
		this._type = DEFAULT_THREAT_TYPE;
		// Pre-select the proximity of the section the "write up" button lives under
		// (falling back to the default, the book's Nearby), so a homefront button starts on Homefront.
		this._proximity = THREAT_PROXIMITY_IDS.includes(defaultProximity) ? defaultProximity : DEFAULT_PROXIMITY;
		this._name = "";
		this._instinct = "";
		this._selectedMoves = new Set();
		this._resolve = null;
		this._frontOnOpen = new FrontOnOpen(this);
	}

	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id: "stonetop-create-threat",
			title: "Write Up a Threat",
			template: "systems/stonetop_pwd/templates/dialogs/create-threat.hbs",
			classes: ["stonetop", "stonetop-create-threat-dialog"],
			width: 560,
			height: "auto",
			resizable: true,
		});
	}

	/** Open the dialog and resolve to a threat seed (or null if cancelled). */
	promise() {
		return new Promise(resolve => { this._resolve = resolve; this.render(true); });
	}

	async _render(force, options) {
		await super._render(force, options);
		this._frontOnOpen.apply();
	}

	getData() {
		const type = threatType(this._type);
		return {
			accent: type.accent,
			typeLabel: type.label,
			name: this._name,
			instinct: this._instinct,
			types: THREAT_TYPES.map(t => ({ id: t.id, label: t.label, blurb: t.blurb, accent: t.accent, selected: t.id === this._type })),
			proximities: THREAT_PROXIMITIES.map(p => ({ id: p.id, label: p.label, hint: p.hint, selected: p.id === this._proximity })),
			suggestedMoves: type.suggestedMoves.map(text => ({ text, checked: this._selectedMoves.has(text) })),
		};
	}

	/** Snapshot the free-text/radio fields so they survive the re-render on type change. */
	_capture(html) {
		this._name = html.find(".ct-name").val() ?? this._name;
		this._instinct = html.find(".ct-instinct").val() ?? this._instinct;
		const prox = html.find("input[name='ct-proximity']:checked").val();
		if (prox) this._proximity = prox;
	}

	activateListeners(html) {
		super.activateListeners(html);
		this._frontOnOpen.start();

		html.find("input[data-type-option]").on("change", ev => {
			this._capture(html);
			this._type = ev.currentTarget.value;
			// Suggested moves are type-specific; drop the picks from the old type.
			this._selectedMoves.clear();
			this.render(false);
		});

		html.find(".ct-suggested-check").on("change", ev => {
			const move = ev.currentTarget.value;
			if (ev.currentTarget.checked) this._selectedMoves.add(move);
			else this._selectedMoves.delete(move);
		});

		html.find(".ct-cancel").on("click", () => this.close());
		html.find(".ct-create").on("click", () => this._submit(html));
	}

	_submit(html) {
		this._capture(html);
		const name = String(this._name ?? "").trim() || "New Threat";
		this._finish({
			name,
			type: this._type,
			instinct: String(this._instinct ?? "").trim(),
			proximity: this._proximity,
			gmMoves: [...this._selectedMoves],
		});
	}

	_finish(result) {
		const resolve = this._resolve;
		this._resolve = null;
		this.close();
		resolve?.(result);
	}

	async close(options = {}) {
		this._frontOnOpen.stop();
		// A close without submitting (Cancel, Escape, X) resolves the promise to null.
		if (this._resolve) { const resolve = this._resolve; this._resolve = null; resolve(null); }
		return super.close(options);
	}
}
