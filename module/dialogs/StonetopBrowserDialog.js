import { CatalogBrowserDialog } from "./CatalogBrowserDialog.js";
import { openOrFocus } from "../utils/open-or-focus.js";
import { ArcanaSource } from "./catalog/ArcanaSource.js";
import { MonsterSource } from "./catalog/MonsterSource.js";
import { PeopleSource } from "./catalog/PeopleSource.js";

/**
 * One window for looking THROUGH what the world holds, with a tab per list: the arcana, the
 * bestiary, and the world's own people.
 *
 * These began as two windows behind two hotbar macros, which was two of everything for one
 * gesture — a GM comparing a monster against the card that summons it had both open, filtered
 * differently, and had to remember which macro was which. They are one question ("what have I
 * got?") asked of three lists, so they are one window: `Browse Stonetop`, on the magnifying
 * glass.
 *
 * Everything about how it LOOKS and FILTERS is CatalogBrowserDialog; what is in each list is a
 * CatalogSource (see dialogs/catalog/CatalogSource.js). Which is why almost nothing is left
 * here: this window's own business is its chrome, its lists, and who is allowed to open it.
 * A fourth list is a new source file plus one line in _buildSources.
 *
 * GM PREP, not a player tool. Every list here reads something a player shouldn't have: the
 * arcana pack is GM/Assistant-owned and half of what it's for is reading the curses on cards
 * the players haven't found yet; the bestiary pack is GM-owned too; and an NPC's status and
 * home are the GM's own notes. So open() refuses anyone else — refuses rather than quietly
 * emptying, because a window listing nothing reads as a bug rather than as a door that isn't
 * yours. It is reached from the "Browse Stonetop" hotbar macro (seeded GM-only in
 * hooks/Ready.js) and from `game.stonetop.openBrowser()`, and there is deliberately no button
 * for it anywhere on a character sheet.
 */
export class StonetopBrowserDialog extends CatalogBrowserDialog {
	/**
	 * Built per window rather than as shared module-level singletons: each source caches rows
	 * (the bestiary memoises 212 pack documents, the arcana 82), and that cache should die with
	 * the window that filled it.
	 */
	_buildSources() {
		return [new ArcanaSource(), new MonsterSource(), new PeopleSource()];
	}

	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id: "stonetop-browser",
			title: "Browse Stonetop",
			// Sized for the widest filter bar of the three: the monsters carry three chip groups
			// and one of them is twelve pills long. The bar wraps rather than clipping when a
			// larger UI font won't fit it on one line.
			width: 820,
			height: 640,
			resizable: true,
			classes: ["stonetop", "stonetop-catalog-app"],
		});
	}

	/**
	 * Open the browser, focusing an existing one rather than stacking a second copy — it's a
	 * reference window, and two of them filtered differently is just confusing. A second copy
	 * would also mean a second world hook and a second full pull of both packs.
	 *
	 * @param {object}   [context]
	 * @param {string}   [context.source]     Which tab to open on ("arcana" / "monsters" / "people").
	 * @param {string[]} [context.ownedSlugs] Arcana the opening character holds, for the "Held" badge.
	 */
	static open(context = {}) {
		if (!game.user.isGM) {
			ui.notifications.warn("Only the GM can browse the world's catalogues.");
			return null;
		}
		// openOrFocus looks in BOTH window registries; a raw ui.windows scan would quietly start
		// stacking duplicates the day this dialog moves to ApplicationV2.
		let minted = false;
		const dialog = openOrFocus("stonetop-browser", () => {
			minted = true;
			const app = new StonetopBrowserDialog();
			// Before the first render, so a caller asking for a tab gets it in one paint. Safe on
			// an app that has never rendered: _retarget only re-renders one that has.
			app._retarget(context);
			return app.render(true);
		});
		if (!dialog) return null;

		// The context has to reach an ALREADY-OPEN window too, or opening the macro a second time
		// silently ignores it. This window now lives for a whole session, so "the one that's
		// already up" is the common case, not the edge one.
		//
		// Only that one, though. A window the factory just minted has been pointed at the context
		// already, and retargeting it again asks every source to take the same arguments twice —
		// which is harmless only for as long as every source's retarget() answers by COMPARING
		// (ArcanaSource diffs the held slugs). One that reported a change unconditionally would
		// invalidate its rows and force a second render straight over the first paint. Each path
		// retargets exactly once instead, so no source has to be idempotent to make this correct.
		if (!minted) dialog._retarget(context);
		return dialog;
	}
}
