// Relationship hearts — the 1-5 affinity rating shared by two sheets:
//   • the NPC sheet's Relationships tab (how this NPC feels about each PC), and
//   • the character sheet's Details tab (how this PC feels about the other PCs).
// Both store the same shape: `system.relationships` is a map of actor id →
// { hearts, notes }. Sparse — an actor with no stored entry reads as the default
// 3 hearts, so a fresh sheet shows everyone at neutral without persisting anything.
// Keys are actor ids (no dots), so `system.relationships.<id>` updates merge cleanly.
// NOTE: this is the LEAF of the relationships modules — it must not import
// relationship-board.js or heart-words.js, both of which import it. A back-import would
// make the cycle resolve into a temporal-dead-zone error depending on which side loaded
// first, since both of those evaluate top-level consts. The hosts wire them together,
// which keeps the dependency one-way.
import { isDefaultImg } from "./strings.js";
import { makeColumnsResizable } from "./resizable-columns.js";
import { makeColumnsSortable } from "./sortable-columns.js";
// Leaf module with no imports of its own, so it cannot participate in the cycle above.
import { wireAvatarPreview, removeAvatarPreview } from "./avatar-preview.js";
import { openLinkedActorSheet } from "./actor-link.js";

// One to five, defaulting to three, clamped to 1-5 (a relationship always has at
// least one heart — you can't drop it to zero).
export const HEARTS_MAX     = 5;
export const HEARTS_MIN     = 1;
export const HEARTS_DEFAULT = 3;
// Falls back to NEUTRAL, not the minimum, for anything non-numeric: these ratings come
// out of an ObjectField, which validates nothing, so a hand-edited or corrupted value
// would otherwise read as NaN — silently emptying the hearts and indexing the feeling
// table out of range. A garbage value shouldn't be interpreted as "hates", either.
export const clampHearts = n => {
	// Absent reads as neutral (matching the `??` in readRelationship) — note Number(null)
	// and Number("") are both 0, which would otherwise clamp to 1 and assert hatred.
	if (n === null || n === undefined || n === "") return HEARTS_DEFAULT;
	const num = Math.trunc(Number(n));
	// Present but not a number: neutral. Present and out of range: clamp, since that IS
	// a rating, just a bad one.
	if (!Number.isFinite(num)) return HEARTS_DEFAULT;
	return Math.max(HEARTS_MIN, Math.min(HEARTS_MAX, num));
};

// A full-sentence feeling per rating, shown in the heart-row tooltip so hovering
// reads "Vera hates Aldric" rather than a bare "5/5". Each key is a
// {subject}/{object} format string; indexed by (hearts - 1), i.e. 1 heart → hates.
const HEART_FEELING_KEYS = [
	"stonetop.relationships.feels1", // 1 — hates
	"stonetop.relationships.feels2", // 2 — dislikes
	"stonetop.relationships.feels3", // 3 — neutral (default)
	"stonetop.relationships.feels4", // 4 — likes
	"stonetop.relationships.feels5", // 5 — loves
];
export const relationSummary = (hearts, subject, object) =>
	game.i18n.format(HEART_FEELING_KEYS[clampHearts(hearts) - 1], { subject, object });

// A relationship entry is { hearts, notes, shown? }. Early builds stored a bare
// number, so read either shape and normalize. An absent entry defaults to 3 hearts,
// no notes. `shown` stays undefined when never set, so the caller's per-kind default
// applies (see relationshipRow) — that's what lets other PCs default to visible while
// the steading's NPCs default to hidden without writing an entry for everyone.
// Whether an entry records an actual RATING, as opposed to existing only because someone
// ticked its visibility box or typed a note. That distinction is invisible in the read
// shape — readRelationship defaults a missing rating to 3, exactly like a missing entry —
// so it has to be asked of the RAW value.
//
// ONLY RELIABLE FOR ENTRIES WRITTEN SINCE updateRelationship STOPPED PADDING THEM. Earlier
// builds always wrote the whole { hearts, notes } object, so in a world that predates that
// change every entry that exists carries `hearts` — including ones created purely by ticking
// a show box or saving a note, which will read as rated here. There is no migration that can
// fix it: a legacy `hearts: 3` is byte-identical whether someone judged the person neutral or
// never judged them at all. The consequence is confined to presentation (the board's
// rated-before-unrated sort key and its dimmed unrated cards), so an upgraded world sees a
// board that is merely less sorted than a fresh one, never a wrong rating.
export function hasStoredRating(raw) {
	if (typeof raw === "number") return true; // legacy bare-number shape: the number IS the rating
	return !!raw && typeof raw === "object" && raw.hearts !== undefined;
}

