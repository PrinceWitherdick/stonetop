// Data model for the "location" JournalEntryPage subtype — a place from the Book
// II gazetteer rendered as one structured page (Impressions, Hooks, Terrain,
// Dangers, …) instead of a stack of plain-text pages. Mirrors the bestiary codex
// idea (BestiaryPageModel.js) but, because locations are heterogeneous, the page
// holds an ordered array of typed sections rather than a fixed field set.
//
// Section kinds:
//   • "prose" — heading + rich HTML body (ProseMirror); the catch-all that keeps
//               the gazetteer's tables, sub-headed bullet lists, and @UUID
//               cross-links intact.
//   • "qa"    — heading + prompt/answer pairs (Questions); the GM fills answers in.
const fields = foundry.data.fields;

export class LocationPageModel extends foundry.abstract.TypeDataModel {
	static defineSchema() {
		const sectionSchema = () => new fields.SchemaField({
			// "prose" | "qa" — selects which of the fields below is meaningful.
			kind:    new fields.StringField({ required: true, blank: false, initial: "prose", choices: ["prose", "qa"] }),
			heading: new fields.StringField({ required: true, blank: true }),
			// Tags the section for the bestiary's Dangers & Hazards styling.
			danger:  new fields.BooleanField({ required: true, initial: false }),
			// kind === "prose": genuinely rich text (lists, tables, links, bold).
			body:    new fields.HTMLField({ required: true, blank: true }),
			// kind === "qa": prompt/answer pairs filled via labeled inputs.
			pairs:   new fields.ArrayField(new fields.SchemaField({
				prompt: new fields.StringField({ required: true, blank: true }),
				answer: new fields.StringField({ required: true, blank: true }),
			})),
		});
		return {
			sections: new fields.ArrayField(sectionSchema()),
		};
	}
}
