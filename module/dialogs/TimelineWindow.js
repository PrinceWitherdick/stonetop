// THE TIMELINE, OPEN.
//
// ONE CLASS, TWO SHAPES, and the whole of the difference between them is how many tracks it is
// handed. Given one track it draws that thread down a spine, which is what a sheet tab shows.
// Given all of them it draws one row per season with a lane per thread, which is the aggregate.
// Not two implementations: the same getData, the same listeners, the same writes, the same live
// sync. The tab is a third shape of the same thing again -- see TimelinePanel, which is this class
// mounted frameless, exactly as the relationship map's panel is its window.
//
// Either shape can be laid DOWN the page or ACROSS it, per reader (the toolbar's Vertical/Horizontal
// pair), and each reader chooses which KINDS of row they see (the toolbar's Filter menu). Both are
// client settings: they change how this reader reads the record, never the record.
//
// WHAT THIS FILE IS CAREFUL ABOUT:
//
//  • ONE WRITER. Every change to a track's entries goes through `_mutate` below, which hands one of
//    timeline-core's pure mutators to the store's single write path. The entry dialog collects
//    input and knows nothing about storage, so the add path and the edit path cannot drift.
//  • A LIVE UPDATE RE-RENDERS, and the reader keeps their place through it: the scroll column's
//    offset DOWN and ACROSS (a sideways timeline scrolls left to right) and the toolbar control
//    that had the keyboard, through StonetopDialog's kept place rather than core's `scrollY`, which
//    only knows about down. Throttled, because one Apply-damage press that drops three foes is
//    three page writes, and a reader on a magnifier must not watch the board flash three times. It
//    never re-renders under the entry dialog: that is a separate window holding its own state.
//  • THE HOOK COMES OFF ON CLOSE. It is a global journal hook, and a window closed without taking
//    it off leaves it firing on every journal write at the table for the rest of the session.

import { StonetopDialog } from "../utils/stonetop-dialog.js";
import { themedDialogClasses } from "../utils/window-theme.js";
import { openOrFocus } from "../utils/open-or-focus.js";
import { registerRestorableWindow } from "../utils/window-restore.js";
import { openingSize } from "../utils/opening-size.js";
import { getStonetopSteadingActor } from "../utils/world.js";
import { localize, format } from "../utils/i18n.js";
import { promptForTimelineEntry } from "./TimelineEntryDialog.js";
import { pickContentOption } from "./content-picker.js";
import { bringDialogToFront } from "../utils/front-on-open.js";
import { escHtml } from "../utils/strings.js";
import { GUTTER_X_VAR, GUTTER_Y_VAR, wireDragScroll } from "../utils/drag-scroll.js";
import { clampScale, wireWheelZoom } from "../utils/wheel-zoom-scroll.js";
import {
	TIMELINE_JOURNAL_NAME, allTracks, findTimelineJournal, mutateTrack, readTrack, trackDisplayName,
	trackForActor,
} from "../timeline/timeline-store.js";
import {
	TIMELINE_SOURCES, addEntry, moveEntry, patchEntry, removeEntry, trackIdFromKey,
} from "../timeline/timeline-core.js";
import { SYSTEM_ID } from "../system-id.js";
import {
	getTimelineHiddenSources, getTimelineOrientation, setTimelineHiddenSources, setTimelineOrientation,
} from "../settings.js";
import { buildAggregateVM, buildTrackVM, enrichTrackVM, kindMenu } from "../timeline/timeline-view.js";
import { timelineNow } from "../timeline/timeline-record.js";
import { openTimelineColours } from "./TimelineColoursDialog.js";
import { FINE_ZOOM_STEP } from "../utils/image-zoom.js";

/**
 * How far past each edge the timeline can be dragged, as a share of the column it is seen in: three
 * quarters, so a reader can haul it nearly out of sight and a quarter of the window still has the
 * timeline in it to grab and bring back.
 */
const TIMELINE_DRAG_GUTTER = 0.75;

/**
 * What one wheel notch multiplies the timeline's zoom by: the relationship map's own gentle step,
 * so the two read the same under one hand.
 */
const TIMELINE_ZOOM_STEP = FINE_ZOOM_STEP;

