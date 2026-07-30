// Board view for the relationship hearts — the same rows the table renders, dealt into
// three standing lanes instead of a sorted list. Nothing here stores anything new: a lane
// is a READING of the 1-5 rating in `system.relationships`, and moving a card writes that
// same rating. Toggle back to the table and the data is identical.
//
// Pairs with relationship-hearts.js (the storage layer) and templates/actor/partials/
// relationships-board.hbs (the markup). Wired from wireRelationshipTable, so all three
// host sheets get it without a call-site change.
import { clampHearts, setRelationshipHeartsExact } from "./relationship-hearts.js";
import { readStoredColumnState, writeStoredColumnState } from "./steading-column-util.js";

// Which layout a section is showing. Per user, per browser, per table — the same key
// space that already owns these tables' column widths and sort order, so a character
// sheet can sit in board view while the steading stays a table.
export const REL_VIEWS = ["table", "board"];
export const REL_VIEW_DEFAULT = "table";
const VIEW_STORAGE_PREFIX = "stonetop-pwd.relView.";

/** The stored layout for one table, falling back to the table on anything unrecognized. */
export function relationshipView(resizeKey) {
	if (!resizeKey) return REL_VIEW_DEFAULT;
	const stored = readStoredColumnState(`${VIEW_STORAGE_PREFIX}${resizeKey}`);
	return REL_VIEWS.includes(stored) ? stored : REL_VIEW_DEFAULT;
}

/** Persist the layout for one table. An unknown value resets to the default. */
export function setRelationshipView(resizeKey, view) {
	if (!resizeKey) return;
	writeStoredColumnState(`${VIEW_STORAGE_PREFIX}${resizeKey}`,
		REL_VIEWS.includes(view) ? view : REL_VIEW_DEFAULT);
}

/**
 * Everything a host's getData needs for one relationships section. Defined here rather
 * than assembled at each of the three call sites, which pair the same two lines.
 *
 * Carries the `resizeKey` back out so the template can stamp it rather than repeating the
 * literal: the toggle writes storage under the button's key and the next render reads it
 * under getData's, so naming it twice is what would let the two drift — and a drift there
 * fails silently, flipping storage while the section re-renders looking identical.
 *
 * The lanes are built ONLY for the board. The table is the default view and discards
 * them, so building them unconditionally partitioned and sorted the whole roster on every
 * re-render — every HP tick, every note saved — for a view that never reads the result.
 */
export function relationshipViewContext(resizeKey, rows = []) {
	const view = relationshipView(resizeKey);
	return { resizeKey, view, lanes: view === "board" ? buildRelationshipLanes(rows) : [] };
}

// Three lanes over the five-point scale, ordered COLDEST FIRST so the board reads
// left-to-right as regard warming — the same direction as the rating itself, and as the
// heart strip on every card, which fills left to right. Array order is the rendered
// order, and it is also the arrow-key order: everything downstream works off the index or
// the key, never a hard-coded position, so this list is the single place to change it.
//
// `steps` are the exact ratings the band contains, coldest first — the lane's own drop
// zones. Hostile and Trusted each hold two, Neutral holds only itself. Dropping into a zone
// asserts that EXACT value, which is what makes the board lossless: every one of the five
// ratings is reachable by drag, and a 5 sent to Hostile and dropped back on the 5 zone is
// still a 5.
//
// `write` is the fallback for a move that names a band but not a value: a drop that lands on
// a lane's chrome rather than one of its zones, and the per-card Neutral button (whose band
// holds one value anyway, so nothing is being guessed there). It stays the GENTLE end of each
// band, so a coarse gesture still cannot assert "hates" or "loves" by accident — those need
// an aimed drop into their own labelled zone, a one-notch step, or a click on the heart strip.
// All three are deliberate, which was always the actual requirement.
export const REL_LANES = [
	{
		key: "hostile", write: 2, steps: [1, 2],
		labelKey: "stonetop.relationships.lane.hostile",
		hintKey:  "stonetop.relationships.lane.hostileHint",
		icon: "fa-solid fa-hand-fist",
	},
	{
		key: "neutral", write: 3, steps: [3],
		labelKey: "stonetop.relationships.lane.neutral",
		hintKey:  "stonetop.relationships.lane.neutralHint",
		icon: "fa-solid fa-scale-balanced",
	},
	{
		key: "trusted", write: 4, steps: [4, 5],
		labelKey: "stonetop.relationships.lane.trusted",
		hintKey:  "stonetop.relationships.lane.trustedHint",
		icon: "fa-solid fa-hand-holding-heart",
	},
];

// Every rating the board can reach, coldest first. Derived from the lanes so the two can
// never disagree about what the scale is.
export const REL_STEPS = REL_LANES.flatMap(lane => lane.steps);

/** The lane a rating sits in. Runs through clampHearts, so garbage lands in Neutral. */
export function laneForHearts(hearts) {
	const n = clampHearts(hearts);
	// Asks `steps`, the same list the drop zones are cut from, rather than a second
	// min/max encoding of the band — the two could not then disagree about which lane a
	// rating belongs to. Falls back BY KEY, not by position: the fallback must stay
	// Neutral no matter how REL_LANES is ordered.
	return REL_LANES.find(lane => lane.steps.includes(n))
		?? REL_LANES.find(lane => lane.key === "neutral");
}

export function laneByKey(key) {
	return REL_LANES.find(lane => lane.key === key) ?? null;
}

// Resolved once, BY KEY: the middle of the per-card control is Neutral itself, not "whatever
// lane happens to sit in the middle of REL_LANES".
const NEUTRAL_LANE = laneByKey("neutral");

