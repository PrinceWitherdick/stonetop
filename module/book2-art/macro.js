// Identity + lookup for the seeded "Import Book Art" bring-your-own-book macro,
// shared by the Ready-hook seeder (_ensureBook2ArtMacro) and the Welcome guide's
// launch button (WelcomeDialog._runImportBookArt) so the pack id, macro id, name,
// and legacy names live in exactly one place and can never drift between them.
// The shipped compendium doc is the single source of truth for the macro's
// command/img.
export const BOOK2_ART_MACRO_PACK = "stonetop_pwd.stonetop-macros";
export const BOOK2_ART_MACRO_ID   = "stMacroBook2Art1";
export const BOOK2_ART_MACRO_NAME = "Import Book Art";
// Worlds seeded before the rename carry the old name; callers rename in place.
export const BOOK2_ART_MACRO_LEGACY_NAMES = ["Import Book II Art"];

/**
 * The world's copy of the macro — matched by its current name, else by a
 * pre-rename legacy name — or undefined if the world has none.
 */
export function findBook2ArtWorldMacro() {
	return game.macros.find(m => m.name === BOOK2_ART_MACRO_NAME)
		?? game.macros.find(m => BOOK2_ART_MACRO_LEGACY_NAMES.includes(m.name));
}

/**
 * The shipped compendium copy of the macro (the source of truth for command/img),
 * or undefined if the pack is unavailable. Never throws.
 */
export async function loadBook2ArtMacroSource() {
	try { return await game.packs.get(BOOK2_ART_MACRO_PACK)?.getDocument(BOOK2_ART_MACRO_ID); }
	catch { return undefined; }
}
