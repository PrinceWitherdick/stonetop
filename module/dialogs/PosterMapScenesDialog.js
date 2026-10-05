import { StonetopDialog } from "../utils/stonetop-dialog.js";

// ── PosterMapScenesDialog ────────────────────────────────────────────────────
// "You already have these maps — want the Scenes?"
//
// The poster maps a GM supplies to the Import Book Art macro are written to the durable
// art folder, which outlives the world they were imported in. So a new world can find
// them sitting on disk with no Scene pointing at them. Rather than silently creating five
// Scenes in someone's brand-new world — or making them re-run the whole PDF import to get
// them back — this asks, with a tick box per map so they can take only the ones they want.
//
// A map that already has a Scene is listed unticked: it is offered only so the GM can
// deliberately refresh its artwork, never as a suggestion.
//
// Resolves (via StonetopDialog's promise protocol) to the chosen rows, or [] if the GM
// declines or dismisses the window.

export class PosterMapScenesDialog extends StonetopDialog {
	/** @param {Array<{map: object, src: string, hasScene: boolean}>} rows */
	constructor(rows = [], options = {}) {
		super(options);
		this._rows = rows;
	}

	/** Open the offer for `rows`; resolves to the subset the GM ticked. */
	static async ask(rows) {
		if (!rows?.length) return [];
		return (await new PosterMapScenesDialog(rows).promise()) ?? [];
	}

	// The list is between one and five rows, so the window sizes to whatever it got.
	get _autoHeight() { return true; }

	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id:        "stonetop-poster-map-scenes",
			title:     "Maps you already have",
			template:  "systems/stonetop_pwd/templates/dialogs/poster-map-scenes.hbs",
			width:     520,
			height:    "auto",
			resizable: true,
			classes:   ["stonetop", "stonetop-poster-maps-dialog"],
		});
	}

	getData() {
		return {
			// Only a world that already has some of these Scenes needs the "refresh" wording
			// explained, so the note is conditional rather than always on screen.
			anyExisting: this._rows.some(row => row.hasScene),
			rows: this._rows.map((row, index) => ({
				index,
				name:     row.map.name,
				hint:     row.map.hint,
				hasScene: row.hasScene,
				// New maps are ticked; ones that already have a Scene are not, so "Create
				// Scenes" on an untouched dialog only ever adds what is missing.
				checked:  !row.hasScene,
			})),
		};
	}

	activateListeners(html) {
		super.activateListeners(html);
		const root = html[0];
		html.find('[data-action="create"]').on("click", () => this._resolveWith(this._selected(root)));
		html.find('[data-action="skip"]').on("click", () => this._resolveWith([]));
	}

	/** The rows whose checkbox is ticked, in catalog order. */
	_selected(root) {
		const ticked = new Set(
			Array.from(root?.querySelectorAll?.('input[name="poster-map"]:checked') ?? [])
				.map(input => Number(input.value))
		);
		return this._rows.filter((_row, index) => ticked.has(index));
	}
}
