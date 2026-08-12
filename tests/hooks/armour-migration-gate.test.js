import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { _migrateArmourToArmor } from "../../module/hooks/Ready.js";

// The pre-rename `system.attributes.armour` sweep. It is a GM-only, primary-GM-only world write,
// and it used to be neither: it ran on every connected client, so each PLAYER tried to update
// every character — including the ones they don't own. Core rejects that, and because the call
// site was a bare `await`, the rejection tore down the rest of onReady for them (no hotbar
// macros, no game.stonetop, no window restore). It went unnoticed for as long as it did because
// the "nothing stale" early return makes it a silent no-op in an already-clean world.

/** A character still carrying the legacy key, plus one that has already been migrated. */
function world({ isGM = true, activeGMs = ["gm1"], selfId = "gm1" } = {}) {
	const stale = {
		id: "stale", type: "character",
		system: { attributes: { armour: 1 } },
		update: vi.fn(async () => {}),
	};
	const clean = {
		id: "clean", type: "character",
		system: { attributes: { armor: { value: 1 } } },
		update: vi.fn(async () => {}),
	};
	const actors = [stale, clean];
	return {
		stale, clean,
		game: {
			// A plain array: game.actors is a Collection, but the sweep only ever calls .filter,
			// which an array already provides.
			actors,
			user: { id: selfId, isGM },
			// isPrimaryGM elects the lowest-id ACTIVE GM.
			users: activeGMs.map(id => ({ id, isGM: true, active: true })),
			release: { generation: 13 },
		},
	};
}

let priorGame;
beforeEach(() => { priorGame = globalThis.game; });
afterEach(() => { globalThis.game = priorGame; });

describe("_migrateArmourToArmor", () => {
	it("drops the legacy key for the primary GM", async () => {
		const w = world();
		globalThis.game = w.game;

		await _migrateArmourToArmor();

		expect(w.stale.update).toHaveBeenCalledTimes(1);
		// v13 shape: the legacy `-=` leaf prefix, chosen by deletionEntry off game.release.
		expect(w.stale.update).toHaveBeenCalledWith({ "system.attributes.-=armour": null });
		// Untouched — it has no `armour` key to drop.
		expect(w.clean.update).not.toHaveBeenCalled();
	});

	it("writes NOTHING on a player's client", async () => {
		const w = world({ isGM: false, selfId: "player1" });
		globalThis.game = w.game;

		await _migrateArmourToArmor();

		expect(w.stale.update).not.toHaveBeenCalled();
	});

	it("writes nothing on a SECOND GM's client, so two GMs can't both migrate", async () => {
		const w = world({ activeGMs: ["gm1", "gm2"], selfId: "gm2" });
		globalThis.game = w.game;

		await _migrateArmourToArmor();

		expect(w.stale.update).not.toHaveBeenCalled();
	});

	it("is a no-op in an already-clean world", async () => {
		const w = world();
		delete w.stale.system.attributes.armour;
		globalThis.game = w.game;

		await _migrateArmourToArmor();

		expect(w.stale.update).not.toHaveBeenCalled();
	});
});
