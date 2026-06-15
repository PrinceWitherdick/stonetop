// System data model for the "stonetop" Actor subtype (the steading). Replaces
// the stonetop block of the former template.json.
import { valueField, debility } from "./fields.js";

const fields = foundry.data.fields;

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
