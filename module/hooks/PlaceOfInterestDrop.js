// Drag-a-Place-of-Interest-onto-a-scene support.
//
// Each "Places of Interest" entry on the steading Overview tab carries a lettered
// disc (A–R) and a name. Dragging that disc onto the canvas drops a map Note at the
// cursor: a matching landmark-<letter>.svg icon whose label (the place name) shows on
// hover. The sizing/colour mirror the lettered pins on the seeded Village scene — a
// 90px contained icon, a 60px label anchored below in ink brown.
//
// The steading sheet writes { type, letter, name } into the drag payload
// (StonetopSteadingSheet.activateListeners). This dropCanvasData hook claims that
// payload and creates the Note. Note creation is async but the hook must answer
// synchronously, so we fire-and-forget and return false to tell core we handled it.

export const PLACE_OF_INTEREST_DRAG_TYPE = "StonetopPlaceOfInterest";

const _ICON_DIR = "systems/stonetop_pwd/assets/icons/landmarks";
const _FALLBACK_ICON = "icons/svg/book.svg";

// Pin formatting — matches the seeded Village scene's lettered notes.
const NOTE_ICON_SIZE = 90;
const NOTE_FONT_SIZE = 60;
const NOTE_TEXT_COLOR = "#1b1009";
const NOTE_TINT = "#ffffff";
const NOTES_CONTROL = "notes";
const SELECT_TOOL = "select";

// Map a place letter to its lettered-disc icon; anything outside A–R (there are only
// 18 places) falls back to a generic book icon rather than a broken image.
function _iconFor(letter) {
	const l = String(letter ?? "").trim().toLowerCase();
	return /^[a-r]$/.test(l) ? `${_ICON_DIR}/landmark-${l}.svg` : _FALLBACK_ICON;
}

// dropCanvasData hook: claim only our place-of-interest payload and leave every other
// drop (tokens, tiles, journal pins, other systems') to core by returning nothing.
export function onDropPlaceOfInterest(canvas, data) {
	if (data?.type !== PLACE_OF_INTEREST_DRAG_TYPE) return;
	_createPlaceNote(canvas, data);
	return false;
}

export function switchToJournalNotesControls(controls = globalThis.ui?.controls) {
	if (!controls) return;
	if (typeof controls.activate === "function") {
		return controls.activate({ control: NOTES_CONTROL, tool: SELECT_TOOL });
	}
	if (typeof controls.initialize === "function") {
		return controls.initialize({ layer: NOTES_CONTROL, control: NOTES_CONTROL, tool: SELECT_TOOL });
	}
	if (typeof controls.render === "function") {
		return controls.render({ control: NOTES_CONTROL, tool: SELECT_TOOL });
	}
}

// Core sets data.x/data.y to scene coordinates at the cursor before firing the hook,
// so the note lands where it was dropped (anchored at its centre).
async function _createPlaceNote(canvas, data) {
	const scene = canvas?.scene;
	if (!scene) return;
	if (!game.user.can("NOTE_CREATE")) {
		ui.notifications.warn("You don't have permission to create map notes on this scene.");
		return;
	}

	const name = String(data.name ?? "").trim();
	const noteData = {
		x: data.x,
		y: data.y,
		entryId: null,
		pageId: null,
		texture: {
			src: _iconFor(data.letter),
			anchorX: 0.5,
			anchorY: 0.5,
			fit: "contain",
			tint: NOTE_TINT,
		},
		iconSize: NOTE_ICON_SIZE,
		text: name,
		fontSize: NOTE_FONT_SIZE,
		textAnchor: CONST.TEXT_ANCHOR_POINTS?.BOTTOM ?? 1,
		textColor: NOTE_TEXT_COLOR,
		global: false,
	};

	try {
		await scene.createEmbeddedDocuments("Note", [noteData]);
		await switchToJournalNotesControls();
		ui.notifications.info(`Placed "${name || data.letter}" on ${scene.name}.`);
	} catch (err) {
		console.error("Stonetop | Failed to create place-of-interest note", err);
		ui.notifications.error("Couldn't create the map note (see the console for details).");
	}
}
