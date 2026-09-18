import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerVitalsMirrorHooks, mayMoveVitals, mayMoveSteadingGear, FLAG_NOISE } from "../../../module/actors/character/vitals-mirror.js";
import { StonetopCharacter } from "../../../module/actors/character/StonetopCharacter.js";
import { READINESS_FLAG } from "../../../module/combat/defend-readiness.js";
import { LEDGER_KEY } from "../../../module/utils/ledger-core.js";
import { CAMP_FLAG, CAMP_OWED_FLAG } from "../../../module/camp/camp-rules.js";
import { DEATHS_DOOR_FLAG } from "../../../module/actors/character/deaths-door.js";

// The stored armor and max HP are what the token bar, the Fight tab and the ledger read. They have to
// follow a change made with the character's sheet closed, on exactly one client: the one that made it.

function character({ id = "pim", owner = true } = {}) {
	const sync = vi.fn(async () => true);
	return {
		id, name: id, type: "character", isOwner: owner, pack: null, isToken: false,
		typedActor: { syncStoredVitals: sync },
		sync,
	};
}

describe("what moves a vital", () => {
	it("ignores the mirror's own write and a blow's damage", () => {
		expect(mayMoveVitals({ _id: "x", system: { attributes: { armor: { value: 2, unpierceable: 0 }, hp: { max: 20 } } } })).toBe(false);
		expect(mayMoveVitals({ system: { attributes: { hp: { value: 3 } } } })).toBe(false);
	});

	it("counts what the vitals are worked out from: a carried mark, the playbook, a level, the hand-set deltas", () => {
		expect(mayMoveVitals({ flags: { "stonetop-pwd": { inventory: { checked: { shield: true } } } } })).toBe(true);
		expect(mayMoveVitals({ system: { playbook: { slug: "the-heavy" } } })).toBe(true);
		expect(mayMoveVitals({ system: { attributes: { level: { value: 2 } } } })).toBe(true);
		expect(mayMoveVitals({ system: { attributes: { armor: { adjustment: 1 } } } })).toBe(true);
		expect(mayMoveVitals({ system: { attributes: { hp: { adjustment: -2 } } } })).toBe(true);
	});

	it("ignores what play writes over and over and no vital reads", () => {
		expect(mayMoveVitals({ name: "Pim", img: "pim.webp" })).toBe(false);
		expect(mayMoveVitals({ system: { attributes: { xp: { value: 3 }, wounds: [] } } })).toBe(false);
		for (const key of FLAG_NOISE) expect(mayMoveVitals({ flags: { "stonetop-pwd": { [key]: 1 } } })).toBe(false);
		expect(mayMoveVitals({ flags: { "stonetop-pwd": { "-=camp": null } } })).toBe(false);
	});

	it("spells each quiet flag as its owner does", () => {
		expect([...FLAG_NOISE].sort()).toEqual([READINESS_FLAG, LEDGER_KEY, CAMP_FLAG, CAMP_OWED_FLAG, DEATHS_DOOR_FLAG].sort());
	});

	it("counts the steading's Weapons of War, and nothing else about the steading", () => {
		expect(mayMoveSteadingGear({ flags: { "stonetop-pwd": { steading: { improvements: { "weapons-of-war": { completed: true } } } } } })).toBe(true);
		expect(mayMoveSteadingGear({ flags: { "stonetop-pwd": { steading: { fortifications: ["Weapons of war"] } } } })).toBe(true);
		expect(mayMoveSteadingGear({ flags: { "stonetop-pwd": { steading: { system: { attributes: { prosperity: { value: 2 } } } } } } })).toBe(false);
	});
});

