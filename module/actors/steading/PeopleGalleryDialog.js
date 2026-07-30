import { StonetopDialog } from "../../utils/stonetop-dialog.js";
import { book2ArtRoot } from "../../book2-art/art-root.js";
import { BOOK2_ART_APPLY_MANIFEST } from "../../book2-art/manifest.js";

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
	constructor({ current = "", canBrowse = false, onPick, onBrowse, onClear } = {}, options = {}) {
		super(options);
		this._current = current;
		this._canBrowse = canBrowse;
		this._onPick = onPick;
		this._onBrowse = onBrowse;
		this._onClear = onClear;
	}

	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id: "stonetop-people-gallery",
			title: "People of Stonetop",
			template: "systems/stonetop-pwd/templates/dialogs/people-gallery.hbs",
			width: 640,
			height: "auto",
			resizable: true,
			classes: ["stonetop", "stonetop-people-gallery"],
		});
	}

	/** The broadcast { out -> name } index, tolerant of an unregistered/legacy setting. */
	_peopleIndex() {
		try {
			const idx = game.settings.get("stonetop-pwd", "peopleArt");
			return idx && typeof idx === "object" && !Array.isArray(idx) ? idx : {};
		} catch (_) {
			return {};
		}
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
		const root = book2ArtRoot();
		const traits = PeopleGalleryDialog._traitsByOut();
		const people = Object.entries(idx).map(([out, name]) => {
			const src = `${root}/${out}`;
			// A portrait with no manifest entry (an older import, or a file dropped in by hand)
			// is untagged, which is the same bucket as one deliberately left unspecified.
			const t = traits[out] ?? { presenting: "", kid: false };
			return { out, name, src, selected: src === this._current, presenting: t.presenting, kid: t.kid };
		});
		people.sort((a, b) => (a.name || "").localeCompare(b.name || "") || a.out.localeCompare(b.out));
		// Counts ride on the chips so it's clear what narrowing will cost before you click.
		const counts = {
			all: people.length,
			masculine: people.filter((p) => p.presenting === "masculine").length,
			feminine: people.filter((p) => p.presenting === "feminine").length,
			unspecified: people.filter((p) => !p.presenting).length,
			kid: people.filter((p) => p.kid).length,
			notKid: people.filter((p) => !p.kid).length,
		};
		// Only worth offering the filters when there is enough art for them to do something,
		// and only for the traits that were actually tagged.
		const showFilters = people.length > 1 && (counts.masculine || counts.feminine || counts.kid);
		return { people, counts, showFilters: !!showFilters, hasKids: !!counts.kid, canBrowse: this._canBrowse };
	}

	/**
	 * Narrow the grid in place rather than re-rendering: filtering is pure display, and a
	 * re-render would rebuild every <img> and throw away the scroll position mid-browse.
	 */
	_activateFilters(root, picks) {
		const chips = [...root.querySelectorAll(".stonetop-people-chip")];
		if (!chips.length) return;
		const noMatch = root.querySelector(".stonetop-people-nomatch");
		const state = { presenting: "any", kid: "any" };

		const apply = () => {
			// a hover preview belonging to a tile we are about to hide would be left
			// stranded beside nothing
			this._removePortraitPreview();
			let shown = 0;
			for (const p of picks) {
				const presenting = p.dataset.presenting || "";
				const isKid = p.dataset.kid === "1";
				// "unspecified" is a selectable bucket in its own right, so an untagged portrait
				// is findable rather than only ever reachable through "All".
				const okP = state.presenting === "any"
					|| (state.presenting === "unspecified" ? !presenting : presenting === state.presenting);
				const okK = state.kid === "any" || (state.kid === "kids" ? isKid : !isKid);
				const ok = okP && okK;
				p.hidden = !ok;
				if (ok) shown++;
			}
			if (noMatch) noMatch.hidden = shown > 0;
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
		const src = btn.dataset.src;
		if (!src) return;
		const popup = document.createElement("div");
		popup.className = "stonetop-people-preview";
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
		root.querySelector(".stonetop-people-gallery-body")
			?.addEventListener("scroll", () => {
				const anchor = this._portraitAnchor;
				if (!this._portraitPreview || !anchor?.isConnected) return;
				if (anchor.matches(":hover")) this._positionPortraitPreview(this._portraitPreview, anchor);
				else this._removePortraitPreview();
			}, { passive: true });
	}

	async close(options) {
		this._removePortraitPreview();
		return super.close(options);
	}

	activateListeners(html) {
		super.activateListeners(html);
		const root = html[0];
		// One walk of the grid, shared: a full import is ~155 tiles, and the filter pass and
		// the click wiring below both want the same list.
		const picks = [...root.querySelectorAll(".stonetop-people-pick")];
		this._activateFilters(root, picks);
		this._activatePortraitPreviews(root);

		picks.forEach(btn => {
			btn.addEventListener("click", async () => {
				const src = btn.dataset.src;
				if (!src) return;
				await this._onPick?.(src);
				this.close();
			});
		});

		// Close first so the gallery isn't stacked over the FilePicker it opens.
		root.querySelector(".stonetop-people-browse")?.addEventListener("click", () => {
			this.close();
			this._onBrowse?.();
		});

		root.querySelector(".stonetop-people-clear")?.addEventListener("click", async () => {
			await this._onClear?.();
			this.close();
		});

		root.querySelector(".stonetop-people-cancel")?.addEventListener("click", () => this.close());
	}
}
