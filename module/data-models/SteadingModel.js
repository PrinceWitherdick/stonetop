// System data model for the "stonetop" Actor subtype (the steading). Replaces
// the stonetop block of the former template.json.
const fields = foundry.data.fields;

const valueField = (initial = 0) => new fields.SchemaField({
	value: new fields.NumberField({ required: true, integer: true, initial }),
});

const debility = label => new fields.SchemaField({
	label: new fields.StringField({ required: true, initial: label }),
	value: new fields.BooleanField({ required: true, initial: false }),
});

export class SteadingModel extends foundry.abstract.TypeDataModel {
	static defineSchema() {
		return {
			stats: new fields.SchemaField({
				fortunes: valueField(1),
				defenses: valueField(0),
			}),
			attributes: new fields.SchemaField({
				population: valueField(0),
				prosperity: valueField(0),
				surplus:    valueField(1),
				debilities: new fields.SchemaField({
					options: new fields.SchemaField({
						diminished: debility("Diminished"),
						lacking:    debility("Lacking"),
						malcontent: debility("Malcontent"),
					}),
				}),
			}),
		};
	}
}