/**
 * The rating one sub-column to the side, or null at either end of the scale.
 *
 * `direction` is in SCREEN terms — negative is leftward. REL_STEPS is coldest-first, which is
 * also the rendered order, so a positive direction always walks the card rightward however
 * the lanes happen to be arranged.
 *
 * Null rather than a clamp: at 1 there is no colder rating, and the caller has to be able to
 * tell "nothing to do" from "move to 1", because re-asserting the current value through the
 * click-toggle write path would silently decrement it.
 */
export function stepHearts(hearts, direction = 1) {
	const from = REL_STEPS.indexOf(clampHearts(hearts));
	const to = from + (direction < 0 ? -1 : 1);
	return to < 0 ? null : REL_STEPS[to] ?? null;
}

// The i18n key for one rating's short name ("Dislikes"), shared by the drop zones and by the
// step buttons, which name the rating they are about to write.
const zoneLabelKey = hearts => `stonetop.relationships.zone.h${hearts}`;

/**
 * One step button for a card sitting at `current`, pointing left (colder) or right (warmer).
 *
 * These two REPLACED the old Hostile/Trusted band shortcuts, which stopped making sense once
 * a lane held two values: a band button wrote only its gentle end, so pressing "Hostile" on a
 * card that was already Hostile did nothing at all, and no button in the strip could express
 * the difference between a 4 and a 5. A step names an exact rating, so every press moves the
 * card exactly one sub-column — the same motion the arrow keys already made, from the same
 * helper.
 *
 * Unlike a band shortcut a step CAN assert 1 or 5, and that is not the accident the bands were
 * guarding against: a step reaches an extreme only from its immediate neighbour, and the
 * button's own tooltip names the rating it will write before it is pressed.
 */
function stepButton(current, direction) {
	const colder = direction < 0;
	const next = stepHearts(current, direction);
	return {
		// What KIND of button this is, as much as which way it points: the template branches on
		// `dir` to tell the two steps from the Neutral band button beside them.
		dir:      colder ? "colder" : "warmer",
		icon:     colder ? "fa-solid fa-chevron-left" : "fa-solid fa-chevron-right",
		hearts:   next,
		disabled: next === null,
		labelKey: next === null
			? `stonetop.relationships.lane.${colder ? "stepFloor" : "stepCeiling"}`
			: `stonetop.relationships.lane.${colder ? "stepColder" : "stepWarmer"}`,
		// The rating the label names: where the press would land, or — at the end of the scale
		// — where the card already sits, which is why it cannot move.
		targetLabelKey: zoneLabelKey(next ?? clampHearts(current)),
	};
}

/**
 * Deal the table's rows into lanes. Pure: no Foundry globals, no storage read, so the
 * partition and the sort are testable on plain objects.
 *
 * ONE full-width card list per lane. The exact-value zones are drop targets only, surfaced
 * as an overlay while a card is being dragged and gone the rest of the time — permanently
 * splitting a ~185px lane into two ~90px sub-columns cost every card half its width to serve
 * an occasional gesture. So `zones` here carries no cards, just the labels and values the
 * overlay needs; a dropped card fills the whole lane.
 *
 * Cards sort by rating (warmest first), then RATED BEFORE UNRATED, then by name. That middle
 * key is the whole reason `rated` exists: storage is sparse, so an absent entry reads as 3
 * hearts and Neutral would otherwise open holding every person in the world, with the few
 * deliberate neutrals lost among them. Each card still shows its own five-heart strip, which
 * is what preserves the exact-value reading now that position no longer encodes it.
 */
export function buildRelationshipLanes(rows = []) {
	// The per-card control: nudge one sub-column colder, snap to Neutral, nudge one warmer.
	// Three segments because five will not fit a ~185px lane on the NPC sheet — but unlike the
	// band shortcuts these replaced, three is now enough to REACH all five ratings, one press
	// at a time. Neutral keeps a button of its own because it is the one rating that is a
	// destination rather than a direction: getting back to "no strong feeling" from either end
	// should not be two presses.
	const moveButtonsFor = (hearts, laneKey) => [
		stepButton(hearts, -1),
		{
			laneKey:   NEUTRAL_LANE.key,
			labelKey:  NEUTRAL_LANE.labelKey,
			icon:      NEUTRAL_LANE.icon,
			// Formatted like the step buttons' labels so one template expression serves all
			// three, even though Neutral's own label has no placeholder to fill.
			targetLabelKey: zoneLabelKey(NEUTRAL_LANE.write),
			isCurrent: laneKey === NEUTRAL_LANE.key,
		},
		stepButton(hearts, 1),
	];

	return REL_LANES.map(lane => {
		const cards = rows
			.filter(row => laneForHearts(row?.hearts).key === lane.key)
			.sort((a, b) =>
				(clampHearts(b?.hearts) - clampHearts(a?.hearts)) ||
				((a.rated ? 0 : 1) - (b.rated ? 0 : 1)) ||
				String(a.name ?? "").localeCompare(String(b.name ?? "")))
			.map(row => ({
				...row,
				laneKey: lane.key,
				// The card's own exact rating, so a drop can tell "already this value" from
				// "same band, different value" without re-deriving it from the DOM.
				zoneHearts: clampHearts(row?.hearts),
				// Per CARD, not per lane: the step buttons name exact ratings, so two cards
				// sharing a lane offer different targets.
				moveButtons: moveButtonsFor(row?.hearts, lane.key),
			}));
		return {
			...lane,
			// Label + value per drop zone. No cards: the overlay is a target, not a container.
			zones: lane.steps.map(hearts => ({
				hearts,
				labelKey: zoneLabelKey(hearts),
			})),
			// Only Hostile and Trusted have a choice to offer, so only they get an overlay.
			// Neutral is a single value; dropping anywhere in it can only ever mean 3.
			isSplit:    lane.steps.length > 1,
			cards,
			count:      cards.length,
			ratedCount: cards.filter(c => c.rated).length,
			isEmpty:    cards.length === 0,
		};
	});
}

