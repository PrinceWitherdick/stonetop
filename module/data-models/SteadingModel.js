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
			// How this steading stands with the other communities of the setting: a map
			// of settlement slug (see module/data/settlements.js) → { hearts, notes, shown }.
			// Same shape and same shared helpers as the NPC and character relationship
			// maps, which are keyed by actor id instead — see utils/relationship-hearts.js.
			// Sparse: an absent entry reads as the neutral 3 hearts, so the roster ships
			// prefilled at neutral without writing anything to world data.
			relationships: new fields.ObjectField({ required: true }),
		};
	}
}
