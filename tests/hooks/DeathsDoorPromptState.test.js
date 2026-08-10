import { afterEach, describe, expect, it, vi } from "vitest";
import {
	RAISED_OPTION,
	onPreUpdateActorDeathsDoor,
	onUpdateActorDeathsDoorRaised,
	promptRaiseFromDead,
} from "../../module/hooks/DeathsDoorPrompt.js";
import { DEATHS_DOOR_STATE } from "../../module/actors/character/deaths-door.js";
import { FakeActorBuilder } from "../fakes/FakeActorBuilder.js";

const STATE_PATH = "flags.stonetop-pwd.deathsDoor";

/**
 * A character about to take a hit, with whatever death flags the case needs. The prompt setting is
 * OFF: the card is a separate question, and every case here is about the state the hook records.
 */
function about(flags, hp = 5) {
	const actor = new FakeActorBuilder().withFlags(flags).build();
	actor.type = "character";
	actor.system = { attributes: { hp: { value: hp } } };
	global.game = { settings: { get: () => false } };
	// tests/setup.js fakes `getProperty` but not `setProperty`, and this hook swallows its own
	// faults on purpose (a throw here would abort the HP write and lose the damage) — so without
	// this the assertions below would pass or fail on a silently caught TypeError.
	global.foundry.utils.setProperty ??= (obj, path, value) => {
		const parts = String(path).split(".");
		let current = obj;
		for (const key of parts.slice(0, -1)) { current[key] ??= {}; current = current[key]; }
		current[parts.at(-1)] = value;
	};
	return actor;
}

/** The hook writes into the pending `changes`; this is what it added, if anything. */
function recorded(actor, newHp, options = {}) {
	const changes = { system: { attributes: { hp: { value: newHp } } } };
	onPreUpdateActorDeathsDoor(actor, changes, options);
	// setProperty writes the dotted path as a real nesting; read it either way.
	return changes.flags?.["stonetop-pwd"]?.deathsDoor ?? changes[STATE_PATH];
}

/** Run the pair the way Foundry does: one options object handed to both halves. */
function applyHp(actor, newHp, { userId = "me" } = {}) {
	const options = {};
	const changes = { system: { attributes: { hp: { value: newHp } } } };
	onPreUpdateActorDeathsDoor(actor, changes, options);
	onUpdateActorDeathsDoorRaised(actor, changes, options, userId);
	return options;
}

afterEach(() => { delete global.game; delete global.Dialog; });

describe("onPreUpdateActorDeathsDoor — the state a hit records", () => {
	it("makes a living character dying when they cross to 0", () => {
		expect(recorded(about({}), 0)).toBe(DEATHS_DOOR_STATE.DYING);
	});

	/**
	 * The freeze this guards against. `fate-pending` is one of the two states nextDeathsDoorState
	 * refuses to move off — rightly, since a fatal roll is on the table — so a stale one left
	 * beside an insert (a torn write, see effectiveDeathsDoorState) would have frozen this
	 * character's state for good: never dying again, and so never announcing it, for the rest of
	 * their career. Read through the same lens the character model uses and the next hit both
	 * records the dying state and overwrites the stale flag.
	 */
	it("still lands on a Ghost carrying a fate-pending nothing ever cleared", () => {
		const actor = about({
			deathsDoor: DEATHS_DOOR_STATE.FATE_PENDING,
			postDeathInsert: { slug: "ghost" },
		});

		expect(recorded(actor, 0)).toBe(DEATHS_DOOR_STATE.DYING);
	});

	// A fate-pending with no insert behind it is a real one: the 6- is rolled and the fate is
	// genuinely still owed, so another hit must not restart the brush with death.
	it("leaves a real fate-pending standing", () => {
		const actor = about({ deathsDoor: DEATHS_DOOR_STATE.FATE_PENDING }, 0);

		expect(recorded(actor, 0)).toBeUndefined();
	});

	// Nothing walks `dead` back on its own — the raise is asked about, never assumed.
	it("writes no state change when a dead character is given hit points", () => {
		const actor = about({ deathsDoor: DEATHS_DOOR_STATE.DEAD }, 0);

		expect(recorded(actor, 5)).toBeUndefined();
	});
});

