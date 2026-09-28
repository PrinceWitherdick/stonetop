// The Would-Be Hero's moves on the ROLL (WBH audit, 2026-09-27):
//  - But I Get Up Again: "you have advantage on your next roll against whatever dealt the damage". Only an
//    attack ever read it, and nothing but the +1d4 blow ever spent it, so a missed Clash kept the
//    advantage for ever and a Defy Danger or a Persuade aimed at that foe got none. Any roll aimed at them
//    now takes it, named, and spends it after the dice; the blow's +1d4 is its own half.
//  - Tough Love (the user's ruling: wire it): "they have disadvantage on any rolls against you until you two
//    work it out", imposed on the called-out PC's rolls aimed at the hero, named on the card.

import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { buildLiveCharacter, makeLiveItem } from "../../fakes/LiveCharacter.js";

// The attack's targets and a Persuade (vs. PCs)'s aim, without the prompts that settle them (as
// fine-whisky.test.js does for Binding Arbitration). Null unless a test says otherwise. A Clash's 6-
// counter-attack is the attack flow's own business, and has its own tests.
const seams = vi.hoisted(() => ({ begin: null, aim: null }));
vi.mock("../../../module/combat/attack-flow.js", async (importOriginal) => {
	const real = await importOriginal();
	return {
		...real,
		maybeBeginAttack: (...args) => (seams.begin ?? real.maybeBeginAttack)(...args),
		maybeCounterOnMiss: async () => false,
	};
});
vi.mock("../../../module/pc-asks/pc-ask-flow.js", async (importOriginal) => {
	const real = await importOriginal();
	return { ...real, aimPcAskRoll: (...args) => (seams.aim ?? real.aimPcAskRoll)(...args) };
});

const SCOPE = "stonetop-pwd";

function wbhRoller({ id = "pim", moves = [], flags = {}, total = 8 } = {}) {
	const rolled = (name, rollType = "dex") => ({ _id: `${name}-1`, name, type: "move", system: { rollType }, roll: vi.fn(async () => ({ total })) });
	const defy = rolled("Defy Danger");
	const persuade = rolled("Persuade (vs. NPCs)", "cha");
	const persuadePcs = rolled("Persuade (vs. PCs)", "cha");
	const clash = rolled("Clash", "str");
	const made = buildLiveCharacter({
		slug: "the-would-be-hero", name: "The Would-Be Hero", seedStartingMoves: false, flags,
		items: moves.map(m => makeLiveItem({ name: m.name ?? m, type: "move", system: { moveType: "playbook" }, flags: m.learned === false ? { [SCOPE]: { learned: false } } : undefined })),
	});
	made.actor.id = id;
	const items = [...made.actor.items, defy, persuade, persuadePcs, clash];
	items.get = itemId => items.find(i => i._id === itemId) ?? null;
	made.actor.items = items;
	const roll = (item, prompted = { takenOffers: [] }) => made.char.onRoll({
		currentTarget: { closest: sel => (sel === ".item" ? { dataset: { itemId: item._id } } : null), getAttribute: () => null },
	}, prompted);
	return { ...made, defy, persuade, persuadePcs, clash, roll };
}
const rolledWith = item => item.roll.mock.calls.at(-1)[0];
const target = tokens => { global.game.user = { targets: new Set(tokens) }; };

afterEach(() => { delete global.game.user; seams.begin = null; seams.aim = null; delete globalThis.fromUuidSync; });

