import { describe, it, expect, vi } from "vitest";
import { StonetopCharacter } from "../../../module/actors/character/StonetopCharacter.js";
import { DEATHS_DOOR_STATE } from "../../../module/actors/character/deaths-door.js";
import { FakeActorBuilder } from "../../fakes/FakeActorBuilder.js";
import { FakeRepositoryFactory } from "../../fakes/FakeRepositoryFactory.js";

const SLUG_PATH  = "flags.stonetop_pwd.postDeathInsert.slug";
const STATE_PATH = "flags.stonetop_pwd.deathsDoor";
const TAB_PATH   = "flags.stonetop_pwd.postDeathInsert.tabOpen";

function makeCharacter(flags = {}) {
	const actor = new FakeActorBuilder().withFlags(flags).build();
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
	it("clears the Death's Door state in the same update as the slug", async () => {
		const { actor, character } = makeCharacter({ deathsDoor: DEATHS_DOOR_STATE.FATE_PENDING });

		await character.setPostDeathInsert("ghost");

		// Taking one shows the tab on its own merits, so there is no request to record and
		// none stored to drop — the fragment is empty and adds nothing to the write.
		expect(slugWrite(actor)).toEqual({ [SLUG_PATH]: "ghost", [STATE_PATH]: null });
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
