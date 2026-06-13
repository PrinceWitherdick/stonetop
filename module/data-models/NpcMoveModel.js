// System data model for the "npcMove" Item subtype (template.json: description +
// rollFormula).
const fields = foundry.data.fields;

export class NpcMoveModel extends foundry.abstract.TypeDataModel {
	static defineSchema() {
		return {
			description: new fields.HTMLField({ required: true, blank: true }),
			rollFormula: new fields.StringField({ required: true, blank: true }),
		};
	}
}
