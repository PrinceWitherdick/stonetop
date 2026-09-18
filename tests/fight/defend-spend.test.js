import { describe, it, expect, vi } from "vitest";
import { halveDamage, defendOffers, defendNotes, spendOnBlow, spentOn } from "../../module/fight/defend-spend.js";
import { heldReadiness, READINESS_FLAG } from "../../module/combat/defend-readiness.js";
import { SYSTEM_ID } from "../../module/system-id.js";

// Spending Defend's Readiness on a blow from its damage card (Book I p.216).

const character = (name, readiness = 0, moves = []) => ({
	name, type: "character", uuid: `Actor.${name}`, isOwner: true,
	items: moves.map(move => ({ type: "move", name: move })),
	flags: { [SYSTEM_ID]: { [READINESS_FLAG]: readiness } },
	setFlag: vi.fn(async function (scope, key, value) { this.flags[scope][key] = value; }),
});

describe("heldReadiness and halveDamage", () => {
	it("reads a character's Readiness, and nobody else's", () => {
		expect(heldReadiness(character("bram", 2))).toBe(2);
		expect(heldReadiness({ type: "monster", flags: { [SYSTEM_ID]: { [READINESS_FLAG]: 3 } } })).toBe(0);
	});

	it("halves a blow rounding up, as the book's halvings do", () => {
		expect(halveDamage(7)).toBe(4);
		expect(halveDamage(6)).toBe(3);
		expect(halveDamage(0)).toBe(0);
	});
});

describe("defendOffers", () => {
	const bram = character("bram", 1);
	const aeliana = character("aeliana", 2);
	const damage = { results: [{ uuid: "Token.bram", name: "Bram" }] };

	it("offers the one hit a halving of their own blow, and a defender beside them both options", () => {
		const offers = defendOffers(damage, () => ({ self: bram, allies: [aeliana] }));
		expect(offers.halve.map(o => o.defender.name)).toEqual(["bram", "aeliana"]);
		expect(offers.standIn.map(o => o.defender.name)).toEqual(["aeliana"]);
	});

	it("offers each option once against a blow, and nothing on a blow already applied", () => {
		const taken = { ...damage, halvedBy: [{ uuid: "Token.bram", name: "bram", how: "halve" }], standIns:[{ uuid: "Token.bram", by: aeliana.uuid, name: "aeliana" }] };
		const none = { halve: [], parry: [], standIn: [], ignore: [] };
		expect(defendOffers(taken, () => ({ self: bram, allies: [aeliana] }), () => aeliana)).toEqual(none);
		const applied = { ...damage, applied: [{ uuid: "Token.bram" }] };
		expect(defendOffers(applied, () => ({ self: bram, allies: [aeliana] }))).toEqual(none);
	});
});

describe("playbook moves on the card", () => {
	const damage = { results: [{ uuid: "Token.bram", name: "Bram" }] };

	it("offers a Fox's Parry & Riposte beside the plain halving", () => {
		const fox = character("fox", 1, ["Parry & Riposte"]);
		const offers = defendOffers(damage, () => ({ self: null, allies: [fox] }));
		expect(offers.parry.map(o => o.defender.name)).toEqual(["fox"]);
		expect(offers.halve.map(o => o.defender.name)).toEqual(["fox"]);
	});

	it("lets a Steadfast Guardian take a blow for free, while they hold any Readiness", () => {
		const heavy = character("heavy", 1, ["Steadfast Guardian"]);
		expect(defendOffers(damage, () => ({ self: null, allies: [heavy] })).standIn).toEqual([{ row: damage.results[0], defender: heavy, cost: 0 }]);
	});

	it("offers A Mighty Rampart's ignore to whoever will suffer the blow: the one hit, or the one who took it for them", () => {
		const judge = character("judge", 1, ["A Mighty Rampart"]);
		expect(defendOffers(damage, () => ({ self: judge, allies: [] })).ignore.map(o => o.defender.name)).toEqual(["judge"]);
		const stood = { ...damage, standIns: [{ uuid: "Token.bram", by: judge.uuid, name: "judge" }] };
		expect(defendOffers(stood, () => ({ self: null, allies: [] }), () => judge).ignore.map(o => o.defender.name)).toEqual(["judge"]);
		expect(defendOffers(damage, () => ({ self: character("plain", 1), allies: [] })).ignore).toEqual([]);
	});
});

