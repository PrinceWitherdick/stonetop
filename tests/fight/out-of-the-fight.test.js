import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
	defeatedStatusId, droppedOutOfTheFight, combatantsFor, markOutOfTheFight, installOutOfTheFight,
} from "../../module/fight/out-of-the-fight.js";
import { collection } from "../fakes/fight.js";

// A monster on 0 hit points is out of the fight, and its token says so without the GM clicking.

/** A token's own actor, the way a monster's always is: unlinked, so `isToken` and a token UUID. */
function foe({ uuid = "Scene.s1.Token.t1.Actor.rat", type = "monster", hp = 6, max = 6, isToken = true, statuses = [] } = {}) {
	const actor = {
		uuid, type, isToken,
		system: { attributes: { hp: { value: hp, max } } },
		statuses: new Set(statuses),
		toggleStatusEffect: vi.fn(async (id, options) => { actor.toggled.push([id, options]); actor.statuses.add(id); }),
		toggled: [],
	};
	return actor;
}

const fighter = (id, actor, { defeated = false } = {}) => ({
	id, actor, defeated,
	update: vi.fn(async changes => Object.assign(fighterOf(id), changes)),
});
const fighters = new Map();
const fighterOf = id => fighters.get(id);
const inFight = (id, actor, options) => {
	const c = fighter(id, actor, options);
	fighters.set(id, c);
	return c;
};
const combat = (id, combatants) => ({ id, combatants: collection(combatants) });

const hpWrite = value => ({ system: { attributes: { hp: { value } } } });
const dottedWrite = value => ({ "system.attributes.hp.value": value });

let saved;
beforeEach(() => {
	fighters.clear();
	saved = { user: globalThis.game.user, users: globalThis.game.users, combats: globalThis.game.combats, config: globalThis.CONFIG };
	const gm = { id: "gm", isGM: true, active: true };
	globalThis.game.user = gm;
	globalThis.game.users = Object.assign(collection([gm]), { activeGM: gm });
	globalThis.game.combats = collection([]);
	globalThis.CONFIG = { specialStatusEffects: { DEFEATED: "dead" } };
});
afterEach(() => {
	globalThis.game.user = saved.user;
	globalThis.game.users = saved.users;
	globalThis.game.combats = saved.combats;
	globalThis.CONFIG = saved.config;
});

describe("defeatedStatusId", () => {
	it("takes the world's, and falls back to core's own", () => {
		expect(defeatedStatusId({ specialStatusEffects: { DEFEATED: "slain" } })).toBe("slain");
		expect(defeatedStatusId({})).toBe("dead");
	});
});

describe("droppedOutOfTheFight", () => {
	it("is the last hit point going, written either way round", () => {
		expect(droppedOutOfTheFight(foe({ hp: 0 }), hpWrite(0))).toBe(true);
		expect(droppedOutOfTheFight(foe({ hp: -3 }), dottedWrite(-3))).toBe(true);
	});

	it("is not a blow that leaves it standing", () => {
		expect(droppedOutOfTheFight(foe({ hp: 2 }), hpWrite(2))).toBe(false);
	});

	it("ignores a write that never touched the hit points", () => {
		expect(droppedOutOfTheFight(foe({ hp: 0 }), { name: "Rat" })).toBe(false);
	});

	it("leaves a character's 0 to Death's Door, and an npc's to its own rules", () => {
		expect(droppedOutOfTheFight(foe({ type: "character", hp: 0 }), hpWrite(0))).toBe(false);
		expect(droppedOutOfTheFight(foe({ type: "npc", hp: 0 }), hpWrite(0))).toBe(false);
	});

	it("wants an HP maximum to be at 0 of, as bodiesFor does", () => {
		expect(droppedOutOfTheFight(foe({ hp: 0, max: 0 }), hpWrite(0))).toBe(false);
	});
});

describe("combatantsFor", () => {
	it("finds the token's own row, not every rat off the same sheet", () => {
		const one = foe({ uuid: "Scene.s1.Token.t1.Actor.rat" });
		const two = foe({ uuid: "Scene.s1.Token.t2.Actor.rat" });
		const combats = collection([combat("c1", [inFight("r1", one), inFight("r2", two)])]);
		expect(combatantsFor(one, combats).map(c => c.id)).toEqual(["r1"]);
	});

	it("looks in every combat in the world", () => {
		const rat = foe();
		const combats = collection([combat("c1", []), combat("c2", [inFight("r1", rat)])]);
		expect(combatantsFor(rat, combats).map(c => c.id)).toEqual(["r1"]);
	});
});

