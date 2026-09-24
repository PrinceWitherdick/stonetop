// Reading the stylesheet's colour tokens for a canvas painter, which PIXI wants as numbers.
//
// Shared by every map overlay skinned through CSS (utils/scene-route.js#routeInk,
// fight/fight-overlay.js#fightInk), so the one parse of a `#rrggbb` token lives in one place.

/**
 * The live body style's tokens as PIXI values, or null where there is no stylesheet to read (a paint
 * before the page is styled, a test). Each reader answers null / the fallback for a token that is
 * missing or malformed, so a caller falls back token by token.
 *
 * @returns {null|{hex: (name: string) => number|null, number: (name: string, fallback: number) => number}}
 */
export function bodyStyleTokens() {
	const body = globalThis.document?.body;
	if (!body || typeof globalThis.getComputedStyle !== "function") return null;
	const style = globalThis.getComputedStyle(body);
	const read = name => style.getPropertyValue(name)?.trim() ?? "";
	return {
		hex: name => {
			const found = /^#([0-9a-f]{6})$/i.exec(read(name));
			return found ? parseInt(found[1], 16) : null;
		},
		number: (name, fallback) => {
			const value = Number(read(name));
			return Number.isFinite(value) && value > 0 ? value : fallback;
		},
	};
}
