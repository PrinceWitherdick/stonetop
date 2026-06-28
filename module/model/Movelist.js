/**
 * @property {string} id
 * @property {string} name
 * @property {string|null} description
 * @property {string|null} moveType
 * @property {string} ownedId - same as id; provided for template convenience
 */
export class OtherItemSnapshot {
	constructor(b) {
		this.id          = b._id;
		this.name        = b._name;
		this.description = b._description;
		this.moveType    = b._moveType;
		this.ownedId     = b._ownedId;
	}
}

export class OtherItemSnapshotBuilder {
	withId(v)          { this._id          = v; return this; }
	withName(v)        { this._name        = v; return this; }
	withDescription(v) { this._description = v; return this; }
	withMoveType(v)    { this._moveType    = v; return this; }
	withOwnedId(v)     { this._ownedId     = v; return this; }
	build()            { return new OtherItemSnapshot(this); }
}

/**
 * @property {MoveSnapshot[]} playbookMoves
 * @property {MoveSnapshot[]} basicMoves
 * @property {MoveSnapshot[]} expeditionMoves
 * @property {MoveGroupSnapshot[]} otherGroups
 * @property {OtherItemSnapshot[]} otherMoves
 * @property {string|null} startingMovesNote
 * @property {{label: string, moves: MoveSnapshot[]}|null} postDeathGroup
 * @property {boolean} movesIncomplete - starting "moves of your choice" not all picked yet
 * @property {boolean} levelMovesIncomplete - fewer move picks made than the current level entitles
 * @property {number} levelMovesShortfall - how many move picks the character still owes for their level
 * @property {number} characterLevel
 */
export class Movelist {
	constructor(b) {
		this.playbookMoves     = b._playbookMoves;
		// Moves learned from OTHER playbooks via a cross-playbook pick (Versatile/…),
		// rendered with their full card (description/roll/marks/resource) like playbook moves.
		this.learnedMoves      = b._learnedMoves ?? [];
		this.basicMoves        = b._basicMoves;
		this.expeditionMoves   = b._expeditionMoves;
		this.otherGroups       = b._otherGroups;
		this.otherMoves        = b._otherMoves;
		this.startingMovesNote = b._startingMovesNote;
		this.postDeathGroup    = b._postDeathGroup ?? null;
		this.movesIncomplete   = b._movesIncomplete ?? false;
		this.levelMovesIncomplete = b._levelMovesIncomplete ?? false;
		this.levelMovesShortfall  = b._levelMovesShortfall ?? 0;
		this.characterLevel       = b._characterLevel ?? 1;
	}
}

export class MovelistBuilder {
	withPlaybookMoves(v)     { this._playbookMoves     = v; return this; }
	withLearnedMoves(v)      { this._learnedMoves      = v; return this; }
	withBasicMoves(v)        { this._basicMoves        = v; return this; }
	withExpeditionMoves(v)   { this._expeditionMoves   = v; return this; }
	withOtherGroups(v)       { this._otherGroups       = v; return this; }
	withOtherMoves(v)        { this._otherMoves        = v; return this; }
	withStartingMovesNote(v) { this._startingMovesNote = v; return this; }
	withPostDeathGroup(v)    { this._postDeathGroup    = v; return this; }
	withMovesIncomplete(v)   { this._movesIncomplete   = v; return this; }
	withLevelMovesIncomplete(v) { this._levelMovesIncomplete = v; return this; }
	withLevelMovesShortfall(v)  { this._levelMovesShortfall  = v; return this; }
	withCharacterLevel(v)       { this._characterLevel       = v; return this; }
	build()                  { return new Movelist(this); }
}
