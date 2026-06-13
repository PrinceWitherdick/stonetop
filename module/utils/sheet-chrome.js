// Shared window-header chrome for the bestiary sheets (monster stat block +
// Bestiary Entry). Both wear the same edit/lock toggle, strip Foundry's
// document-id link, and collapse the portrait slot when its art fails to load.
// The only per-sheet variation is the header's BEM class and the toggle's noun,
// so those are parameters rather than two copies of the logic.

import { unlockForEditing, relockIfWeUnlocked } from "./compendium-edit.js";

/**
 * Drop the header portrait if its image fails to load, flagging the header so
 * CSS collapses the now-empty slot. No-op in edit mode (the slot stays so the
 * user can drop in art).
 * @param {Application} sheet      the host sheet (uses `_editMode`, `element`)
 * @param {string} headerClass     e.g. "stonetop-monster-header"
 */
export function hideBrokenPortrait(sheet, headerClass) {
	if (sheet._editMode) return;
	const img = sheet.element[0]?.querySelector(".stonetop-portrait");
	if (!img) return;
	const header = img.closest(`.${headerClass}`);
	const drop = () => {
		img.remove();
		header?.classList.add(`${headerClass}--no-portrait`);
	};
	if (img.complete && img.naturalWidth === 0) { drop(); return; }
	img.addEventListener("error", drop, { once: true });
}

/** Strip Foundry's document-id link from the window header. */
export function stripHeaderChrome(sheet) {
	const header = sheet.element[0]?.querySelector(".window-header");
	header?.querySelectorAll(".document-id-link").forEach(el => el.remove());
}

/**
 * Inject the edit/lock toggle into the window header. `noun` names the thing
 * being edited (e.g. "stat block" or "Entry") for the tooltip.
 * @param {Application} sheet
 * @param {string} noun
 */
export function injectHeaderToggle(sheet, noun) {
	const header = sheet.element[0]?.querySelector(".window-header");
	if (!header || !sheet.actor.isOwner) return;
	header.querySelector(".stonetop-header-toggle")?.remove();

	// Locked == viewed from a locked compendium. Show a lock affordance;
	// toggling it on unlocks the pack so the fields become editable.
	const locked = !sheet.isEditable;

	const label = document.createElement("label");
	label.className = "stonetop-edit-toggle stonetop-header-toggle";
	label.title = locked
		? "Unlock & edit (unlocks the compendium)"
		: (sheet._editMode ? `Lock ${noun}` : `Edit ${noun}`);

	const checkbox = document.createElement("input");
	checkbox.type = "checkbox";
	checkbox.checked = sheet._editMode;
	checkbox.addEventListener("change", () => toggleEdit(sheet, checkbox));

	const track = document.createElement("span");
	track.className = "stonetop-toggle-track";
	const thumb = document.createElement("span");
	thumb.className = "stonetop-toggle-thumb";
	const icon = document.createElement("i");
	icon.className = locked ? "fas fa-lock" : "fas fa-wrench";
	thumb.appendChild(icon);
	track.appendChild(thumb);
	label.appendChild(checkbox);
	label.appendChild(track);

	header.insertBefore(label, header.querySelector(".window-title"));
}

/**
 * Handle the edit/lock toggle: unlock the pack when turning on (from a locked
 * compendium), flip `_editMode`, re-lock when turning off, then re-render.
 */
export async function toggleEdit(sheet, checkbox) {
	const turningOn = checkbox.checked;
	if (turningOn && !sheet.isEditable) {
		if (!await unlockForEditing(sheet)) { checkbox.checked = false; return; }
	}
	// Set the mode before re-locking: relocking the pack triggers an async
	// re-render, and if _editMode were still true that render would paint
	// edit-mode markup into a now-locked form (disabled inputs everywhere).
	sheet._editMode = turningOn;
	if (!turningOn) await relockIfWeUnlocked(sheet);
	sheet.render(false);
}
