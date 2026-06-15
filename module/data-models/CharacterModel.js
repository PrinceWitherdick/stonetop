// System data model for the "character" Actor subtype. Replaces the character
// block of the former template.json. The bulk of a character lives in embedded
// Items (moves, playbook) and flags; this schema is just the core sheet data.
import { valueField, valueMaxField, debility } from "./fields.js";

const fields = foundry.data.fields;

export class CharacterModel extends foundry.abstract.TypeDataModel {
	static defineSchema() {
		return {
			stats: new fields.SchemaField({
				str: valueField(),
				dex: valueField(),
				int: valueField(),
				wis: valueField(),
				con: valueField(),
				cha: valueField(),
			}),
			attributes: new fields.SchemaField({
				hp:      valueMaxField(16, 16),
				xp:      valueMaxField(0, 8),
				level:   valueField(1),
				armor:   valueField(),
				forward: valueField(),
				ongoing: valueField(),
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
