import { StonetopDialog } from "../../utils/stonetop-dialog.js";
import { book2ArtRoot } from "../../book2-art/art-root.js";
import { BOOK2_ART_APPLY_MANIFEST } from "../../book2-art/manifest.js";
import { displayPortraitSrc } from "../../book2-art/people-portraits.js";
import { getObjectSetting } from "../../settings.js";
import { filePicker } from "../../utils/foundry-compat.js";

// How long the grid takes to travel to a rolled portrait, however far away it landed. The
// browser's own `scrollIntoView({behavior:"smooth"})` picks its own duration and scales it
// with distance, so in a ~155-tile grid a roll clear across the gallery took noticeably
// longer than one nearby — and rolling repeatedly meant waiting on the scroll every time.
const ROLL_SCROLL_MS = 200;

/**
 * Where the gallery body has to be scrolled to put a tile in the middle of it, clamped to
 * the ends of the scroll range so a roll near the top or bottom doesn't ask for an
 * impossible offset (and then appear not to move, having asked for one it was already at).
 *
 * Takes measurements rather than elements so the centring is testable without a DOM: `*Top`
 * values are viewport-relative rects, `scrollTop`/`scrollHeight` the body's own.
 */
export function rolledScrollTop({ scrollTop, viewTop, viewHeight, tileTop, tileHeight, scrollHeight }) {
	const centred = scrollTop + (tileTop - viewTop) - (viewHeight - tileHeight) / 2;
	return Math.max(0, Math.min(centred, scrollHeight - viewHeight));
}

/**
 * The identity of a portrait, whichever way it is being held.
 *
 * A face is stored as the SQUARE once one has been cut, but a portrait chosen before squares
 * existed is still the whole illustration, and the two paths are different strings for the same
 * person. Everything that asks "is this the same portrait?" — selected, used-by, and the roll's
 * "give me a different one" — has to ask it on one of the two, and the whole illustration is the
 * one that always exists. Anything that is not gallery art (a browsed file) is its own identity.
 */
export const asFullPortrait = displayPortraitSrc;

/**
 * Choose one portrait at random out of `srcs` — which the caller has already narrowed to the
 * tiles the filters leave on screen, so "feminine, not a child, surprise me" works.
 *
 * Prefers a portrait other than `current`, so rolling again on a member who already has one
 * always lands somewhere new; falls back to the whole pool when the current portrait is the
 * only thing showing. `rng` is injectable so the tests can pin the roll.
 *
 * Compares raw strings, so the caller owes it paths that are already comparable — see
 * `asFullPortrait`, and the roll handler that runs both sides through it.
 */
export function pickRandomPortrait(srcs, { current = "", rng = Math.random } = {}) {
	const pool = (srcs ?? []).filter(Boolean);
	if (!pool.length) return null;
	const fresh = pool.filter(src => src !== current);
	const choices = fresh.length ? fresh : pool;
	// Clamp rather than trust rng() < 1: a stub (or an edge-case 1) would index past the end.
	return choices[Math.min(choices.length - 1, Math.floor(rng() * choices.length))];
}

/**
 * The "People of Stonetop" portrait gallery: pick an imported book illustration as a
 * resident's or neighbor's portrait on the steading sheet.
 *
 * The images are the ones a GM tagged as people in the local art picker and imported from
 * their own book PDF (they are copyrighted, so nothing ships). Which of them are on disk, and
 * what to label each, is broadcast in the world-scoped `peopleArt` setting — a { manifest out
 * path -> display name } map published by the Import Book Art macro and book2-art/reapply.js.
 * Reading that setting (instead of browsing files) is what lets this work for players too, who
 * cannot FilePicker.browse. Each `out` resolves against the durable art folder (`book2ArtRoot`),
 * the exact path the index checked for, so a listed portrait always loads.
 *
 * Falls back to a normal FilePicker via "Browse files…" for a custom image (offered only to a
 * user who can browse), and "Use default" clears the portrait back to the placeholder.
 */
