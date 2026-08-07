/**
 * @property {string} slug
 * @property {string} name
 * @property {string|null} img
 * @property {string|null} description  - trigger text ("When you die but...")
 * @property {InstinctSection} instinct - replaces the playbook instinct
 * @property {MoveSnapshot[]} moves     - all granted automatically
 * @property {LoreSection} lore         - terrible purpose, consequences, etc.
 * @property {{slug: string, label: string}[]} crossedOffMarks - Thrall: Marks Dark Succor
 *           crossed off, which can never be gained. Not the same as simply not having them,
 *           and there is no lore option for "gone for good", so they are recorded separately.
 * @property {string} masterTask        - Thrall: "your master gives you a task; until you
 *           complete it, your Favor stays at 0."
 * @property {string} tether            - Ghost: what they are bound to. Tethered reforms them
 *           beside it, and its destruction is the Final Consequence.
 * @property {boolean} needsTether      - Ghost with no tether named yet — the sheet nudges,
 *           since Tethered can't resolve properly without one.
 */
export class PostDeathInsertSnapshot {
	constructor(b) {
		this.slug        = b._slug;
		this.name        = b._name;
		this.img         = b._img;
		this.description = b._description;
		this.instinct    = b._instinct;
		this.moves       = b._moves;
		this.lore        = b._lore;
		this.crossedOffMarks = b._crossedOffMarks ?? [];
		this.masterTask      = b._masterTask ?? "";
		this.tether          = b._tether ?? "";
		this.needsTether     = !!b._needsTether;
	}
}

export class PostDeathSectionSnapshot {
	constructor(b) {
		this.activeSlug       = b._activeSlug;
		this.activeInsert     = b._activeInsert;
		this.availableInserts = b._availableInserts;
	}
}

export class PostDeathSectionSnapshotBuilder {
	withActiveSlug(v)       { this._activeSlug       = v; return this; }
	withActiveInsert(v)     { this._activeInsert     = v; return this; }
	withAvailableInserts(v) { this._availableInserts = v; return this; }
	build()                 { return new PostDeathSectionSnapshot(this); }
}

export class PostDeathInsertSnapshotBuilder {
	withSlug(v)        { this._slug        = v; return this; }
	withName(v)        { this._name        = v; return this; }
	withImg(v)         { this._img         = v; return this; }
	withDescription(v) { this._description = v; return this; }
	withInstinct(v)    { this._instinct    = v; return this; }
	withMoves(v)       { this._moves       = v; return this; }
	withLore(v)        { this._lore        = v; return this; }
	withCrossedOffMarks(v) { this._crossedOffMarks = v; return this; }
	withMasterTask(v)      { this._masterTask      = v; return this; }
	withTether(v)          { this._tether          = v; return this; }
	withNeedsTether(v)     { this._needsTether     = v; return this; }
	build()            { return new PostDeathInsertSnapshot(this); }
}