/**
 * What a move into `laneKey` should write, or null when the move is a no-op.
 *
 * Two rules, both load-bearing:
 *  • Moving a RATED card into the lane it already occupies writes nothing. Skipping the
 *    write also skips a pointless ledger line.
 *  • An UNRATED card in its default lane is NOT a no-op: it reads as 3 only because
 *    nothing is stored, so committing it to Neutral is a real change (it stops being a
 *    guess) even though the number does not move.
 */
export function laneMoveTarget({ hearts, rated = false, laneKey } = {}) {
	const lane = laneByKey(laneKey);
	if (!lane) return null;
	if (rated && laneForHearts(hearts).key === lane.key) return null;
	return lane.write;
}

/**
 * What a move into an exact-value ZONE should write, or null when it is a no-op.
 *
 * The band rule collapses to a value rule here, and it gets STRICTER in a useful way: moving
 * a 5 onto the 4 zone is a real change that laneMoveTarget would have called a no-op (both
 * are Trusted). That is the whole point of the zones — the band no longer hides the value.
 *
 * Unlike a band move this CAN assert 1 or 5, because a drop into a labelled zone is aimed,
 * not incidental.
 */
export function zoneMoveTarget({ hearts, rated = false, zoneHearts } = {}) {
	// Number(), so a dataset string like "4" still works, but NOT Math.trunc: truncating
	// would quietly turn a malformed 2.5 into a perfectly valid 2, which is precisely the
	// "wrote a rating you did not aim at" outcome this guard exists to prevent. A zone must
	// name an exact step or the move is refused outright.
	const target = Number(zoneHearts);
	if (!Number.isInteger(target) || !REL_STEPS.includes(target)) return null;
	if (rated && clampHearts(hearts) === target) return null;
	return target;
}

/**
 * Resolve whichever kind of move was requested. A zone names a value; a lane names only a
 * band. Zone wins when both are present, since it is the more specific instruction.
 */
export function moveTarget({ hearts, rated = false, laneKey, zoneHearts } = {}) {
	return zoneHearts === undefined || zoneHearts === null
		? laneMoveTarget({ hearts, rated, laneKey })
		: zoneMoveTarget({ hearts, rated, zoneHearts });
}

/**
 * Apply a move, by zone (exact value) or by lane (band). Returns the rating written, or null
 * when nothing was written — callers use that to decide whether to announce the change.
 */
export async function applyRelationshipLaneMove(actor, { id, hearts, rated, laneKey, zoneHearts, editable = true } = {}) {
	if (!actor || !id || !editable) return null;
	const next = moveTarget({ hearts, rated, laneKey, zoneHearts });
	if (next === null) return null;
	await setRelationshipHeartsExact(actor, id, next);
	return next;
}

// ── DOM wiring ───────────────────────────────────────────────────────────────

// Read a card's state back off the DOM, so the click and keyboard paths share one source
// of truth with what was rendered.
function cardState(card) {
	return {
		id:     card?.dataset?.relId,
		hearts: Number(card?.dataset?.relHearts),
		rated:  card?.dataset?.relRated === "true",
	};
}

// Announce a move to screen readers. The board's visual feedback is a card jumping to a
// different column, which a screen reader user never sees.
//
// Must be called BEFORE the write is awaited. Every write re-renders the sheet, which
// replaces this whole subtree — announce afterwards and the text lands on a detached node
// that is no longer in the accessibility tree, so nothing is ever spoken. Setting it while
// the region is still live is enough: assistive tech queues the announcement off the
// mutation, and the node being replaced a moment later does not retract it.
function announce(wrapper, message) {
	const live = wrapper.querySelector(".stonetop-rel-board-live");
	if (!live || !message) return;
	live.textContent = message;
}

/** The short word for one rating ("Dislikes"), which is also its zone's heading. */
function stepLabel(hearts) {
	return game.i18n.localize(`stonetop.relationships.zone.h${clampHearts(hearts)}`);
}

// The message for a pending move. Names the RATING written, not the band aimed at: with
// zones, "moved to Trusted" would read identically for a 4 and a 5, which is exactly the
// distinction a zone drop was made to express.
function moveMessage(name, hearts) {
	return game.i18n.format("stonetop.relationships.lane.moved", {
		name: name ?? "", lane: stepLabel(hearts),
	});
}

/**
 * Run `fn` once the sheet's re-render has actually landed in the DOM.
 *
 * `stale` is the node being replaced, and it is what makes the wait work. Neither `await
 * actor.update()` resolving NOR `sheet.render()` returning means the sheet has re-rendered:
 * AppV1's `render` returns the Application synchronously and schedules `_render` separately,
 * so the first frame usually still finds the OLD node. A match that is not the stale node is
 * the only reliable signal that the new DOM is there.
 *
 * Gives up after `framesLeft` frames and calls `fn(null)` rather than falling silent: a
 * caller whose work is not about the found node (re-fitting an auto-height window, say) still
 * has to run, and a getData that awaits a compendium fetch can outlast the budget.
 */