export class PeopleGalleryDialog extends StonetopDialog {
	constructor({ current = "", canBrowse = false, used = {}, onPick, onBrowse, onClear } = {}, options = {}) {
		super(options);
		this._current = current;
		this._canBrowse = canBrowse;
		// { src -> who already wears it }, built by the caller from the rest of the roster.
		this._used = used ?? {};
		this._onPick = onPick;
		this._onBrowse = onBrowse;
		this._onClear = onClear;
	}

	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id: "stonetop-people-gallery",
			title: "People of Stonetop",
			template: "systems/stonetop_pwd/templates/dialogs/people-gallery.hbs",
			width: 640,
			height: "auto",
			resizable: true,
			classes: ["stonetop", "stonetop-people-gallery"],
		});
	}

	/** The broadcast { out -> name } index, tolerant of an unregistered/legacy setting. */
	_peopleIndex() {
		return getObjectSetting("peopleArt");
	}

	/**
	 * The broadcast { illustration out -> square out } index: which portraits have their
	 * hand-authored square face on disk. Empty in a world whose GM has not run the rebuild (or
	 * whose build predates squares), which is exactly right — every such portrait then offers
	 * and commits the whole illustration, as it always did.
	 */
	_squareIndex() {
		return getObjectSetting("peoplePortraitArt");
	}

	/**
	 * Sorting traits by manifest `out` path. The broadcast index says which portraits are on
	 * disk; the shipped manifest says what each one IS — how it presents, and whether it's a
	 * child — as tagged in the local art picker. They are joined here rather than folded into
	 * the setting so the setting stays a plain { out -> name } map (nothing to migrate in a
	 * world that already has one), and because traits are static authored data, not per-world.
	 */
	static _traitsByOut() {
		const map = {};
		for (const p of BOOK2_ART_APPLY_MANIFEST.people ?? []) {
			map[p.out] = { presenting: p.presenting || "", kid: !!p.kid };
		}
		return map;
	}

	getData() {
		const idx = this._peopleIndex();
		const squares = this._squareIndex();
		const root = book2ArtRoot();
		const traits = PeopleGalleryDialog._traitsByOut();
		// Everything about "is this the same person" is decided on the WHOLE illustration's path
		// — see asFullPortrait — because a portrait can be held either way: an actor picked
		// before squares existed carries the illustration, one picked after carries the square.
		const currentFull = asFullPortrait(this._current);
		const usedByFull = {};
		for (const [src, who] of Object.entries(this._used ?? {})) usedByFull[asFullPortrait(src)] = who;
		const people = Object.entries(idx).map(([out, name]) => {
			const full = `${root}/${out}`;
			// The square is what gets committed and what the tile shows, so the grid is a
			// preview of the sheet rather than of the book page. The whole illustration is one
			// hover away, which is where a standing figure actually reads.
			const square = squares[out] ? `${root}/${squares[out]}` : "";
			const src = square || full;
			// A portrait with no manifest entry (an older import, or a file dropped in by hand)
			// is untagged, which is the same bucket as one deliberately left unspecified.
			const t = traits[out] ?? { presenting: "", kid: false };
			// "Used" always means used by somebody ELSE: the caller leaves the row being edited
			// out of the map, so this member's own portrait reads as selected, not as taken.
			const usedBy = usedByFull[full] ?? "";
			return {
				out, name, src, full, isSquare: !!square,
				selected: full === currentFull, presenting: t.presenting, kid: t.kid, usedBy,
			};
		});
		people.sort((a, b) => (a.name || "").localeCompare(b.name || "") || a.out.localeCompare(b.out));
		// Counts ride on the chips so it's clear what narrowing will cost before you click.
		const counts = {
			all: people.length,
			masculine: people.filter((p) => p.presenting === "masculine").length,
			feminine: people.filter((p) => p.presenting === "feminine").length,
			// Not the complement of masculine+feminine: the picker's tag vocabulary can grow, and
			// a portrait tagged something else is not untagged.
			unspecified: people.filter((p) => !p.presenting).length,
			kid: people.filter((p) => p.kid).length,
			used: people.filter((p) => p.usedBy).length,
		};
		// True complements, so they are subtracted rather than counted a second time: every
		// portrait is in exactly one bucket of each pair.
		counts.notKid = people.length - counts.kid;
		counts.unused = people.length - counts.used;
		// Only worth offering the filters when there is enough art for them to do something,
		// and only for the traits that were actually tagged.
		const showFilters = people.length > 1 && (counts.masculine || counts.feminine || counts.kid || counts.used);
		return {
			people, counts,
			showFilters: !!showFilters,
			hasKids: !!counts.kid,
			// Nobody has a portrait yet in a fresh world, and a lone "Unused 155" chip would
			// only be noise, so the use filter appears with the first assignment.
			hasUsed: !!counts.used,
			canBrowse: this._canBrowse,
		};
	}

	/**
	 * Narrow the grid in place rather than re-rendering: filtering is pure display, and a
	 * re-render would rebuild every <img> and throw away the scroll position mid-browse.
	 */
	_activateFilters(root, picks) {
		const chips = [...root.querySelectorAll(".stonetop-people-chip")];
		if (!chips.length) return;
		const noMatch = root.querySelector(".stonetop-people-nomatch");
		const state = { presenting: "any", kid: "any", used: "any" };
		const facets = Object.keys(state);

		const apply = () => {
			// a hover preview belonging to a tile we are about to hide would be left
			// stranded beside nothing
			this._removePortraitPreview();
			let shown = 0;
			for (const p of picks) {
				// Each tile's data-<facet> speaks the same vocabulary as that facet's chips
				// (see people-gallery.hbs), so a facet needs no decoder and a new one costs a
				// chip group and a dataset attribute — no change here.
				const ok = facets.every(facet => state[facet] === "any" || p.dataset[facet] === state[facet]);
				p.hidden = !ok;
				if (ok) shown++;
			}
			if (noMatch) noMatch.hidden = shown > 0;
			// Randomize rolls from what is showing, so it goes dead with the grid — and a
			// proposal the new filter just hid is no longer on offer, so it is withdrawn.
			if (this._proposed?.hidden) this._propose(null);
			this._syncRandomButton(shown);
		};

		for (const chip of chips) {
			chip.addEventListener("click", () => {
				const group = chip.dataset.filter;
				state[group] = chip.dataset.value;
				for (const c of chips) {
					if (c.dataset.filter === group) c.classList.toggle("is-on", c === chip);
				}
				apply();
			});
		}
	}

	// ── Picking ───────────────────────────────────────────────────────

	/** Apply a portrait and close. Only Accept gets here: every other route only proposes. */
	async _choose(src) {
		if (!src) return;
		await this._onPick?.(src);
		this.close();
	}

	/** The tiles the filters currently leave on screen — the pool Random rolls from. */
	_visiblePicks() {
		return (this._picks ?? []).filter(p => !p.hidden);
	}

	/**
	 * Nothing showing, nothing to roll. Kept in step with the filters by their apply(), which
	 * passes the count it just tallied rather than making us walk all ~155 tiles again.
	 */
	_syncRandomButton(shown = this._visiblePicks().length) {
		if (this._randomBtn) this._randomBtn.disabled = shown === 0;
	}

	/**
	 * Hold a portrait as a PROPOSAL rather than applying it: it highlights the tile and arms
	 * Accept, so nothing is committed until you say so. Both ways in behave the same — a roll
	 * you don't like costs another click on Randomize, and a tile clicked by mistake (easy in
	 * a grid of cover-cropped thumbnails, where the wrong one is a few pixels away) costs a
	 * click on the right one, rather than a portrait you must reopen the gallery to fix.
	 *
	 * `how` only picks the wording of the hint. `scroll` is the real difference between the
	 * two: a roll lands anywhere in a ~155-tile grid, most of it off-screen, so it has to be
	 * brought into view — but a click is already under the pointer, and scrolling it to the
	 * middle would yank the grid out from under the eye that just chose it.
	 *
	 * Pass null to drop the proposal.
	 */
	_propose(tile, { how = "rolled", scroll = false } = {}) {
		if (this._proposed && this._proposed !== tile) this._proposed.classList.remove("is-proposed");
		this._proposed = tile ?? null;
		if (this._acceptBtn) this._acceptBtn.disabled = !this._proposed;
		if (tile) {
			tile.classList.add("is-proposed");
			if (scroll) this._scrollToProposed(tile);
		}
		this._updateHint(tile, how);
	}

	/**
	 * Glide the gallery body to a rolled tile in a fixed ROLL_SCROLL_MS, near or far — the
	 * point of the movement is to show WHERE the roll landed, and past a certain speed the
	 * eye follows it just as well. Animated by hand rather than with `behavior: "smooth"`
	 * because that duration is the browser's to choose, and it chooses by distance.
	 *
	 * Scrolls the body directly instead of `scrollIntoView`, which walks every scrollable
	 * ancestor and would drag the page behind the dialog around too.
	 */
	_scrollToProposed(tile) {
		this._cancelRollScroll();
		const body = this._bodyEl;
		// No scroll container (a gallery small enough to need none, or a changed template):
		// nothing to animate, and the tile is on screen already.
		if (!body) return;
		const view = body.getBoundingClientRect();
		const rect = tile.getBoundingClientRect();
		const to = rolledScrollTop({
			scrollTop: body.scrollTop, viewTop: view.top, viewHeight: body.clientHeight,
			tileTop: rect.top, tileHeight: rect.height, scrollHeight: body.scrollHeight,
		});
		const from = body.scrollTop;
		const distance = to - from;
		// Sub-pixel hops aren't worth a frame, and a reader who asked for less motion gets
		// the destination without the trip.
		if (Math.abs(distance) < 1 || window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
			body.scrollTop = to;
			return;
		}
		const start = performance.now();
		const step = (now) => {
			const t = Math.min(1, (now - start) / ROLL_SCROLL_MS);
			// Ease-out cubic: leaves immediately (so the roll reads as instant) and settles
			// rather than stopping dead, which is what makes the landing legible.
			body.scrollTop = from + (distance * (1 - Math.pow(1 - t, 3)));
			this._rollScrollFrame = t < 1 ? requestAnimationFrame(step) : null;
		};
		this._rollScrollFrame = requestAnimationFrame(step);
	}

	/** Drop any scroll still in flight — a second roll, or a close, supersedes the first. */
	_cancelRollScroll() {
		if (this._rollScrollFrame) cancelAnimationFrame(this._rollScrollFrame);
		this._rollScrollFrame = null;
	}

	/**
	 * Say what is on offer, in the line that otherwise explains the grid. The tile is
	 * highlighted too, but a roll may have scrolled it from where the eye was, and the label
	 * under a cover-cropped thumbnail is easy to miss — so the name is repeated somewhere
	 * fixed, along with the reminder that nothing has been applied yet.
	 */
	_updateHint(tile, how = "rolled") {
		const hint = this._hintEl;
		if (!hint) return;
		if (!tile) {
			hint.textContent = this._hintDefault;
			return;
		}
		const name = tile.querySelector(".stonetop-people-label")?.textContent?.trim();
		// A portrait someone else already wears can be proposed either way (they are only
		// hidden if you filter them out), and the red tile edge is easy to miss mid-scroll —
		// so say it here rather than let it be discovered after Accept.
		const taken = tile.dataset.usedBy ? ` It is already assigned to ${tile.dataset.usedBy}.` : "";
		const verb = how === "picked" ? "Picked" : "Rolled";
		hint.textContent = name
			? `${verb} ${name}.${taken} Accept to use it, or keep looking.`
			: `Accept to use this portrait, or keep looking.${taken}`;
	}

	// ── Hover preview ─────────────────────────────────────────────────
	// Even at ~200px a tile is a cover-cropped thumbnail, so hovering one pops a large copy
	// that shows the whole portrait uncropped. Mirrors the arcana preview rather than the Welcome
	// guide's pure-CSS ::after: the grid lives in an `overflow-y: auto` body, which would
	// clip a pseudo-element, so the popup is a fixed-position node on <body> instead.

	_removePortraitPreview() {
		this._portraitPreview?.remove();
		this._portraitPreview = null;
		this._portraitAnchor = null;
	}

	_showPortraitPreview(btn) {
		this._removePortraitPreview();
		// The WHOLE illustration, never the square: the tile already shows the square, so a
		// preview of the same thing bigger would say nothing. This is where a standing figure
		// gets to be a standing figure, and where you check the square framed the right face.
		const src = btn.dataset.full || btn.dataset.src;
		if (!src) return;
		const popup = document.createElement("div");
		// `stonetop-hover-popup` is the shared marker Reduce Motion suppresses (styles/stonetop.css).
		popup.className = "stonetop-hover-popup stonetop-people-preview";
		const img = document.createElement("img");
		img.src = src;
		img.alt = "";
		popup.appendChild(img);
		const label = btn.querySelector(".stonetop-people-label")?.textContent?.trim();
		if (label) {
			const cap = document.createElement("span");
			cap.textContent = label;
			popup.appendChild(cap);
		}
		document.body.appendChild(popup);
		this._portraitPreview = popup;
		this._portraitAnchor = btn;
		// Position once the image has its intrinsic size, or the box is measured at zero and
		// lands in the wrong place. Portraits are lazy-loaded, so the first hover on a tile
		// that has not painted yet would otherwise mis-place.
		if (img.complete) this._positionPortraitPreview(popup, btn);
		else img.addEventListener("load", () => {
			if (this._portraitPreview === popup) this._positionPortraitPreview(popup, btn);
		}, { once: true });
	}

	// Prefer the side: these are tall portraits shown large, so an above/below popup rarely
	// fits, and sitting beside the tile leaves the row you are scanning visible.
	_positionPortraitPreview(popup, anchor) {
		const a = anchor.getBoundingClientRect();
		// offsetWidth/Height, not the rect: the grow-in animation starts at scale(0.4) and
		// would shrink the measured box (same trap as the arcana popup).
		const pw = popup.offsetWidth;
		const ph = popup.offsetHeight;
		const gap = 10;
		const right = a.right + gap;
		const left = a.left - pw - gap;
		// right unless it would run off, then left, then clamp
		let x = right + pw <= window.innerWidth - 8 ? right : (left >= 8 ? left : right);
		x = Math.max(8, Math.min(x, window.innerWidth - pw - 8));
		// vertically centred on the tile, clamped into the viewport
		let y = a.top + a.height / 2 - ph / 2;
		y = Math.max(8, Math.min(y, window.innerHeight - ph - 8));
		popup.style.left = `${x}px`;
		popup.style.top = `${y}px`;
	}

	_activatePortraitPreviews(root) {
		// Delegated from the grid, not four listeners per tile: a full import is ~155
		// portraits, so the per-tile shape meant ~620 registrations (and ~620 closures) every
		// time the gallery opened. mouseover/mouseout and focusin/focusout are the bubbling
		// counterparts of mouseenter/mouseleave and focus/blur, which do not bubble at all.
		const grid = root.querySelector(".stonetop-people-grid");
		if (!grid) return;
		// Both pairs re-fire while the pointer or focus moves BETWEEN a tile's own children
		// (the img and its label), which the non-bubbling events never did: entering a tile
		// we are already previewing is not a new hover, and leaving for somewhere still
		// inside it is not a leave.
		const tileOf = ev => ev.target.closest?.(".stonetop-people-pick");
		const stillInside = (btn, ev) => btn.contains(ev.relatedTarget);

		grid.addEventListener("mouseover", ev => {
			const btn = tileOf(ev);
			if (btn && btn !== this._portraitAnchor) this._showPortraitPreview(btn);
		});
		grid.addEventListener("mouseout", ev => {
			const btn = tileOf(ev);
			if (btn && !stillInside(btn, ev)) this._removePortraitPreview();
		});
		// keyboard parity: tabbing through the grid previews too
		grid.addEventListener("focusin", ev => {
			const btn = tileOf(ev);
			if (btn && btn !== this._portraitAnchor) this._showPortraitPreview(btn);
		});
		grid.addEventListener("focusout", ev => {
			const btn = tileOf(ev);
			if (btn && !stillInside(btn, ev)) this._removePortraitPreview();
		});
		// The popup is fixed while the tile scrolls under it, so it has to react to scrolling or
		// it ends up hanging beside the wrong portrait. FOLLOW the tile rather than dismiss:
		// dismissing races with any scroll that accompanies the hover itself (a scrolled-into-view
		// tile fires `scroll` a frame after `mouseenter`, which would kill the preview the moment
		// it appeared). Only drop it once the pointer has actually left the tile.
		//
		// Coalesced to one frame: `scroll` fires far faster than the screen paints, and the
		// reposition reads the anchor's rect and the popup's size — a forced layout flush each
		// time — to move something that can only visibly move once per frame.
		let repositionFrame = 0;
		this._bodyEl?.addEventListener("scroll", () => {
			if (repositionFrame) return;
			repositionFrame = requestAnimationFrame(() => {
				repositionFrame = 0;
				const anchor = this._portraitAnchor;
				if (!this._portraitPreview || !anchor?.isConnected) return;
				if (anchor.matches(":hover")) this._positionPortraitPreview(this._portraitPreview, anchor);
				else this._removePortraitPreview();
			});
		}, { passive: true });
	}

	async close(options) {
		this._removePortraitPreview();
		this._cancelRollScroll();
		return super.close(options);
	}

	activateListeners(html) {
		super.activateListeners(html);
		const root = html[0];
		// One walk of the grid, shared: a full import is ~155 tiles, and the filter pass, the
		// Random button and the click wiring below all want the same list.
		const picks = [...root.querySelectorAll(".stonetop-people-pick")];
		this._picks = picks;
		this._randomBtn = root.querySelector(".stonetop-people-random");
		this._acceptBtn = root.querySelector(".stonetop-people-accept");
		this._hintEl = root.querySelector(".stonetop-people-hint");
		this._hintDefault = this._hintEl?.textContent ?? "";
		this._proposed = null;
		// The grid's scroll container: both the roll's scroll animation and the hover preview
		// that has to follow it need this one, so it is found once here.
		this._bodyEl = root.querySelector(".stonetop-people-gallery-body");
		this._cancelRollScroll();
		this._activateFilters(root, picks);
		this._activatePortraitPreviews(root);
		this._syncRandomButton();

		// Clicking a tile only offers it. Accept is the one thing that writes the portrait.
		picks.forEach(btn => btn.addEventListener("click", () => this._propose(btn, { how: "picked" })));

		// Rolls from the tiles the filters left showing, and shows the result rather than
		// taking it. Avoid whatever is already on offer — the standing proposal if there is
		// one, else the member's current portrait — so rolling again always moves.
		//
		// Rolled over `data-full`, not `data-src`, for the reason getData spells out: a portrait
		// chosen before squares existed is held as the WHOLE illustration while its tile now
		// shows the square, so comparing the two raw paths never matches and "avoid the current
		// one" silently stops avoiding anything. The winning tile still contributes its own
		// `data-src` — the square is what Accept commits.
		this._randomBtn?.addEventListener("click", () => {
			const visible = this._visiblePicks();
			const held = this._proposed?.dataset.src || this._current;
			const full = pickRandomPortrait(visible.map(p => p.dataset.full), { current: asFullPortrait(held) });
			if (full) this._propose(visible.find(p => p.dataset.full === full), { scroll: true });
		});

		// The one door a portrait actually goes through, however it was landed on.
		this._acceptBtn?.addEventListener("click", () => this._choose(this._proposed?.dataset.src));

		// Close first so the gallery isn't stacked over the FilePicker it opens.
		root.querySelector(".stonetop-people-browse")?.addEventListener("click", () => {
			this.close();
			this._onBrowse?.();
		});

		root.querySelector(".stonetop-people-clear")?.addEventListener("click", async () => {
			await this._onClear?.();
			this.close();
		});
	}
}