describe("But I Get Up Again's advantage, on any roll against whoever knocked them down", () => {
	const crin = { document: { uuid: "Scene.s.Token.tc", name: "Crinwin" }, actor: { id: "crinActor" } };
	const knocked = { knockedDownBy: { key: "Scene.s.Token.tc", name: "Crinwin", roll: true, blow: true } };
	const moves = ["I Get Knocked Down", "But I Get Up Again"];

	it("gives a Defy Danger aimed at that foe advantage, named, and spends it after the dice", async () => {
		target([crin]);
		const { actor, defy, persuade, roll } = wbhRoller({ moves, flags: knocked });
		await roll(defy);
		expect(rolledWith(defy).rollMode).toBe("adv");
		expect(rolledWith(defy).conditionNotes).toContain("But I Get Up Again");
		// The roll half spent; the blow's +1d4 still owed.
		expect(actor.getFlag(SCOPE, "knockedDownBy")).toMatchObject({ roll: false, blow: true });
		await roll(persuade);
		expect(rolledWith(persuade).rollMode).toBe("normal");
	});

	it("is spent by a Clash at them that misses, which never gets to a blow", async () => {
		seams.begin = async () => ({ messageFlags: { [SCOPE]: { attack: { moveKey: "clash", targets: [{ uuid: "Scene.s.Token.tc", name: "Crinwin", actorId: "crinActor" }] } } } });
		const { actor, clash, roll } = wbhRoller({ moves, flags: knocked, total: 4 });
		await roll(clash);
		expect(rolledWith(clash).rollMode).toBe("adv");
		expect(rolledWith(clash).conditionNotes.filter(n => n === "But I Get Up Again")).toHaveLength(1);
		expect(actor.getFlag(SCOPE, "knockedDownBy")).toMatchObject({ roll: false, blow: true });
	});

	// A guided move, Improvise or a bare stat roll (onDirectStatRoll) aimed at that foe is a roll against them too.
	describe("on a roll with no move behind it (onDirectStatRoll)", () => {
		let direct;
		beforeEach(() => {
			direct = [];
			vi.doMock("../../../module/utils/roll-engine.js", async (importOriginal) => ({
				...(await importOriginal()),
				rollStat: vi.fn(async (stat, actor, options) => { direct.push(options); return { total: 8 }; }),
			}));
		});
		afterEach(() => vi.doUnmock("../../../module/utils/roll-engine.js"));

		it("gives a guided roll at that foe advantage, named, and spends it after the dice", async () => {
			target([crin]);
			const { actor, char } = wbhRoller({ moves, flags: knocked });
			await char.onDirectStatRoll("dex", { moveName: "Trade & Barter" });
			expect(direct[0].rollMode).toBe("adv");
			expect(direct[0].conditionNotes).toContain("But I Get Up Again");
			expect(actor.getFlag(SCOPE, "knockedDownBy")).toMatchObject({ roll: false, blow: true });
			await char.onDirectStatRoll("dex", { moveName: "Trade & Barter" });
			expect(direct[1].rollMode).toBe("normal");
		});

		it("gives and spends nothing on a roll told it is aimed at nobody (Struggle as One)", async () => {
			target([crin]);
			const { actor, char } = wbhRoller({ moves, flags: knocked });
			await char.onDirectStatRoll("str", { moveName: "Struggle as One", targets: [] });
			expect(direct[0].rollMode).toBe("normal");
			expect(actor.getFlag(SCOPE, "knockedDownBy")).toMatchObject({ roll: true });
		});
	});

	it("gives nothing on a roll at someone else, or with the move not learned, and spends nothing", async () => {
		target([{ document: { uuid: "Scene.s.Token.tx", name: "Stranger" }, actor: { id: "x" } }]);
		const { actor, defy, roll } = wbhRoller({ moves, flags: knocked });
		await roll(defy);
		expect(rolledWith(defy).rollMode).toBe("normal");
		expect(actor.getFlag(SCOPE, "knockedDownBy")).toMatchObject({ roll: true });
		target([crin]);
		const off = wbhRoller({ moves: ["I Get Knocked Down", { name: "But I Get Up Again", learned: false }], flags: knocked });
		await off.roll(off.defy);
		expect(rolledWith(off.defy).rollMode).toBe("normal");
	});
});

