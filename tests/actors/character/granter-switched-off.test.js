// A cross-playbook move switched OFF (un-learned, kept on the sheet) switches off what it granted
// (the user's ruling): the moves stamped `grantedBy` it read as un-learned to every rule, and a
// grant-only possession it brought (the Seeker's Sacred Pouch through Initiate of the Secret Arts)
// can't be spent until a granter is learned again. Nothing is deleted; re-learning restores it.

import { describe, expect, it } from "vitest";
import { buildLiveCharacter, makeLiveItem, sourceMovesFor } from "../../fakes/LiveCharacter.js";
import { isMoveLearned, moveLearnedIn, ownsLearnedMoveNamed, ownsMoveNamed, switchedOffGranter } from "../../../module/actors/character/owns-move.js";

const off = () => ({ "stonetop-pwd": { learned: false } });

function moveActor({ granterLearned = true, grantLearned = true } = {}) {
	const versatile = { _id: "v1", type: "move", name: "Versatile", system: {}, flags: granterLearned ? {} : off() };
	const smash = {
		_id: "s1", type: "move", name: "Smash", system: {},
		flags: { "stonetop-pwd": { grantedBy: { move: "Versatile", instanceId: "v1" }, ...(grantLearned ? {} : { learned: false }) } },
	};
	const actor = { items: [versatile, smash] };
	for (const i of actor.items) i.parent = actor;
	return { actor, versatile, smash };
}

describe("a move granted by a switched-off cross move reads as un-learned", () => {
	it("is off while its granter is off, and back on with it", () => {
		const { actor, versatile } = moveActor({ granterLearned: false });
		expect(ownsMoveNamed(actor, "Smash")).toBe(true);
		expect(ownsLearnedMoveNamed(actor, "Smash")).toBe(false);
		delete versatile.flags["stonetop-pwd"];
		expect(ownsLearnedMoveNamed(actor, "Smash")).toBe(true);
	});

	it("reads the granter off the item's own actor too (isMoveLearned on an embedded item)", () => {
		const { smash } = moveActor({ granterLearned: false });
		expect(isMoveLearned(smash)).toBe(false);
		expect(isMoveLearned(moveActor().smash)).toBe(true);
	});

	it("keeps the grant's own toggle: a learned granter with the grant switched off is off", () => {
		const { actor, smash } = moveActor({ grantLearned: false });
		expect(moveLearnedIn(smash, actor.items)).toBe(false);
		expect(switchedOffGranter(smash, actor.items)).toBeNull();
	});

	it("names the switched-off granter; a granter no longer on the sheet switches nothing off", () => {
		const { actor, smash, versatile } = moveActor({ granterLearned: false });
		expect(switchedOffGranter(smash, actor.items)).toBe(versatile);
		expect(moveLearnedIn(smash, [smash])).toBe(true);
	});
});

const seekerMove = name => sourceMovesFor("The Seeker").find(d => d.name === name);
const blessedMove = name => sourceMovesFor("The Blessed").find(d => d.name === name);

/** A level-4 Seeker holding Initiate (on or off), Big Magic through it, and a pouch with 1 Stock spent. */
function seeker({ initiateLearned = true } = {}) {
	const initiate = makeLiveItem({ name: "Initiate of the Secret Arts", type: "move", system: structuredClone(seekerMove("Initiate of the Secret Arts").system), flags: initiateLearned ? {} : off() });
	const bigMagic = makeLiveItem({ name: "Big Magic", type: "move", system: structuredClone(blessedMove("Big Magic").system),
		flags: { "stonetop-pwd": { grantedBy: { move: initiate.name, instanceId: initiate._id } } } });
	const built = buildLiveCharacter({
		slug: "the-seeker", name: "The Seeker", level: 4, items: [initiate, bigMagic],
		flags: { "possessions.selected": ["sacred-pouch"], "possessions.uses": { "sacred-pouch": 1 }, "possessions.grantedAtLevel": { "sacred-pouch": 2 } },
	});
	built.actor.items.get = id => built.actor.items.find(i => i._id === id);
	return { ...built, initiate, bigMagic };
}

describe("the Seeker's Sacred Pouch while Initiate of the Secret Arts is switched off", () => {
	it("is held and spendable while Initiate is learned", async () => {
		const { char } = seeker();
		expect(await char.holdsPossession("sacred-pouch")).toBe(true);
		expect((await char.stockSources()).map(s => s.key)).toContain("stock");
	});

	it("can't be spent while Initiate is off; its Stock is kept and comes back with Initiate", async () => {
		const { char, actor, initiate } = seeker({ initiateLearned: false });
		expect(await char.holdsPossession("sacred-pouch")).toBe(false);
		expect((await char.stockSources()).map(s => s.key)).not.toContain("stock");
		expect(ownsLearnedMoveNamed(actor, "Big Magic")).toBe(false);
		// Nothing deleted: the pouch stays selected with its spent Stock.
		expect(actor.flags["stonetop-pwd"].possessions.selected).toContain("sacred-pouch");
		await char.setMoveLearned(initiate._id, true);
		expect(await char.holdsPossession("sacred-pouch")).toBe(true);
		expect((await char.stockSources()).find(s => s.key === "stock")).toMatchObject({ stored: 1 });
		expect(ownsLearnedMoveNamed(actor, "Big Magic")).toBe(true);
	});

	it("stops Big Magic's +2 Stock growing the pouch while it is off", async () => {
		const on = seeker();
		const offChar = seeker({ initiateLearned: false });
		expect(await on.char.sacredPouchMax()).toBeGreaterThan(await offChar.char.sacredPouchMax());
	});

	it("reads as off on the Moves tab, naming the granter", async () => {
		const { char } = seeker({ initiateLearned: false });
		const snap = await char.buildSnapshot();
		const bigMagic = snap.moves.find(c => c.key === "learned")?.moves.find(m => m.name === "Big Magic");
		expect(bigMagic.granterOff).toBe("Initiate of the Secret Arts");
		const onSnap = await seeker().char.buildSnapshot();
		expect(onSnap.moves.find(c => c.key === "learned")?.moves.find(m => m.name === "Big Magic").granterOff).toBeNull();
	});
});
