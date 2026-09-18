// ── Stored armor and max HP, kept current without the sheet ────────────────
// A character's armor and max HP are derived (StonetopCharacter#computedVitals): gear in four stores,
// the playbook and level, move bonuses, an insert's Marks and the hand-set deltas. Everything outside
// the sheet reads the STORED fields instead: the token's HP bar, the Fight tab's vitals, Apply on a
// damage card, the ledger. The sheet mirrors them after each render (StonetopCharacterSheet#
// _syncStoredDerived), which left them stale whenever the change came from somewhere the sheet was not
// open: a shield handed over mid-fight, a level or a Mark taken with the sheet closed.
//
// So a change to a character or its items that could move a vital re-mirrors them, on THE ONE CLIENT
// THAT MADE THE CHANGE. That client had the permission to make it, so it has the permission to write
// the mirror, and every other client sees the same hook and stands aside. A burst (an arcanum dropped
// with its curios) is settled once, after it lands.
//
// Two inputs live OUTSIDE the character, and a change to them re-mirrors every character, on the primary
// GM's client (a player who changed them may not own everyone): the steading's Weapons of War, which make
// the special weapons and armor common (StonetopCharacter#_earnedCommonSpecialSlugs), and a world
// arcanum's own record, which the arcana repository reads before the pack.

import { isPrimaryGM } from "../../utils/primary-gm.js";
import { isSteadingActor } from "../../utils/world.js";

// What the vitals are worked out from on the character document itself, outside its flags. Its items
// have hooks of their own. HP, XP, wounds, the name and the portrait move nothing, and the mirror's own
// write coming back is not in here either.
const SYSTEM_INPUTS = [
	"system.playbook",
	"system.attributes.level",
	"system.attributes.hp.adjustment",
	"system.attributes.armor.adjustment",
];

// Every flag is an input (the gear, possessions, marks, arcana and inserts all live there), but for these,
// written over and over in play and read by no vital: Defend's Readiness, the ledger, camp, and Death's
// Door. Each is its owner's constant (tests/actors/character/vitals-mirror checks the spelling against them).
export const FLAG_NOISE = new Set(["readiness", "ledger", "camp", "campOwed", "deathsDoor"]);

// The steading's flags a vital reads: Weapons of War, as the improvement or a fortification.
const STEADING_INPUT = /^flags\.[^.]+\.steading\.(improvements|fortifications)(\.|$)/;

const SETTLE_MS = 250;
const pending = new Map();

/** Whether this character's stored vitals are this client's to keep. */
function mirrorsHere(actor, userId) {
	return isWorldCharacter(actor) && userId === globalThis.game?.user?.id && !!actor.isOwner;
}

function isWorldCharacter(actor) {
	return actor?.type === "character" && !actor.pack && !actor.isToken;
}

/** The dotted keys an update touched. */
function changedKeys(changed) {
	return Object.keys(globalThis.foundry?.utils?.flattenObject?.(changed ?? {}) ?? {});
}

/** Whether an actor update could move a derived vital. */
export function mayMoveVitals(changed) {
	return changedKeys(changed).some(key => {
		if (key.startsWith("flags.")) return !FLAG_NOISE.has(String(key.split(".")[2]).replace(/^-=/, ""));
		return SYSTEM_INPUTS.some(input => key === input || key.startsWith(`${input}.`));
	});
}

/** Whether a steading update could move a character's vitals. */
export function mayMoveSteadingGear(changed) {
	return changedKeys(changed).some(key => STEADING_INPUT.test(key));
}

function mirror(actor) {
	return actor.typedActor?.syncStoredVitals?.()
		.catch(err => console.error(`Stonetop | could not mirror ${actor.name}'s armor and max HP`, err));
}

/** Re-mirror a character's vitals once the changes arriving now have settled. */
export function scheduleVitalsMirror(actor) {
	clearTimeout(pending.get(actor.id));
	pending.set(actor.id, setTimeout(() => {
		pending.delete(actor.id);
		mirror(actor);
	}, SETTLE_MS));
}

/** Every character in the world, on the primary GM's client only. */
function scheduleEveryone() {
	if (!isPrimaryGM()) return;
	for (const actor of globalThis.game?.actors ?? []) {
		if (isWorldCharacter(actor) && actor.isOwner) scheduleVitalsMirror(actor);
	}
}

/** A world arcanum, the record the arcana repository reads (FoundryArcanaRepository#_worldArcanumItem). */
function isWorldArcanum(item) {
	return !item?.parent && !item?.pack && item?.type === "move" && item.system?.moveType === "arcanum";
}

function onItem(item, userId) {
	if (isWorldArcanum(item)) return scheduleEveryone();
	const actor = item?.parent;
	if (mirrorsHere(actor, userId)) scheduleVitalsMirror(actor);
}

function onUpdateActor(actor, changed, _options, userId) {
	if (isSteadingActor(actor)) {
		if (mayMoveSteadingGear(changed)) scheduleEveryone();
		return;
	}
	if (mirrorsHere(actor, userId) && mayMoveVitals(changed)) scheduleVitalsMirror(actor);
}

/** Registered once, at module scope in stonetop.js. */
export function registerVitalsMirrorHooks() {
	Hooks.on("updateActor", onUpdateActor);
	// create/delete pass (doc, options, userId); update passes (doc, changed, options, userId).
	Hooks.on("createItem", (item, _options, userId) => onItem(item, userId));
	Hooks.on("updateItem", (item, _changed, _options, userId) => onItem(item, userId));
	Hooks.on("deleteItem", (item, _options, userId) => onItem(item, userId));
	// A world whose characters changed before this existed, or while no GM was on to follow the steading:
	// the primary GM settles every character once on load, one at a time so the load is not a burst of
	// pack reads. Most are already current, which costs a comparison and no write.
	Hooks.once("ready", async () => {
		if (!isPrimaryGM()) return;
		for (const actor of globalThis.game?.actors ?? []) {
			if (isWorldCharacter(actor) && actor.isOwner) await mirror(actor);
		}
	});
}