describe("spendOnBlow", () => {
	const message = flag => ({
		flag,
		getFlag() { return this.flag; },
		setFlag: vi.fn(async function (_scope, _key, value) { this.flag = value; }),
	});

	it("takes a Readiness off the defender and records the halving", async () => {
		const bram = character("bram", 2);
		const card = message({ results: [{ uuid: "Token.bram", name: "Bram" }] });
		expect(await spendOnBlow(card, "halve", { row: card.flag.results[0], defender: bram })).toBe(true);
		expect(bram.flags[SYSTEM_ID][READINESS_FLAG]).toBe(1);
		expect([...spentOn(card.flag).halved]).toEqual(["Token.bram"]);
		expect(defendNotes(card.flag)).toEqual(["bram spent Readiness to halve the blow on Bram."]);
	});

	it("parries: one Readiness halves the blow and strikes back at whoever struck", async () => {
		const fox = character("fox", 2, ["Parry & Riposte"]);
		const card = message({ attackerUuid: "Scene.s.Token.t.Actor.wolf", results: [{ uuid: "Token.bram", name: "Bram" }] });
		const strikeBack = vi.fn(async () => true);
		expect(await spendOnBlow(card, "parry", { row: card.flag.results[0], defender: fox, cost: 1 }, { strikeBack })).toBe(true);
		expect(fox.flags[SYSTEM_ID][READINESS_FLAG]).toBe(1);
		expect([...spentOn(card.flag).halved]).toEqual(["Token.bram"]);
		expect(strikeBack).toHaveBeenCalledWith(fox, "Scene.s.Token.t.Actor.wolf", "Parry & riposte");
		expect(defendNotes(card.flag)).toEqual(["fox spent Readiness to parry the blow on Bram and strike back."]);
	});

	it("parries a blow a character takes by striking back at the foe, never at the character", async () => {
		const fox = character("fox", 2, ["Parry & Riposte"]);
		const card = message({ attackerUuid: "Actor.bram", selfHarm: true, foeUuid: "Scene.s.Token.wolf", results: [{ uuid: "Token.bram", name: "Bram" }] });
		const strikeBack = vi.fn(async () => true);
		expect(await spendOnBlow(card, "parry", { row: card.flag.results[0], defender: fox, cost: 1 }, { strikeBack })).toBe(true);
		expect(strikeBack).toHaveBeenCalledWith(fox, "Scene.s.Token.wolf", "Parry & riposte");
	});

	it("takes a blow for free for a Steadfast Guardian, and ignores one for A Mighty Rampart", async () => {
		const heavy = character("heavy", 1, ["Steadfast Guardian"]);
		const card = message({ results: [{ uuid: "Token.bram", name: "Bram" }] });
		expect(await spendOnBlow(card, "standIn", { row: card.flag.results[0], defender: heavy, cost: 0 })).toBe(true);
		expect(heavy.flags[SYSTEM_ID][READINESS_FLAG]).toBe(1);
		expect(heavy.setFlag).not.toHaveBeenCalled();
		const judge = character("judge", 1, ["A Mighty Rampart"]);
		expect(await spendOnBlow(card, "ignore", { row: card.flag.results[0], defender: judge, cost: 1 })).toBe(true);
		expect([...spentOn(card.flag).ignored]).toEqual(["Token.bram"]);
		expect(defendNotes(card.flag)).toEqual([
			"heavy took the blow for Bram (Steadfast Guardian, no Readiness spent).",
			"judge spent Readiness to ignore the blow (A Mighty Rampart).",
		]);
	});

	it("hands the blow to the defender, and refuses one with no Readiness left", async () => {
		const aeliana = character("aeliana", 1);
		const card = message({ results: [{ uuid: "Token.bram", name: "Bram" }] });
		expect(await spendOnBlow(card, "standIn", { row: card.flag.results[0], defender: aeliana })).toBe(true);
		expect(card.flag.standIns).toEqual([{ uuid: "Token.bram", by: "Actor.aeliana", name: "aeliana", how: "standIn", free: false }]);
		expect(await spendOnBlow(card, "halve", { row: card.flag.results[0], defender: aeliana })).toBe(false);
	});
});
