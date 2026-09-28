// Writes a page sheet makes to a page whose content is one whole array (a location or chronicle
// page's `system.sections`: ArrayField updates replace the whole array).
import { sameProse } from "../utils/same-prose.js";

const pending = new WeakMap();

/**
 * Run `write` once every write queued before it for the same page has finished.
 *
 * A write that replaces the whole array is built from the array as it stood when it was built,
 * so two in flight at once end with the later one putting the earlier one's field back. That
 * happens: closing a pop-out saves every always-on editor in it, alongside the answer that just
 * lost focus, and a typed answer was lost exactly this way. Queued, each write clones the array
 * when its turn comes and so starts from everything written before it.
 *
 * A write that fails rejects its own caller and does not hold up the ones behind it.
 * @param {object} doc  The page, which is what the queue is keyed by.
 * @param {() => Promise<unknown>} write
 * @returns {Promise<unknown>} What `write` returned.
 */
export function queuePageWrite(doc, write) {
	const before = pending.get(doc) ?? Promise.resolve();
	const run = before.catch(() => {}).then(write);
	pending.set(doc, run);
	return run;
}

/**
 * Whether laying `patch` over `section` would change anything that is stored.
 *
 * Only the patch's own keys are compared, and inside a list only the fields the new rows carry,
 * since those rows are read back off the form and know nothing of anything else. Rich text (`body`)
 * is compared as ProseMirror holds it (see sameProse); other text is compared trimmed, the way the
 * data model stores it.
 * @param {object} section
 * @param {object} patch
 * @returns {boolean}
 */
export function patchChangesSection(section, patch) {
	return !Object.entries(patch ?? {}).every(([key, value]) => sameField(key, section?.[key], value));
}

function sameField(key, stored, next) {
	if (key === "body") return sameProse(next, stored);
	if (Array.isArray(stored) || Array.isArray(next)) {
		if (!Array.isArray(stored) || !Array.isArray(next) || stored.length !== next.length) return false;
		return next.every((row, i) => Object.keys(row ?? {}).every(k => sameField(k, stored[i]?.[k], row[k])));
	}
	return String(stored ?? "").trim() === String(next ?? "").trim();
}
