// Sheet for the "threat" JournalEntryPage subtype (see gm-prep-page-sheet.js for the
// shared behaviour). It renders ONLY the book-faithful card (view), with live doom-track
// checkboxes, a reveal toggle, and an owner Edit button that opens the ThreatEditorDialog.
//
// Editing is a separate movable dialog, NOT this sheet rendered standalone — standalone
// JournalEntryPage sheets are malformed in v13/14 (window frame vs. content positions
// diverge). This sheet is only ever rendered embedded in the journal.
import { buildThreatCardVM } from "../threats/threat-view.js";
import { ThreatEditorDialog } from "../threats/threat-editor-dialog.js";
import { createStonetopGmPrepPageSheetClass } from "./gm-prep-page-sheet.js";

export function createStonetopThreatPageSheetClass(Base) {
	return createStonetopGmPrepPageSheetClass(Base, {
		template: "systems/stonetop_pwd/templates/journal/threat-page.hbs",
		buildCardVM: buildThreatCardVM,
		editSelector: ".threat-edit-start",
		openEditor: (document) => new ThreatEditorDialog(document).render(true),
	});
}
