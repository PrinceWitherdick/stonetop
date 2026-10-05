import { posterMapSlugOf } from "../book2-art/poster-map-catalog.js";
import { SYSTEM_ID } from "../system-id.js";

// Turn the imported maps down, for this browser only.
//
// WHAT IT DIMS. The five poster maps the Import Book Art macro brings in, in both places they
// show: as a Scene on the canvas, as the `figure.stonetop-map` the same run embeds at the top of
// the Setting Overview pages, and as the expedition's route map (its step and its "See the whole
// map" window), which draws the same files. They are bright, near-white scans, and in a dark palette
// they are the brightest thing on the screen by a long way. Nothing else is touched: a battle
// map the GM drew or imported themselves is their artwork, lit the way they chose, and the
// books' other pages (the rulebook reader, the Core Loop flowcharts) stay as printed.
//
// A SETTING OF ITS OWN, not a side effect of the dark palette. Glare is about the room and the
// screen as much as the palette, and a reader in the light palette at night can want the map
// down just as much. Kept apart, as the other accessibility switches are, so one does not
// decide the other.
//
// HOW, ON THE CANVAS. A TINT on the level's background mesh, not a filter. A tint multiplies the
// colour in the shader the mesh already runs, so a dimmed map costs nothing a full-brightness one
// does not; a ColorMatrixFilter would render a 6000px map to a texture every frame to do the same
// sum. The scene's own tint (a Level can carry one) is kept and multiplied, never replaced.
//
// HOW, IN A PAGE. A CSS variable on the document root that each picture's `filter: brightness()`
// reads, so every open journal page and route map follows the slider live with no re-render.

/** The setting's key, quoted here so the registration scan finds it read. */
const KEY = "mapBrightness";

/** Where a mesh keeps the tint core gave it, so a second pass multiplies the original. */
const BASE_TINT = Symbol("stonetopBaseTint");

/** The slider's floor. Below this a map stops being readable at all, and that is not dimming. */
export const MIN_MAP_BRIGHTNESS = 30;

/**
 * The stored percentage as a multiplier in [0.3, 1]. Anything unreadable is full brightness,
 * because the safe failure for a comfort setting is the map as it was imported.
 */
export function mapBrightnessFactor(value) {
	const percent = Number(value);
	if (!Number.isFinite(percent)) return 1;
	return Math.min(100, Math.max(MIN_MAP_BRIGHTNESS, percent)) / 100;
}

/**
 * A 0xRRGGBB tint with every channel scaled by `factor`. `base` may be a plain number or core's
 * `Color` (a Number subclass, which is what a Level's tint reads back as and which `isFinite` alone
 * rejects), so it is unwrapped first. No tint at all is white, never `Number(null)`'s black.
 */
export function dimmedTint(base, factor) {
	const value = base == null ? NaN : Number(base);
	const tint = Number.isFinite(value) ? value : 0xFFFFFF;
	const channel = shift => Math.round(((tint >> shift) & 0xFF) * factor);
	return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/** This browser's setting, as a multiplier. */
function currentFactor() {
	try {
		return mapBrightnessFactor(game.settings.get(SYSTEM_ID, KEY));
	} catch {
		return 1;
	}
}

/**
 * The meshes that paint the scene's background artwork. v14 keeps one per Level in
 * `levelTextures`, named `Level.<n>.background` (foregrounds are `.foreground`); v13 has the one
 * `background` mesh at the group root.
 */
function backgroundMeshes(primary) {
	if (Array.isArray(primary?.levelTextures)) {
		return primary.levelTextures.filter(mesh => /\.background$/.test(mesh?.name ?? ""));
	}
	return primary?.background ? [primary.background] : [];
}

/**
 * Dim (or restore) the current Scene's map, if it is one of ours. A Scene that is not a poster
 * map is left exactly as core drew it.
 */
export function applyMapBrightnessToCanvas(board = globalThis.canvas, factor = currentFactor()) {
	if (!board?.ready || !posterMapSlugOf(board.scene)) return;
	for (const mesh of backgroundMeshes(board.primary)) {
		if (!(BASE_TINT in mesh)) mesh[BASE_TINT] = mesh.tint;
		mesh.tint = factor >= 1 ? mesh[BASE_TINT] : dimmedTint(mesh[BASE_TINT], factor);
	}
}

/** The pages' half: one variable on the root, read by `figure.stonetop-map img` and the route maps. */
export function applyMapBrightnessToPage(factor = currentFactor(), root = globalThis.document?.documentElement) {
	root?.style.setProperty("--stonetop-map-brightness", String(factor));
}

/** Both halves at once, from the stored setting. */
export function applyMapBrightness() {
	const factor = currentFactor();
	applyMapBrightnessToPage(factor);
	applyMapBrightnessToCanvas(globalThis.canvas, factor);
}

/**
 * Wire it up. `canvasReady` because every scene switch and every redraw builds fresh meshes at
 * core's tint; `clientSettingChanged` so the slider is heard here, by key, the way the time banner
 * hears its own switch, and the registration in settings.js needs no `onChange` reaching into
 * the canvas.
 */
export function registerMapBrightness(hooks = globalThis.Hooks) {
	hooks.on("canvasReady", board => applyMapBrightnessToCanvas(board));
	hooks.on("clientSettingChanged", key => {
		if (String(key ?? "") === `${SYSTEM_ID}.${KEY}`) applyMapBrightness();
	});
	hooks.once("ready", () => applyMapBrightnessToPage());
}
