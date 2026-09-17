import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { spotBeside, sendAgainst } from "../../module/fight/send-against.js";
import { SYSTEM_ID } from "../../module/system-id.js";
import { fakeActor, fakeToken, fakeScene, fakeCombatant, fakeCombat, GRID } from "../fakes/fight.js";

// Dragging a foe onto a hero in the Fight tab: where the foe's token goes, and the move itself.

const sq = (col, row, w = 1, h = 1) => ({ x: col * GRID, y: row * GRID, w: w * GRID, h: h * GRID });
const grid = { size: GRID, kind: "square" };

describe("spotBeside", () => {
	it("puts the foe on the side of the hero it is coming from", () => {
		expect(spotBeside({ mover: sq(10, 5), target: sq(5, 5), grid })).toEqual({ x: 600, y: 500 });
		expect(spotBeside({ mover: sq(0, 5), target: sq(5, 5), grid })).toEqual({ x: 400, y: 500 });
		expect(spotBeside({ mover: sq(5, 0), target: sq(5, 5), grid })).toEqual({ x: 500, y: 400 });
	});

	it("never stands on another token, taking the next nearest spot", () => {
		const spot = spotBeside({ mover: sq(10, 5), target: sq(5, 5), others: [sq(6, 5)], grid });
		expect([{ x: 600, y: 400 }, { x: 600, y: 600 }]).toContainEqual(spot);
	});

	it("keeps inside the scene", () => {
		const spot = spotBeside({ mover: sq(3, -4), target: sq(0, 0), grid, sceneRect: { x: 0, y: 0, w: 2000, h: 2000 } });
		expect(spot.x).toBeGreaterThanOrEqual(0);
		expect(spot.y).toBeGreaterThanOrEqual(0);
	});

	it("gives up when the hero is surrounded", () => {
		const ring = [];
		for (let dc = -1; dc <= 1; dc += 1) for (let dr = -1; dr <= 1; dr += 1) if (dc || dr) ring.push(sq(5 + dc, 5 + dr));
		expect(spotBeside({ mover: sq(10, 5), target: sq(5, 5), others: ring, grid })).toBeNull();
	});

	it("fits a large foe against the hero without covering them", () => {
		const spot = spotBeside({ mover: sq(12, 5, 2, 2), target: sq(5, 5), grid });
		expect(spot).toEqual({ x: 600, y: 500 });
	});
});

describe("sendAgainst", () => {
	let saved;
	beforeEach(() => { saved = { game: globalThis.game, canvas: globalThis.canvas }; });
	afterEach(() => { globalThis.game = saved.game; globalThis.canvas = saved.canvas; });

	function setup({ isGM = true } = {}) {
		const tBram = fakeToken({ id: "tBram", col: 5, row: 5, actor: fakeActor({ id: "bram", type: "character" }) });
		const tWolf = fakeToken({ id: "tWolf", col: 12, row: 5, actor: fakeActor({ id: "wolf", type: "monster" }) });
		const tRock = fakeToken({ id: "tRock", col: 6, row: 5, actor: fakeActor({ id: "rock", type: "npc" }) });
		const scene = fakeScene({ tokens: [tBram, tWolf, tRock] });
		scene.moveTokens = vi.fn(async () => ({}));
		// The player plays Bram and owns nothing else; the GM owns everyone.
		const combat = fakeCombat({
			scene,
			combatants: [
				fakeCombatant({ id: "cBram", token: tBram, scene, side: "heroes", isOwner: true }),
				fakeCombatant({ id: "cWolf", token: tWolf, scene, side: "foes", isOwner: isGM }),
			],
		});
		globalThis.game = { ...saved.game, user: { id: "gm", isGM } };
		globalThis.canvas = { scene, dimensions: { sceneRect: { x: 0, y: 0, width: 4000, height: 4000 } } };
		return { scene, combat, tWolf };
	}

	it("moves the foe's token into a free square touching the hero, in one displace", async () => {
		const { scene, combat } = setup();
		expect(await sendAgainst(combat, "cWolf", "cBram", { scene })).toBe("moved");
		const move = scene.moveTokens.mock.calls[0][0].tWolf.waypoints[0];
		expect(move.action).toBe("displace");
		// East of Bram is taken by the rock, so the wolf takes a corner on that side.
		expect([{ x: 600, y: 400 }, { x: 600, y: 600 }]).toContainEqual({ x: move.x, y: move.y });
	});

	it("moves the hero instead when it is the hero who was sent", async () => {
		const { scene, combat } = setup();
		expect(await sendAgainst(combat, "cBram", "cWolf", { scene })).toBe("moved");
		const moved = scene.moveTokens.mock.calls[0][0];
		expect(Object.keys(moved)).toEqual(["tBram"]);
		// Bram comes from the west, so he arrives on the wolf's west side.
		expect(moved.tBram.waypoints[0]).toMatchObject({ action: "displace", x: 1100, y: 500 });
	});

	it("leaves a foe already in contact where it is", async () => {
		const { scene, combat, tWolf } = setup();
		tWolf._source.x = 400;
		expect(await sendAgainst(combat, "cWolf", "cBram", { scene })).toBe("already");
		expect(scene.moveTokens).not.toHaveBeenCalled();
	});

	it("lets a player throw their own character at a foe", async () => {
		const { scene, combat } = setup({ isGM: false });
		expect(await sendAgainst(combat, "cBram", "cWolf", { scene })).toBe("moved");
		expect(Object.keys(scene.moveTokens.mock.calls[0][0])).toEqual(["tBram"]);
	});

	it("moves nobody who is not the reader's to move, and nobody at their own side", async () => {
		const player = setup({ isGM: false });
		expect(await sendAgainst(player.combat, "cWolf", "cBram", { scene: player.scene })).toBe(false);
		expect(player.scene.moveTokens).not.toHaveBeenCalled();
		const gm = setup();
		gm.combat.combatants.get("cWolf").flags[SYSTEM_ID].side = "heroes";
		expect(await sendAgainst(gm.combat, "cWolf", "cBram", { scene: gm.scene })).toBe(false);
		expect(gm.scene.moveTokens).not.toHaveBeenCalled();
	});

	it("tells the GM when there is no room", async () => {
		const { scene, combat } = setup();
		const warn = vi.fn();
		const tokens = [...scene.tokens];
		for (let dc = -1; dc <= 1; dc += 1) for (let dr = -1; dr <= 1; dr += 1) {
			if (dc || dr) tokens.push(fakeToken({ id: `t${dc}${dr}`, col: 5 + dc, row: 5 + dr }));
		}
		const crowded = fakeScene({ tokens });
		crowded.moveTokens = vi.fn();
		globalThis.canvas.scene = crowded;
		for (const c of combat.combatants) c.sceneId = crowded.id;
		expect(await sendAgainst(combat, "cWolf", "cBram", { scene: crowded, notify: { warn } })).toBe("noRoom");
		expect(warn).toHaveBeenCalledWith("There is no free space next to bram.");
		expect(crowded.moveTokens).not.toHaveBeenCalled();
	});
});

