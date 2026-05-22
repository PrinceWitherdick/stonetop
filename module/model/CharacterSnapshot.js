export { Resource } from "./data/Resource.js";
export { ResourceSnapshot, ResourceBuilder } from "./snapshot/ResourceSnapshot.js";
export { StatSnapshot } from "./snapshot/StatSnapshot.js";
export { ValueMax, VitalsSnapshot, VitalsSnapshotBuilder } from "./snapshot/VitalsSnapshot.js";
export { DebilitySnapshot, DebilitySnapshotBuilder } from "./snapshot/DebilitySnapshot.js";
export {
	LoreOptionSnapshot, LoreOptionSnapshotBuilder,
	LoreEntrySnapshot, LoreEntrySnapshotBuilder,
	LoreSection,
	AppearanceOptionSnapshot, AppearanceLineSnapshot, AppearanceSection,
	InstinctOptionSnapshot, InstinctOptionSnapshotBuilder, InstinctSection,
	OriginOptionSnapshot, OriginSection,
	BackgroundChoiceOptionSnapshot,
	BackgroundChoicesSnapshot, BackgroundChoicesSnapshotBuilder,
	BackgroundOptionSnapshot, BackgroundOptionSnapshotBuilder, BackgroundSection,
	SelectableOptionSnapshot,
	PlaybookSnapshot, PlaybookSnapshotBuilder,
} from "./snapshot/PlaybookSnapshot.js";
export {
	RequirementSnapshot,
	MoveSnapshot, MoveSnapshotBuilder,
	MoveCategorySnapshot, MoveCategorySnapshotBuilder,
	MoveGroupSnapshot,
} from "./snapshot/MoveSnapshot.js";
export {
	OtherItemSnapshot, OtherItemSnapshotBuilder,
	Movelist, MovelistBuilder,
} from "./snapshot/Movelist.js";
export {
	LoadOptionSnapshot, LoadSnapshot, LoadSnapshotBuilder,
	InventoryItemSnapshot, InventoryItemSnapshotBuilder,
	InventorySegmentSnapshot,
	OutfitSnapshot, OutfitSnapshotBuilder,
	PossessionsSnapshot,
	PossessionItemSnapshot, PossessionItemSnapshotBuilder,
	InventorySnapshot,
} from "./snapshot/InventorySnapshot.js";
export {
	PostDeathInsertSnapshot, PostDeathInsertSnapshotBuilder,
	PostDeathSectionSnapshot, PostDeathSectionSnapshotBuilder,
} from "./snapshot/PostDeathInsertSnapshot.js";
export {
	ArcanaSnapshot, ArcanaSectionSnapshot,
	MinorArcanumSnapshot, MinorArcanumSnapshotBuilder,
	MinorArcanumFrontSnapshot, MinorArcanumFrontSnapshotBuilder,
	MinorArcanumBackSnapshot, MinorArcanumBackSnapshotBuilder,
	ArcanumUnlockSection, ArcanaUnlockTextItem,
	ArcanaUnlockOptionSnapshot, ArcanaUnlockOptionSnapshotBuilder,
	ArcanumBackMoveSnapshot,
} from "./snapshot/ArcanaSnapshot.js";

/**
 * The canonical read-only data object returned by `StonetopCharacter.buildSnapshot()`.
 *
 * External sheets and systems consume this shape directly — no Foundry APIs
 * or Stonetop internals required after the snapshot is built.
 *
 * @property {string} name
 * @property {PlaybookSnapshot|null} playbook
 * @property {DebilitySnapshot[]} debilities - always 3: weakened, dazed, miserable
 * @property {Object.<string, StatSnapshot>} stats - keys: str dex con int wis cha
 * @property {VitalsSnapshot} vitals
 * @property {MoveCategorySnapshot[]} moves - only categories with ≥1 move included
 * @property {Movelist} movelist
 * @property {InventorySnapshot} inventory
 * @property {ArcanaSnapshot} arcana
 * @property {PostDeathSectionSnapshot} postDeathInsert
 * @property {string} rollMode - "normal" | "adv" | "dis"
 */
export class CharacterSnapshot {
	constructor(b) {
		this.name            = b._name;
		this.playbook        = b._playbook;
		this.debilities      = b._debilities;
		this.stats           = b._stats;
		this.vitals          = b._vitals;
		this.moves           = b._moves;
		this.movelist        = b._movelist;
		this.inventory       = b._inventory;
		this.arcana          = b._arcana;
		this.postDeathInsert = b._postDeathInsert;
		this.rollMode        = b._rollMode;
	}
}

export class CharacterSnapshotBuilder {
	withName(v)            { this._name            = v; return this; }
	withPlaybook(v)        { this._playbook        = v; return this; }
	withDebilities(v)      { this._debilities      = v; return this; }
	withStats(v)           { this._stats           = v; return this; }
	withVitals(v)          { this._vitals          = v; return this; }
	withMoves(v)           { this._moves           = v; return this; }
	withMovelist(v)        { this._movelist        = v; return this; }
	withInventory(v)       { this._inventory       = v; return this; }
	withArcana(v)          { this._arcana          = v; return this; }
	withPostDeathInsert(v) { this._postDeathInsert = v; return this; }
	withRollMode(v)        { this._rollMode        = v; return this; }
	build()                { return new CharacterSnapshot(this); }
}