function afterRender(actor, selector, stale, fn, framesLeft = 30) {
	requestAnimationFrame(() => {
		const found = actor?.sheet?.element?.[0]?.querySelector(selector);
		if (found && found !== stale) fn(found);
		else if (framesLeft > 1) afterRender(actor, selector, stale, fn, framesLeft - 1);
		else fn(null);
	});
}

/**
 * Hand focus back to an element after a write re-renders the sheet.
 *
 * Whatever the user was standing on is destroyed by the re-render, so without this focus
 * falls to the body and the next arrow key does nothing — the keyboard path would work
 * exactly once. Only worth doing for a gesture that CAME from the keyboard: forcing focus
 * after a mouse click or a drop paints a focus ring on a card the user is already pointing
 * at, and can scroll it into view under their cursor.
 */
function refocusAfterRender(actor, selector, stale) {
	if (!selector) return;
	afterRender(actor, selector, stale, found => found?.focus());
}

const cardSelector = id => `.stonetop-rel-card[data-rel-id="${CSS.escape(id)}"]`;

// ── Drag tuning ──────────────────────────────────────────────────────────────

// How far a press must travel before it becomes a drag. Below this it stays a click, so
// the heart strip, the note field and the lane buttons all keep working — a card is one
// big press target and most presses on it are not drags.
const DRAG_THRESHOLD = 4;
// How far it must travel before a drop is allowed to WRITE anything. Deliberately larger
// than the lift threshold, and the two are separate for a real reason: a card fills its
// whole lane, so it straddles BOTH of that lane's drop zones. The overlay appears the
// instant the lift threshold is crossed, which means the pointer is already sitting inside
// whichever zone happens to be under it — a zone it never travelled to. Pressing the left
// half of a "Dislikes" card and twitching 4px would otherwise resolve to the "Hates" zone
// and silently rewrite the rating. Below this distance the gesture is treated as a nudge
// and nothing is written.
const DROP_COMMIT_DISTANCE = 14;

/**
 * Whether a gesture travelled far enough to be honoured as a drop.
 *
 * Exported so the two thresholds' RELATIONSHIP is testable — the lift threshold must stay
 * strictly smaller, or a card could never be picked up and put down at all.
 */
export function isCommittedDrop(dx, dy) {
	return Math.hypot(dx, dy) >= DROP_COMMIT_DISTANCE;
}

/** Whether a press has travelled far enough to stop being a click and become a drag. */
export function isLiftedDrag(dx, dy) {
	return Math.hypot(dx, dy) >= DRAG_THRESHOLD;
}

/**
 * Whether a press should lift the card, given which kind of pointer it is.
 *
 * TOUCH additionally requires horizontal dominance, because a card carries
 * `touch-action: pan-y` — the vertical axis belongs to the scroller, so a vertical swipe on
 * the board is someone scrolling the sheet, not starting a drag. Radial-only meant a plain
 * scroll cleared the 4px threshold, lifted the card and flashed every drop zone for a frame
 * or two until the browser claimed the gesture and fired pointercancel. Nothing is lost:
 * pan-y already prevents a vertical touch drag from working, so this only stops the board
 * from pretending otherwise.
 *
 * Mouse and pen keep the plain radial test; they have no competing scroll gesture.
 */
export function liftsDrag(pointerType, dx, dy) {
	if (!isLiftedDrag(dx, dy)) return false;
	return pointerType !== "touch" || Math.abs(dx) > Math.abs(dy);
}
// Auto-scroll: how near the scroll container's edge the pointer must come, and the fastest
// it will scroll per frame. Pointer-event drags get NO auto-scroll from the browser (an
// HTML5 drag would), and on the character sheet the board is the last thing on a long
// scrolling tab, so without this a lane below the fold is simply unreachable.
const AUTOSCROLL_EDGE = 40;
const AUTOSCROLL_MAX  = 16;

/**
 * How far to scroll this frame, given where the pointer is inside a scroll container.
 * Negative scrolls up. Zero once the pointer is clear of both margins.
 *
 * Speed ramps with how deep into the margin the pointer has come, so easing toward the
 * edge creeps and pinning against it runs — a fixed step is either too slow to reach a
 * far lane or too fast to stop on a near one. Split out from the drag so the arithmetic,
 * which is the part with edges worth pinning down, is testable without a browser.
 */
export function autoScrollDelta(pointerY, top, bottom, { edge = AUTOSCROLL_EDGE, max = AUTOSCROLL_MAX } = {}) {
	const above = edge - (pointerY - top);
	const below = edge - (bottom - pointerY);
	// Above wins a tie: in a container shorter than two margins the whole thing is "edge",
	// and scrolling up to find what you have already passed beats running to the end.
	if (above > 0) return -Math.min(max, above);
	if (below > 0) return  Math.min(max, below);
	return 0;
}

/**
 * Where to translate a dragged card so it stays under the cursor.
 *
 * The scroll term is the subtle part, and it is why this is split out and tested. The card
 * is a DESCENDANT of the scroll container, so auto-scrolling moves the card's own layout
 * position by -(scrolled) while a transform derived purely from viewport pointer
 * coordinates does not move at all. Rendered position is `origin - scrolled + dy`; for that
 * to equal `origin + (y - startY)`, dy must ADD the scrolled distance back. Without it the
 * card slides away from the pointer at the scroll rate and leaves the screen entirely,
 * exactly in the long-scroll case auto-scroll exists to serve.
 */
export function dragTranslation({ x, startX, y, startY, scrollTop = 0, startScroll = 0 }) {
	return { dx: x - startX, dy: y - startY + (scrollTop - startScroll) };
}

