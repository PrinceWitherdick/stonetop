import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { memberHit, groupTokenInfo, applyMemberHit, isLoneBlowOnGroup, GROUP_WOUND_FLAG } from "../../module/fight/group-hits.js";
import { SYSTEM_ID } from "../../module/system-id.js";
import { fakeActor, fakeToken, fakeScene, fakeCombatant, fakeCombat, collection } from "../fakes/fight.js";

// One fighter's blow on a token standing for a group hits one member of it (Book I pp.415-416).

const horde = ({ count = 12, hp = 3, wound = 0, fightAsGroup = true } = {}) => {
	const actor = fakeActor({
		id: "horde", type: "monster",
		system: { organization: "horde", fightAsGroup, count, attributes: { hp: { value: hp, max: 3 } } },
		flags: { [SYSTEM_ID]: { [GROUP_WOUND_FLAG]: wound } },
	});
	actor.update = vi.fn(async changes => {
		if ("system.count" in changes) actor.system.count = changes["system.count"];
		if (`flags.${SYSTEM_ID}.${GROUP_WOUND_FLAG}` in changes) actor.flags[SYSTEM_ID][GROUP_WOUND_FLAG] = changes[`flags.${SYSTEM_ID}.${GROUP_WOUND_FLAG}`];
	});
	return actor;
};

describe("memberHit", () => {
	it("drops one member for a blow that reaches their HP, however hard it lands", () => {
		expect(memberHit({ hpMax: 3, count: 12, wound: 0 }, 3)).toEqual({ down: true, count: 11, wound: 0, memberHp: 0 });
		expect(memberHit({ hpMax: 3, count: 12, wound: 0 }, 9)).toEqual({ down: true, count: 11, wound: 0, memberHp: 0 });
	});

	it("leaves a member hurt for less, and finishes them with the next blow", () => {
		const hurt = memberHit({ hpMax: 3, count: 12, wound: 0 }, 2);
		expect(hurt).toEqual({ down: false, count: 12, wound: 2, memberHp: 1 });
		expect(memberHit({ hpMax: 3, count: 12, wound: hurt.wound }, 1)).toMatchObject({ down: true, count: 11, wound: 0 });
	});

	it("does nothing for a blow that dealt nothing", () => {
		expect(memberHit({ hpMax: 3, count: 12, wound: 0 }, 0)).toEqual({ down: false, count: 12, wound: 0, memberHp: 3 });
	});
});

describe("groupTokenInfo", () => {
	it("reads a group of several, fighting as a group", () => {
		expect(groupTokenInfo(horde({ wound: 1 }))).toEqual({ hpMax: 3, hp: 3, count: 12, standing: 12, wound: 1 });
	});

	it("is nothing for one creature, a group of one left, or a group not fighting as one", () => {
		expect(groupTokenInfo(horde({ count: 1 }))).toBeNull();
		expect(groupTokenInfo(horde({ fightAsGroup: false }))).toBeNull();
		expect(groupTokenInfo(fakeActor({ id: "c", type: "character" }))).toBeNull();
	});
});

describe("applyMemberHit", () => {
	it("takes one off the group's size and leaves its pool alone", async () => {
		const actor = horde();
		expect(await applyMemberHit(actor, 4)).toMatchObject({ down: true, before: 12, after: 11 });
		expect(actor.update).toHaveBeenCalledWith({ "system.count": 11 });
		expect(actor.system.attributes.hp.value).toBe(3);
	});

	it("keeps a hurt member's wound on the token", async () => {
		const actor = horde();
		expect(await applyMemberHit(actor, 2)).toMatchObject({ down: false, memberHp: 1, after: 12 });
		expect(actor.update).toHaveBeenCalledWith({ [`flags.${SYSTEM_ID}.${GROUP_WOUND_FLAG}`]: 2 });
	});
});

describe("isLoneBlowOnGroup", () => {
	let saved;
	beforeEach(() => {
		saved = { game: globalThis.game, ui: globalThis.ui, canvas: globalThis.canvas, CONST: globalThis.CONST };
		globalThis.CONST = { GRID_TYPES: { GRIDLESS: 0, SQUARE: 1 } };
	});
	afterEach(() => { Object.assign(globalThis, saved); });

	function world({ fightTab = true } = {}) {
		const target = horde();
		const bram = fakeActor({ id: "bram", type: "character" });
		const crew = fakeActor({ id: "crewActor", type: "npc" });
		const tokens = { horde: fakeToken({ id: "tH", col: 1, row: 0, actor: target }), bram: fakeToken({ id: "tB", col: 0, row: 0, actor: bram }), crew: fakeToken({ id: "tC", col: 2, row: 0, actor: crew }) };
		const scene = fakeScene({ tokens: Object.values(tokens) });
		const combat = fakeCombat({ scene, combatants: [
			fakeCombatant({ id: "cH", token: tokens.horde, scene }),
			fakeCombatant({ id: "cB", token: tokens.bram, scene }),
			fakeCombatant({ id: "cC", token: tokens.crew, scene, side: "heroes", count: 6 }),
		] });
		globalThis.game = { ...saved.game, user: { id: "gm", isGM: true }, users: collection([]), combats: collection([combat]), settings: { get: (_s, key) => (key === "fightTab" ? fightTab : undefined) } };
		globalThis.ui = { combat: { viewed: combat } };
		globalThis.canvas = { scene };
		return { target, bram, crew, scene };
	}

	it("is a lone character's blow on a horde token, and not a group's", () => {
		const { target, bram, crew, scene } = world();
		expect(isLoneBlowOnGroup(target, bram, scene)).toBe(true);
		expect(isLoneBlowOnGroup(target, crew, scene)).toBe(false);
	});

	it("leaves the pool to take it with the Fight tab off", () => {
		const { target, bram, scene } = world({ fightTab: false });
		expect(isLoneBlowOnGroup(target, bram, scene)).toBe(false);
	});
});
