// System data model for the "gmToolkit" Actor subtype — the GM's own sheet, the screen-side
// companion to the GM playbook (Book I, "Running the Game").
//
// The schema is EMPTY on purpose, and that is the honest state of this type rather than an
// oversight. Everything the sheet shows today is REFERENCE: the GM move lists are transcribed
// from the playbook and live in code (module/gm-toolkit/gm-moves.js), so there is nothing
// per-toolkit to persist. Reading preferences that do persist (which sections are folded, the
// window's size) are client settings keyed by actor id, not document data.
//
// Declaring the model anyway is what makes `actor.system` a validated TypeDataModel instead of
// a raw untyped object, so the first field a later tab needs is a one-line addition here rather
// than a change of kind. Note that a field added later must tolerate absence on toolkits
// created before it: `initial` covers that for every field type this system uses.
export class GmToolkitModel extends foundry.abstract.TypeDataModel {
	static defineSchema() {
		return {};
	}
}
