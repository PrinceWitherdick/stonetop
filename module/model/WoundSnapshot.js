/**
 * A single problematic/permanent wound — the fictional-harm track from Book I's
 * Harm & Healing (distinct from HP and the three debilities). Built by
 * `_buildWoundsSection` in StonetopCharacter and consumed by the character sheet.
 *
 * @property {string} id              - stable key (foundry.utils.randomID)
 * @property {string} text            - the fictional consequence
 * @property {string} status          - "problematic" | "stabilized" | "permanent"
 * @property {string} origin          - "wound" | "deaths-door"
 * @property {string} requirementNote - GM-named requirement (the Recover fork)
 * @property {string} planNote        - Make-a-Plan / adaptation goal (permanent only)
 * @property {{text:string, done:boolean}[]} planRequirements - Make-a-Plan tick-boxes
 * @property {string} mechanicalTag   - lasting reminder text echoed at roll time
 * @property {string} reminderMove    - move name the tag reminds on ("" none, "*" all)
 * @property {boolean} gmOnly         - soft UI hide from the owning player
 * @property {boolean} healed         - true → shown under the collapsed "Scars" list
 */
export class WoundSnapshot {
	constructor(b) {
		this.id              = b._id;
		this.text            = b._text;
		this.status          = b._status;
		this.origin          = b._origin;
		this.requirementNote = b._requirementNote;
		this.planNote        = b._planNote;
		this.planRequirements = b._planRequirements ?? [];
		this.mechanicalTag   = b._mechanicalTag;
		this.reminderMove    = b._reminderMove;
		this.gmOnly          = b._gmOnly;
		this.healed          = b._healed;
	}

	get isProblematic() { return this.status === "problematic"; }
	get isStabilized()  { return this.status === "stabilized"; }
	get isPermanent()   { return this.status === "permanent"; }
	get isDeathsDoor()  { return this.origin === "deaths-door"; }

	// Make-a-Plan progress, e.g. {done: 1, total: 3}. total 0 = no structured plan.
	get planProgress() {
		const reqs = this.planRequirements ?? [];
		return { done: reqs.filter(r => r.done).length, total: reqs.length };
	}
}

export class WoundSnapshotBuilder {
	withId(v)              { this._id              = v; return this; }
	withText(v)            { this._text            = v; return this; }
	withStatus(v)          { this._status          = v; return this; }
	withOrigin(v)          { this._origin          = v; return this; }
	withRequirementNote(v) { this._requirementNote = v; return this; }
	withPlanNote(v)        { this._planNote        = v; return this; }
	withPlanRequirements(v) { this._planRequirements = v; return this; }
	withMechanicalTag(v)   { this._mechanicalTag   = v; return this; }
	withReminderMove(v)    { this._reminderMove    = v; return this; }
	withGmOnly(v)          { this._gmOnly          = v; return this; }
	withHealed(v)          { this._healed          = v; return this; }
	build()                { return new WoundSnapshot(this); }
}