/**
 * How far the wheel zooms the timeline. A quarter is a long campaign seen whole; four times is a
 * card's words large enough to read under a magnifier. Narrower than the map's range, because past
 * these a column of prose is either specks or one word to a screen.
 */
const TIMELINE_ZOOM_MIN = 0.25;
const TIMELINE_ZOOM_MAX = 4;

/** The aggregate window's DOM id, so a second open focuses the first. */
export const TIMELINE_WINDOW_ID = "stonetop-timeline-window";

// What utils/window-restore.js files the aggregate under, so a reload brings it back where it was.
const RESTORE_KIND = "timeline";
const AGGREGATE_RESTORE_KEY = `${RESTORE_KIND}:all`;

export class TimelineWindow extends StonetopDialog {
	/**
	 * ⚠ A TRACK DESCRIPTOR EXACTLY AS `trackForActor` HANDS ONE BACK, keys and all. The tab passes
	 * the store's answer straight through (timeline-tab.js → TimelinePanel → here), and
	 * `_trackDescriptor` below hands the same shape back OUT to `ensureTrackPage`. A key renamed on
	 * the way in reads as `""` and fails silently twice over: the title and the entry dialog lose
	 * the thread's name, and the first entry written on a track with no page yet mints one titled
	 * with the raw actor id.
	 *
	 * @param {object}  [track]           Which track to show. Omit entirely for the aggregate.
	 * @param {string}  [track.trackId]
	 * @param {string}  [track.trackKind]
	 * @param {string}  [track.name]
	 */
	constructor({ trackId = "", trackKind = "", name = "" } = {}, options = {}) {
		super(options);
		this._trackId = trackId;
		this._trackKind = trackKind;
		this._trackName = name;
		this._syncHooks = [];
		// Takes the grab-and-throw back off the scroll column a repaint is about to replace.
		this._unwireDragScroll = null;
		// The wheel's zoom, kept on the instance so a repaint (anyone's write at the table) leaves the
		// reader at the size they chose. Every open starts at 1, as the map's board starts fitted.
		this._zoom = 1;
		this._unwireWheelZoom = null;
		this._unwireShowMenuDismiss = null;
		// Whether this reader left the Filter menu open. Kept on the instance because every tick in it
		// re-renders the window, and a menu that shut itself after each tick would be a menu you
		// have to reopen ten times to hide ten things.
		this._showMenuOpen = false;
		// Where the reader was as the window went down; see `restoreView`.
		this._viewAtMinimize = null;
	}

	static get defaultOptions() {
		const size = openingSize({ share: 0.8, maxAspect: 1.4, fallbackWidth: 980, fallbackHeight: 760 });
		return foundry.utils.mergeObject(super.defaultOptions, {
			id: TIMELINE_WINDOW_ID,
			template: "systems/stonetop-pwd/templates/dialogs/timeline.hbs",
			width: size.width,
			height: size.height,
			resizable: true,
			classes: [...themedDialogClasses(), "stonetop", "stonetop-timeline-app"],
		});
	}

	// The column that scrolls, kept DOWN and ACROSS through a repaint, so somebody else's entry
	// landing never throws the reader back to the start of the campaign; and the toolbar control
	// that had the keyboard, given back. See StonetopDialog#_keptScrollSelector.
	get _keptScrollSelector() { return ".stonetop-timeline-scroll"; }

	get _focusKeyAttribute() { return "data-timeline-focus"; }

	get title() {
		return this._trackId
			? format("stonetop.timeline.trackTitle", { name: this._trackName })
			: localize("stonetop.timeline.windowTitle");
	}

	/** Single-track mode, as against the aggregate. */
	get isSingleTrack() { return !!this._trackId; }

	/**
	 * What utils/window-restore.js saves this window under, and reopens it from after a reload. Only
	 * the aggregate has one: a single thread is only ever shown as a sheet's tab (TimelinePanel, which
	 * the restore skips as frameless), and comes back with its sheet.
	 */
	get restoreKey() {
		return this.isSingleTrack ? null : AGGREGATE_RESTORE_KEY;
	}

