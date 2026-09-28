/**
 * @property {string} key    - "weakened" | "dazed" | "miserable" | "walkItOff" (the Ranger's stand-in box)
 * @property {string} name   - "Weakened" | "Dazed" | "Miserable" | "Walk It Off"
 * @property {boolean} active
 * @property {string[]} stats - stat keys affected, e.g. ["str","dex"]
 */
export class DebilitySnapshot {
	constructor(b) {
		this.key    = b._key;
		this.name   = b._name;
		this.active = b._active;
		this.stats  = b._stats;
	}
}

export class DebilitySnapshotBuilder {
	withKey(v)    { this._key    = v; return this; }
	withName(v)   { this._name   = v; return this; }
	withActive(v) { this._active = v; return this; }
	withStats(v)  { this._stats  = v; return this; }
	build()       { return new DebilitySnapshot(this); }
}
