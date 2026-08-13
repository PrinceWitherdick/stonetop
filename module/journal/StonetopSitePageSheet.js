// Sheet for the "site" JournalEntryPage subtype (see gm-prep-page-sheet.js for the shared
// behaviour). Like the threat and hazard page sheets it renders ONLY the book-faithful
// card (view), with an owner Edit button; a site's own random tables are rollable right
// from the card, which is the point of writing them up as tables (Book I p. 369).
//
// Editing opens the Create-a-Site walkthrough pre-filled (CreateSiteDialog in edit mode)
// rather than a separate editor dialog; the wizard IS the site editor.
import { buildSiteCardVM } from "../sites/site-view.js";
import { gmPrepCardWiring } from "./gm-prep-page.js";
import { createStonetopGmPrepPageSheetClass } from "./gm-prep-page-sheet.js";

export function createStonetopSitePageSheetClass(Base) {
	return createStonetopGmPrepPageSheetClass(Base, {
		template: "systems/stonetop-pwd/templates/journal/site-page.hbs",
		buildCardVM: buildSiteCardVM,
		editSelector: ".site-edit-start",
		// Imported at click time, not at load: the wizard drags in the whole Create-a-Site book
		// data (data/site-tables.js, the largest data module in the system), and only a GM who
		// opens the editor ever needs it. Viewing a site card does not. create-stonetop-content-
		// dialog.js defers it the same way.
		openEditor: async (document) => {
			const { CreateSiteDialog } = await import("../sites/create-site-dialog.js");
			return new CreateSiteDialog({ page: document }).promise();
		},
		// Read from the same per-kind table the multi-kind hosts wire from, so a site's card
		// controls are declared in exactly one place however the card is being drawn.
		wireExtras: (root, page) => gmPrepCardWiring("site")?.(root, () => page),
	});
}
