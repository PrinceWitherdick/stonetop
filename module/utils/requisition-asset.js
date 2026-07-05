/** Sentinel <option> value for the "Something else…" custom-asset choice, shared by
 *  the two Requisition pickers (the player-facing RequisitionDialog and the steading
 *  sheet's GM walkthrough) so the marker can never drift between them. */
export const CUSTOM_ASSET_VALUE = "__custom__";

/**
 * Wire an asset <select> to its companion custom-text <input>: reveal/enable the input
 * only when "Something else…" is chosen, focus it, and (when a hidden field is given)
 * mirror the resolved value into it on every change. Runs once immediately to sync the
 * initial state. Returns the sync function for callers that need to re-run it.
 *
 * @param {object}      opts
 * @param {HTMLElement} opts.select        - the asset <select>
 * @param {HTMLElement} opts.customInput   - the free-text <input> shown for a custom asset
 * @param {HTMLElement} [opts.valueInput]  - hidden field to receive the resolved value; when
 *                                           present, keystrokes in the custom input sync too
 */
export function wireCustomAssetSelect({ select, customInput, valueInput } = {}) {
	const sync = () => {
		if (!select || !customInput) return;
		const isCustom = select.value === CUSTOM_ASSET_VALUE;
		customInput.hidden = !isCustom;
		customInput.disabled = !isCustom;
		if (valueInput) valueInput.value = isCustom ? customInput.value.trim() : select.value;
		if (isCustom) customInput.focus();
	};
	select?.addEventListener("change", sync);
	if (valueInput) customInput?.addEventListener("input", sync);
	sync();
	return sync;
}