describe("markOutOfTheFight", () => {
	it("writes core's two halves: the combatant's record, then the overlay", async () => {
		const rat = foe({ hp: 0 });
		const row = inFight("r1", rat);
		expect(await markOutOfTheFight(rat, { combats: collection([combat("c1", [row])])})).toBe(true);
		expect(row.update).toHaveBeenCalledWith({ defeated: true });
		expect(rat.toggled).toEqual([["dead", { overlay: true, active: true }]]);
	});

	it("marks a token that is in no fight at all", async () => {
		const rat = foe({ hp: 0 });
		expect(await markOutOfTheFight(rat, { combats: collection([]) })).toBe(true);
		expect(rat.toggled).toHaveLength(1);
	});

	it("leaves a bestiary entry alone: a skull there would ride every token stamped from it", async () => {
		const sheet = foe({ hp: 0, isToken: false, uuid: "Actor.rat" });
		expect(await markOutOfTheFight(sheet, { combats: collection([]) })).toBe(false);
		expect(sheet.toggled).toHaveLength(0);
	});

	it("still marks a linked token standing in a fight", async () => {
		const sheet = foe({ hp: 0, isToken: false, uuid: "Actor.ogre" });
		const row = inFight("o1", sheet);
		expect(await markOutOfTheFight(sheet, { combats: collection([combat("c1", [row])]) })).toBe(true);
		expect(row.update).toHaveBeenCalledWith({ defeated: true });
	});

	it("writes nothing over a foe already marked both ways", async () => {
		const rat = foe({ hp: 0, statuses: ["dead"] });
		const row = inFight("r1", rat, { defeated: true });
		expect(await markOutOfTheFight(rat, { combats: collection([combat("c1", [row])]) })).toBe(false);
		expect(row.update).not.toHaveBeenCalled();
		expect(rat.toggled).toHaveLength(0);
	});

	it("fills in the half that is missing", async () => {
		const rat = foe({ hp: 0, statuses: ["dead"] });
		const row = inFight("r1", rat);
		expect(await markOutOfTheFight(rat, { combats: collection([combat("c1", [row])]) })).toBe(true);
		expect(row.update).toHaveBeenCalledWith({ defeated: true });
		expect(rat.toggled).toHaveLength(0);
	});

	it("uses the status the world points DEFEATED at", async () => {
		const rat = foe({ hp: 0 });
		await markOutOfTheFight(rat, { combats: collection([]), config: { specialStatusEffects: { DEFEATED: "slain" } } });
		expect(rat.toggled[0][0]).toBe("slain");
	});
});

describe("installOutOfTheFight", () => {
	function fakeHooks() {
		const on = new Map();
		return {
			on: (name, fn) => { on.set(name, [...(on.get(name) ?? []), fn]); return on.get(name).length; },
			off: vi.fn(),
			fire: async (name, ...args) => {
				for (const fn of on.get(name) ?? []) fn(...args);
				await new Promise(r => setTimeout(r, 0));
			},
		};
	}

	it("marks the foe when the blow lands", async () => {
		const hooks = fakeHooks();
		installOutOfTheFight({ hooks });
		const rat = foe({ hp: 0 });
		const row = inFight("r1", rat);
		globalThis.game.combats = collection([combat("c1", [row])]);

		await hooks.fire("updateActor", rat, hpWrite(0));
		expect(row.update).toHaveBeenCalledWith({ defeated: true });
		expect(rat.toggled).toHaveLength(1);
	});

	it("is the primary GM's write and nobody else's", async () => {
		const hooks = fakeHooks();
		installOutOfTheFight({ hooks });
		const player = { id: "pc", isGM: false, active: true };
		globalThis.game.user = player;
		globalThis.game.users = Object.assign(collection([player]), { activeGM: null });
		const rat = foe({ hp: 0 });

		await hooks.fire("updateActor", rat, hpWrite(0));
		expect(rat.toggled).toHaveLength(0);
	});

	it("hands back a way to stop watching", () => {
		const hooks = fakeHooks();
		installOutOfTheFight({ hooks })();
		expect(hooks.off).toHaveBeenCalledWith("updateActor", 1);
	});
});
