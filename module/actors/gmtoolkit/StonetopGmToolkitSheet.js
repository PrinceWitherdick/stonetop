// Sheet for the "gmToolkit" Actor subtype — the GM's own sheet, the screen-side companion to
// the GM playbook (the "Playbook - GM" spread). Its job is the one the paper playbook does:
// hold the things a GM reaches for mid-sentence, on one surface, in the book's own order.
//
// MODERN LAYOUT ONLY. Every other actor sheet in this system can be rendered in the
// pre-redesign CLASSIC layout as well (see module/utils/sheet-layout.js and the
// `classicLayout*` settings), because those sheets existed before the icon rail and people
// had learned where things were. This one is new, so it has no "as it was" to preserve and
// there is nothing to toggle: no `layoutClasses()` in `classes`, no `stonetop.classicLayout`
// in the context, no `{{#if}}` branches in the template, and `settings.js` deliberately has
// no `classicLayoutGmToolkit` key. `isClassicLayout` answers false for an unregistered key,
// so nothing has to be excluded for that to hold.
//
// `mountTabRail` is still called unconditionally, which is not a contradiction: the helper is
// also the cleanup path that sweeps stale rails off the frame, and a guarded call is the one
// way to strand a live rail there (tests/actors/classic-layout.test.js says so for the other
// three sheets, and the reasoning is the same here).
//
// Phase 1 is reference only, so this class stores nothing and writes nothing: there is no
// edit mode, no header edit/lock toggle, and no `_updateObject` work beyond the base class.
import { stripHeaderChrome } from "../../utils/sheet-chrome.js";
import { mountTabRail } from "../../utils/tab-rail.js";
import { mountScrollFrost } from "../../utils/scroll-frost.js";
import { withSheetSizeMemory } from "../../utils/sheet-size.js";
import { withSectionEditing } from "../../utils/section-editing.js";
import { gmMoveSections } from "../../gm-toolkit/gm-moves.js";
import { postRandomGmMove } from "../../gm-toolkit/random-gm-move.js";
import { gmDiagrams } from "../../gm-toolkit/gm-diagrams.js";
import { runImportBookArtMacro } from "../../book2-art/macro.js";
import { withGmPrepTabs } from "./gm-prep-tabs.js";
import { localize } from "../../utils/i18n.js";
import { stonetopSteadingHeaderButton } from "../../utils/world.js";

/**
 * What counts as a foldable section heading on this sheet — see `_wireSectionCollapse`.
 * Two shapes: the move groups' own `<h3>`, and the proximity / Hazards headings on the
 * Threats tab, which reuse the steading's heading class along with the rest of that markup.
 */
const HEADING_SELECTOR = ".stonetop-move-group-title, .steading-residents-heading";

