// THE GM'S OFF SWITCHES FOR THE RELATIONSHIP MAP AND THE TIMELINE.
//
// Two world settings (module/settings.js), each taking its feature off the table for everyone: the
// steading's and every character's tab, the Journal sidebar's way in, the hotbar macro, any window
// open on it. NOTHING STORED IS TOUCHED. The map's journal entry and the timeline's pages stay where
// they are, and the timeline goes on recording underneath (timeline/timeline-watch.js is not gated),
// so a GM who switches one back on finds it as it would have been.
//
// No reload. The tabs are template guards (`stonetop.relmapShown`, `stonetop.timelineShown`)
// read at render, the Journal sidebar is a render hook, and the window openers refuse with a notice
// (dialogs/RelationshipMapWindow.js, dialogs/TimelineWindow.js). So all a flip owes is a repaint of
// what is already open, which is this file, run on every client by the setting's `onChange`.

import { openApplications } from "../utils/open-windows.js";
import { isRelationshipMapShown, isTimelineShown } from "../settings.js";
import { addOpenMapButton, isJournalDirectory } from "./journal-directory-maps.js";
import { findTimelineJournal } from "../timeline/timeline-store.js";
import { RelationshipMapWindow } from "../dialogs/RelationshipMapWindow.js";
import { TimelineWindow } from "../dialogs/TimelineWindow.js";

/** The standalone window each feature has. Matched EXACTLY: the sheet tabs mount subclasses of
 *  these (dialogs/RelationshipMapPanel.js, dialogs/TimelinePanel.js), and those belong to their
 *  sheet, which closes them itself when the tab goes (utils/mounted-panel-slot.js). */
const WINDOW_CLASS = Object.freeze({
	relationshipMap: RelationshipMapWindow,
	timeline: TimelineWindow,
});

/** The actor types whose sheets carry each feature's tab, so the only ones a flip repaints. */
const SHEET_TYPES = Object.freeze({
	relationshipMap: ["steading"],
	timeline: ["character", "steading"],
});

/**
 * The Journal tab's "Relationship Map" button while the map is on, and no button while it is off.
 *
 * ⚠ TAKEN OUT AS WELL AS NOT PUT IN. A directory render need not repaint the header the button sits
 * in, so a flip to off could leave the button from the last render standing, opening nothing.
 */
export function syncOpenMapButton(app, element, onOpen) {
	if (isRelationshipMapShown()) {
		addOpenMapButton(app, element, onOpen);
		return;
	}
	if (!isJournalDirectory(app)) return;
	const root = element?.jquery ? element[0] : element;
	root?.querySelector?.("[data-relmap-open-map]")?.closest(".stonetop-relmap-directory-actions")?.remove();
}

/**
 * Take the Timeline journal's row out of one rendered Journal directory while the timeline is off.
 *
 * Removed rather than hidden, for the reason hideRelationshipMapRows gives: core's search box
 * clears `hidden` on every keystroke. The map's own rows need no such call, because they are never
 * shown; only its button goes (syncOpenMapButton, above).
 */
export function hideTimelineJournalRow(app, element) {
	if (isTimelineShown() || !isJournalDirectory(app)) return;
	const root = element?.jquery ? element[0] : element;
	const id = findTimelineJournal()?.id;
	if (!id) return;
	root?.querySelector?.(`li.directory-item.document[data-entry-id="${id}"]`)?.remove();
}

/**
 * Is this window open on the Timeline journal, or on one of its pages by itself? Those are the
 * journal the switch takes away, which its sidebar row going (hideTimelineJournalRow) does not reach
 * once it is open, or when an @UUID link opens it.
 */
function showsTimelineJournal(app) {
	const doc = app?.document;
	if (doc?.documentName === "JournalEntryPage") return doc.type === "timeline";
	if (doc?.documentName !== "JournalEntry") return false;
	const id = findTimelineJournal()?.id;
	return !!id && doc.id === id;
}

/**
 * Repaint what a flip changes, on this client.
 *
 * Every open sheet that carries the feature's tab (SHEET_TYPES), since the tabs are drawn at render (`render(false)`, which neither
 * un-minimizes nor raises a sheet: see `appv1-forced-render-focuses`). The Journal sidebar, for the
 * map's button and the Timeline row. And, going off, the feature's own window, which would
 * otherwise sit there with nothing left to open it again, and for the timeline any window on its
 * journal. Going on, such a window (opened through a link while it was off, so showing the "turned
 * off" line: journal/StonetopTimelinePageSheet.js) is repainted with the thread.
 *
 * @param {"relationshipMap"|"timeline"} feature
 * @param {boolean} enabled
 */
export function onFeatureSwitched(feature, enabled) {
	const windowClass = WINDOW_CLASS[feature];
	const types = SHEET_TYPES[feature] ?? [];
	for (const app of openApplications()) {
		try {
			if (!enabled && windowClass && app.constructor === windowClass) app.close();
			else if (feature === "timeline" && showsTimelineJournal(app)) {
				if (enabled) { if (app.rendered) app.render(false); }
				else app.close();
			}
			else if (app.rendered && app.document instanceof Actor && types.includes(app.document.type)) app.render(false);
		} catch (err) {
			console.warn(`Stonetop | could not repaint ${app?.id} for the ${feature} switch`, err);
		}
	}
	globalThis.ui?.journal?.render?.();
}
