// A core V1 Dialog whose actions are buttons in its CONTENT rather than in its footer, with
// no default footer button. Core's keyboard handling assumes the opposite:
//
//   - Enter with focus anywhere in the dialog looks up `buttons[focused.dataset.button ||
//     default]`. A content button has no `data-button` and there is no default, so it
//     submits `undefined` and throws — after preventDefault, so the focused button is not
//     clicked either. Enter on a focused button is how a keyboard user presses it.
//   - Tab from outside the dialog focuses the first `.dialog-button` on the PAGE, which is
//     another window's, or throws when there is none.
//
// Both are handed back to the browser when they would land on no footer button of ours:
// Enter activates the focused control natively, and Tab moves focus as it would anywhere.
// Escape and every footer-button path stay core's.
//
// Built on first use, not at import: `Dialog` is Foundry's global, and the unit tests
// import the sheets that use this without it.
let InlineActionsDialog = null;

export function createInlineActionsDialog(data, options) {
	InlineActionsDialog ??= class extends Dialog {
		_onKeyDown(event) {
			const own = this.element?.[0];
			if (event.key === "Enter" && own?.contains(document.activeElement)) {
				const key = document.activeElement.dataset?.button || this.data.default;
				if (!key || !this.data.buttons?.[key]) return;
			}
			if (event.key === "Tab" && own && !own.contains(document.activeElement)
				&& !own.querySelector(".dialog-button")) return;
			return super._onKeyDown(event);
		}
	};
	return new InlineActionsDialog(data, options);
}
