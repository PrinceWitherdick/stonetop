// THE PALETTE AS CODE OUTSIDE THE STYLESHEET SEES IT.
//
// settings.js#applySheetContrast is the one writer of the palette's classes on the document root
// (`.stonetop-dark`, `.stonetop-slate`, `.stonetop-high-contrast`), and fires PALETTE_HOOK when they
// change. Whatever paints in the palette's ink where the stylesheet cannot reach (a PDF frame, the
// fight overlay's canvas, a colour preview) reads and follows it from here. A leaf, so the colour
// modules can use it without importing settings.js.

/** Fired by applySheetContrast whenever the palette's classes on the root change. */
export const PALETTE_HOOK = "stonetopPaletteChanged";

/** Call `callback` on every change of palette, until the returned function is called. */
export function onPaletteChange(callback) {
	const hooks = globalThis.Hooks;
	const id = hooks?.on?.(PALETTE_HOOK, callback);
	return () => { if (id !== undefined) hooks?.off?.(PALETTE_HOOK, id); };
}

/** Whether a dark palette (Lamplit or Slate) is on. */
export function isDarkPalette(root = globalThis.document?.documentElement) {
	return !!root?.classList?.contains?.("stonetop-dark");
}
