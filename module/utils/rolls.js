import { sign } from "./roll-engine.js";

let _activePrompt = null;

/**
 * Show the pre-roll dialog and return the player's choices.
 * Returns { rollMode, situational: 0 } or null if the dialog was dismissed.
 *
 * Also shows current forward and ongoing values (read-only — those are applied
 * automatically by the caller after this returns).
 *
 * @param {Actor|null}  actor    - Rolling actor; used to read forward/ongoing.
 * @param {string|null} moveName - Optional move name shown in the dialog title.
 * @returns {Promise<{rollMode: string, situational: number}|null>}
 */
export function promptRoll(actor, moveName = null) {
	if (_activePrompt) return _activePrompt;

	const forward = actor?.system?.attributes?.forward?.value ?? 0;
	const ongoing = actor?.system?.attributes?.ongoing?.value ?? 0;

	let resolvePrompt;
	_activePrompt = new Promise(resolve => {
		resolvePrompt = resolve;
	});
	const prompt = _activePrompt;

	const done = (mode) => {
		_activePrompt = null;
		resolvePrompt({ rollMode: mode, situational: 0 });
	};

	const modRows = [];
	if (forward !== 0) {
		modRows.push(`<div class="stonetop-modifier-row stonetop-modifier-forward">
				<span class="stonetop-modifier-label">Forward</span>
				<span class="stonetop-modifier-value">${sign(forward)}</span>
				<span class="stonetop-modifier-note">(applied once, then cleared)</span>
			</div>`);
	}
	if (ongoing !== 0) {
		modRows.push(`<div class="stonetop-modifier-row stonetop-modifier-ongoing">
				<span class="stonetop-modifier-label">Ongoing</span>
				<span class="stonetop-modifier-value">${sign(ongoing)}</span>
			</div>`);
	}

	const content = modRows.length
		? `<form class="stonetop-roll-dialog"><fieldset class="stonetop-active-modifiers"><legend>Active Modifiers</legend>${modRows.join("")}</fieldset></form>`
		: "";

	new Dialog({
		title:   moveName ? `Roll: ${moveName}` : "Roll",
		content,
		buttons: {
			dis: { label: "Disadvantage", callback: () => done("dis") },
			def: { label: "Normal",       callback: () => done("def") },
			adv: { label: "Advantage",    callback: () => done("adv") },
		},
		default: "def",
		close: () => { _activePrompt = null; resolvePrompt(null); },
	}).render(true);

	return prompt;
}
