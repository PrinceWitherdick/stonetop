// Helpers for editing a creature stat block / entry that may live in a locked
// compendium. The bestiary sheets show an edit toggle even on read-only
// compendium documents; turning it on unlocks the source pack (GM only) so the
// fields — HP, armor, the whole stat block — become editable. Turning it off,
// or closing the sheet, re-locks whatever WE unlocked (leaving a pack the user
// had already unlocked alone).

/** The CompendiumCollection a document came from, or null for world documents. */
export function compendiumPackOf(doc) {
	return doc?.pack ? globalThis.game?.packs?.get(doc.pack) : null;
}

/**
 * Make `sheet` editable, unlocking its source compendium if needed.
 * Returns true if the sheet is now editable, false if it can't be (e.g. a
 * non-GM trying to unlock a locked compendium). Sets `sheet._weUnlockedPack`
 * when this call is the one that unlocked the pack.
 */
export async function unlockForEditing(sheet) {
	if (sheet.isEditable) return true;
	const pack = compendiumPackOf(sheet.actor);
	if (!pack || !pack.locked) return sheet.isEditable; // world actor, or already unlocked
	if (!globalThis.game?.user?.isGM) {
		ui.notifications?.warn("Only a GM can unlock the compendium to edit this stat block.");
		return false;
	}
	await pack.configure({ locked: false });
	sheet.options.editable = true;
	sheet._weUnlockedPack = true;
	ui.notifications?.info(`Unlocked “${pack.metadata.label}” for editing — it re-locks when you stop editing.`);
	return true;
}

/** Re-lock the source compendium, but only if this sheet unlocked it. */
export async function relockIfWeUnlocked(sheet) {
	if (!sheet._weUnlockedPack) return;
	sheet._weUnlockedPack = false;
	sheet.options.editable = false; // mirror the unlock; the pack is read-only again
	const pack = compendiumPackOf(sheet.actor);
	if (pack && !pack.locked && globalThis.game?.user?.isGM) await pack.configure({ locked: true });
}
