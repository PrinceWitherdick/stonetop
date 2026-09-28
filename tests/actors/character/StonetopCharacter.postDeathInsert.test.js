import { describe, it, expect, vi } from "vitest";
import { StonetopCharacter } from "../../../module/actors/character/StonetopCharacter.js";
import { DEATHS_DOOR_STATE } from "../../../module/actors/character/deaths-door.js";
import { FakeActorBuilder } from "../../fakes/FakeActorBuilder.js";
import { FakeRepositoryFactory } from "../../fakes/FakeRepositoryFactory.js";

const SLUG_PATH  = "flags.stonetop-pwd.postDeathInsert.slug";
const STATE_PATH = "flags.stonetop-pwd.deathsDoor";
const TAB_PATH   = "flags.stonetop-pwd.postDeathInsert.tabOpen";

// At 0 HP unless a case says otherwise: every brush with death these cases take an insert from is one.
function makeCharacter(flags = {}, { hp = 0 } = {}) {
	const actor = new FakeActorBuilder().withFlags(flags).withHp(hp, 8).build();
	actor.items = [];
	actor.update = vi.fn(async () => {});
	actor.createEmbeddedDocuments = vi.fn(async () => []);
	actor.deleteEmbeddedDocuments = vi.fn(async () => []);
	return { actor, character: new StonetopCharacter(actor, new FakeRepositoryFactory()) };
}

/** The update that carried the slug, whichever call it was. */
function slugWrite(actor) {
	return actor.update.mock.calls.map(([data]) => data).find(data => SLUG_PATH in data) ?? null;
}

/**
 * Taking an insert used to be two writes: the slug, then the Death's Door state. A reload landing
 * between them (2026-08-08, in play) left a character wearing a Ghost and still flagged
 * `fate-pending`, which told every reader that Death's Door was owed by someone who had just
 * answered it. One update can't be torn in half.
 */
