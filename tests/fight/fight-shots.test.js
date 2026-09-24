import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { shotsFrom, recordShots, hasShots, clearShots, releaseSpentTargets, shotOnRecordAt } from "../../module/fight/fight-shots.js";
import { engagementOf, snapshotFight } from "../../module/fight/fight-state.js";
import { SYSTEM_ID } from "../../module/system-id.js";
import { fakeActor, fakeToken, fakeScene, fakeCombatant, fakeCombat, collection } from "../fakes/fight.js";

// A damage roll at somebody out of reach is kept as a shot, so a crew, a monster or the GM's archers can
// be engaged at range (Book I p.416's crew "opens fire on a horde").

let saved;
beforeEach(() => {
	saved = { game: globalThis.game, ui: globalThis.ui, canvas: globalThis.canvas, CONST: globalThis.CONST };
	globalThis.CONST = { GRID_TYPES: { GRIDLESS: 0, SQUARE: 1 } };
});
afterEach(() => { Object.assign(globalThis, saved); });

/** A crew at range from a horde, a spitting drake at range from Bram, and a wolf in Bram's face. */
function world() {
	const token = (id, col, row, actor) => Object.assign(fakeToken({ id, col, row, actor }), { uuid: `Scene.scene1.Token.${id}` });
	const crew = fakeActor({ id: "crew", type: "npc", flags: { [SYSTEM_ID]: { followerOrigin: { ftype: "crew" } } } });
	const tokens = {
		crew: token("tCrew", 0, 0, crew),
		horde: token("tHorde", 8, 0, fakeActor({ id: "horde", type: "monster" })),
		bram: token("tBram", 0, 5, fakeActor({ id: "bram", type: "character" })),
		wolf: token("tWolf", 1, 5, fakeActor({ id: "wolf", type: "monster" })),
		drake: token("tDrake", 8, 5, fakeActor({ id: "drake", type: "monster" })),
	};
	const scene = fakeScene({ tokens: Object.values(tokens) });
	const c = (id, t) => Object.assign(fakeCombatant({ id, token: t, scene }), {
		canUserModify: () => true,
		update: vi.fn(async changes => { const shots = changes[`flags.${SYSTEM_ID}.shots`]; if (shots) combatants[id].flags[SYSTEM_ID].shots = shots; }),
	});
	const combatants = {};
	for (const [id, t] of [["cCrew", tokens.crew], ["cHorde", tokens.horde], ["cBram", tokens.bram], ["cWolf", tokens.wolf], ["cDrake", tokens.drake]]) combatants[id] = c(id, t);
	const combat = fakeCombat({ scene, combatants: Object.values(combatants) });
	globalThis.game = { ...saved.game, user: { id: "gm", isGM: true, targets: new Set() }, users: collection([]), combats: collection([combat]), settings: { get: (_s, key) => (key === "fightTab" ? true : undefined) } };
	globalThis.ui = { combat: { viewed: combat } };
	globalThis.canvas = { scene, tokens: { setTargets: vi.fn() } };
	return { scene, combat, tokens, combatants, crew };
}

describe("shotsFrom", () => {
	it("keeps who a roll hit on the other side and out of reach", () => {
		const { scene, combat, combatants, tokens } = world();
		const found = engagementOf(combat, scene, combatants.cBram);
		expect(shotsFrom(found, [{ uuid: tokens.drake.uuid }, { uuid: tokens.wolf.uuid }, { uuid: tokens.crew.uuid }])).toEqual(["cDrake"]);
	});

	it("is nothing for a blow on somebody in contact", () => {
		const { scene, combat, combatants, tokens } = world();
		expect(shotsFrom(engagementOf(combat, scene, combatants.cBram), [{ uuid: tokens.wolf.uuid }])).toEqual([]);
	});
});

describe("recordShots", () => {
	it("writes a crew's volley down, and the fight then has the crew engaged with the horde", async () => {
		const { scene, combat, combatants, tokens, crew } = world();
		expect(await recordShots(crew, [{ uuid: tokens.horde.uuid }])).toEqual(["cHorde"]);
		expect(combatants.cCrew.update).toHaveBeenCalledWith({ [`flags.${SYSTEM_ID}.shots`]: ["cHorde"] });
		const { result } = snapshotFight(combat, { scene, users: [] });
		expect(result.byFighter.cCrew.shootingAt).toEqual(["cHorde"]);
		expect(result.clusters.some(cl => cl.heroIds.includes("cCrew") && cl.foeIds.includes("cHorde"))).toBe(true);
	});

	it("writes nothing when it would change nothing, or when the reader may not", async () => {
		const { combatants, tokens, crew } = world();
		combatants.cCrew.flags[SYSTEM_ID].shots = ["cHorde"];
		expect(await recordShots(crew, [{ uuid: tokens.horde.uuid }])).toBeNull();
		combatants.cCrew.canUserModify = () => false;
		expect(await recordShots(crew, [{ uuid: tokens.drake.uuid }])).toBeNull();
		expect(combatants.cCrew.update).not.toHaveBeenCalled();
	});

	it("clears a shot when the next blow lands on somebody in contact", async () => {
		const { combatants, tokens } = world();
		combatants.cBram.flags[SYSTEM_ID].shots = ["cDrake"];
		expect(await recordShots(combatants.cBram.actor, [{ uuid: tokens.wolf.uuid }])).toEqual([]);
		expect(combatants.cBram.update).toHaveBeenCalledWith({ [`flags.${SYSTEM_ID}.shots`]: [] });
	});
});

describe("clearing and releasing", () => {
	it("knows a shot on record, and clears it with an empty list", async () => {
		const { combatants } = world();
		expect(hasShots(combatants.cCrew)).toBe(false);
		expect(clearShots(combatants.cCrew)).toBeNull();
		combatants.cCrew.flags[SYSTEM_ID].shots = ["cHorde"];
		expect(hasShots(combatants.cCrew)).toBe(true);
		await clearShots(combatants.cCrew);
		expect(combatants.cCrew.update).toHaveBeenCalledWith({ [`flags.${SYSTEM_ID}.shots`]: [] });
	});

	it("knows a shot is on record at a target only once one was written, never for a blow in contact", async () => {
		const { combatants, tokens } = world();
		const bram = combatants.cBram.actor;
		expect(shotOnRecordAt(bram, [{ uuid: tokens.wolf.uuid }])).toBe(false);
		await recordShots(bram, [{ uuid: tokens.wolf.uuid }]);
		expect(shotOnRecordAt(bram, [{ uuid: tokens.wolf.uuid }])).toBe(false);
		await recordShots(bram, [{ uuid: tokens.drake.uuid }]);
		expect(shotOnRecordAt(bram, [{ uuid: tokens.drake.uuid }])).toBe(true);
		expect(shotOnRecordAt(bram, [{ uuid: tokens.wolf.uuid }])).toBe(false);
	});

	it("lets go of the reader's targets once a roll has used them, in a fight only", () => {
		world();
		globalThis.game.user.targets = new Set([{}]);
		releaseSpentTargets({ used: false });
		expect(globalThis.canvas.tokens.setTargets).not.toHaveBeenCalled();
		releaseSpentTargets({ used: true });
		expect(globalThis.canvas.tokens.setTargets).toHaveBeenCalledWith([], { mode: "replace" });
	});
});