export function createStonetopGmToolkitSheetClass(Base) {
	// withSheetSizeMemory: reopen at the size this GM last left the toolkit at. This sheet has
	// a fixed default height rather than `height: "auto"`, so the mixin only ever has to
	// restore a size the user actually dragged to (its `_stonetopUserSized` latch), and an
	// untouched toolkit keeps the default forever.
	//
	// withSectionEditing: the fold carets on every tab, plus the per-section edit pencil the
	// Threats and Sites tabs carry (their delete buttons are live only under the pencil, so a
	// GM reading their prep can't bin a threat with a stray click).
	//
	// withGmPrepTabs: the Threats & Dangers and Sites tabs, moved here from the steading sheet.
	// Its file header explains the one thing that must not drift: the STORAGE stayed on the
	// steading, so those tabs resolve it rather than using `this.actor`.
	return class StonetopGmToolkitSheet extends withGmPrepTabs(withSectionEditing(withSheetSizeMemory(Base))) {
		// Read by the mixin's `isSectionEditable`. Constant, not state: this sheet has no global
		// edit wrench, so a section is editable exactly when its own pencil is on.
		_editMode = false;

		// Last move the randomizer drew, per section key, so the next draw from that section can
		// avoid repeating it. Deliberately NOT persisted and not on the actor: it is one click's
		// worth of memory, and a "don't repeat" that survives a reload would be a stored
		// preference nobody asked for. Reopening the sheet starts it empty, which is correct.
		//
		// The name is checked against AppV1's own members: a property collision there is silent
		// (see the character sheet's notes on `_element`), and `_lastRandomMove` collides with
		// nothing in Application, FormApplication or ActorSheet.
		_lastRandomMove = {};

		static get defaultOptions() {
			return foundry.utils.mergeObject(super.defaultOptions, {
				// No `...layoutClasses("gmToolkit")` — see the modern-only note at the top.
				// "gm-toolkit" is what the frame rules in stonetop.css hang off; "stonetop" is
				// what gets the window chrome.
				classes:   ["stonetop", "sheet", "actor", "gm-toolkit"],
				// Wide enough that the Moves list reads in its two columns without every gloss
				// wrapping. The column COUNT is fixed at two in stonetop.css, so width here buys
				// line length rather than tracks: this frame spends 60px before the content
				// starts (16px window-content padding + 10px `.sheet-body` scrollbar gutter +
				// 24px tab padding + 10px tab gutter), leaving 760px, which is two 368px tracks
				// either side of a 24px gutter — measured, 14 of the 30 glosses take a second
				// line there, against 26 at the 560px floor. Narrower is not broken, only
				// wrappier, and the Threats and Sites tabs want the room regardless.
				width:     820,
				// A DEFINITE height, unlike the NPC's `height: "auto"`. The moves tab is long
				// and its length is fixed (the lists are transcribed, not authored), so an
				// auto-height window would simply open near the full height of the screen every
				// time. A definite frame is also what lets the active tab own the scroll.
				height:    660,
				// Mirrors the CSS floor in stonetop.css. This frame has no `pbta` class, so
				// like the monster and NPC it would otherwise have no floor at all.
				minHeight: 420,
				resizable: true,
				// NOTHING on this sheet is a drop target. ActorSheet's default `dragDrop` entry
				// declares a dragSelector but no DROP selector, which makes the whole
				// `.window-content` accept drops, and the inherited `_onDropItem` then attaches
				// the dropped Item (or a whole Folder's worth) to the actor. On a sheet that
				// renders thirty move cards, dropping a Move onto it is a natural gesture, and
				// the result is invisible: this template iterates `stonetop.moveSections` only,
				// so nothing appears, nothing errors, and there is no UI anywhere to find or
				// delete what just landed. Empty array, not a no-op override, so `DragDrop#bind`
				// never binds at all.
				dragDrop:  [],
				tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "moves" }],
				// The active tab IS the scrollport on this frame (stonetop.css), and AppV1 only
				// saves and restores offsets for the selectors named here. It matters more on this
				// sheet than on any other: `_wirePrepPageSync` re-renders it on every threat,
				// hazard and site write, so without this a GM ticking the second of a threat's
				// grim portents is thrown back to the top of the list between ticks. The character
				// sheet declares the same selector for the same reason, and utils/scroll-frost.js
				// is written assuming `_restoreScrollPositions` runs.
				scrollY:   [".sheet-body > .tab.active"],
			});
		}

		get template() {
			return "systems/stonetop-pwd/templates/actor/gm-toolkit.hbs";
		}

		async _render(force, options) {
			// Before the paint, so a page written between here and the first render is not
			// missed. Idempotent; see the mixin for why it binds on render rather than in the
			// constructor.
			//
			// Gated on the render actually proceeding, which is the condition AppV1 applies
			// INSIDE `super._render` ("not rendered and not forced, return") and therefore too
			// late to stop this line. Without the gate, a debounced re-render landing after
			// `close()` re-registers the three world-wide JournalEntryPage hooks on a dead sheet
			// and the `close()` that would have dropped them has already run, leaving them live
			// for the rest of the session.
			if (force || this.rendered) this._wirePrepPageSync();
			await super._render(force, options);
			stripHeaderChrome(this);
		}

		async close(options = {}) {
			this._unwirePrepPageSync();
			return super.close(options);
		}

		// The gear goes, a "Stonetop" shortcut takes its place. Sheet configuration picks an
		// alternate sheet class for a document, and this actor subtype has exactly one — so the
		// gear here only ever offers the sheet already on screen. What a GM actually wants from
		// this header is the jump the character sheet's header already offers: the steading,
		// whose Threats and Sites STORAGE these tabs read (see gm-prep-tabs.js). Built from the
		// shared descriptor in utils/world.js so the label, marker and unset-state class match
		// the same button everywhere else it appears.
		_getHeaderButtons() {
			const buttons = super._getHeaderButtons().filter(b => b.class !== "configure-sheet");
			buttons.unshift(stonetopSteadingHeaderButton());
			return buttons;
		}

		async getData() {
			const context = await super.getData();
			context.stonetop ??= {};

			// Localized at the boundary rather than in the template, so the sections are one
			// list of plain objects the tests can assert on without a Handlebars environment.
			context.stonetop.moveSections = gmMoveSections().map(section => ({
				key:        section.key,
				title:      localize(section.titleKey),
				note:       localize(section.noteKey),
				collapseId: section.collapseId,
				moves:      section.moves,
				// The die beside the note. One string for all three, carried per-section rather
				// than hung on the context beside the list, so the template needs no `../` walk
				// out of its `{{#each}}` and a section stays one self-contained object.
				randomizeTitle: localize("stonetop.gmToolkit.moves.randomize"),
			}));

			// The Core Loop tab's two figures. Localized and resolved to a servable path at the
			// boundary, same as the move sections, so the template gets plain data and the tests
			// can assert on it without Handlebars. A diagram with no `src` is one this world has
			// not imported; the template draws a placeholder rather than the entry being dropped.
			context.stonetop.diagrams = gmDiagrams();

			// What the shared `section-edit-toggle` partial reads. `editMode` is the GLOBAL edit
			// wrench, which this sheet does not have: the partial hides every pencil while it is
			// on, so leaving it undefined would be read as "on" by an `{{#unless}}` and no pencil
			// would ever draw.
			context.stonetop.canEdit  = this.isEditable;
			context.stonetop.editMode = this._editMode;
			// The Core Loop tab's Import Book Art button asks, because the macro browses and
			// writes files. This sheet is GM-only by ownership, so it is always true in practice.
			context.stonetop.isGM = game.user?.isGM ?? false;

			// Both prep tabs, including their per-section edit flags (a section is editable when
			// its own pencil is toggled, which is what keeps the delete buttons inert while a GM
			// is only reading).
			await this._addGmPrepContext(context);

			return context;
		}

		activateListeners(html) {
			super.activateListeners(html);
			// Hang the tab rail off the window's right edge (module/utils/tab-rail.js). Done
			// first so anything below sees the nav in its final home on the frame.
			mountTabRail(this, html);
			// The frosted seam between the pinned header and the scrolling tab under it. Must
			// come AFTER mountTabRail: it binds its tab-change watcher against the frame, and
			// the rail has to already be there for the click to be heard.
			mountScrollFrost(this, html);
			// Folding a section is a reading preference, so this is wired outside any
			// editability guard, exactly as the character and steading sheets wire theirs.
			this._wireSectionCollapse(html, HEADING_SELECTOR);
			// The per-section edit pencil on Threats and Sites. Same class hook the steading
			// used, because the shared `section-edit-toggle` partial emits it and moved here
			// unchanged along with the rest of that markup.
			this._wireSectionEditToggle(html, ".steading-section-edit-toggle");
			// Threats and Sites: doom tracks, prep tools, card collapse, drag-to-scene and the
			// journal threat-seed drop. Self-gated per action, so it goes outside the editable
			// guard the same way the steading wired it.
			this._activateGmPrepListeners(html[0]);
			// This sheet's own two buttons. Both are delegated rather than bound per element,
			// because both are re-emitted whenever their tab re-renders and either may be absent
			// (the import button depends on which diagrams this world already has).
			this._wireToolkitButtons(html[0]);
		}

		/**
		 * The Core Loop tab's "Import Book Art" button and the die beside each GM Moves heading.
		 *
		 * ONE delegated listener for both: they are two `closest` checks on the same event on the
		 * same root, and a second `addEventListener` for the second check buys nothing.
		 *
		 * Neither re-renders the sheet. The randomizer's move goes to CHAT, and the page it was
		 * drawn from is reference that never changes; a render would cost a scroll jump for
		 * nothing — the same reasoning the fold in section-editing.js gives for toggling classes
		 * in place.
		 */
		_wireToolkitButtons(root) {
			root.addEventListener("click", async (ev) => {
				// Only rendered for a GM in the first place (the macro browses and writes files);
				// asked again here because a delegated handler cannot rely on that.
				if (ev.target.closest(".stonetop-gm-diagram-import")) {
					ev.preventDefault();
					if (game.user?.isGM) runImportBookArtMacro();
					return;
				}

				const button = ev.target.closest(".stonetop-section-randomize");
				if (!button) return;
				ev.preventDefault();
				const key = button.dataset.section;
				const move = await postRandomGmMove(key, {
					// The last move drawn from THIS section, so a second click always moves on.
					exclude: this._lastRandomMove[key] ?? "",
					speaker: ChatMessage.getSpeaker({ actor: this.actor }),
				});
				if (move) this._lastRandomMove[key] = move.name;
			});
		}
	};
}