export function readRelationship(raw) {
	const obj = (raw && typeof raw === "object") ? raw : { hearts: raw };
	return {
		hearts: clampHearts(obj.hearts ?? HEARTS_DEFAULT),
		notes:  obj.notes ?? "",
		shown:  typeof obj.shown === "boolean" ? obj.shown : undefined,
	};
}

// One template row: who they are, how `actor` regards them, and the per-slot heart
// states so the template needs no math helper. `defaultShown` is this row's visibility
// before anyone has ticked its box.
//
// `rated` is the one thing the sparse storage cannot otherwise express: an absent entry
// and a deliberate 3 both read as 3 hearts, which is fine for a table sorted by rating
// but not for the board, where an untouched roster would pile every card into Neutral and
// drown the handful anyone has actually judged. It is derived, never stored.
//
// It asks whether a RATING was stored, not whether an ENTRY exists: an entry is also
// created by ticking someone's visibility box or typing a note, neither of which is a
// judgment about them. See hasStoredRating, and updateRelationship, which is what keeps
// those two writes from persisting a rating nobody made.
export function relationshipRow(actor, other, { defaultShown = true } = {}) {
	const stored = actor.system?.relationships?.[other.id];
	const { hearts, notes, shown } = readRelationship(stored);
	return {
		id:   other.id,
		name: other.name,
		// What makes the name a link. Present on an Actor, absent on the plain {id, name}
		// objects a slug-keyed roster passes (the steading's settlements) — and a settlement
		// has no sheet to open, so "actor-backed" and "clickable" are the same question and
		// this answers both. Kept beside `id`, which is the fallback lookup when a uuid stops
		// resolving (a compendium re-import, say).
		uuid: other.uuid ?? null,
		img:  isDefaultImg(other.img) ? null : other.img,
		hearts,
		notes,
		rated:      hasStoredRating(stored),
		shown:      shown ?? defaultShown,
		feeling:    relationSummary(hearts, actor.name, other.name),
		heartSlots: Array.from({ length: HEARTS_MAX }, (_, i) => ({ position: i + 1, filled: i < hearts })),
	};
}

// Every candidate row for a sheet's relationships table, in display order.
//
// `groups` is an ordered list of { actors, defaultShown } — a sheet decides which
// populations it offers and whether each starts visible. After those, ANY id already
// stored in `system.relationships` that no group covered becomes a row too: that is
// what lets someone dropped onto the table persist as a row (and survive being
// unticked) instead of vanishing on the next render. Self is never a row.
//
// An id whose actor has since been deleted just drops out; the orphan entry is
// harmless and costs nothing. A sheet keyed by slug rather than actor id (the
// steading's settlements) simply finds no actor for its keys, so it adds nothing.
export function buildRelationshipRows(actor, groups, { extraTypes = ["character", "npc"] } = {}) {
	const rows = [];
	const seen = new Set([actor.id]);
	for (const { actors = [], defaultShown = true } of groups) {
		for (const doc of actors) {
			if (!doc || seen.has(doc.id)) continue;
			seen.add(doc.id);
			rows.push(relationshipRow(actor, doc, { defaultShown }));
		}
	}
	for (const id of Object.keys(actor.system?.relationships ?? {})) {
		if (seen.has(id)) continue;
		const doc = game.actors?.get(id);
		if (!doc || !extraTypes.includes(doc.type)) continue;
		seen.add(id);
		rows.push(relationshipRow(actor, doc, { defaultShown: true }));
	}
	return rows;
}

// Drop someone onto a relationships table to put them on the list: a stranger becomes a
// new row, and someone already there but unticked is revealed. Both are the same write —
// `shown: true` — because an absent entry already reads as neutral, so the reveal
// doubles as the add. Always returns a status, so the caller can consume EVERY drop that
// lands on the table rather than letting it fall through to whatever else the sheet does
// with dropped actors.
export async function relationshipDropResult(actor, doc, rows, { editable = true } = {}) {
	if (!doc || !["character", "npc"].includes(doc.type)) return "unsupported";
	// A pack entry's id is only meaningful inside its pack, and buildRelationshipRows
	// resolves stored ids through game.actors — so storing one would write a key that can
	// never become a row, while the notice claimed it worked. Say so instead of pretending.
	if (doc.pack) return "compendium";
	if (doc.id === actor.id) return "self";
	if (!editable) return "readonly";
	const row = rows.find(r => r.id === doc.id);
	if (row?.shown) return "already";
	await setRelationshipShown(actor, doc.id, true);
	return row ? "revealed" : "added";
}

