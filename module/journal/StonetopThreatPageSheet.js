// Sheet for the "threat" JournalEntryPage subtype. It renders ONLY the book-faithful
// card (view), with live doom-track checkboxes the owner can tick, a reveal toggle,
// and (for the owner) an Edit button that opens the ThreatEditorDialog. This is what
// a scene pin opens (embedded in the journal), so "check the doom track on the scene"
// is: click the pin, tick a portent right here.
//
// Editing is a separate movable dialog, NOT this sheet rendered standalone — standalone
// JournalEntryPage sheets are malformed in v13/14 (window frame vs. content positions
// diverge). This sheet is only ever rendered embedded in the journal.
import { buildThreatCardVM, wireThreatDoomChange, handleThreatRevealClick, wireThreatCardDrag } from "../threats/threat-view.js";
import { ThreatEditorDialog } from "../threats/threat-editor-dialog.js";

export function createStonetopThreatPageSheetClass(Base) {
	return class StonetopThreatPageSheet extends Base {
		get template() {
			return "systems/stonetop_pwd/templates/journal/threat-page.hbs";
		}

		// The embedded page view renders with editable:false, which would blanket-disable
		// every input (including the owner's live doom checkboxes). We gate editability
		// ourselves per element in the template, so suppress the lock-down.
		_disableFields(_form) {}

		async getData(options = {}) {
			const context = super.getData(options);
			const page = this.document;
			const st = context.stonetop = { canEdit: page.isOwner };
			st.card = await buildThreatCardVM(page, { forOwner: page.isOwner });
			st.card.canDrag = page.isOwner;
			return context;
		}

		activateListeners(html) {
			super.activateListeners(html);
			// The embedded view sheet is rendered by the journal, which never sets _element.
			this._element = html;
			const root = html?.[0] ?? html;
			if (!root) return;

			// Drag the card onto a scene to drop a linked pin (native page payload). The whole
			// card is the drag handle; fall back to this page's uuid if the markup lacks it.
			wireThreatCardDrag(root, { fallbackUuid: this.document.uuid });

			// Live doom-track checkboxes (owners only; players are disabled).
			wireThreatDoomChange(root, () => this.document);

			root.addEventListener("click", async ev => {
				if (await handleThreatRevealClick(ev, () => this.document)) return;
				if (!this.document.isOwner) return;
				if (ev.target.closest(".threat-edit-start")) {
					ev.preventDefault();
					new ThreatEditorDialog(this.document).render(true);
				}
			});
		}
	};
}
