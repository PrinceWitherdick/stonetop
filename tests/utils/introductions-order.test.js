import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
	orderForIntroductions,
	legacyIntroOrderIds,
	moveId,
	reshuffle,
	readIntroOrder,
	introductionsRoster,
	adoptLegacyIntroOrder,
	writeIntroOrder,
	INTRO_ORDER_SETTING,
} from "../../module/utils/introductions-order.js";
import { SYSTEM_ID } from "../../module/system-id.js";

// The introductions' own turn order. It used to be the Combat tracker's initiative, and the
// Fight tab replaced that tracker; these pin the order as its own thing, and the one-time copy of
// a world's old tracker order.

const pc = (id, name = id) => ({ id, name, type: "character", system: { playbook: { slug: "fox", name: "The Fox" } } });

describe("orderForIntroductions", () => {
	const roster = [pc("a"), pc("b"), pc("c")];

	it("follows the saved order", () => {
		expect(orderForIntroductions(roster, ["c", "a", "b"]).map(a => a.id)).toEqual(["c", "a", "b"]);
	});

	it("appends anyone the saved order does not mention, in roster order", () => {
		expect(orderForIntroductions(roster, ["b"]).map(a => a.id)).toEqual(["b", "a", "c"]);
	});

	it("drops names that are no longer player characters, and repeats", () => {
		expect(orderForIntroductions(roster, ["gone", "c", "c", "a"]).map(a => a.id)).toEqual(["c", "a", "b"]);
	});

	it("is the roster itself with no saved order, and nothing with no roster", () => {
		expect(orderForIntroductions(roster, []).map(a => a.id)).toEqual(["a", "b", "c"]);
		expect(orderForIntroductions(roster, undefined).map(a => a.id)).toEqual(["a", "b", "c"]);
		expect(orderForIntroductions([], ["a"])).toEqual([]);
		expect(orderForIntroductions(null, null)).toEqual([]);
	});

	it("hands back the same actor objects", () => {
		expect(orderForIntroductions(roster, ["b"])[0]).toBe(roster[1]);
	});
});

describe("legacyIntroOrderIds (the old Combat-tracker order, read once)", () => {
	const c = (id, actorId, initiative, tokenId = null) => ({ id, actorId, initiative, tokenId });

	it("sorts as core's tracker does: initiative high to low, unrolled last, then id", () => {
		const combats = [{ combatants: [c("x3", "a", null), c("x1", "b", 3), c("x2", "c", 7), c("x0", "d", undefined)] }];
		expect(legacyIntroOrderIds(combats, ["a", "b", "c", "d"])).toEqual(["c", "b", "d", "a"]);
	});

	it("reads only player characters, once each", () => {
		const combats = [{ combatants: [c("1", "monster", 9), c("2", "a", 2), c("3", "a", 1), c("4", "b", 5)] }];
		expect(legacyIntroOrderIds(combats, ["a", "b"])).toEqual(["b", "a"]);
	});

	it("picks the combat holding the most PCs", () => {
		const combats = [
			{ combatants: [c("1", "a", 1)] },
			{ combatants: [c("2", "b", 1), c("3", "a", 2)] },
		];
		expect(legacyIntroOrderIds(combats, ["a", "b"])).toEqual(["a", "b"]);
	});

	it("breaks a tie on the tokenless combatants the old dialog added", () => {
		const combats = [
			{ active: true, combatants: [c("1", "a", 2, "tok1"), c("2", "b", 1, "tok2")] },
			{ combatants: [c("3", "b", 2), c("4", "a", 1)] },
		];
		expect(legacyIntroOrderIds(combats, ["a", "b"])).toEqual(["b", "a"]);
	});

	it("then on the active one, then the most recently changed", () => {
		const one = { combatants: [c("1", "a", 2), c("2", "b", 1)] };
		const two = { combatants: [c("3", "b", 2), c("4", "a", 1)] };
		expect(legacyIntroOrderIds([one, { ...two, active: true }], ["a", "b"])).toEqual(["b", "a"]);
		expect(legacyIntroOrderIds([{ ...one, modified: 5 }, { ...two, modified: 9 }], ["a", "b"])).toEqual(["b", "a"]);
	});

	it("never reads a fight's order", () => {
		const fight = { isFight: true, combatants: [c("1", "b", null), c("2", "a", null)] };
		expect(legacyIntroOrderIds([fight], ["a", "b"])).toEqual([]);
	});

	it("is empty with no combat holding a PC", () => {
		expect(legacyIntroOrderIds([], ["a"])).toEqual([]);
		expect(legacyIntroOrderIds([{ combatants: [c("1", "wolf", 3)] }], ["a"])).toEqual([]);
		expect(legacyIntroOrderIds(undefined, undefined)).toEqual([]);
	});
});

