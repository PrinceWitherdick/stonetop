import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { makeSeed, outgoingSeed, incomingSeed, sheetSeed, engagedFoeTargets } from "../../module/fight/damage-seed.js";
import { fakeActor, fakeToken, fakeScene, fakeCombatant, fakeCombat, collection } from "../fakes/fight.js";

// The fight's +N for several attackers (Book I p.414), offered to damage rolls.

let saved;
let fightTabOn;
beforeEach(() => {
	saved = { game: globalThis.game, ui: globalThis.ui, canvas: globalThis.canvas, fromUuidSync: globalThis.fromUuidSync, CONST: globalThis.CONST };
	fightTabOn = true;
	globalThis.CONST = { GRID_TYPES: { GRIDLESS: 0, SQUARE: 1 } };
});
afterEach(() => { Object.assign(globalThis, saved); });

/**
 * Bram and Aeliana on one crinwin; Cadi between two wolves; a horde of six beside Bram's other flank.
 */
function fight() {
	const actor = (id, type, extra = {}) => fakeActor({ id, name: id[0].toUpperCase() + id.slice(1), type, ...extra });
	const bramActor = actor("bram", "character");
	const cadiActor = actor("cadi", "character");
	const wolfActor = actor("wolf", "monster");
	const token = (id, col, row, a) => Object.assign(fakeToken({ id, col, row, actor: a }), { uuid: `Scene.scene1.Token.${id}`, documentName: "Token" });
	const tokens = {
		bram: token("tBram", 0, 1, bramActor),
		aeliana: token("tAel", 0, 3, actor("aeliana", "character")),
		crinwin: token("tCrin", 0, 2, actor("crinwin", "monster")),
		cadi: token("tCadi", 6, 1, cadiActor),
		wolf1: token("tW1", 5, 1, wolfActor),
		wolf2: token("tW2", 7, 1, wolfActor),
	};
	const scene = fakeScene({ tokens: Object.values(tokens) });
	const c = (id, t) => fakeCombatant({ id, token: t, scene });
	const combat = fakeCombat({ scene, combatants: [
		c("cBram", tokens.bram), c("cAel", tokens.aeliana), c("cCrin", tokens.crinwin),
		c("cCadi", tokens.cadi), c("cW1", tokens.wolf1), c("cW2", tokens.wolf2),
	] });
	globalThis.game = {
		...saved.game,
		user: { id: "gm", isGM: true },
		users: collection([]),
		combats: collection([combat]),
		settings: { get: (scope, key) => (key === "fightTab" ? fightTabOn : undefined) },
	};
	globalThis.ui = { combat: { viewed: combat } };
	globalThis.canvas = { scene };
	const byUuid = new Map(Object.values(tokens).map(t => [t.uuid, t]));
	globalThis.fromUuidSync = uuid => byUuid.get(uuid) ?? null;
	return { scene, combat, tokens, bramActor, cadiActor, wolfActor };
}

describe("makeSeed", () => {
	it("words a party's pile-on, with two named as both and more as all", () => {
		expect(makeSeed({ count: 2, direction: "onFoe", target: "Crinwin", names: ["Bram", "Aeliana"] })).toMatchObject({
			bonus: 1, count: 2, applied: true,
			label: "+1: Bram & Aeliana are both fighting Crinwin",
			pill: "+1 for 2 attackers",
			pillLeftOff: "+1 for 2 attackers, left off",
			cite: "Book I, page 414",
		});
		expect(makeSeed({ count: 3, direction: "onFoe", target: "Crinwin", names: ["A", "B", "C"] }).label)
			.toBe("+2: A, B & C are all fighting Crinwin");
	});

	it("words foes piling onto a character", () => {
		expect(makeSeed({ count: 2, direction: "onHero", target: "Cadi", names: ["Wolf", "Wolf"] })).toMatchObject({
			bonus: 1, label: "+1: Cadi is fighting Wolf & Wolf", pill: "+1 for 2 foes",
		});
	});

	it("is nothing for a single attacker", () => {
		expect(makeSeed({ count: 1, direction: "onFoe", target: "Crinwin", names: ["Bram"] })).toBeNull();
	});
});