	/**
	 * Where the reader had got to inside the window, saved with its geometry by utils/window-restore.js
	 * and handed back as the reopening render's `view` option (see `_render`): the wheel's zoom, and
	 * the scroll offset counted from the timeline's own corner rather than the box's.
	 *
	 * ⚠ FROM THE CONTENT'S CORNER, past the drag gutter. The gutter is a share of the box, and the box
	 * after a reload may be another size (a smaller screen clamps the window), so a raw offset would
	 * land the reader somewhere else in the campaign.
	 */
	get restoreView() {
		// ⚠ A MINIMIZED WINDOW'S COLUMN IS HIDDEN and reads 0 down and across, which less the gutter
		// is the empty corner. So it answers with where it was when it went down (`minimize`).
		if (this._viewAtMinimize) return this._viewAtMinimize;
		const scroll = this._scrollColumn();
		if (!scroll) return null;
		const { x, y } = this._gutterOf(scroll);
		return {
			zoom: this._zoom,
			left: Math.round(scroll.scrollLeft - x),
			top:  Math.round(scroll.scrollTop - y),
		};
	}

	/** The view is read while the column can still be measured, and kept until the window comes back. */
	async minimize() {
		if (!this._minimized && !this._viewAtMinimize) this._viewAtMinimize = this.restoreView;
		return super.minimize();
	}

	async maximize() {
		const done = await super.maximize();
		this._viewAtMinimize = null;
		return done;
	}

	_scrollColumn() {
		return this.element?.[0]?.querySelector?.(".stonetop-timeline-scroll") ?? null;
	}

	/** The drag gutter as drag-scroll.js last sized it onto the column. */
	_gutterOf(scroll) {
		const px = (name) => Number.parseFloat(scroll.style?.getPropertyValue?.(name)) || 0;
		return { x: px(GUTTER_X_VAR), y: px(GUTTER_Y_VAR) };
	}

	/**
	 * A reload's reopening render carries the view the window was left at (`restoreView`). The zoom
	 * goes on BEFORE the draw, so the wheel wiring paints it onto the fresh column and the offset
	 * below is not clamped against an unzoomed picture; the offset goes on after, once the window
	 * has its saved size and the gutter is measured.
	 */
	async _render(force, options = {}) {
		const view = options?.view;
		if (view && Number.isFinite(view.zoom)) {
			this._zoom = clampScale(view.zoom, TIMELINE_ZOOM_MIN, TIMELINE_ZOOM_MAX);
		}
		await super._render(force, options);
		const scroll = view ? this._scrollColumn() : null;
		if (!scroll) return;
		const { x, y } = this._gutterOf(scroll);
		if (Number.isFinite(view.left)) scroll.scrollLeft = x + view.left;
		if (Number.isFinite(view.top)) scroll.scrollTop = y + view.top;
	}

	// ── reading ────────────────────────────────────────────────────────────────

	/**
	 * The tracks this window draws. One in single-track mode, every track that has a page in the
	 * aggregate.
	 *
	 * ⚠ SINGLE-TRACK MODE DOES NOT REQUIRE A PAGE. A track nobody has written in yet has none, and
	 * `readTrack` answers `{page: null, entries: []}` for it: that is the invitation the tab shows,
	 * not an error. The aggregate only ever lists pages that exist, because a lane for a thread
	 * with no page is a column that cannot be written in.
	 */
	_tracks() {
		if (!this.isSingleTrack) return allTracks();
		const track = readTrack(this._trackId);
		return [{
			trackId:   this._trackId,
			trackKind: this._trackKind,
			name:      this._trackName,
			actor:     this._trackActor(),
			page:      track.page,
			entries:   track.entries,
		}];
	}

	/** The actor behind a track, for its portrait and its name. */
	_trackActor() {
		if (!this._trackId) return null;
		if (this._trackKind === "steading") return getStonetopSteadingActor();
		return game.actors?.get(this._trackId) ?? null;
	}

	/**
	 * May this reader write on a track?
	 *
	 * Asked of the PAGE and not of the actor, because the page is what the write actually lands on
	 * and core's own ownership is what will accept or refuse it. A track with no page yet is
	 * writable by anyone who could make one, which is the same question `ensureTrackPage` answers.
	 */
	_canEdit(trackId) {
		// ⚠ MEMOISED FOR THE LENGTH OF ONE RENDER, and not as a micro-optimisation. The
		// aggregate asks this once per LANE per PERIOD, so a table of five threads over twenty
		// seasons asks it a hundred times -- and each answer walks `game.journal` to find the
		// Timeline entry and then its pages to find the track. The cache is cleared at the top of
		// every getData, so ownership changing mid-session still shows up on the next repaint.
		if (this._editCache?.has(trackId)) return this._editCache.get(trackId);
		const page = readTrack(trackId).page;
		const answer = page
			? !!page.isOwner
			: !!(game.user?.isGM || findTimelineJournal()?.isOwner);
		this._editCache?.set(trackId, answer);
		return answer;
	}

