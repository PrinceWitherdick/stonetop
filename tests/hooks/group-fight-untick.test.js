import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { _reconcileWorldGroupFights } from "../../module/hooks/Ready.js";

// The sweep that unticks the monster sheet's Group fight switch on WORLD monsters while the Fight tab
// is on. With the tab on, a group's scale is chosen token by token (the "how many?" window, Merge and
// Split), and the sheet no longer draws the switch, so a sidebar monster left ticked would make every
// token dragged out of it a group, skip the "how many?" question, and offer no box to untick.
//
// Same gate as every other onReady write (see retired-actor-flags.test.js): a player has no right to
// update actors they don't own, and a second GM must not race the first.

/** A ticked horde, an unticked one, and a character, on a world with the Fight tab on or off. */
function world({ isGM = true, activeGMs = ["gm1"], selfId = "gm1", fightTab = true, unticked = [] } = {}) {
	// The world settings the sweep reads and writes, so a test can watch the record it keeps.
	const stored = { groupFightUnticked: unticked };
	const ticked = { id: "ticked", type: "monster", name: "Crinwin", system: { organization: "horde", fightAsGroup: true, count: 6 } };
	const plain = { id: "plain", type: "monster", name: "Wolf", system: { organization: "group", fightAsGroup: false } };
	const hero = { id: "hero", type: "character", name: "Bram", system: {} };
	const updateDocuments = vi.fn(async () => []);
	return {
		ticked, plain, hero, updateDocuments, stored,
		game: {
			actors: [ticked, plain, hero],
			user: { id: selfId, isGM },
			// isPrimaryGM elects the lowest-id ACTIVE GM.
			users: activeGMs.map(id => ({ id, isGM: true, active: true })),
			settings: {
				get: (scope, key) => (key === "fightTab" ? fightTab : stored[key]),
				set: async (scope, key, value) => { stored[key] = value; },
			},
		},
	};
}

let priorGame, priorActor;
beforeEach(() => { priorGame = globalThis.game; priorActor = globalThis.Actor; });
afterEach(() => { globalThis.game = priorGame; globalThis.Actor = priorActor; });

/** Install the world and the Actor class the sweep batches through. */
function install(w) {
	globalThis.game = w.game;
	globalThis.Actor = { updateDocuments: w.updateDocuments };
}

describe("_reconcileWorldGroupFights", () => {
	it("unticks the world monsters fighting as a group, in ONE batched request", async () => {
		const w = world();
		install(w);

		expect(await _reconcileWorldGroupFights()).toBe(1);

		// Only the switch: the monster's Group size is still what the "how many?" window offers first.
		expect(w.updateDocuments).toHaveBeenCalledTimes(1);
		expect(w.updateDocuments).toHaveBeenCalledWith([{ _id: "ticked", "system.fightAsGroup": false }]);
	});

	// With the tab off, the switch is back on the sheet and ticking a sidebar monster is the GM's call.
	it("leaves them ticked while the Fight tab is off", async () => {
		const w = world({ fightTab: false });
		install(w);

		expect(await _reconcileWorldGroupFights()).toBe(0);
		expect(w.updateDocuments).not.toHaveBeenCalled();
	});

	it("writes down whose switch it took, so the tab is not a one-way door", async () => {
		const w = world();
		install(w);

		await _reconcileWorldGroupFights();

		expect(w.stored.groupFightUnticked).toEqual(["ticked"]);
	});

	// The whole point of the record: a GM who throws the tab back gets their bestiary back with it.
	it("gives the switch back when the Fight tab goes off again", async () => {
		const w = world({ fightTab: false, unticked: ["ticked"] });
		w.ticked.system.fightAsGroup = false;
		install(w);

		expect(await _reconcileWorldGroupFights()).toBe(1);
		expect(w.updateDocuments).toHaveBeenCalledWith([{ _id: "ticked", "system.fightAsGroup": true }]);
		// Spent: the next pass with the tab off has nothing left to hand back.
		expect(w.stored.groupFightUnticked).toEqual([]);
	});

	it("clears a record whose monster is gone, or which the GM has already re-ticked by hand", async () => {
		const w = world({ fightTab: false, unticked: ["ticked", "deleted-long-ago"] });
		install(w);

		expect(await _reconcileWorldGroupFights()).toBe(0);
		expect(w.updateDocuments).not.toHaveBeenCalled();
		expect(w.stored.groupFightUnticked).toEqual([]);
	});

	it("is a no-op in a world with nothing ticked, so it can run every load", async () => {
		const w = world();
		w.ticked.system.fightAsGroup = false;
		install(w);

		expect(await _reconcileWorldGroupFights()).toBe(0);
		expect(w.updateDocuments).not.toHaveBeenCalled();
	});

	it("writes NOTHING on a player's client, or on a SECOND GM's", async () => {
		for (const options of [{ isGM: false, selfId: "player1" }, { activeGMs: ["gm1", "gm2"], selfId: "gm2" }]) {
			const w = world(options);
			install(w);

			expect(await _reconcileWorldGroupFights()).toBe(0);
			expect(w.updateDocuments).not.toHaveBeenCalled();
		}
	});

	it("unticks the monsters it can when the batch is rejected", async () => {
		const w = world();
		w.ticked.update = vi.fn(async () => {});
		w.updateDocuments.mockRejectedValue(new Error("locked"));
		install(w);
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		try {
			expect(await _reconcileWorldGroupFights()).toBe(1);
			expect(w.ticked.update).toHaveBeenCalledWith({ "system.fightAsGroup": false });
		} finally {
			warn.mockRestore();
		}
	});
});
