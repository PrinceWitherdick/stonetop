import { beforeEach, describe, it, expect, vi } from "vitest";
import { createStonetopItemClass } from "../../module/item/StonetopItem.js";

// A roll card used to carry no identity at all — the move's name survived only as escaped text in
// the card header, and that header reads "Know Things with WIS" for an alt-stat roll. The message
// flag stamped here is what lets a chat handler recognise WHICH move a card came from.

const rollStat = vi.hoisted(() => vi.fn(async () => ({ total: 7 })));
vi.mock("../../module/utils/roll-engine.js", () => ({
	rollStat,
	rollFormula: vi.fn(async () => ({ total: 0 })),
}));

const move = (name, system = {}) => ({ type: "move", name, system });

function makeItem(name, system, actorItems = []) {
	const Base = class {
		constructor() {
			this.name = name;
			this.system = system;
			this.parent = { type: "character", name: "Vahid", items: actorItems };
		}
	};
	return new (createStonetopItemClass(Base))();
}

const KNOW_THINGS = { moveType: "basic", rollType: "int", description: "<p>x</p>" };

beforeEach(() => { rollStat.mockClear(); });

describe("StonetopItem.roll — move identity on the card", () => {
	it("stamps the base move name, not the stat-decorated header", async () => {
		await makeItem("Know Things", KNOW_THINGS).roll({ statOverride: "wis" });
		const opts = rollStat.mock.calls[0][2];
		expect(opts.messageFlags["stonetop-pwd"].move).toBe("Know Things");
		expect(opts.moveName).toBe("Know Things with WIS");   // the header still names the stat
	});

	it("merges into an existing producer's flags rather than replacing them", async () => {
		// The attack flow already stamps its own payload under the same scope key.
		await makeItem("Clash", { rollType: "str" }).roll({
			messageFlags: { "stonetop-pwd": { attack: { move: "clash" } } },
		});
		const flags = rollStat.mock.calls[0][2].messageFlags["stonetop-pwd"];
		expect(flags.attack).toEqual({ move: "clash" });
		expect(flags.move).toBe("Clash");
	});
});

describe("StonetopItem.roll — Never at a Loss", () => {
	it("defers the miss XP and carries the choice when the character owns the move", async () => {
		const item = makeItem("Know Things", KNOW_THINGS, [move("Know Things"), move("Never at a Loss")]);
		await item.roll();
		const opts = rollStat.mock.calls[0][2];
		expect(opts.noXpOnMiss).toBe(true);
		expect(opts.tierActions.failure).toContain("stonetop-know-things-xp");
	});

	it("beats the item's own noXpOnMiss default rather than being overwritten by it", async () => {
		// The spread order in roll() matters here: system.noXpOnMiss is false for Know Things.
		const item = makeItem("Know Things", { ...KNOW_THINGS, noXpOnMiss: false },
			[move("Never at a Loss")]);
		await item.roll();
		expect(rollStat.mock.calls[0][2].noXpOnMiss).toBe(true);
	});

	it("leaves a character without the move rolling exactly as before", async () => {
		await makeItem("Know Things", KNOW_THINGS, [move("Know Things")]).roll();
		const opts = rollStat.mock.calls[0][2];
		expect(opts.noXpOnMiss).toBe(false);
		expect(opts.tierActions).toBeUndefined();
	});

	it("does not fire on a different move, even for a Seeker who owns it", async () => {
		const item = makeItem("Seek Insight", { rollType: "wis" }, [move("Never at a Loss")]);
		await item.roll();
		expect(rollStat.mock.calls[0][2].noXpOnMiss).toBe(false);
	});
});