	async getData() {
		// Fresh per render; see `_canEdit`.
		this._editCache = new Map();
		const tracks = this._tracks();
		const hidden = getTimelineHiddenSources().filter(source => TIMELINE_SOURCES.includes(source));
		const horizontal = getTimelineOrientation() === "horizontal";

		// The reader's filter is applied INSIDE the builders, before periods are formed, so a season
		// holding nothing but hidden rows leaves no empty block or column behind. Totals (kills,
		// counts) are of everything, hidden or not.
		const single = this.isSingleTrack;
		const vm = single
			? buildTrackVM(tracks[0], { canEdit: this._canEdit(this._trackId), hidden })
			: buildAggregateVM(tracks, { canEdit: (id) => this._canEdit(id), hidden });

		// Enriched after the model is built rather than inside it, and by the shared walker rather
		// than here: the view model is pure so the three hosts can share it, and enrichment is async
		// and Foundry-only. Every shape is walked the same way because the cards are the same
		// objects either way.
		await enrichTrackVM(vm);

		return {
			single,
			timeline: vm,
			trackId: this._trackId,
			trackName: this._trackName,
			// A missing page in single-track mode is a thread nobody can write in yet, which reads
			// differently from an empty one: the first is waiting on a GM, the second on the reader.
			hasPage: single ? !!tracks[0].page : true,
			canEdit: single ? this._canEdit(this._trackId) : tracks.some(t => this._canEdit(t.trackId)),
			// The aggregate has nowhere further to go, so it does not offer the door to itself.
			showOpenFull: single,
			horizontal,
			// Only a GM can write the world's colours, so only a GM is offered the window.
			isGM: !!game.user?.isGM,
			kinds: kindMenu(hidden),
			hiddenCount: hidden.length,
			hiddenCountLabel: format("stonetop.timeline.show.hiddenCount", { count: hidden.length }),
			showMenuOpen: this._showMenuOpen,
			killTotalLabel: format("stonetop.timeline.kills.total", { count: vm.killTotal ?? 0 }),
			scrollLabel: single
				? format("stonetop.timeline.trackTitle", { name: this._trackName })
				: localize("stonetop.timeline.windowTitle"),
		};
	}

	// ── writing ────────────────────────────────────────────────────────────────

	/**
	 * The ONE write path. Hands a pure mutator to the store, which reads the track's page, runs it
	 * over the entries, and writes back only what moved.
	 *
	 * `mutate` returns timeline-core's own `{entries, added|removed|changed|moved}` shape, and a
	 * null result means nothing moved -- so a no-op write, which would re-render every open sheet
	 * and every other client's window to no effect, is skipped there rather than at each call site.
	 */
	async _mutate(trackId, mutate, { create = false } = {}) {
		try {
			const done = await mutateTrack(this._trackDescriptor(trackId), mutate, { create });
			return done?.moved ?? null;
		} catch (err) {
			// The reporting is what this window adds over the shared path: a reader who pressed a
			// button is owed the reason it did nothing.
			this.reportWriteFailure(localize("stonetop.timeline.windowTitle"), err);
			return null;
		}
	}

	/**
	 * What `ensureTrackPage` needs to mint a page for a track this window knows about.
	 *
	 * ⚠ THE NAME IS RESOLVED, not just passed on. A blank name here is a thread titled with its raw
	 * actor id -- `trackDisplayName` answers off the live actor and is what the rest of the system
	 * titles a thread by, which makes the two agree even if this window was opened without a name.
	 */
	_trackDescriptor(trackId) {
		if (trackId === this._trackId) {
			return { trackId, trackKind: this._trackKind, name: this._trackName || trackDisplayName(trackId) };
		}
		const actor = game.actors?.get(trackId);
		return trackForActor(actor) ?? { trackId, trackKind: "", name: trackId };
	}