describe("moveId", () => {
	it("moves a name one place earlier or later", () => {
		expect(moveId(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
		expect(moveId(["a", "b", "c"], "b", 1)).toEqual(["a", "c", "b"]);
	});

	it("is null off either end, for a name not in the order, or for no move", () => {
		expect(moveId(["a", "b"], "a", -1)).toBeNull();
		expect(moveId(["a", "b"], "b", 1)).toBeNull();
		expect(moveId(["a", "b"], "z", 1)).toBeNull();
		expect(moveId(["a", "b"], "a", 0)).toBeNull();
	});

	it("never changes the order it was given", () => {
		const ids = ["a", "b"];
		moveId(ids, "a", 1);
		expect(ids).toEqual(["a", "b"]);
	});
});

describe("reshuffle", () => {
	it("rolls again rather than hand back the order it started from", () => {
		let calls = 0;
		const shuffleFn = ids => (calls++ < 2 ? [...ids] : [...ids].reverse());
		expect(reshuffle(["a", "b", "c"], shuffleFn)).toEqual(["c", "b", "a"]);
		expect(calls).toBe(3);
	});

	it("gives up after a bounded number of rolls", () => {
		let calls = 0;
		const stuck = ids => { calls++; return [...ids]; };
		expect(reshuffle(["a", "b"], stuck)).toEqual(["a", "b"]);
		expect(calls).toBeLessThanOrEqual(11);
	});

	it("leaves fewer than two names alone", () => {
		expect(reshuffle(["a"], () => { throw new Error("not called"); })).toEqual(["a"]);
	});
});

// ── The Foundry side: the setting, the roster and the one-time copy ───────────

describe("the saved order in a world", () => {
	let stored;
	let writes;
	let savedGame;

	const world = ({ isGM = true, activeGM = "gm", actors = [pc("a"), pc("b"), pc("c")], combats = [] } = {}) => {
		global.game = {
			user: { id: isGM ? "gm" : "player", isGM },
			users: { activeGM: activeGM ? { id: activeGM } : null, find: () => null },
			actors: { contents: actors },
			combats: { contents: combats },
			settings: {
				get: (scope, key) => {
					if (scope !== SYSTEM_ID || key !== INTRO_ORDER_SETTING) throw new Error(`unregistered ${scope}.${key}`);
					return stored;
				},
				set: async (scope, key, value) => { writes.push({ scope, key, value }); stored = value; return value; },
			},
		};
	};

	const combat = (combatants, extra = {}) => ({
		active: false, _stats: { modifiedTime: 1 }, flags: {}, ...extra,
		combatants: combatants.map(([id, actorId, initiative]) => ({ id, actorId, initiative, tokenId: null })),
	});

	beforeEach(() => {
		savedGame = global.game;
		stored = { ids: [] };
		writes = [];
	});
	afterEach(() => { global.game = savedGame; });

	it("reads tolerantly", () => {
		world();
		stored = "nonsense";
		expect(readIntroOrder()).toEqual({ ids: [], adopted: null });
		stored = { ids: ["a", 7, "", null, "b"], adopted: "combat" };
		expect(readIntroOrder()).toEqual({ ids: ["a", "b"], adopted: "combat" });
	});

	it("puts the roster in the saved order", () => {
		world();
		stored = { ids: ["c", "a"], adopted: "none" };
		expect(introductionsRoster().map(a => a.id)).toEqual(["c", "a", "b"]);
	});

	it("shows a world's old tracker order until it has been copied", () => {
		world({ combats: [combat([["1", "b", 9], ["2", "c", 5], ["3", "a", 1]])] });
		expect(introductionsRoster().map(a => a.id)).toEqual(["b", "c", "a"]);
	});

	it("ignores the tracker once the world owns its order, even with nothing saved", () => {
		world({ combats: [combat([["1", "b", 9], ["2", "c", 5]])] });
		stored = { ids: [], adopted: "none" };
		expect(introductionsRoster().map(a => a.id)).toEqual(["a", "b", "c"]);
	});

	it("copies the old order once, on the primary GM", async () => {
		world({ combats: [combat([["1", "c", 3], ["2", "a", 2]])] });
		expect(await adoptLegacyIntroOrder()).toBe(true);
		expect(writes).toEqual([{ scope: SYSTEM_ID, key: INTRO_ORDER_SETTING, value: { ids: ["c", "a"], adopted: "combat" } }]);
		expect(await adoptLegacyIntroOrder()).toBe(false);
		expect(writes).toHaveLength(1);
	});

	it("marks the world even with nothing to copy, so a later fight is never read as an order", async () => {
		world();
		expect(await adoptLegacyIntroOrder()).toBe(false);
		expect(writes.map(w => w.value)).toEqual([{ ids: [], adopted: "none" }]);
	});

	it("never copies on a player, or on a GM who is not the primary", async () => {
		world({ isGM: false, activeGM: null, combats: [combat([["1", "a", 1]])] });
		expect(await adoptLegacyIntroOrder()).toBe(false);
		world({ isGM: true, activeGM: "other-gm", combats: [combat([["1", "a", 1]])] });
		expect(await adoptLegacyIntroOrder()).toBe(false);
		expect(writes).toEqual([]);
	});

	it("leaves an order already saved alone", async () => {
		world({ combats: [combat([["1", "c", 3]])] });
		stored = { ids: ["b", "a"] };
		expect(await adoptLegacyIntroOrder()).toBe(false);
		expect(writes).toEqual([]);
	});

	it("saves a new order as the world's own, keeping the copy marker", async () => {
		world();
		stored = { ids: ["a"], adopted: "combat" };
		await writeIntroOrder(["b", "a", 4, ""]);
		expect(stored).toEqual({ ids: ["b", "a"], adopted: "combat" });
		stored = { ids: [] };
		await writeIntroOrder(["c"]);
		expect(stored).toEqual({ ids: ["c"], adopted: "none" });
	});

	it("never writes from a player's client", async () => {
		world({ isGM: false });
		await writeIntroOrder(["b"]);
		expect(writes).toEqual([]);
	});
});