// The nearest ancestor that actually scrolls. Differs per host: the character sheet scrolls
// in .window-content, the NPC sheet in its active tab panel.
function scrollableAncestor(el) {
	for (let node = el?.parentElement; node; node = node.parentElement) {
		const overflowY = getComputedStyle(node).overflowY;
		if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) return node;
	}
	return null;
}

// Relationships with a write in flight. Every path reads a card's rating back off the DOM
// (`data-rel-hearts`), which stays STALE from the moment the write starts until the
// re-render lands. A second gesture in that window would decide against the old value:
// clicking Hostile then immediately Trusted would see hearts=5, judge "already Trusted",
// and write nothing — leaving the card in Hostile, silently, against the user's last
// instruction. Latching makes the extra gesture a no-op instead of a wrong one.
//
// Keyed by SUBJECT and object together, because a relationship is a pair and the same
// person is a row on many sheets at once. Keying by the row id alone would let a move on
// one NPC's board block the same player character's card on another NPC's board.
const inFlight = new Set();
const flightKey = (actor, id) => `${actor?.id ?? "?"}:${id}`;

// ── Escape-to-cancel ─────────────────────────────────────────────────────────

// Cancels the one drag currently in progress, or null when nothing is being dragged.
let activeDragCancel = null;
let escapeWatcherWired = false;

// Escape must be SWALLOWED, not merely default-prevented. Foundry's KeyboardManager binds
// keydown on `window` in the bubble phase and never looks at `defaultPrevented`
// (client/helpers/interaction/keyboard-manager.mjs), and its `hasFocus` bail returns FALSE
// for a focused `<li>` — it only counts INPUT/SELECT/TEXTAREA, contentEditable, a BUTTON in
// a form, or an explicit data-keyboard-focus. A dragged card is an `<li>`, so Escape would
// reach core's "dismiss" binding and close every open window: the documented safe way to
// abandon a drag would have been the most destructive key on the board. Stopping
// propagation from a capture-phase listener on window means the event never travels onward,
// so core's bubble-phase listener on the same node never runs. Same idiom as tab-search.js.
//
// ONE listener for the module, wired lazily on the first drag and never removed. Per-drag
// add/remove would leak a global Escape-swallower on any drag whose teardown was missed,
// and a listener per wrapper would accumulate one per sheet re-render.
function ensureEscapeWatcher() {
	if (escapeWatcherWired || typeof window === "undefined") return;
	escapeWatcherWired = true;
	window.addEventListener("keydown", ev => {
		if (ev.key !== "Escape" || !activeDragCancel) return;
		ev.preventDefault();
		ev.stopPropagation();
		activeDragCancel();
	}, true);
}

/**
 * The Table/Board toggle, delegated from the SHEET ROOT rather than from the section.
 *
 * Root-level on purpose: the toolbar is placed in different parents per sheet (the heading
 * row on the character and steading sheets, the section body on the NPC sheet, which has no
 * heading), so a listener scoped to the section would miss it wherever it sits outside.
 * Each button names its own table via `data-resize-key`, which is what decouples the two —
 * the toolbar can be moved in the markup without a matching change here.
 *
 * Wired regardless of ownership: a player who cannot rate can still prefer to READ the board.
 */
function wireViewToggle(root, actor, onViewChange) {
	if (root.dataset.stRelViewToggle === "1") return;
	root.dataset.stRelViewToggle = "1";
	root.addEventListener("click", ev => {
		const btn = ev.target.closest(".stonetop-rel-view-btn");
		if (!btn || !root.contains(btn)) return;
		ev.preventDefault();
		const resizeKey = btn.dataset.resizeKey;
		const view = btn.dataset.relView;
		// Compare against STORAGE, not a rendered attribute: the button may now live far from
		// the section it controls, and storage is the thing the next render will read anyway.
		if (!resizeKey || !REL_VIEWS.includes(view) || view === relationshipView(resizeKey)) return;
		setRelationshipView(resizeKey, view);
		// Re-render rather than CSS-toggling two rendered copies: both views carry a live note
		// input per row, and a hidden twin would go stale the moment the visible one was edited.
		actor?.sheet?.render(false);
		// Wait for the new DOM, do NOT chain off render()'s return value: AppV1's render is
		// synchronous and hands back the Application, so a `.then()` on it runs a microtask
		// later — before `_render` has swapped anything. `onViewChange` is what re-fits an
		// auto-height window (the NPC sheet), and measuring the pre-toggle markup leaves the
		// window sized for the view the user just left.
		afterRender(actor,
			`.stonetop-rel-view-btn[data-resize-key="${CSS.escape(resizeKey)}"][data-rel-view="${view}"]`,
			btn,
			found => {
				// A keyboard press destroys its own button; put the user back on its
				// replacement rather than dropping them to the body. Harmless after a mouse
				// press, which left focus on that same button anyway.
				found?.focus();
				onViewChange?.(view);
			});
	});
}

/**
 * Wire one rendered relationships section: the Table/Board toggle always, and the board's
 * lane controls when the viewer may rate.
 *
 * Idempotent per wrapper (`data-st-rel-board`), matching the convention the column utils
 * use, so a host that wires the same root twice is a no-op the second time.
 *
 * `onViewChange` lets a host react to the layout flip beyond the re-render — the NPC
 * sheet is auto-height and has to re-measure.
 */