	/**
	 * Which thread a new entry belongs to.
	 *
	 * ⚠ THE AGGREGATE'S New Entry BUTTON CARRIES NO TRACK, because the aggregate is every
	 * thread at once. Left unasked, the write would land on `readTrack("")`, find no page and do
	 * nothing at all -- a button that silently does nothing, which is the worst shape this can take.
	 * So it asks, through the same one-of-N chooser the rest of the system uses.
	 *
	 * Only the threads this reader may actually write on are offered: a list whose rows can be
	 * chosen and then refused is a worse answer than a shorter list.
	 */
	async _askWhichTrack() {
		// `page.isOwner` directly rather than `_canEdit`: every track `allTracks` returns already
		// HAS its page in hand, and `_canEdit` would re-resolve each one through the journal.
		const options = allTracks()
			.filter(track => track.page?.isOwner)
			.map(track => ({ id: track.trackId, label: track.name, icon: "fa-feather-pointed" }));
		if (!options.length) return null;
		// One writable thread is not a question worth asking.
		if (options.length === 1) return options[0].id;
		return pickContentOption({
			title: localize("stonetop.timeline.whichTrack.title"),
			options,
			buttonLabel: localize("stonetop.timeline.whichTrack.confirm"),
		});
	}

	async _onNewEntry(trackId) {
		const target = trackId || this._trackId || await this._askWhichTrack();
		if (!target) return;
		return this._writeNewEntry(target);
	}

	async _writeNewEntry(trackId) {
		// The clock's season -- the same "now" a milestone files under, so a row the reader types and
		// a row the system writes in the same moment land in the same season.
		const stamp = timelineNow();
		const input = await promptForTimelineEntry({
			season: stamp.season,
			year:   stamp.year,
			trackName: this._trackNameFor(trackId),
		});
		if (!input) return;

		await this._mutate(trackId, entries => addEntry(entries, {
			...input,
			source:    "hand",
			createdAt: Date.now(),
			authorId:  game.user?.id ?? "",
		}, foundry.utils.randomID), { create: true });
	}

	async _onEditEntry(trackId, entryId) {
		const entry = readTrack(trackId).entries.find(e => e.id === entryId);
		if (!entry) return;
		const input = await promptForTimelineEntry({ entry, trackName: this._trackNameFor(trackId) });
		if (!input) return;
		await this._mutate(trackId, entries => patchEntry(entries, entryId, input));
	}

	async _onRemoveEntry(trackId, entryId) {
		// NAMED BUTTONS rather than Yes/No, and the affirmative first: the question can then be
		// answered off the buttons alone. The house shape, and the same one every other
		// delete-with-confirm in this system takes. `stonetop` in the classes or the window gets
		// none of our chrome at all.
		const entry = readTrack(trackId).entries.find(e => e.id === entryId);
		const removed = await new Promise(resolve => {
			new Dialog({
				title: localize("stonetop.timeline.remove.title"),
				content: `<p>${escHtml(entry?.title || localize("stonetop.timeline.remove.untitled"))}</p>`
					+ `<p>${localize("stonetop.timeline.remove.body")}</p>`,
				buttons: {
					remove: { label: localize("stonetop.timeline.remove.confirm"), callback: () => resolve(true) },
					keep:   { label: localize("stonetop.timeline.remove.cancel"),  callback: () => resolve(false) },
				},
				default: "keep",
				close:  () => resolve(false),
				render: bringDialogToFront,
			}, { classes: ["dialog", "stonetop"] }).render(true);
		});
		if (!removed) return;
		await this._mutate(trackId, entries => removeEntry(entries, entryId));
	}

	async _onMoveEntry(trackId, entryId, delta) {
		await this._mutate(trackId, entries => moveEntry(entries, entryId, delta));
	}

	/**
	 * A track's display name, for a dialog title opened from the aggregate.
	 *
	 * Resolved by id rather than by walking `allTracks`, which normalises and sorts every entry on
	 * every page to hand back a list this only reads one name off.
	 */
	_trackNameFor(trackId) {
		if (trackId === this._trackId) return this._trackName;
		return trackDisplayName(trackId);
	}

	/** The track a changed page belongs to, for the sync gate. Reads the key, writes nothing. */
	_pageTrackId(page) {
		return trackIdFromKey(page?.getFlag?.(SYSTEM_ID, "chronicleKey")) || page?.system?.trackId || "";
	}