// Status -> [notification level, message]. Shared so both sheets say the same thing.
export function relationshipDropNotice(result, actor, doc) {
	const level = ["added", "revealed", "already"].includes(result) ? "info" : "warn";
	const name = result === "self" ? (actor?.name ?? "") : (doc?.name ?? "");
	return [level, game.i18n.format(`stonetop.relationships.drop.${result}`, { name })];
}

// Dashed-outline affordance while a drag is over a relationships section, so "drop a
// person here" is discoverable rather than found by accident. Returns a clear() the host
// must call from its own drop handling: a sheet-level handler often consumes the drop
// before it would ever reach a listener here, so dragleave alone can't be trusted.
export function wireRelationshipDropHighlight(section) {
	if (!section) return () => {};
	let depth = 0;
	const clear = () => { depth = 0; section.classList.remove("is-drop-target"); };
	section.addEventListener("dragenter", () => { depth++; section.classList.add("is-drop-target"); });
	section.addEventListener("dragleave", () => { if (--depth <= 0) clear(); });
	return clear;
}

// Patch one field of a relationship entry. Writes the entry OBJECT under the row's id
// (never a nested key), so a legacy bare-number value is cleanly replaced by the
// { hearts, notes } shape — and since actor.update merges, a field this write omits keeps
// whatever was already stored there.
//
// Every field is written only once it has actually been set, so an untouched row keeps
// falling back to a default rather than freezing today's default into world data. Nothing
// downstream can tell the difference on READ: readRelationship supplies the same defaults.
//
//  • `shown` — otherwise a row's per-kind default visibility would be baked in.
//  • `hearts` — otherwise merely ticking a visibility box or typing a note would persist
//    the neutral default as though someone had judged this person. That silently turns an
//    unrated row into a rated one (see hasStoredRating), which the board reads as a real
//    3-heart verdict, and it made the NPC ledger log "set to Neutral (3)" for a show-box
//    tick.
//  • `notes` — same rule, for the same reason. Rating someone used to write `notes: ""`
//    beside the rating, which is a change from `undefined` and so logged a phantom "note
//    set to blank" on every first-time rating; the ledger had to recognise and discard it.
//    Keeping the field absent also leaves "has a note" derivable from storage later, the
//    way hasStoredRating derives "has a rating" now.
//
// `options` rides through to actor.update so a caller can attribute the change (the
// `{stonetopMove}` idiom the ledgers read); never pass `{stonetopLedger: true}`, which is
// the ledger's own re-entrancy kill switch.
function updateRelationship(actor, id, patch, options = {}) {
	const stored = actor.system?.relationships?.[id];
	const { hearts, notes, shown } = { ...readRelationship(stored), ...patch };
	const entry = {};
	if (patch.notes !== undefined || stored?.notes !== undefined) entry.notes = notes;
	if (patch.hearts !== undefined || hasStoredRating(stored)) entry.hearts = hearts;
	if (shown !== undefined) entry.shown = shown;
	return actor.update({ [`system.relationships.${id}`]: entry }, options);
}

// Clicking heart N sets the rating to N; clicking the current rating's last filled
// heart drops it by one, down to the 1-heart minimum — a relationship always keeps
// at least one heart; it can't be zeroed out.
export async function setRelationshipHearts(actor, id, position) {
	const current = readRelationship(actor.system?.relationships?.[id]).hearts;
	const next = position === current ? position - 1 : position;
	await updateRelationship(actor, id, { hearts: clampHearts(next) });
}

// Set a rating to an exact value, with no click-toggle. The board needs this: dropping a
// card into a lane asserts a value outright, and routing that through
// setRelationshipHearts would hit its "clicked the last filled heart" branch and silently
// DECREMENT whenever the asserted value matched the current one.
export async function setRelationshipHeartsExact(actor, id, hearts, options = {}) {
	await updateRelationship(actor, id, { hearts: clampHearts(hearts) }, options);
}

export async function setRelationshipNote(actor, id, notes) {
	await updateRelationship(actor, id, { notes: notes ?? "" });
}

// Whether this row shows on the sheet in play mode. Always writes an explicit boolean —
// once the box is ticked, that choice outranks the per-kind default from then on.
export async function setRelationshipShown(actor, id, shown) {
	await updateRelationship(actor, id, { shown: !!shown });
}

