// When a scene Note is created linked to a `threat` page (via the native
// JournalEntryPage canvas drop from the Threats tab or an open card), stamp it with
// the torn-note icon, the threat's name as its label, and global visibility so a
// revealed pin ignores fog-of-war. This is the ONE seam over core's page-drop
// behaviour; everything else (linking pageId, placement, click-to-open) is core.
import { STONETOP_SCOPE } from "../actors/character/StonetopFlags.js";
import { threatPageById } from "../threats/threat-store.js";

const THREAT_PIN_ICON = "systems/stonetop_pwd/assets/icons/threat-note.svg";
const PIN_TEXT_COLOR = "#1b1009";

/** Resolve the threat page a pending Note links to, or null. */
function _linkedThreatPage(data, noteDoc) {
	return threatPageById(data?.entryId ?? noteDoc?.entryId, data?.pageId ?? noteDoc?.pageId);
}

/** preCreateNote hook: give threat-linked pins the book-note look + global visibility. */
export function onPreCreateThreatNote(noteDoc, data, _options, _userId) {
	const page = _linkedThreatPage(data, noteDoc);
	if (!page) return;
	noteDoc.updateSource({
		texture: { src: THREAT_PIN_ICON, anchorX: 0.5, anchorY: 0.5, fit: "contain", tint: "#ffffff" },
		iconSize: 80,
		text: page.name,
		fontSize: 44,
		textAnchor: CONST.TEXT_ANCHOR_POINTS?.BOTTOM ?? 1,
		textColor: PIN_TEXT_COLOR,
		global: true,
		flags: { [STONETOP_SCOPE]: { threat: true } },
	});
}