	// ── reading preferences (this reader only) ─────────────────────────────────

	/** Lay the timeline down the page or across it. Client-scoped; the re-render is the work. */
	async _onOrientation(orientation) {
		const next = orientation === "horizontal" ? "horizontal" : "vertical";
		if (next === getTimelineOrientation()) return;
		await setTimelineOrientation(next);
		this.render(false);
	}

	/** Show or hide one kind of row. Client-scoped; nothing on the page changes. */
	async _onShowKind(source, shown) {
		const hidden = new Set(getTimelineHiddenSources());
		if (shown) hidden.delete(source);
		else hidden.add(source);
		await setTimelineHiddenSources([...hidden]);
		this.render(false);
	}

	async _onShowAll() {
		await setTimelineHiddenSources([]);
		this.render(false);
	}

	// ── wiring ─────────────────────────────────────────────────────────────────

	activateListeners(html) {
		super.activateListeners(html);
		const root = html[0];
		if (!root) return;

		// Delegated, one listener for the whole board: the aggregate can hold a great many cards,
		// and binding four listeners to each of them is what makes a repaint expensive.
		root.addEventListener("click", async ev => {
			const target = ev.target;

			const add = target.closest?.(".stonetop-timeline-new");
			if (add) return this._onNewEntry(add.dataset.trackId || this._trackId);

			const full = target.closest?.(".stonetop-timeline-open-full");
			if (full) return openTimelineWindow();

			const orient = target.closest?.(".stonetop-timeline-orient");
			if (orient) return this._onOrientation(orient.dataset.orientation);

			if (target.closest?.(".stonetop-timeline-show-all")) return this._onShowAll();

			if (target.closest?.(".stonetop-timeline-colours-open")) return openTimelineColours();

			const card = target.closest?.("[data-entry-id]");
			const trackId = target.closest?.("[data-track-id]")?.dataset?.trackId || this._trackId;
			if (!card || !trackId) return;
			const entryId = card.dataset.entryId;

			if (target.closest(".stonetop-timeline-edit"))   return this._onEditEntry(trackId, entryId);
			if (target.closest(".stonetop-timeline-remove")) return this._onRemoveEntry(trackId, entryId);
			const move = target.closest(".stonetop-timeline-move");
			if (move) return this._onMoveEntry(trackId, entryId, Number(move.dataset.delta));
		});

		root.addEventListener("change", ev => {
			const box = ev.target?.closest?.("[data-timeline-source]");
			if (box) this._onShowKind(box.dataset.timelineSource, !!box.checked);
		});

		// `toggle` does not bubble, so it is caught on the way DOWN (capture). Remembered so the
		// menu stays open across the re-render each tick in it causes.
		root.addEventListener("toggle", ev => {
			if (ev.target?.classList?.contains("stonetop-timeline-show")) this._showMenuOpen = !!ev.target.open;
		}, true);
		this._wireShowMenuDismiss(root.querySelector(".stonetop-timeline-show"));

		// Drag the column about and throw it, as the relationship map's board is (utils/drag-scroll.js).
		// A fresh column every repaint, so the old one's wiring (and any glide still running on it) goes.
		// The gutter is empty room past every edge to drag the timeline off into, as the map's board
		// goes off any side; `.stonetop-timeline-canvas` is what spends it.
		this._unwireDragScroll?.();
		this._unwireDragScroll = wireDragScroll(root.querySelector(".stonetop-timeline-scroll"), {
			gutter: TIMELINE_DRAG_GUTTER,
		});
		// And the wheel zooms it about the cursor, as the map's wheel zooms the board
		// (utils/wheel-zoom-scroll.js). The canvas's one child is the picture; the stylesheet spends
		// the scale on it, and the gutter round it stays a window's worth whatever the size.
		this._unwireWheelZoom?.();
		this._unwireWheelZoom = wireWheelZoom(root.querySelector(".stonetop-timeline-scroll"), {
			content: ".stonetop-timeline-canvas > *",
			get: () => this._zoom,
			set: scale => { this._zoom = scale; },
			step: TIMELINE_ZOOM_STEP,
			min: TIMELINE_ZOOM_MIN,
			max: TIMELINE_ZOOM_MAX,
		});

		this._wireSync();
	}