/**
 * The raise prompt. `dead` is the one state with no automatic way out ("only the rarest of magic
 * can bring them back"), and a GM playing out a resurrection looks exactly like a GM fixing a typo
 * in the HP box — so the pair of hooks recognises the moment and asks whoever made the change.
 */
describe("onUpdateActorDeathsDoorRaised — asking whether they are back", () => {
	/** Stand in for core's Dialog, answering with whichever button the case wants pressed. */
	function stubDialog(press = "yes") {
		const opened = [];
		global.Dialog = class {
			constructor(data) { opened.push(data); this._data = data; }
			render() { this._data.buttons[press]?.callback?.(); return this; }
		};
		return opened;
	}

	it("asks the user who made the change, and clears the state on yes", async () => {
		const actor = about({ deathsDoor: DEATHS_DOOR_STATE.DEAD }, 0);
		actor.name = "Brakkos";
		actor.unsetFlag = vi.fn(async () => {});
		global.game.user = { id: "me" };
		global.game.i18n = { localize: k => k, format: (k, d) => `${k}:${d.name}` };
		global.ui = { notifications: { info: vi.fn(), warn: vi.fn() } };
		const opened = stubDialog("yes");

		applyHp(actor, 5);
		await Promise.resolve();

		expect(opened).toHaveLength(1);
		expect(opened[0].title).toContain("Brakkos");
		expect(actor.unsetFlag).toHaveBeenCalledWith("stonetop-pwd", "deathsDoor");
	});

	// "No" writes nothing at all: the hit points stay where the GM put them, and the only thing
	// this question ever settles is whether the sheet still says they are dead.
	it("leaves them dead on no", async () => {
		const actor = about({ deathsDoor: DEATHS_DOOR_STATE.DEAD }, 0);
		actor.unsetFlag = vi.fn(async () => {});
		global.game.user = { id: "me" };
		global.game.i18n = { localize: k => k, format: k => k };
		stubDialog("no");

		applyHp(actor, 5);
		await Promise.resolve();

		expect(actor.unsetFlag).not.toHaveBeenCalled();
	});

	// updateActor fires on EVERY connected client. Without this the whole table gets the question.
	it("stays quiet on every client but the one that made the change", () => {
		const actor = about({ deathsDoor: DEATHS_DOOR_STATE.DEAD }, 0);
		actor.unsetFlag = vi.fn(async () => {});
		global.game.user = { id: "someone-else" };
		const opened = stubDialog("yes");

		applyHp(actor, 5, { userId: "me" });

		expect(opened).toHaveLength(0);
	});

	// The stamp is what makes it a transition. A later write finds them already up, so there is
	// nothing to ask about and the question must not come back.
	it("asks once, on the write that raises them", () => {
		const actor = about({ deathsDoor: DEATHS_DOOR_STATE.DEAD }, 4);
		global.game.user = { id: "me" };
		const opened = stubDialog("no");

		const options = applyHp(actor, 6);

		expect(options[RAISED_OPTION]).toBeUndefined();
		expect(opened).toHaveLength(0);
	});

	it("says nothing about a living character being healed", () => {
		const actor = about({}, 0);
		global.game.user = { id: "me" };
		const opened = stubDialog("yes");

		applyHp(actor, 5);

		expect(opened).toHaveLength(0);
	});

	/**
	 * The `Dead` tag on the sheet is the other way in, for a table that plays the resurrection out
	 * before touching anyone's hit points. Same question, same write — only the one sentence about
	 * HP differs, and saying it on a sheet still sitting at 0 would be a lie.
	 */
	describe("the two ways in", () => {
		function content(opts) {
			const actor = about({ deathsDoor: DEATHS_DOOR_STATE.DEAD }, 0);
			actor.unsetFlag = vi.fn(async () => {});
			global.game.i18n = { localize: k => k, format: (k, d) => `${k}:${d.name}` };
			const opened = stubDialog("no");
			promptRaiseFromDead(actor, opts);
			return opened[0].content;
		}

		it("mentions the hit points when that is what raised the question", () => {
			expect(content({ fromHp: true })).toContain("raiseHpNote");
		});

		it("leaves them out when the tag was clicked", () => {
			expect(content()).not.toContain("raiseHpNote");
		});
	});
});
