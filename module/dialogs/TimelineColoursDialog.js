// THE GM'S TIMELINE COLOURS: the colour each kind of row wears, for the whole world.
//
// One colour in, four out (timeline-colours.js): the GM picks on whatever skin they read in, and
// each skin gets that hue walked along its lightness until it reads there -- darker on the light
// pages, lighter on the dark ones. So the row previews the colour THIS page will wear, and says so
// when the pick had to be adjusted to read here.
//
// ⚠ THE NOTE IS FOR THIS SKIN ONLY. No one colour clears 7:1 on both the white high-contrast page
// and the near-black one, so "adjusted on some skin" is true of every pick there is and would sit
// on every row saying nothing.
//
// Only the kinds the GM actually picked are written; the rest keep the stylesheet's shipped colour,
// which is hand-tuned per skin. That is also why a pick that lands back ON this skin's shipped
// colour counts as no pick: kept as a choice, it would be walked into the other three skins and
// replace their own tuned colours with a derived one.

import { StonetopDialog } from "../utils/stonetop-dialog.js";
import { openOrFocus } from "../utils/open-or-focus.js";
import { format, localize } from "../utils/i18n.js";
import {
	TIMELINE_COLOUR_KINDS, TIMELINE_KIND_PALETTE, currentColourMode, kindColourSet,
} from "../timeline/timeline-colours.js";
import { kindChip } from "../timeline/timeline-view.js";
import { getTimelineKindColours, setTimelineKindColours } from "../settings.js";

/** One per client: there is one set of world colours to edit. */
const TIMELINE_COLOURS_ID = "stonetop-timeline-colours";