// Wire a rendered relationships table. Drag-resize + click-to-sort are view features
// (shared utils; preferences persist in localStorage), so they're wired regardless of
// ownership; the hearts and the note field only write when editable. Both column utils are
// idempotent, so a host sheet that already wires every `[data-resize-key]` table
// generically (the steading sheet does) just makes this a no-op.
export function wireRelationshipTable(root, actor, { editable = true } = {}) {
	if (!root) return;
	root.querySelectorAll(".stonetop-rel-table[data-resize-key]").forEach(table => {
		makeColumnsResizable(table, table.dataset.resizeKey);
		makeColumnsSortable(table, table.dataset.resizeKey);
	});
	if (!editable) return;

	root.addEventListener("click", async ev => {
		const heart = ev.target.closest(".stonetop-rel-heart");
		if (!heart) return;
		const id = ev.target.closest("[data-rel-id]")?.dataset?.relId;
		const position = Number(heart.dataset.position);
		if (!id || !position) return;
		await setRelationshipHearts(actor, id, position);
	});

	root.addEventListener("change", async ev => {
		// The show/hide box (edit mode only) — unticked rows drop out of the table in
		// play mode. Unnamed input, so the sheet's form submit ignores it.
		const showBox = ev.target.closest(".stonetop-rel-show-check");
		if (showBox) {
			const id = showBox.dataset?.relId;
			if (id) await setRelationshipShown(actor, id, showBox.checked);
			return;
		}
		const note = ev.target.closest(".stonetop-rel-note-input");
		if (!note) return;
		const id = note.dataset?.relId;
		if (!id) return;
		await setRelationshipNote(actor, id, note.value ?? "");
	});
}

// The two ways a relationship row points back at the person it names: the name opens their
// sheet, and the portrait shows a full-size preview on hover. Both are the steading
// Residents table's affordances, wired the same way, so a name behaves the same wherever
// it is listed.
//
// Deliberately NOT folded into wireRelationshipTable: that one bails early when the viewer
// can't edit, and neither of these is an edit. Looking up who someone is has nothing to do
// with being allowed to rate them, so a player reading a GM's NPC keeps both. It also
// covers BOTH layouts from one call — the table's rows and the board's cards emit the same
// `.stonetop-rel-open` / `.stonetop-rel-portrait` hooks — so hosts wire it once per render
// regardless of which view is showing.
export function wireRelationshipLinks(root) {
	// Bound to the section wrapper rather than the sheet root, the way wireRelationshipBoard
	// is: the hover half has to listen in the capture phase (mouseenter/mouseleave do not
	// bubble), so a sheet-root listener would run a `closest()` walk for every pointer
	// crossing anywhere on the sheet — a thousand nodes on the character sheet — to serve
	// one section. Both partials only ever render inside this wrapper.
	root?.querySelectorAll?.(".stonetop-rel-views").forEach(wireRelationshipLinksIn);
}

function wireRelationshipLinksIn(root) {
	// Same once-per-wrapper guard wireRelationshipBoard puts on this element, for the same
	// reason: nothing here removes a listener, so a second call on a surviving wrapper would
	// stack another capture-phase trio and open the sheet twice per click.
	if (root.dataset.stRelLinks === "1") return;
	root.dataset.stRelLinks = "1";

	// Only the <img> portrait carries data-name; the fallback is a glyph in a <span> with
	// nothing to enlarge, and the selector is what keeps it from raising an empty card.
	wireAvatarPreview(root, ".stonetop-rel-portrait[data-name]");

	const open = async link => {
		// The pointer is by definition over the row, and rendering a sheet does not move it,
		// so no mouseleave is coming to clear the preview once the window covers the name.
		removeAvatarPreview();
		await openLinkedActorSheet(link);
	};

	root.addEventListener("click", async ev => {
		const link = ev.target.closest(".stonetop-rel-open");
		if (!link) return;
		ev.preventDefault();
		ev.stopPropagation();
		await open(link);
	}, true);

	// The link carries no href — one would make it natively draggable and fight the board
	// card's own drag — so the browser gives it neither a tab stop nor Enter/Space activation.
	// The template supplies the tab stop with tabindex; this supplies the keys, or the name
	// would be reachable by keyboard and still do nothing when pressed.
	root.addEventListener("keydown", async ev => {
		if (ev.key !== "Enter" && ev.key !== " ") return;
		const link = ev.target.closest?.(".stonetop-rel-open");
		if (!link) return;
		// Space would scroll the sheet under the newly-raised window. Propagation is stopped
		// for the board's sake: its own keydown handler is delegated off the WRAPPER and only
		// checks `closest(".stonetop-rel-card")`, so a press on a link inside a card reaches it
		// as though the card itself were focused.
		ev.preventDefault();
		ev.stopPropagation();
		await open(link);
	}, true);
}
