// System data model for the "move" Item subtype. template.json declared only a
// handful of these fields; the rest were stored loosely (template.json never
// strips unknown keys). A data model DOES strip unknown keys, so every field a
// move actually stores is enumerated here.
//
// The rich, irregularly-shaped sub-objects (asterisk / requirement / resource /
// moveResults) are kept as ObjectFields so their interior is preserved verbatim
// and — crucially — they default to null rather than {}. Code such as
// MoveDefinition treats `system.resource` truthily, so an empty {} default would
// wrongly give every move a resource track.
import { looseObject } from "./fields.js";

const fields = foundry.data.fields;

export class MoveModel extends foundry.abstract.TypeDataModel {
	static defineSchema() {
		return {
			description:     new fields.HTMLField({ required: true, blank: true }),
			moveType:        new fields.StringField({ required: true, blank: true }),
			// Freeform tags/notes for a player-authored "inventory-custom" item, rendered
			// raw in the item's parenthetical (the same slot shipped catalog items fill
			// from flags.stonetop.note). Blank on every non-inventory move. Declared here
			// because a TypeDataModel strips keys it doesn't know — see the header note.
			note:            new fields.StringField({ required: false, blank: true, initial: "" }),
			// String or null in real data; normalizeRollType() also tolerates objects.
			rollType:        new fields.StringField({ required: false, blank: true, nullable: true, initial: "" }),
			rollFormula:     new fields.StringField({ required: true, blank: true }),
			moveEffect:      new fields.StringField({ required: true, blank: true }),
			weight:          new fields.NumberField({ required: true, integer: true, initial: 1 }),
			inventoryColumn: new fields.StringField({ required: true, blank: true, initial: "regular" }),
			armorBonus:      new fields.NumberField({ required: true, integer: true, initial: 0 }),
			hpBonus:         new fields.NumberField({ required: true, integer: true, initial: 0 }),
			// Raises every load cap by this many ◇ while owned (the Ranger's Pack Horse → 1).
			loadBonus:       new fields.NumberField({ required: true, integer: true, initial: 0 }),
			// Drops a carried shield's ◇ load by this many while owned (the Heavy/Judge/Marshal's
			// Armored move → 1, so a shield reads ◆ instead of ◆◆). Floored at 1 ◇ in buildSnapshot.
			shieldLoadReduction: new fields.NumberField({ required: true, integer: true, initial: 0 }),
			// The heaviest load tier at which this move's fiction still works ("light" /
			// "normal" / "heavy"); blank on moves with no load gate. Read by the expedition
			// Outfit party-load readout to flag a move the current load has switched off
			// (Catlike, Free Running, Stalker, Uncanny Reflexes). Pack Horse instead raises
			// the caps, via loadBonus.
			maxLoad:         new fields.StringField({ required: false, blank: true, initial: "" }),
			// Whether the move also requires the carrier to be UNARMORED (worn-armor base 0),
			// on top of its maxLoad gate (Uncanny Reflexes). False on every other move.
			requiresUnarmored: new fields.BooleanField({ required: false, initial: false }),
			repeatMax:       new fields.NumberField({ required: true, integer: true, initial: 0 }),
			// Per-stat ceiling for stat-increase moves (Improved Stat = 2, Superior Stat
			// = 3); null on every other move. Drives the level-up stat picker's cap
			// enforcement and marks a move as one that needs a stat choice when taken.
			cap:             new fields.NumberField({ required: false, integer: true, nullable: true, initial: null }),
			isStartingMove:  new fields.BooleanField({ required: true, initial: false }),
			// Suppresses the engine's automatic +1 XP on a miss for moves whose text
			// overrides it (e.g. Danger Sense; Death's Door rolls like Hard to Kill).
			noXpOnMiss:      new fields.BooleanField({ required: false, initial: false }),
			// A signature line rendered at the foot of the move's chat card (love letters
			// close with a sign-off, e.g. "XOXO - your GM"). Blank on every normal move.
			signed:          new fields.StringField({ required: false, blank: true, initial: "" }),
			// A shared "choose from this list" pool (love letters use it — the roll decides
			// how many to pick via moveResults.<tier>.pick). Each tier's pick count lives on
			// moveResults; this is just the option strings. Empty on every normal move.
			pickOptions:     new fields.ArrayField(new fields.StringField(), { required: false, initial: [] }),
			slug:            new fields.StringField({ required: true, blank: true }),
			playbook:        new fields.StringField({ required: true, blank: true }),
			replaces:        new fields.StringField({ required: true, blank: true }),
			// Irregular sub-objects — preserved verbatim, default null (falsy).
			asterisk:        looseObject(),
			requirement:     looseObject(),
			resource:        looseObject(),
			// Worn-armor contribution for a custom item — { base?, modifier? }, read by
			// CharacterInventory.calculateArmor (base = max-wins, modifier = additive).
			// Default null (falsy) so a non-armor item is skipped by that filter.
			armor:           looseObject(),
			moveResults:     looseObject(),
			markOptions:     new fields.ArrayField(new fields.ObjectField(), { required: false, initial: [] }),
			// Repeat-scaling selection budget for `markOptions` moves: { base, perExtra }.
			// Total picks allowed = base + perExtra*(ownedCount-1). Drives the move card's
			// "pick N each time you take this move" cap (Veteran Crew, Heroes to the Last,
			// Beast of Legend, Well Versed). Null/absent ⇒ unbudgeted, the prior behavior.
			markBudget:      looseObject(),
			// Cross-playbook "learn a move from another playbook" config (Versatile,
			// Worldly, Dabbler, Wild Soul, Initiate of the Secret Arts, Seasoned Warrior,
			// Arts of War): { playbooks: ["The Blessed", …] | "any", grantsPossession?: slug }.
			// Its presence marks a move as needing the level-up foreign-move picker.
			crossPlaybook:   looseObject(),
		};
	}
}