describe("Tough Love on the called-out PC's rolls against the hero", () => {
	/** Pim, a Would-Be Hero holding Tough Love against `against`, with a token on the map. */
	const hero = ({ against = ["bram"], learned = true } = {}) => {
		const flags = { [SCOPE]: { toughLove: against.map(id => ({ id, name: id })) } };
		const pim = {
			id: "pim", name: "Pim", type: "character", documentName: "Actor", uuid: "Actor.pim",
			items: [{ type: "move", name: "Tough Love", flags: learned ? {} : { [SCOPE]: { learned: false } } }],
			flags, getFlag: (scope, key) => flags[scope]?.[key],
		};
		const docs = new Map([
			["Actor.pim", pim],
			["Scene.s.Token.tp", { documentName: "Token", uuid: "Scene.s.Token.tp", name: "Pim", actor: pim }],
		]);
		globalThis.fromUuidSync = uuid => docs.get(uuid) ?? null;
		return pim;
	};
	const pimToken = { document: { uuid: "Scene.s.Token.tp", name: "Pim" }, actor: { id: "pim" } };

	it("imposes disadvantage on a Persuade at the hero's token, named Tough Love", async () => {
		hero();
		target([pimToken]);
		const { persuade, roll } = wbhRoller({ id: "bram" });
		await roll(persuade);
		expect(rolledWith(persuade).rollMode).toBe("dis");
		expect(rolledWith(persuade).conditionNotes).toContain("Tough Love");
	});

	it("imposes it on a Persuade (vs. PCs) aimed at the hero, and on an attack on their token", async () => {
		hero();
		seams.aim = async () => ({ messageFlags: { [SCOPE]: { pcAsk: { move: "Persuade (vs. PCs)", targetId: "pim", targetName: "Pim" } } } });
		const made = wbhRoller({ id: "bram" });
		await made.roll(made.persuadePcs);
		expect(rolledWith(made.persuadePcs).rollMode).toBe("dis");
		expect(rolledWith(made.persuadePcs).conditionNotes).toContain("Tough Love");
		seams.aim = null;
		seams.begin = async () => ({ messageFlags: { [SCOPE]: { attack: { moveKey: "clash", targets: [{ uuid: "Scene.s.Token.tp", name: "Pim", actorId: "pim" }] } } } });
		await made.roll(made.clash);
		expect(rolledWith(made.clash).rollMode).toBe("dis");
	});

	it("leaves everyone else's rolls alone, and the hero's with the move not learned", async () => {
		hero();
		target([pimToken]);
		const cadi = wbhRoller({ id: "cadi" });
		await cadi.roll(cadi.persuade);
		expect(rolledWith(cadi.persuade).rollMode).toBe("normal");
		hero({ learned: false });
		const bram = wbhRoller({ id: "bram" });
		await bram.roll(bram.persuade);
		expect(rolledWith(bram.persuade).rollMode).toBe("normal");
		// Worked out: nobody left on the list.
		hero({ against: [] });
		await bram.roll(bram.defy);
		expect(rolledWith(bram.defy).rollMode).toBe("normal");
	});

	// A guided move (a row with no rollable of its own), Improvise and a bare stat roll go through
	// onDirectStatRoll, not onRoll: the user's ruling covers every move roll aimed at the hero, those too.
	describe("on a roll with no move behind it (onDirectStatRoll)", () => {
		let direct;
		beforeEach(() => {
			direct = [];
			vi.doMock("../../../module/utils/roll-engine.js", async (importOriginal) => ({
				...(await importOriginal()),
				rollStat: vi.fn(async (stat, actor, options) => { direct.push(options); return { total: 8 }; }),
			}));
		});
		afterEach(() => vi.doUnmock("../../../module/utils/roll-engine.js"));

		it("imposes disadvantage on a guided roll at the hero's token, named Tough Love", async () => {
			hero();
			target([pimToken]);
			const { char } = wbhRoller({ id: "bram" });
			await char.onDirectStatRoll("cha", { moveName: "Trade & Barter" });
			expect(direct[0].rollMode).toBe("dis");
			expect(direct[0].conditionNotes).toContain("Tough Love");
			// Not handed on to the roll engine as an option of its own.
			expect(direct[0]).not.toHaveProperty("targets");
		});

		it("leaves a guided roll alone aimed at nobody, at someone else, or told it is aimed at nobody", async () => {
			hero();
			const { char } = wbhRoller({ id: "bram" });
			await char.onDirectStatRoll("cha", { moveName: "Trade & Barter" });
			expect(direct[0].rollMode).toBe("normal");
			target([{ document: { uuid: "Scene.s.Token.tx", name: "Stranger" }, actor: { id: "x" } }]);
			await char.onDirectStatRoll("cha", { moveName: "Trade & Barter" });
			expect(direct[1].rollMode).toBe("normal");
			target([pimToken]);
			await char.onDirectStatRoll("str", { moveName: "Struggle as One", targets: [] });
			expect(direct[2].rollMode).toBe("normal");
			expect(direct[2].conditionNotes ?? []).not.toContain("Tough Love");
		});
	});
});

// Binding Arbitration had the same gap: "advantage on all rolls against them" reached onRoll's rolls only.
describe("Binding Arbitration on a roll with no move behind it (onDirectStatRoll)", () => {
	let direct;
	beforeEach(() => {
		direct = [];
		vi.doMock("../../../module/utils/roll-engine.js", async (importOriginal) => ({
			...(await importOriginal()),
			rollStat: vi.fn(async (stat, actor, options) => { direct.push(options); return { total: 8 }; }),
		}));
	});
	afterEach(() => vi.doUnmock("../../../module/utils/roll-engine.js"));

	const judge = ({ learned = true } = {}) => {
		const made = buildLiveCharacter({
			slug: "the-judge", name: "The Judge", seedStartingMoves: false,
			items: [makeLiveItem({ name: "Binding Arbitration", type: "move", system: { moveType: "playbook" }, flags: learned ? undefined : { [SCOPE]: { learned: false } } })],
			flags: { oaths: [{ id: "o1", name: "Brennan", broken: true }] },
		});
		return made.char;
	};

	it("gives a guided roll at a targeted oathbreaker advantage, named on the card", async () => {
		target([{ document: { uuid: "Scene.s.Token.tb", name: "Brennan" }, actor: { id: "brennanActor" } }]);
		await judge().onDirectStatRoll("cha", { moveName: "Trade & Barter" });
		expect(direct[0].rollMode).toBe("adv");
		expect(direct[0].conditionNotes).toContain("Binding Arbitration");
		await judge({ learned: false }).onDirectStatRoll("cha", { moveName: "Trade & Barter" });
		expect(direct[1].rollMode).toBe("normal");
	});
});
