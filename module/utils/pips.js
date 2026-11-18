/**
 * The arithmetic behind a row of fill-up-to pips (Loyalty, Readiness, resource and mark tracks).
 */

/**
 * Value after clicking the pip at `idx` (0-based) on a track currently filled to `current`:
 * clicking the highest filled pip clears back to it, any other fills up to it.
 *
 * @param {number} current
 * @param {number} idx
 * @returns {number}
 */
export function pipToggleValue(current, idx) {
	return current === idx + 1 ? idx : idx + 1;
}

/**
 * Value for a checkbox pip at `idx` (a number or its dataset string) that was just checked or
 * unchecked: checking fills through it, unchecking clears down to it.
 *
 * @param {boolean} checked
 * @param {number|string} idx
 * @returns {number}
 */
export function pipCheckValue(checked, idx) {
	return Number(idx) + (checked ? 1 : 0);
}