/**
 * Open the gallery on a portrait and apply whatever the user settles on. The one door every
 * portrait surface goes through — the steading's residents and neighbors, and the character
 * sheet's follower cards — so the two policy calls it makes are made once:
 *
 *   • who gets the raw FilePicker fallback. Only a user who can browse the data files; players
 *     pick from the broadcast gallery, which needs no file access; and
 *   • where FilePicker lives, which moved namespace in v13.
 *
 * `onPick` receives the chosen path and `onClear` nothing — "Use default" is a distinct
 * outcome from picking, since a caller may want to close a stale photo popout rather than
 * point it at an empty path.
 *
 * `onFrame`, when supplied, chains straight into the portrait framer once a file has been
 * BROWSED — the one case with no sensible default square, since shipped gallery art already
 * carries a hand-cut one and chaining off Accept would nag on the common path. Fail-closed: a
 * caller that passes no `onFrame` gets no chain, which is how a surface with nowhere to store a
 * frame simply never offers one.
 *
 * @param {{current?: string, used?: Record<string,string>, onPick: Function, onClear?: Function,
 *          onFrame?: Function}} opts
 */
export function openPeoplePortraitPicker({ current = "", used = {}, onPick, onClear, onFrame } = {}) {
	const canBrowse = !!(game.user?.isGM || game.user?.can?.("FILES_BROWSE"));
	const onBrowse = () => {
		const FilePickerClass = filePicker();
		if (FilePickerClass) new FilePickerClass({ type: "image", current, callback: async path => {
			// Awaited: the framer reads the NEW image off the document, so the write has to land
			// before it opens.
			await onPick(path);
			await onFrame?.(path);
		} }).render(true);
	};
	return new PeopleGalleryDialog({ current, canBrowse, used, onPick, onBrowse, onClear }).render(true);
}