export function wireRelationshipBoard(root, actor, { editable = true, onViewChange } = {}) {
	if (!root) return;
	wireViewToggle(root, actor, onViewChange);
	root.querySelectorAll(".stonetop-rel-views[data-resize-key]").forEach(wrapper => {
		if (wrapper.dataset.stRelBoard === "1") return;
		wrapper.dataset.stRelBoard = "1";

		// Only ONE view is rendered (see relationships-view.hbs), so in table view there are
		// no cards for any of this to reach — and the drag wiring alone costs five listeners
		// per section, one of them a pointermove. The toggle above stays wired either way,
		// since that is how the user gets to the board in the first place.
		if (wrapper.dataset.relView !== "board") return;
		if (!editable) return;

		// Move a card to a lane. The primary path, not a fallback: it works by pointer, by
		// touch and from the keyboard, and it is what makes the board usable for anyone who
		// cannot complete a drag.
		// `to` names either a band (`{laneKey}`) or an exact rating (`{zoneHearts}`). Exact
		// values come from a drop on a zone, an arrow key, or one of the card's two step
		// buttons; a band from a drop on a lane's chrome or the card's Neutral button.
		// `refocus` is for a gesture that CAME from the keyboard, whose own element the
		// re-render destroys. A mouse click or a drop leaves the pointer where the user put it,
		// and forcing focus there rings a card they are already looking at — and can scroll it
		// out from under the cursor.
		const moveTo = async (card, to, stale, { onCommit, refocus = false } = {}) => {
			const state = cardState(card);
			const key = flightKey(actor, state.id);
			if (!state.id || inFlight.has(key)) return false;
			// Decide first, announce second, write last: the write re-renders and takes the
			// live region with it, so the announcement has to go out while it still exists.
			const next = moveTarget({ ...state, ...to });
			if (next === null) return false;
			inFlight.add(key);
			// Announce the rating actually written, not the band aimed at: with zones, "moved to
			// Trusted" would be the same sentence for a 4 and a 5.
			announce(wrapper, moveMessage(card?.dataset?.relName, next));
			// The move is going to happen: let the caller settle the DOM optimistically before
			// the await, so a drag does not snap back for the frames the write takes.
			onCommit?.();
			try {
				await applyRelationshipLaneMove(actor, { ...state, ...to, editable });
			} catch (err) {
				// Caught, not left to reject: no call site awaits this, so a lost ownership or a
				// dropped socket would otherwise surface only as an unhandled rejection. And
				// onCommit has already settled the card into its new lane with no re-render
				// coming to undo it, so the board would keep showing a move that never
				// persisted — render explicitly to put it back in step with storage.
				console.error("Stonetop | relationship move failed:", err);
				ui.notifications?.error?.(game.i18n.localize("stonetop.relationships.lane.moveFailed"));
				actor?.sheet?.render(false);
				return false;
			} finally {
				inFlight.delete(key);
			}
			if (refocus) refocusAfterRender(actor, cardSelector(state.id), stale);
			return true;
		};

		// Deliberately `click`, not `pointerdown`. Known cost: if the user is mid-edit in a
		// card's note field, pressing a lane button blurs the note first, and that change
		// handler writes and re-renders — destroying the button before mouseup, so the click
		// never fires and that first press does nothing. Pressing again works.
		//
		// Committing on pointerdown would "fix" that by racing the note's own blur-write:
		// two updates to the same key in flight together, the second reading state the first
		// had not yet stored, which can clobber the note the user just typed. A press the
		// user can plainly see did not land beats silently losing their words.
		wrapper.addEventListener("click", ev => {
			const btn = ev.target.closest(".stonetop-rel-lane-btn");
			if (!btn || !wrapper.contains(btn)) return;
			ev.preventDefault();
			// Two kinds of button share the strip. The outer two are STEPS: each names the
			// exact rating one sub-column to its side, so a press moves the card one column left
			// or right and the pair reaches all five values. The middle one names the Neutral
			// BAND, which holds a single value anyway, so it is exact in practice too.
			const step = btn.dataset.relStep;
			const to = step === undefined
				? { laneKey: btn.dataset.relLane }
				: { zoneHearts: Number(step) };
			// `detail === 0` is a click synthesized from Enter/Space rather than a real press,
			// which is exactly the case where the re-render leaves the user with nothing focused.
			moveTo(btn.closest(".stonetop-rel-card"), to, btn, { refocus: ev.detail === 0 });
		});

		// Left/right shifts a focused card one RATING; up/down walks the column. One heart
		// per press, so the keyboard reaches all five values — the same reach a zone drop and
		// the card's own step buttons have. Drag must never be the only route to a rating.
		wrapper.addEventListener("keydown", ev => {
			const card = ev.target.closest?.(".stonetop-rel-card");
			if (!card || !wrapper.contains(card)) return;
			const horizontal = ev.key === "ArrowLeft" || ev.key === "ArrowRight";
			const vertical   = ev.key === "ArrowUp"   || ev.key === "ArrowDown";
			if (!horizontal && !vertical) return;
			// Never steal an arrow key from the note field — that is text navigation.
			if (ev.target.closest(".stonetop-rel-note-input")) return;
			ev.preventDefault();
			// And stop it reaching Foundry, which binds the arrow keys to panning the canvas
			// and does NOT check defaultPrevented. Its `hasFocus` bail does not cover a
			// focused `<li>`, so without this every card move also slides the battlemap.
			ev.stopPropagation();

			if (vertical) {
				// Walks the whole COLUMN, not just the zone: a lane is split into two small
				// zones, so confining vertical travel to one would strand the user after a
				// card or two.
				const siblings = [...(card.closest(".stonetop-rel-lane")?.querySelectorAll(".stonetop-rel-card") ?? [])];
				const next = siblings[siblings.indexOf(card) + (ev.key === "ArrowDown" ? 1 : -1)];
				next?.focus();
				return;
			}

			// The same one-sub-column motion the outer two card buttons make, from the same
			// helper — so the arrow keys and the buttons can never drift apart. Null at the
			// end of the scale: there is nowhere further to go, and asserting the current
			// value again would run it through the click-toggle path.
			const next = stepHearts(cardState(card).hearts, ev.key === "ArrowRight" ? 1 : -1);
			if (next === null) return;
			moveTo(card, { zoneHearts: next }, card, { refocus: true });
		});

		wireLaneDrag(wrapper, moveTo);
	});
}