	/**
	 * Shut the Filter menu when the reader presses anywhere outside it, as a dropdown does.
	 *
	 * On the DOCUMENT, in capture, so a press the drag-scroll column (or another window) swallows
	 * still counts. Shutting it fires `toggle`, which clears `_showMenuOpen` for the next repaint.
	 * The listener takes itself off once its menu leaves the page: a repaint draws a fresh menu, and
	 * the sheet-tab panel can be dropped with its sheet without ever passing through `close`.
	 */
	_wireShowMenuDismiss(menu) {
		this._unwireShowMenuDismiss?.();
		this._unwireShowMenuDismiss = null;
		if (!menu) return;
		const onPointerDown = ev => {
			if (!menu.isConnected) return unwire();
			if (menu.open && !menu.contains(ev.target)) menu.open = false;
		};
		const unwire = () => {
			document.removeEventListener("pointerdown", onPointerDown, true);
			if (this._unwireShowMenuDismiss === unwire) this._unwireShowMenuDismiss = null;
		};
		document.addEventListener("pointerdown", onPointerDown, true);
		this._unwireShowMenuDismiss = unwire;
	}

	/**
	 * Repaint when a track page changes, wherever the change came from.
	 *
	 * Gated on the CHEAP discriminators first, in order. These are global hooks: every journal write
	 * at the table reaches every open timeline host, and a table with the window up and a tab on
	 * five sheets has six of these handlers. So the first test is a string compare against the
	 * parent's name, and only a page that passes it pays for `findTimelineJournal` (two collection
	 * scans) to rule out a journal of the same name outside the Chronicle folder.
	 *
	 * A single-track host then narrows to its OWN thread. Without that, every player's sheet tab
	 * rebuilds its whole view model -- read, enrich every body -- each time anyone at the table
	 * writes on a thread they are not looking at.
	 *
	 * THROTTLED: one press that writes several rows (three foes dropped by one Apply) repaints once
	 * at the end of the burst, not once per row.
	 */
	_wireSync() {
		this._unwireSync();
		const ours = (page) => page?.parent?.name === TIMELINE_JOURNAL_NAME
			&& page.parent.id === findTimelineJournal()?.id
			&& (!this.isSingleTrack || this._pageTrackId(page) === this._trackId);
		const repaint = (page) => { if (ours(page) && this.rendered) this.renderThrottled(); };

		for (const hook of ["updateJournalEntryPage", "createJournalEntryPage", "deleteJournalEntryPage"]) {
			const id = Hooks.on(hook, repaint);
			this._syncHooks.push([hook, id]);
		}
	}

	_unwireSync() {
		for (const [hook, id] of this._syncHooks) Hooks.off(hook, id);
		this._syncHooks = [];
	}

	async close(options) {
		// ⚠ BEFORE the super call, and unconditionally: three global journal hooks left on would
		// fire on every journal write at the table for the rest of the session, once per window
		// anybody ever opened. (A repaint still pending from the last burst is StonetopDialog's.)
		this._unwireSync();
		this._unwireDragScroll?.();
		this._unwireDragScroll = null;
		this._unwireWheelZoom?.();
		this._unwireWheelZoom = null;
		this._unwireShowMenuDismiss?.();
		return super.close(options);
	}
}

/** Open the aggregate, or bring the open one to the front. */
export function openTimelineWindow() {
	return openOrFocus(TIMELINE_WINDOW_ID, () => new TimelineWindow().render(true));
}

/**
 * The aggregate a reload brings back, from the key it was saved under (TimelineWindow#restoreKey), or
 * null for any other key. Anyone may open the aggregate, so there is nothing else to ask.
 *
 * Handed back unrendered, since utils/window-restore.js draws it where it was left. Minted through
 * openOrFocus all the same, so the window opened by hand in the moment before the restore draws it is
 * this one rather than a second frame on the same id.
 */
export function reopenTimelineWindow(key) {
	if (key !== AGGREGATE_RESTORE_KEY) return null;
	return openOrFocus(TIMELINE_WINDOW_ID, () => new TimelineWindow());
}

/** Registered once, at module scope in stonetop.js. */
export function registerTimelineWindowRestore() {
	registerRestorableWindow(TimelineWindow, RESTORE_KIND, reopenTimelineWindow);
}
