// System data model for the "playbook" Item subtype. template.json declared only
// slug + description; playbooks also store actorType and an `attributes` block.
// Every shipped playbook's is empty now (the Would-Be Hero's old omen/resolve clocks
// were read by nothing: Omens are the Destined background's setup track, Resolve is
// Anger is a Gift's move track). Kept as an ObjectField so an older world's copy
// still validates, its interior preserved verbatim.
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
