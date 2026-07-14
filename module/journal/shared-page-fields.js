// Shared JournalEntryPage field factories for the GM-prep page subtypes (threat + hazard).
// Both models store a "doom track" (ordered grim portents ending in one impending doom)
// and optional custom player moves in the SAME shape — and that sameness is load-bearing:
// the shared doom-track wiring (threat-view.wireThreatDoomChange -> threat-store.setPortentDone
// / setDoomDone) and the shared card markup read those exact field paths on BOTH page types.
// Defining the fields once here makes that contract structural instead of "kept in sync by
// comment," so the two models can't silently drift out from under the shared machinery.
//
// foundry.data.fields is read lazily (inside the factories, which only run from a model's
// defineSchema) so this module has no import-time Foundry dependency.
const F = () => foundry.data.fields;

/** A single doom-track row: the milestone text plus whether it has "come to pass". */
export function doomRow() {
	const fields = F();
	return new fields.SchemaField({
		text: new fields.StringField({ required: true, blank: true, initial: "" }),
		done: new fields.BooleanField({ required: true, initial: false }),
	});
}

/** The doom track as a pair of schema fields to spread into a model: an ordered list of
 *  grim portents ending in one impending doom. */
export function doomTrackFields() {
	const fields = F();
	return {
		grimPortents: new fields.ArrayField(doomRow()),
		impendingDoom: doomRow(),
	};
}

/** Optional player-facing custom moves: a short label plus a rich-text body. */
export function customPlayerMovesField() {
	const fields = F();
	return new fields.ArrayField(new fields.SchemaField({
		label: new fields.StringField({ required: true, blank: true, initial: "" }),
		text: new fields.HTMLField({ required: true, blank: true, initial: "" }),
	}));
}