describe("the vitals mirror hooks", () => {
	let handlers;
	beforeEach(() => {
		vi.useFakeTimers();
		handlers = {};
		globalThis.Hooks = {
			on: vi.fn((name, fn) => { handlers[name] = fn; }),
			once: vi.fn((name, fn) => { handlers[`once:${name}`] = fn; }),
		};
		globalThis.game = { ...(globalThis.game ?? {}), user: { id: "me" } };
		registerVitalsMirrorHooks();
	});
	afterEach(() => vi.useRealTimers());

	it("re-mirrors once a burst of item changes made here has settled", async () => {
		const pim = character();
		handlers.createItem({ parent: pim }, {}, "me");
		handlers.updateItem({ parent: pim }, {}, {}, "me");
		handlers.deleteItem({ parent: pim }, {}, "me");
		expect(pim.sync).not.toHaveBeenCalled();
		await vi.runAllTimersAsync();
		expect(pim.sync).toHaveBeenCalledTimes(1);
	});

	it("leaves a change somebody else made to their client", async () => {
		const pim = character();
		handlers.updateItem({ parent: pim }, {}, {}, "someone-else");
		handlers.updateActor(pim, { system: { attributes: { level: { value: 2 } } } }, {}, "someone-else");
		await vi.runAllTimersAsync();
		expect(pim.sync).not.toHaveBeenCalled();
	});

	it("does not answer its own write", async () => {
		const pim = character();
		handlers.updateActor(pim, { system: { attributes: { armor: { value: 2 }, hp: { max: 22 } } } }, {}, "me");
		await vi.runAllTimersAsync();
		expect(pim.sync).not.toHaveBeenCalled();
	});

	it("skips anything that is not a world character", async () => {
		const npc = { ...character(), type: "npc" };
		const packed = { ...character(), pack: "world.heroes" };
		const token = { ...character(), isToken: true };
		for (const actor of [npc, packed, token]) handlers.updateItem({ parent: actor }, {}, {}, "me");
		await vi.runAllTimersAsync();
		for (const actor of [npc, packed, token]) expect(actor.sync).not.toHaveBeenCalled();
	});

	describe("changes outside the character", () => {
		const weaponsOfWar = { flags: { "stonetop-pwd": { steading: { improvements: { "weapons-of-war": { completed: true } } } } } };
		const steading = { id: "stonetop", type: "stonetop" };
		const arcanum = { parent: null, type: "move", system: { moveType: "arcanum" } };

		function world(primary) {
			const pim = character({ id: "pim" });
			const cadi = character({ id: "cadi" });
			globalThis.game.actors = [pim, cadi, { ...character({ id: "wolf" }), type: "monster" }];
			globalThis.game.users = { activeGM: { id: primary ? "me" : "other-gm" } };
			return { pim, cadi };
		}

		it("re-mirrors every character on the primary GM's client when the steading earns Weapons of War", async () => {
			const { pim, cadi } = world(true);
			handlers.updateActor(steading, weaponsOfWar, {}, "a-player");
			await vi.runAllTimersAsync();
			expect(pim.sync).toHaveBeenCalledTimes(1);
			expect(cadi.sync).toHaveBeenCalledTimes(1);
		});

		it("leaves it to the primary GM, and ignores the rest of the steading", async () => {
			const others = world(false);
			handlers.updateActor(steading, weaponsOfWar, {}, "me");
			const mine = world(true);
			handlers.updateActor(steading, { flags: { "stonetop-pwd": { steading: { population: 3 } } } }, {}, "me");
			await vi.runAllTimersAsync();
			for (const actor of [others.pim, others.cadi, mine.pim, mine.cadi]) expect(actor.sync).not.toHaveBeenCalled();
		});

		it("re-mirrors every character when a world arcanum's record changes", async () => {
			const { pim, cadi } = world(true);
			handlers.updateItem(arcanum, {}, {}, "other-gm");
			await vi.runAllTimersAsync();
			expect(pim.sync).toHaveBeenCalledTimes(1);
			expect(cadi.sync).toHaveBeenCalledTimes(1);
		});
	});
});

describe("StonetopCharacter#syncStoredVitals", () => {
	function typed(attributes, computed) {
		const actor = { system: { attributes }, update: vi.fn(async () => {}) };
		return { self: { _actor: actor, computedVitals: async () => computed }, actor };
	}
	const sync = self => StonetopCharacter.prototype.syncStoredVitals.call(self);

	it("writes what is stale, in one ledger-silenced update", async () => {
		const { self, actor } = typed({ armor: { value: 0, unpierceable: 0 }, hp: { max: 18 } }, { armor: 2, unpierceable: 1, maxHp: 22 });
		expect(await sync(self)).toBe(true);
		expect(actor.update).toHaveBeenCalledWith({
			"system.attributes.armor.value": 2,
			"system.attributes.armor.unpierceable": 1,
			"system.attributes.hp.max": 22,
		}, { stonetopLedger: true });
	});

	it("writes only the half that moved", async () => {
		const { self, actor } = typed({ armor: { value: 2, unpierceable: 0 }, hp: { max: 18 } }, { armor: 2, unpierceable: 0, maxHp: 16 });
		await sync(self);
		expect(actor.update).toHaveBeenCalledWith({ "system.attributes.hp.max": 16 }, { stonetopLedger: true });
	});

	it("leaves max HP alone with no playbook to derive it from", async () => {
		const { self, actor } = typed({ armor: { value: 0 }, hp: { max: 10 } }, { armor: 0, unpierceable: 0, maxHp: 0 });
		expect(await sync(self)).toBe(false);
		expect(actor.update).not.toHaveBeenCalled();
	});

	it("writes no armor that is not a number (a custom move's bonus that is not one), but still the max HP", async () => {
		const { self, actor } = typed({ armor: { value: 2, unpierceable: 0 }, hp: { max: 18 } }, { armor: Number.NaN, unpierceable: 0, maxHp: 20 });
		await sync(self);
		expect(actor.update).toHaveBeenCalledWith({ "system.attributes.hp.max": 20 }, { stonetopLedger: true });
	});

	it("takes the numbers the sheet already worked out, rather than working them out again", async () => {
		const { self, actor } = typed({ armor: { value: 0, unpierceable: 0 }, hp: { max: 18 } }, null);
		self.computedVitals = vi.fn();
		expect(await StonetopCharacter.prototype.syncStoredVitals.call(self, { armor: 3, unpierceable: 0, maxHp: 18 })).toBe(true);
		expect(self.computedVitals).not.toHaveBeenCalled();
		expect(actor.update).toHaveBeenCalledWith({ "system.attributes.armor.value": 3, "system.attributes.armor.unpierceable": 0 }, { stonetopLedger: true });
		// null is "no snapshot": nothing to write.
		actor.update.mockClear();
		expect(await StonetopCharacter.prototype.syncStoredVitals.call(self, { armor: null, unpierceable: 0, maxHp: 0 })).toBe(false);
		expect(actor.update).not.toHaveBeenCalled();
	});
});