describe("outgoingSeed", () => {
	it("counts everyone on the targeted foe, the roller included", () => {
		const { bramActor, tokens } = fight();
		expect(outgoingSeed({ attacker: bramActor, target: { uuid: tokens.crinwin.uuid } }))
			.toMatchObject({ bonus: 1, count: 2, direction: "onFoe", target: "Crinwin", names: ["Bram", "Aeliana"] });
	});

	it("counts a roller who is not in contact, once", () => {
		const { tokens } = fight();
		const archer = fakeActor({ id: "archer", name: "Archer", type: "character" });
		expect(outgoingSeed({ attacker: archer, target: { uuid: tokens.crinwin.uuid } }))
			.toMatchObject({ bonus: 2, count: 3, names: ["Archer", "Bram", "Aeliana"] });
	});

	it("offers nothing on a foe nobody else is fighting", () => {
		const { cadiActor, tokens } = fight();
		expect(outgoingSeed({ attacker: cadiActor, target: { uuid: tokens.wolf1.uuid } })).toBeNull();
	});

	it("offers nothing with the Fight tab off, or for a target that is not a token in the fight", () => {
		const { bramActor, tokens } = fight();
		expect(outgoingSeed({ attacker: bramActor, target: { uuid: "Actor.somebody" } })).toBeNull();
		fightTabOn = false;
		expect(outgoingSeed({ attacker: bramActor, target: { uuid: tokens.crinwin.uuid } })).toBeNull();
	});

	it("offers nothing against a token standing for several foes", () => {
		const { bramActor, tokens, combat } = fight();
		combat.combatants.get("cCrin").flags["stonetop-pwd"].count = 6;
		expect(outgoingSeed({ attacker: bramActor, target: { uuid: tokens.crinwin.uuid } })).toBeNull();
	});
});

describe("incomingSeed and the foes in contact", () => {
	it("counts the foes in contact with a character", () => {
		const { cadiActor } = fight();
		expect(incomingSeed({ pc: cadiActor })).toMatchObject({ bonus: 1, direction: "onHero", target: "Cadi", names: ["Wolf", "Wolf"] });
	});

	it("offers nothing to a character facing one foe", () => {
		const { bramActor } = fight();
		expect(incomingSeed({ pc: bramActor })).toBeNull();
	});

	it("names the foes in contact as the character's enemy, token by token", () => {
		const { cadiActor, bramActor } = fight();
		expect(engagedFoeTargets(cadiActor).map(t => t.uuid)).toEqual(["Scene.scene1.Token.tW1", "Scene.scene1.Token.tW2"]);
		expect(engagedFoeTargets(bramActor)).toEqual([expect.objectContaining({ uuid: "Scene.scene1.Token.tCrin", actorId: "crinwin" })]);
		fightTabOn = false;
		expect(engagedFoeTargets(cadiActor)).toEqual([]);
	});
});

describe("sheetSeed", () => {
	it("counts the wolves on Cadi when the GM rolls a wolf's damage from its token", () => {
		const { tokens } = fight();
		const tokenActor = { ...tokens.wolf1.actor, token: tokens.wolf1 };
		expect(sheetSeed({ actor: tokenActor })).toMatchObject({ bonus: 1, direction: "onHero", target: "Cadi" });
	});

	it("offers nothing to a token fighting more than one opponent, or to a lone attacker", () => {
		const { tokens } = fight();
		expect(sheetSeed({ actor: { ...tokens.crinwin.actor, token: tokens.crinwin } })).toBeNull();
		expect(sheetSeed({ actor: { ...tokens.aeliana.actor, token: tokens.aeliana } })).toMatchObject({ bonus: 1, direction: "onFoe", target: "Crinwin" });
	});

	it("finds a linked actor's one token on the canvas scene, and gives up on several", () => {
		const { tokens, wolfActor } = fight();
		const linked = { ...tokens.aeliana.actor, getActiveTokens: () => [tokens.aeliana] };
		expect(sheetSeed({ actor: linked })).toMatchObject({ bonus: 1, target: "Crinwin" });
		const many = { ...wolfActor, getActiveTokens: () => [tokens.wolf1, tokens.wolf2] };
		expect(sheetSeed({ actor: many })).toBeNull();
	});
});
