import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import {
	moveRefreshUpdate, packEntryFor, packMovesByName, refreshHeldMoves,
} from "../../module/migration/move-refresh.js";
import { ITEMS_PACK } from "../../module/system-id.js";
import { resetPackIndexFields } from "../../module/utils/pack-index.js";

// Moves characters already hold, brought up to the fields the pack has gained since they were taken.

const SCOPE = "stonetop-pwd";
const move = (name, system = {}, extra = {}) => ({ _id: `id-${name}`, type: "move", name, system, flags: {}, ...extra });
const entry = (name, system = {}) => ({ name, type: "move", system });

describe("moveRefreshUpdate", () => {
	it("fills a track and a no-XP miss the held copy lacks", () => {
		const update = moveRefreshUpdate(move("Battle Joy"), entry("Battle Joy", { noXpOnMiss: true, resource: { max: 2, title: "Joy" } }));
		expect(update).toEqual({ _id: "id-Battle Joy", "system.noXpOnMiss": true, "system.resource": { max: 2, title: "Joy" } });
	});

	it("leaves a field the copy already has, whatever the pack says", () => {
		const held = move("Stentorian", { resource: { max: 2, title: "Orders" } });
		expect(moveRefreshUpdate(held, entry("Stentorian", { resource: { max: 2, title: "Command" } }))).toBeNull();
	});

	it("counts an empty track and an explicit false as missing", () => {
		const held = move("Battle Joy", { resource: { max: 0 }, noXpOnMiss: false });
		expect(moveRefreshUpdate(held, entry("Battle Joy", { noXpOnMiss: true, resource: { max: 1 } })))
			.toMatchObject({ "system.noXpOnMiss": true, "system.resource": { max: 1 } });
	});

	it("never touches a player's own move, or a move the pack does not know", () => {
		const custom = move("Stentorian", {}, { flags: { [SCOPE]: { custom: true } } });
		expect(moveRefreshUpdate(custom, entry("Stentorian", { resource: { max: 2 } }))).toBeNull();
		expect(moveRefreshUpdate(move("Stentorian"), null)).toBeNull();
	});

	// The Ranger's: Pack Horse's +1 load (a stale copy read 3/6/9) and Walk It Off's one box, off the pack source.
	it("fills Pack Horse's load bonus and Walk It Off's box on copies taken before they shipped", () => {
		const source = file => JSON.parse(readFileSync(new URL(`../../packs/src/stonetop-items/playbook-moves/the-ranger/${file}`, import.meta.url), "utf8"));
		const packHorse = source("pack-horse.json");
		const walkItOff = source("walk-it-off.json");
		expect(moveRefreshUpdate(move("Pack Horse", { playbook: "The Ranger" }), packHorse))
			.toEqual({ _id: "id-Pack Horse", "system.loadBonus": 1 });
		expect(moveRefreshUpdate(move("Walk It Off", { playbook: "The Ranger" }), walkItOff))
			.toEqual({ _id: "id-Walk It Off", "system.resource": { max: 1, title: "Marked" } });
		expect(moveRefreshUpdate(move("Pack Horse", { loadBonus: 1 }), packHorse)).toBeNull();
	});

	it("hands out a copy, never the pack's own object", () => {
		const resource = { max: 2 };
		const update = moveRefreshUpdate(move("Stentorian"), entry("Stentorian", { resource }));
		expect(update["system.resource"]).toEqual(resource);
		expect(update["system.resource"]).not.toBe(resource);
	});
});

describe("packEntryFor", () => {
	it("tells two playbooks' moves of one name apart by playbook", () => {
		const byName = packMovesByName([
			entry("Twin", { playbook: "The Fox" }), entry("Twin", { playbook: "The Heavy" }), entry("Lone"),
			{ name: "Twin", type: "equipment" },
		]);
		expect(packEntryFor(move("Twin", { playbook: "The Heavy" }), byName).system.playbook).toBe("The Heavy");
		expect(packEntryFor(move("Twin", { playbook: "The Seeker" }), byName)).toBeNull();
		expect(packEntryFor(move("Lone"), byName).name).toBe("Lone");
	});
});

describe("refreshHeldMoves", () => {
	const character = items => ({ type: "character", items, updateEmbeddedDocuments: vi.fn(async () => {}) });

	it("writes each character with something stale once, and skips everyone else", async () => {
		const stale = character([move("Stentorian"), move("Clash")]);
		const fresh = character([move("Stentorian", { resource: { max: 2 } })]);
		const npc = { type: "npc", items: [move("Stentorian")], updateEmbeddedDocuments: vi.fn() };
		const entries = [entry("Stentorian", { resource: { max: 2, title: "Command" } }), entry("Clash")];
		expect(await refreshHeldMoves({ actors: [stale, fresh, npc], entries })).toBe(1);
		expect(stale.updateEmbeddedDocuments).toHaveBeenCalledWith("Item", [
			{ _id: "id-Stentorian", "system.resource": { max: 2, title: "Command" } },
		]);
		expect(fresh.updateEmbeddedDocuments).not.toHaveBeenCalled();
		expect(npc.updateEmbeddedDocuments).not.toHaveBeenCalled();
	});

	describe("reading the pack", () => {
		let savedPacks;
		beforeEach(() => { savedPacks = globalThis.game.packs; resetPackIndexFields(); });
		afterEach(() => { globalThis.game.packs = savedPacks; resetPackIndexFields(); });

		it("reads the items pack's index", async () => {
			const index = [entry("Stentorian", { resource: { max: 2 } })];
			globalThis.game.packs = new Map([[ITEMS_PACK, { index, getIndex: vi.fn(async () => index) }]]);
			const stale = character([move("Stentorian")]);
			expect(await refreshHeldMoves({ actors: [stale] })).toBe(1);
		});

		// Thrown, so the once-per-version gate retries on the next load rather than stamping a sweep
		// that never looked.
		it("throws with no pack to read", async () => {
			globalThis.game.packs = new Map();
			await expect(refreshHeldMoves({ actors: [] })).rejects.toThrow(/not available/);
		});
	});
});
