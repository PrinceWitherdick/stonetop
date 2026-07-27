// The shared "what do you want to make?" chooser: a radio list of icon + label + hint
// rows that resolves to the picked option's id, or null when dismissed. Every sidebar
// creation entry point runs through it — Create Item (create-stonetop-content-dialog.js)
// and Create Actor (create-actor-dialog.js), plus each of their second-step sub-choosers
// — so no step of any flow can drift away from the others in look or behaviour.

import { escHtml } from "../utils/strings.js";

/**
 * Present a one-of-N chooser and resolve to the picked option's id.
 *
 * Labels and hints are escaped, not trusted: the Create Actor flow builds rows from
 * player names, which are user-authored text.
 *
 * @param {object} params
 * @param {string} params.title       Window title.
 * @param {{id: string, label: string, icon: string, hint?: string}[]} params.options
 *                                    The rows, in display order; the first is pre-selected.
 * @param {string} [params.buttonLabel="Continue"]  Confirm-button label.
 * @returns {Promise<string|null>}    The chosen option id, or null if the dialog was dismissed.
 */
export function pickContentOption({ title, options, buttonLabel = "Continue" }) {
	const rows = options.map((opt, i) => `
		<label class="stonetop-content-picker-option">
			<input type="radio" name="contentType" value="${escHtml(opt.id)}"${i === 0 ? " checked" : ""}>
			<i class="fas ${escHtml(opt.icon)}" aria-hidden="true"></i>
			<span class="stonetop-content-picker-text">
				<span class="stonetop-content-picker-label">${escHtml(opt.label)}</span>
				<span class="stonetop-content-picker-hint">${escHtml(opt.hint ?? "")}</span>
			</span>
		</label>`).join("");

	// DialogV2 requires the content element itself to carry no attributes, so the
	// styled/classed container lives one level in.
	const content = document.createElement("div");
	content.innerHTML = `<div class="stonetop stonetop-content-picker">${rows}</div>`;

	return foundry.applications.api.DialogV2.prompt({
		// This is an ApplicationV2 dialog (`.application` root), which the `.stonetop`
		// parchment/slate skin excludes by design (stonetop.css `:not(.application,…)`).
		// The authoring flows we hand off to are AppV1 and pick the skin up for free; a V2
		// window needs `stonetop-themed` to get the same modal look.
		classes: ["stonetop", "stonetop-themed", "stonetop-content-picker-dialog"],
		window: { title },
		position: { width: 440 },
		content,
		ok: {
			label: buttonLabel,
			callback: (event, button) =>
				new foundry.applications.ux.FormDataExtended(button.form).object.contentType,
		},
		rejectClose: false,
	});
}