describe("setPostDeathInsert — the insert and the end of dying are one write", () => {
	// Ending the brush with death is not getting up (the user's ruling, 2026-09-27): taken at the
	// Door, the insert returns them OUT OF THE ACTION, in the same update as the slug.
	it("returns them out of the action in the same update as the slug", async () => {
		const { actor, character } = makeCharacter({ deathsDoor: DEATHS_DOOR_STATE.FATE_PENDING });

		await character.setPostDeathInsert("ghost");

		// Taking one shows the tab on its own merits, so there is no request to record and
		// none stored to drop: the fragment is empty and adds nothing to the write. The fake
		// actor is at 0 HP already, so no hit points ride along.
		expect(slugWrite(actor)).toEqual({ [SLUG_PATH]: "ghost", [STATE_PATH]: DEATHS_DOOR_STATE.OUT_OF_ACTION });
	});

	// Healed while the fate was still owed: the insert still returns them at 0 HP, out of the action,
	// and "Back on your feet" is what brings the hit points back.
	it("puts the hit points to 0 in the same write when they were healed meanwhile", async () => {
		const { actor, character } = makeCharacter({ deathsDoor: DEATHS_DOOR_STATE.FATE_PENDING }, { hp: 5 });

		await character.setPostDeathInsert("revenant");

		expect(slugWrite(actor)).toEqual({
			[SLUG_PATH]: "revenant",
			[STATE_PATH]: DEATHS_DOOR_STATE.OUT_OF_ACTION,
			"system.attributes.hp.value": 0,
		});
	});

	// Undying's 6- gives the Revenant up for the Ghost while they are DYING: the same one write.
	it("returns a dying Revenant who becomes a Ghost out of the action, in the slug's write", async () => {
		const { actor, character } = makeCharacter({ deathsDoor: DEATHS_DOOR_STATE.DYING, postDeathInsert: { slug: "revenant" } });

		await character.setPostDeathInsert("ghost");

		expect(actor.update).toHaveBeenCalledTimes(1);
		expect(slugWrite(actor)).toEqual({ [SLUG_PATH]: "ghost", [STATE_PATH]: DEATHS_DOOR_STATE.OUT_OF_ACTION });
	});

	// Away from any brush with death (a GM handing a living character an insert) nothing is returned
	// from, and someone already out of the action stays there.
	it("leaves the living up and the out-of-action down", async () => {
		const up = makeCharacter({}, { hp: 6 });
		await up.character.setPostDeathInsert("thrall");
		expect(slugWrite(up.actor)).toEqual({ [SLUG_PATH]: "thrall", [STATE_PATH]: null });

		const down = makeCharacter({ deathsDoor: DEATHS_DOOR_STATE.OUT_OF_ACTION });
		await down.character.setPostDeathInsert("thrall");
		expect(slugWrite(down.actor)).toEqual({ [SLUG_PATH]: "thrall", [STATE_PATH]: DEATHS_DOOR_STATE.OUT_OF_ACTION });
	});

	// B11: the same insert dropped again used to wipe the state (a dispersed Ghost stood up, a Ghost
	// lost to the Final Consequence brought back) and delete and remake its three moves.
	it("does nothing at all when the insert they already wear is taken again", async () => {
		const { actor, character } = makeCharacter({
			deathsDoor: DEATHS_DOOR_STATE.DEAD,
			postDeathInsert: { slug: "ghost" },
		});
		actor.items = [{ _id: "m1", type: "move", system: { moveType: "post-death" } }];

		expect(await character.setPostDeathInsert("ghost")).toBe(false);

		expect(actor.update).not.toHaveBeenCalled();
		expect(actor.deleteEmbeddedDocuments).not.toHaveBeenCalled();
		expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
	});

	// Removing one is an edit-mode undo, not a brush with death ending, so there is no state to
	// clear — and clearing it would quietly discard a `dying` or `fate-pending` that is still true.
	// The tab request rides along rather than following as a second write, for the same
	// can't-be-torn-in-half reason the state clear does.
	it("leaves the state alone when an insert is removed, and holds the tab open in the same write", async () => {
		const { actor, character } = makeCharacter({ deathsDoor: DEATHS_DOOR_STATE.DYING });

		await character.setPostDeathInsert(null);

		expect(slugWrite(actor)).toEqual({ [SLUG_PATH]: null, [TAB_PATH]: true });
	});

	// One document write, not two — the whole point of the fragment form.
	it("writes once", async () => {
		const { actor, character } = makeCharacter({ deathsDoor: DEATHS_DOOR_STATE.DYING });

		await character.setPostDeathInsert(null);

		expect(actor.update).toHaveBeenCalledTimes(1);
	});
});

/**
 * And the reader that heals the sheets it already happened on. `deathsDoorState` is what every
 * surface asks (the Death's Door card, the walkthrough's resume, the routing table), so the rule
 * lands in one place rather than at each of them.
 */
describe("deathsDoorState — an insert is the fate, whatever the flag still says", () => {
	it("reports no state for a Ghost left flagged fate-pending", () => {
		const { character } = makeCharacter({
			deathsDoor: DEATHS_DOOR_STATE.FATE_PENDING,
			postDeathInsert: { slug: "ghost" },
		});

		expect(character.deathsDoorState).toBe(null);
		// Which is what puts Tethered back in front of them instead of the fate fork.
		expect(character.zeroHpMove.name).toBe("Tethered");
	});

	it("still reports a fate-pending that no insert has answered", () => {
		const { character } = makeCharacter({ deathsDoor: DEATHS_DOOR_STATE.FATE_PENDING });

		expect(character.deathsDoorState).toBe(DEATHS_DOOR_STATE.FATE_PENDING);
	});

	// A dispersed Ghost is out of the action, and wearing an insert doesn't make that untrue.
	it("passes the other states through for a character with an insert", () => {
		const { character } = makeCharacter({
			deathsDoor: DEATHS_DOOR_STATE.OUT_OF_ACTION,
			postDeathInsert: { slug: "ghost" },
		});

		expect(character.deathsDoorState).toBe(DEATHS_DOOR_STATE.OUT_OF_ACTION);
	});
});
