// Make Stonetop map-note labels legible over busy hand-drawn maps.
//
// Our lettered Place-of-Interest discs and threat/hazard pins label themselves in dark
// ink (#1b1009) to match the parchment aesthetic. Core Foundry (Note#_getTextStyle) only
// gives such dark text a thin, fixed 4px white outline, so on the illustrated Stonetop
// maps the name (e.g. "The Granary") sinks into the surrounding line art and is hard to
// read on hover.
//
// The cartographer's fix is a text halo: a thick, warm paper-coloured knockout that lifts
// the letters off whatever they sit on, plus a soft shadow for definition on the lightest
// parchment. Core recomputes the tooltip style on every refresh (Note#_refreshTooltip
// re-assigns tooltip.style = this._getTextStyle()), so a one-off post-draw tweak would be
// wiped on the next hover/refresh. Instead we shadow the instance's _getTextStyle with a
// wrapper that layers the halo onto core's style, so it survives every refresh.
//
// We claim a note by its icon path rather than a flag so notes already placed in a world
// (like the user's existing Granary pin) are restyled immediately, with no data migration.

// Icon families we own; any note textured from one of these gets the halo treatment.
const _OUR_NOTE_ICONS = [
	"systems/stonetop_pwd/assets/icons/landmarks/", // Place-of-Interest lettered discs
	"systems/stonetop_pwd/assets/icons/threat-note.svg", // threat + hazard pins
];

// Warm off-white knockout, a touch brighter than the parchment so the halo reads as paper
// rather than the pure-white core default (which looks stark on a hand-drawn map).
const _LABEL_HALO_COLOR = "#f8f1df";
// Faint ink-brown glow (distance 0 = symmetric) to define the label on the lightest paper.
const _LABEL_SHADOW_COLOR = "#2a1a0d";

/** True when this note is one of ours, judged by its icon texture. */
function _isStonetopMapNote(noteDoc) {
	const src = noteDoc?.texture?.src;
	if (!src) return false;
	return _OUR_NOTE_ICONS.some((prefix) => src.includes(prefix));
}

/** Layer a thick paper halo + soft shadow onto core's tooltip style, in place. */
function _applyLabelHalo(style, fontSize) {
	const size = Number(fontSize) || 44;
	style.stroke = _LABEL_HALO_COLOR;
	// Scale the halo to the label so big Place-of-Interest names and smaller pin labels
	// both get a comparable paper cushion; round joins keep thick strokes from spiking.
	style.strokeThickness = Math.max(8, Math.round(size / 6));
	style.lineJoin = "round";
	style.dropShadow = true;
	style.dropShadowColor = _LABEL_SHADOW_COLOR;
	style.dropShadowAlpha = 0.35;
	style.dropShadowBlur = 4;
	style.dropShadowAngle = 0;
	style.dropShadowDistance = 0;
	return style;
}

/** drawNote hook: give our map labels a readable paper halo that survives refreshes. */
export function onDrawStonetopNote(note) {
	if (!note || note._stonetopLabelStyled) return;
	if (typeof note._getTextStyle !== "function") return;
	if (!_isStonetopMapNote(note.document)) return;

	const baseGetTextStyle = note._getTextStyle.bind(note);
	note._getTextStyle = function () {
		const style = baseGetTextStyle();
		return _applyLabelHalo(style, this.document?.fontSize);
	};
	note._stonetopLabelStyled = true;

	// The first draw already built the tooltip with core's style (drawNote fires after
	// _draw); re-style it now so the halo shows without waiting for a refresh.
	if (note.tooltip) note.tooltip.style = note._getTextStyle();
}
