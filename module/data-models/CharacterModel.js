// System data model for the "character" Actor subtype. Replaces the character
// block of the former template.json. The bulk of a character lives in embedded
// Items (moves, playbook) and flags; this schema is just the core sheet data.
const fields = foundry.data.fields;

const statField = (initial = 0) => new fields.SchemaField({
	value: new fields.NumberField({ required: true, integer: true, initial }),
});

const debility = (label, stat) => new fields.SchemaField({
	label: new fields.StringField({ required: true, initial: label }),
	value: new fields.BooleanField({ required: true, initial: false }),
	stat:  new fields.ArrayField(new fields.StringField(), { initial: stat }),
});

export class CharacterModel extends foundry.abstract.TypeDataModel {
	static defineSchema() {
		return {
			stats: new fields.SchemaField({
				str: statField(),
				dex: statField(),
				int: statField(),
				wis: statField(),
				con: statField(),
				cha: statField(),
			}),
			attributes: new fields.SchemaField({
				hp:      new fields.SchemaField({
					value: new fields.NumberField({ required: true, integer: true, initial: 16 }),
					max:   new fields.NumberField({ required: true, integer: true, initial: 16 }),
				}),
				xp:      new fields.SchemaField({
					value: new fields.NumberField({ required: true, integer: true, initial: 0 }),
					max:   new fields.NumberField({ required: true, integer: true, initial: 8 }),
				}),
				level:   new fields.SchemaField({
					value: new fields.NumberField({ required: true, integer: true, initial: 1 }),
				}),
				armor:   statField(),
				forward: statField(),
				ongoing: statField(),
				damage:  new fields.SchemaField({
					value: new fields.StringField({ required: true, blank: true, initial: "d4" }),
				}),
				debilities: new fields.SchemaField({
					options: new fields.SchemaField({
						weakened:  debility("Weakened",  ["str", "dex"]),
						dazed:     debility("Dazed",     ["int", "wis"]),
						miserable: debility("Miserable", ["con", "cha"]),
					}),
				}),
			}),
			playbook: new fields.SchemaField({
				name: new fields.StringField({ required: true, blank: true }),
				slug: new fields.StringField({ required: true, blank: true }),
				uuid: new fields.StringField({ required: true, blank: true }),
			}),
		};
	}
}
