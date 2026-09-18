import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { undauntedNow, undauntedOffer, eyesLockedAgainst, lockEyes, lockEyesCandidates, LOCKED_EYES_FLAG } from "../../module/fight/hero-moves.js";
import { SYSTEM_ID } from "../../module/system-id.js";
import { fakeActor, fakeToken, fakeScene, fakeCombatant, fakeCombat, collection } from "../fakes/fight.js";

// Playbook moves the fight turns on: Undaunted and Big Damn Hero (the Would-Be Hero).

let saved;
beforeEach(() => {
	saved = { game: globalThis.game, ui: globalThis.ui, canvas: globalThis.canvas, CONST: globalThis.CONST };
	globalThis.CONST = { GRID_TYPES: { GRIDLESS: 0, SQUARE: 1 } };
});
afterEach(() => { Object.assign(globalThis, saved); });

const withMoves = (actor, moves) => Object.assign(actor, { items: moves.map(name => ({ type: "move", name })) });

/** Pim (a Would-Be Hero) at (1,1); whoever else stands where the caller puts them. */
function world(others = []) {
	const pim = withMoves(fakeActor({ id: "pim", name: "Pim", type: "character" }), ["Undaunted", "Big Damn Hero"]);
	const token = (id, col, row, actor) => Object.assign(fakeToken({ id, col, row, actor }), { uuid: `Scene.scene1.Token.${id}` });
	const tokens = { pim: token("tPim", 1, 1, pim) };
	for (const [key, col, row, actor] of others) tokens[key] = token(`t${key}`, col, row, actor);
	const scene = fakeScene({ tokens: Object.values(tokens) });
	const combatants = Object.fromEntries(Object.entries(tokens).map(([key, t]) => [key, Object.assign(fakeCombatant({ id: `c${key}`, token: t, scene }), {
		update: vi.fn(async function (changes) { this.flags[SYSTEM_ID][LOCKED_EYES_FLAG] = changes[`flags.${SYSTEM_ID}.${LOCKED_EYES_FLAG}`]; }),
	})]));
	const combat = fakeCombat({ scene, combatants: Object.values(combatants) });
	globalThis.game = { ...saved.game, user: { id: "gm", isGM: true }, users: collection([]), combats: collection([combat]), settings: { get: (_s, key) => (key === "fightTab" ? true : undefined) } };
	globalThis.ui = { combat: { viewed: combat } };
	globalThis.canvas = { scene };
	return { pim, tokens, combatants };
}

const wolf = (id = "wolf") => fakeActor({ id, name: "Wolf", type: "monster" });

describe("Undaunted", () => {
	it("is off against one foe their size", () => {
		const { pim } = world([["w", 2, 1, wolf()]]);
		expect(undauntedNow(pim)).toBeNull();
		expect(undauntedOffer(pim)).toBeNull();
	});

	it("is on when they are outnumbered", () => {
		const { pim } = world([["w1", 2, 1, wolf("w1")], ["w2", 0, 1, wolf("w2")]]);
		expect(undauntedNow(pim)).toBe("outnumbered");
		expect(undauntedOffer(pim)).toMatchObject({ key: "undaunted", dice: "1d6", label: "Undaunted: +1d6 damage, while you are outnumbered", pill: "Undaunted +1d6", applied: true });
	});

	it("is on facing a foe bigger than them", () => {
		const drake = fakeActor({ id: "drake", name: "Drake", type: "monster", system: { size: "large" } });
		const { pim } = world([["d", 2, 1, drake]]);
		expect(undauntedNow(pim)).toBe("bigger");
	});

	it("is off for a character without the move", () => {
		const { pim } = world([["w1", 2, 1, wolf("w1")], ["w2", 0, 1, wolf("w2")]]);
		pim.items = [];
		expect(undauntedNow(pim)).toBeNull();
	});
});

describe("Big Damn Hero", () => {
	it("locks eyes with a foe they are fighting, once", async () => {
		const { pim, combatants } = world([["w", 2, 1, wolf()]]);
		expect(lockEyesCandidates(pim).map(c => c.id)).toEqual(["cw"]);
		expect(await lockEyes(pim, "cw")).toBe(true);
		expect(combatants.pim.flags[SYSTEM_ID][LOCKED_EYES_FLAG]).toEqual(["cw"]);
		expect(await lockEyes(pim, "cw")).toBe(false);
		expect(lockEyesCandidates(pim)).toEqual([]);
	});

	it("puts that foe's damage against the hero and whoever stands beside them at disadvantage, and nobody else", () => {
		const cadi = fakeActor({ id: "cadi", name: "Cadi", type: "character" });
		const far = fakeActor({ id: "far", name: "Far", type: "character" });
		const { tokens, combatants } = world([["w", 2, 1, wolf()], ["cadi", 1, 2, cadi], ["far", 8, 8, far]]);
		combatants.pim.flags[SYSTEM_ID][LOCKED_EYES_FLAG] = ["cw"];
		const foe = { ...tokens.w.actor, token: tokens.w };
		expect(eyesLockedAgainst(foe, [{ uuid: tokens.pim.uuid }])).toEqual(["Pim"]);
		expect(eyesLockedAgainst(foe, [{ uuid: tokens.cadi.uuid }])).toEqual(["Pim"]);
		expect(eyesLockedAgainst(foe, [{ uuid: tokens.far.uuid }])).toEqual([]);
		combatants.pim.flags[SYSTEM_ID][LOCKED_EYES_FLAG] = [];
		expect(eyesLockedAgainst(foe, [{ uuid: tokens.pim.uuid }])).toEqual([]);
	});
});
