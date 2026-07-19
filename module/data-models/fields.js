// Shared schema-field factories for the system DataModels. Several models store
// the same shapes (a single integer `value`, a `{value, max}` resource, a
// debility toggle), so the factory lives here once instead of being re-declared
// per model.
const fields = foundry.data.fields;

// A `{ value: <integer> }` sub-object (stats, armor, level, population, …).
export const valueField = (initial = 0) => new fields.SchemaField({
	value: new fields.NumberField({ required: true, integer: true, initial }),
});

// A `{ value, max }` integer resource pair (hp, xp).
export const valueMaxField = (value = 0, max = 0) => new fields.SchemaField({
	value: new fields.NumberField({ required: true, integer: true, initial: value }),
	max:   new fields.NumberField({ required: true, integer: true, initial: max }),
});

// A debility toggle. Characters also tag each debility with the stats it covers;
// pass `stat` (an array of stat keys) to include that field, omit it otherwise.
export const debility = (label, stat) => {
	const schema = {
		label: new fields.StringField({ required: true, initial: label }),
		value: new fields.BooleanField({ required: true, initial: false }),
	};
	if (stat !== undefined) {
		schema.stat = new fields.ArrayField(new fields.StringField(), { initial: stat });
	}
	return new fields.SchemaField(schema);
};

// An irregularly-shaped sub-object preserved verbatim, defaulting to null (falsy)
// rather than {} so truthiness checks (e.g. `system.resource`) behave correctly.
export const looseObject = () => new fields.ObjectField({ required: false, nullable: true, initial: null });

// The character's problematic/permanent wounds — the 3rd/4th harm types from Book I
// (Harm & Healing) that aren't HP or debilities. An additive ArrayField, so existing
// worlds load with an empty list and need no migration. `status`/`origin` are plain
// StringFields (NOT `choices`-constrained) so a value written by a newer build can't
// wedge an older one on read; the snapshot layer coerces unknown values back to a
// safe default. Each element:
//   id              stable key (foundry.utils.randomID)
//   text            the fictional consequence ("Twisted ankle, can't bear weight")
//   status          "problematic" | "stabilized" | "permanent"
//   origin          "wound" | "deaths-door"
//   requirementNote GM-named requirement stored on the Recover "names a requirement" fork
//   planNote        Make-a-Plan / adaptation goal (permanent injuries)
//   planRequirements Make-a-Plan tick-box requirements [{text, done}] (Book I p.530)
//   mechanicalTag   lasting reminder text, e.g. "Let Fly at disadvantage until practiced"
//   reminderMove    move name the tag echoes onto at roll time ("" = none, "*" = all move rolls;
//                   the echo rides 2d6+stat move rolls only, not damage/formula/Death's-Door rolls)
//   gmOnly          soft UI hide from the owning player (see StonetopCharacterSheet)
//   healed          true → moved to the collapsed "Scars" disclosure rather than deleted
export const woundsField = () => new fields.ArrayField(new fields.SchemaField({
	id:              new fields.StringField({ required: true, blank: true }),
	text:            new fields.StringField({ required: true, blank: true }),
	status:          new fields.StringField({ required: true, blank: true, initial: "problematic" }),
	origin:          new fields.StringField({ required: true, blank: true, initial: "wound" }),
	requirementNote: new fields.StringField({ required: true, blank: true }),
	planNote:        new fields.StringField({ required: true, blank: true }),
	planRequirements: new fields.ArrayField(new fields.SchemaField({
		text: new fields.StringField({ required: true, blank: true }),
		done: new fields.BooleanField({ required: true, initial: false }),
	}), { required: false, initial: [] }),
	mechanicalTag:   new fields.StringField({ required: true, blank: true }),
	reminderMove:    new fields.StringField({ required: true, blank: true }),
	gmOnly:          new fields.BooleanField({ required: true, initial: false }),
	healed:          new fields.BooleanField({ required: true, initial: false }),
}), { required: false, initial: [] });

// Schema for the two minimal move subtypes (npcMove / monsterMove): just a
// rich-text description and an optional roll formula.
export const simpleMoveSchema = () => ({
	description: new fields.HTMLField({ required: true, blank: true }),
	rollFormula: new fields.StringField({ required: true, blank: true }),
});
