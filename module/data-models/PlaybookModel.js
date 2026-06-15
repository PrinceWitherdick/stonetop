// System data model for the "playbook" Item subtype. template.json declared only
// slug + description; playbooks also store actorType and a rich `attributes`
// block (omen/resolve resource configs). `attributes` is kept as an ObjectField
// so its irregular interior is preserved verbatim.
const fields = foundry.data.fields;

export class PlaybookModel extends foundry.abstract.TypeDataModel {
	static defineSchema() {
		return {
			slug:        new fields.StringField({ required: true, blank: true }),
			description: new fields.HTMLField({ required: true, blank: true }),
			actorType:   new fields.StringField({ required: true, blank: true }),
			attributes:  new fields.ObjectField({ required: false, initial: {} }),
		};
	}
}