/**
 * Drag a card between lanes with pointer events.
 *
 * Pointer events, NOT HTML5 drag-and-drop, and that is the load-bearing choice here:
 *
 *  • Two of the three hosts would swallow the drop. StonetopCharacterSheet installs a
 *    CAPTURE-phase `drop` on the sheet root that calls stopImmediatePropagation, and the
 *    NPC sheet's relationships section does the same for its own section. An HTML5 drop
 *    inside the board would never reach a listener here.
 *  • Gecko pastes an uncancelled drop's payload as text into whatever input is under it,
 *    and every card carries a note field whose change handler would SAVE that JSON as the
 *    note. Chromium masks the bug entirely, so it would not show up in normal testing.
 *  • The steading sheet already runs two root-level `dragstart` listeners separated only
 *    by selector checks; a third is a live regression risk for its other drags.
 *
 * Pointer events emit no `drag*` at all, so the board is invisible to all of that. Follows
 * the same pointerdown → setPointerCapture → pointermove/pointerup shape as
 * makeColumnsResizable.
 *
 * Drag is strictly an accelerator: the lane buttons and the arrow keys do the same job, so
 * nothing here is the only route to moving a card.
 */
function wireLaneDrag(wrapper, moveTo) {
	let drag = null;
	let scrollFrame = 0;
	// Resolved on the first press and kept, because scrollableAncestor walks the whole
	// ancestor chain calling getComputedStyle (a style flush) and reading scrollHeight (a
	// layout flush) — and a card is pressed far more often than it is dragged. Only a FOUND
	// scroller is cached: it cannot change while this wrapper is rendered, but "nothing
	// scrolls yet" can, since the sheet is resizable and a taller window is not a re-render.
	// `??=` re-walks in exactly that case and caches once there is something to cache.
	let scroller;

	const clearHighlight = () => wrapper
		.querySelectorAll(".stonetop-rel-lane.is-drop-target, .stonetop-rel-zone.is-drop-target")
		.forEach(el => el.classList.remove("is-drop-target"));

	// The exact-value drop zones are an overlay that only EXISTS visually while a drag is
	// live, so the board carries the state class rather than each lane: one toggle reveals
	// every lane's zones at once, and CSS decides which lanes have any (Neutral has none —
	// a single value offers no choice).
	const boards = () => [...wrapper.querySelectorAll(".stonetop-rel-board")];
	const showZones = on => boards().forEach(b => b.classList.toggle("is-dragging", on));

	// What is under the pointer: the exact-value ZONE if there is one, otherwise just the
	// lane (its header, its hint, the padding around the card list) which means "this band"
	// and falls back to the band's gentle end.
	//
	// The dragged card rides UNDER the cursor at every position, so a plain elementFromPoint
	// would return the card itself and resolve to its own SOURCE zone every time, making
	// every drop a no-op. Walk the whole hit stack and skip anything belonging to the card.
	const dropAt = (x, y) => {
		for (const el of document.elementsFromPoint(x, y)) {
			if (drag?.card.contains(el)) continue;
			const zone = el.closest?.(".stonetop-rel-zone");
			if (zone && wrapper.contains(zone)) return { zone, lane: zone.closest(".stonetop-rel-lane") };
			const lane = el.closest?.(".stonetop-rel-lane");
			if (lane && wrapper.contains(lane)) return { zone: null, lane };
		}
		return { zone: null, lane: null };
	};

	const stopScrolling = () => {
		if (scrollFrame) cancelAnimationFrame(scrollFrame);
		scrollFrame = 0;
	};

	// Scroll the host when the pointer nears its edge, at a speed proportional to how deep
	// into the margin it is. Re-arms itself each frame while the drag stays in the margin.
	const autoScroll = () => {
		scrollFrame = 0;
		if (!drag?.started || !drag.scroller) return;
		const box = drag.scroller.getBoundingClientRect();
		const delta = autoScrollDelta(drag.y, box.top, box.bottom);
		if (!delta) return;
		drag.scroller.scrollTop += delta;
		follow();
		scrollFrame = requestAnimationFrame(autoScroll);
	};

	// Keep the card under the cursor. transform, not left/top: it composites instead of
	// forcing a re-layout of the sheet on every frame (see drag-smoothing.js).
	//
	// The Y term carries a scroll correction, and it is not optional. The card is a
	// DESCENDANT of the scroller, so auto-scrolling moves the card's own layout position up
	// by the scrolled distance while a purely pointer-derived transform stays put. The card
	// would slide away from the cursor by exactly the amount scrolled — at 16px/frame it
	// leaves the screen in well under a second, precisely in the long-scroll case
	// auto-scroll exists to serve, leaving the user holding something invisible.
	const follow = () => {
		if (!drag?.started) return;
		const { dx, dy } = dragTranslation({
			x: drag.x, startX: drag.startX, y: drag.y, startY: drag.startY,
			scrollTop: drag.scroller?.scrollTop ?? 0, startScroll: drag.startScroll,
		});
		drag.card.style.transform = `translate(${dx}px, ${dy}px)`;
		const { zone, lane } = dropAt(drag.x, drag.y);
		if (zone === drag.zone && lane === drag.lane) return;
		clearHighlight();
		// Highlight the zone when the pointer is in one, so the user can see WHICH rating they
		// are about to assert; otherwise highlight the whole lane, which is the coarser
		// promise the drop will actually keep.
		(zone ?? lane)?.classList.add("is-drop-target");
		drag.zone = zone;
		drag.lane = lane;
	};

	// One exit for every ending: dropped, cancelled, pointer lost, Escape. Clears `drag`
	// FIRST so it is safe to re-enter — releasePointerCapture fires `lostpointercapture`,
	// which routes straight back here.
	function end() {
		const active = drag;
		if (!active) return;
		drag = null;
		activeDragCancel = null;
		stopScrolling();
		clearHighlight();
		showZones(false);
		active.card.classList.remove("is-dragging");
		active.card.style.transform = "";
		active.card.style.willChange = "";
		try { active.card.releasePointerCapture(active.pointerId); } catch (_err) { /* already gone */ }
	}

	// Only tear down for the pointer that started this drag. A second finger touching the
	// board fires its own pointercancel, which would otherwise abandon a live drag.
	const endIfOurs = ev => { if (drag && ev.pointerId === drag.pointerId) end(); };

	wrapper.addEventListener("pointerdown", ev => {
		if (ev.button !== 0 || drag) return;
		const card = ev.target.closest(".stonetop-rel-card");
		if (!card || !wrapper.contains(card)) return;
		// A card is mostly made of controls. Never begin a drag on one, or rating someone
		// would become impossible without accidentally flinging their card.
		if (ev.target.closest(".stonetop-rel-heart, .stonetop-rel-note-input, .stonetop-rel-show-check, button, input, textarea, select, a")) return;
		// Armed, not started: the press stays a click until it travels DRAG_THRESHOLD.
		scroller ??= scrollableAncestor(wrapper);
		drag = {
			card, pointerId: ev.pointerId, pointerType: ev.pointerType,
			started: false, lane: null, zone: null,
			startX: ev.clientX, startY: ev.clientY, x: ev.clientX, y: ev.clientY,
			// Baseline for the scroll correction in follow(). Read at arm time, not at first
			// movement, so it matches startX/startY.
			scroller, startScroll: scroller?.scrollTop ?? 0,
		};
		// Capture immediately, while still only armed. Waiting until the threshold is
		// crossed would mean a fast first movement lands outside the wrapper and is never
		// seen, so the drag would silently fail to start. Capture retargets every later
		// event to the card, which is inside the wrapper, so delegation keeps working.
		try { card.setPointerCapture(ev.pointerId); } catch (_err) { /* not capturable */ }
	});

	wrapper.addEventListener("pointermove", ev => {
		if (!drag || ev.pointerId !== drag.pointerId) return;
		drag.x = ev.clientX;
		drag.y = ev.clientY;
		if (!drag.started) {
			if (!liftsDrag(drag.pointerType, drag.x - drag.startX, drag.y - drag.startY)) return;
			drag.started = true;
			drag.card.classList.add("is-dragging");
			drag.card.style.willChange = "transform";
			// Reveal the exact-value zones now, not on pointerdown: an ordinary press must not
			// flash them, and until the threshold is crossed this is still a click.
			showZones(true);
			activeDragCancel = end;
			ensureEscapeWatcher();
		}
		// Only once the drag is real: otherwise this would suppress text selection and
		// ordinary presses inside the card.
		ev.preventDefault();
		follow();
		if (!scrollFrame) scrollFrame = requestAnimationFrame(autoScroll);
	});

	wrapper.addEventListener("pointerup", ev => {
		if (!drag || ev.pointerId !== drag.pointerId) return;
		const { card, lane, zone, started } = drag;
		// Never crossed the threshold: this was a click. Tear down without consuming it, so
		// the click handlers still see it.
		if (!started) { end(); return; }
		ev.preventDefault();
		// Lifted, but barely moved. Treat it as a nudge rather than a drop: see
		// DROP_COMMIT_DISTANCE — the overlay arrives already under the pointer, so honouring a
		// tiny gesture would write a rating the user never aimed at.
		if (!isCommittedDrop(drag.x - drag.startX, drag.y - drag.startY)) { end(); return; }
		// A zone names an exact rating; a bare lane names only the band. Read both off the
		// DOM before end() clears the drag.
		const zoneHearts = zone ? Number(zone.dataset.relZone) : undefined;
		const laneKey = lane?.dataset?.relLane;
		const target = zone ? { zoneHearts } : { laneKey };
		// One full-width list per lane, so the card settles into the lane regardless of which
		// zone was aimed at — the zones are targets, not containers.
		const list = lane?.querySelector(".stonetop-rel-lane-cards");
		end();
		if (!zone && !laneKey) return;
		// Settle the card into its new home before the write, so it does not snap back to
		// where it started for the frames the update and re-render take.
		moveTo(card, target, card, {
			onCommit: () => {
				if (!list) return;
				// Drop the target's "nobody here yet" line first, or the card would land
				// underneath it and the lane would read as both empty and occupied until the
				// re-render lands.
				list.querySelector(".stonetop-rel-lane-empty")?.remove();
				list.appendChild(card);
			},
		});
	});

	// A drag can also end without a drop: the browser takes the pointer (a system gesture,
	// a touch becoming a scroll) or the capture is lost. Both must clean up, or the card is
	// left floating and translated with no way to put it down.
	wrapper.addEventListener("pointercancel", endIfOurs);
	wrapper.addEventListener("lostpointercapture", endIfOurs);
}