export class TimelineColoursDialog extends StonetopDialog {
	constructor(options = {}) {
		super(options);
		/** The world's colours as this window shows them, `{kind: "#rrggbb"}`. */
		this._chosen = { ...getTimelineKindColours() };
		/**
		 * The kinds picked or reset IN THIS WINDOW. Save writes only these, over the setting as it
		 * stands at that moment, so a change made elsewhere while the window was open survives.
		 */
		this._touched = new Set();
	}

	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id: TIMELINE_COLOURS_ID,
			template: "systems/stonetop-pwd/templates/dialogs/timeline-colours.hbs",
			width: 420,
			height: "auto",
			resizable: false,
			classes: ["stonetop", "stonetop-timeline-colours-dialog"],
		});
	}

	get _autoHeight() { return true; }

	get title() {
		return localize("stonetop.timeline.colours.title");
	}

	getData() {
		return { rows: TIMELINE_COLOUR_KINDS.map(kind => this._row(kind)) };
	}

	/** One kind's row: its chip, the colour it would wear on this page, and whether it is repainted. */
	_row(kind) {
		const chip = kindChip(kind);
		return {
			kind,
			icon: chip.icon,
			label: chip.label,
			pickLabel: format("stonetop.timeline.colours.pick", { kind: chip.label }),
			resetLabel: format("stonetop.timeline.colours.resetTooltip", { kind: chip.label }),
			...this._paint(kind),
		};
	}

	/**
	 * What a row shows for its kind now: the picker's value, the chip's colour on this page, and the
	 * two flags. A repainted kind's picker holds what the GM chose; the chip shows what this skin
	 * makes of it. The skin is read afresh each time: the GM can change it with the window open.
	 */
	_paint(kind) {
		const mode = currentColourMode();
		const chosen = this._chosen[kind];
		const read = chosen ? kindColourSet(chosen)?.[mode] : null;
		return {
			value: chosen || TIMELINE_KIND_PALETTE[kind][mode],
			colour: read ? read.hex : TIMELINE_KIND_PALETTE[kind][mode],
			repainted: !!read,
			nudged: !!read?.nudged,
		};
	}

	/** The picker moved. Landing on this skin's shipped colour is the default, not a choice. */
	_onPick(kind, value) {
		this._touched.add(kind);
		if (String(value).toLowerCase() === TIMELINE_KIND_PALETTE[kind][currentColourMode()]) delete this._chosen[kind];
		else this._chosen[kind] = value;
	}

	/** Default pressed: the kind goes back to the stylesheet's colour. */
	_onReset(kind) {
		this._touched.add(kind);
		delete this._chosen[kind];
	}

	activateListeners(html) {
		super.activateListeners(html);
		const root = html[0];
		if (!root) return;

		// `input`, not `change`: the chip follows the picker while it is still open.
		root.addEventListener("input", ev => {
			const pick = ev.target?.closest?.(".stonetop-timeline-colours-pick");
			const row = pick?.closest?.("[data-kind]");
			if (!row) return;
			this._onPick(row.dataset.kind, pick.value);
			this._repaintRow(row);
		});

		root.addEventListener("click", ev => {
			const reset = ev.target?.closest?.(".stonetop-timeline-colours-reset");
			const row = reset?.closest?.("[data-kind]");
			if (!row) return;
			this._onReset(row.dataset.kind);
			this._repaintRow(row, { syncPicker: true });
			row.querySelector(".stonetop-timeline-colours-pick")?.focus?.();
		});

		root.querySelector(".stonetop-timeline-colours-save")
			?.addEventListener("click", ev => this._guardBusy(ev, () => this._save()));
		root.querySelector(".stonetop-timeline-colours-cancel")
			?.addEventListener("click", () => this.close());

		this._watchSkin();
	}

	/**
	 * Redraw when the page changes skin (the contrast classes on the root), so every row previews
	 * what THIS page now wears. Re-attached per render; taken off in `close`.
	 */
	_watchSkin() {
		this._skinWatch?.disconnect();
		this._skinWatch = null;
		const rootEl = globalThis.document?.documentElement;
		if (!rootEl || typeof globalThis.MutationObserver !== "function") return;
		let mode = currentColourMode();
		this._skinWatch = new MutationObserver(() => {
			const now = currentColourMode();
			if (now === mode) return;
			mode = now;
			this.render(false);
		});
		this._skinWatch.observe(rootEl, { attributes: true, attributeFilter: ["class"] });
	}

	/**
	 * Bring one row up to date by hand. A re-render would shut a colour picker the GM is still
	 * dragging about in, so nothing here re-renders.
	 */
	_repaintRow(row, { syncPicker = false } = {}) {
		const paint = this._paint(row.dataset.kind);
		row.style.setProperty("--tl-kind", paint.colour);
		const reset = row.querySelector(".stonetop-timeline-colours-reset");
		if (reset) reset.hidden = !paint.repainted;
		const note = row.querySelector(".stonetop-timeline-colours-note");
		if (note) note.hidden = !paint.nudged;
		if (syncPicker) {
			const pick = row.querySelector(".stonetop-timeline-colours-pick");
			if (pick) pick.value = paint.value;
		}
	}

	/** Write the kinds touched here over the world's colours. Every client repaints from onChange. */
	async _save() {
		if (!game.user?.isGM) return this.close();
		if (this._touched.size) {
			const next = { ...getTimelineKindColours() };
			for (const kind of this._touched) {
				if (this._chosen[kind]) next[kind] = this._chosen[kind];
				else delete next[kind];
			}
			await setTimelineKindColours(next);
		}
		return this.close();
	}

	async close(options) {
		this._skinWatch?.disconnect();
		this._skinWatch = null;
		return super.close(options);
	}
}

/** Open the GM's colour window, or bring the one already open to the front. */
export function openTimelineColours() {
	if (!game.user?.isGM) return null;
	// Through openOrFocus, which also covers the window still on its way: a double click on Colours
	// would otherwise find nothing in `ui.windows` yet and mint a second frame on the same id.
	return openOrFocus(TIMELINE_COLOURS_ID, () => {
		const dialog = new TimelineColoursDialog();
		dialog.render(true);
		return dialog;
	});
}
