// Sheet for the "hazard" JournalEntryPage subtype. Like the threat page sheet, it
// renders ONLY the book-faithful card (view) with live doom-track checkboxes, a
// reveal toggle, and (for the owner) an Edit button. This is what a scene pin opens
// (embedded in the journal), so "tick the doom track from the map" is: click the
// pin, tick a portent right here.
//
// Editing opens the Make-a-Hazard walkthrough pre-filled (CreateHazardDialog in edit
// mode) rather than a separate editor dialog; the wizard IS the hazard editor. The
// card reuses the threat card's markup conventions, so threat-view's shared wiring
// (doom toggles, reveal, drag-to-pin) applies unchanged.
import { wireThreatDoomChange, handleThreatRevealClick, wireThreatCardDrag } from "../threats/threat-view.js";
import { buildHazardCardVM } from "../hazards/hazard-view.js";
import { CreateHazardDialog } from "../hazards/create-hazard-dialog.js";

export function createStonetopHazardPageSheetClass(Base) {
	return class StonetopHazardPageSheet extends Base {
		get template() {
			return "systems/stonetop_pwd/templates/journal/hazard-page.hbs";
		}

		// The embedded page view renders with editable:false, which would blanket-disable
		// every input (including the owner's live doom checkboxes). We gate editability
		// ourselves per element in the template, so suppress the lock-down.
		_disableFields(_form) {}

		async getData(options = {}) {
			const context = super.getData(options);
			const page = this.document;
			const st = context.stonetop = { canEdit: page.isOwner };
			st.card = await buildHazardCardVM(page, { forOwner: page.isOwner });
			st.card.canDrag = page.isOwner;
			return context;
		}

		activateListeners(html) {
			super.activateListeners(html);
			// The embedded view sheet is rendered by the journal, which never sets _element.
			this._element = html;
			const root = html?.[0] ?? html;
			if (!root) return;

			// Drag the card onto a scene to drop a linked pin (native page payload).
			wireThreatCardDrag(root, { fallbackUuid: this.document.uuid });

			// Live doom-track checkboxes (owners only; players are disabled).
			wireThreatDoomChange(root, () => this.document);

			root.addEventListener("click", async ev => {
				if (await handleThreatRevealClick(ev, () => this.document)) return;
				if (!this.document.isOwner) return;
				if (ev.target.closest(".hazard-edit-start")) {
					ev.preventDefault();
					new CreateHazardDialog({ page: this.document }).promise();
				}
			});
		}
	};
}
