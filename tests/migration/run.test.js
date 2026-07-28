import { describe, it, expect, vi } from "vitest";
import { previewMigration, prepareWorld, flipAndShutDown, allTargets, worldSettingDocs } from "../../module/migration/run.js";
import { CUTOVER_KEY } from "../../module/system-id.js";
import { OLD_ID as OLD, NEW_ID as NEW, MIGRATION_IDS as IDS, collection, FakeStorage, makeGame } from "../fakes/migration.js";

const fetchOk = () => vi.fn(async (url) => {
	if (String(url).includes("system.json")) return { ok: true, json: async () => ({ id: NEW, compatibility: { minimum: "13" } }) };
	if (String(url).includes("world.json")) return { ok: true, json: async () => ({ system: NEW }) };
	return { ok: true, json: async () => ({ system: { id: NEW } }) };
});

describe("worldSettingDocs", () => {
	it("reads the world settings collection directly", () => {
		expect(worldSettingDocs(makeGame())).toHaveLength(1);
	});

	it("tolerates a world with no settings storage", () => {
		expect(worldSettingDocs({})).toEqual([]);
	});
});

describe("previewMigration", () => {
	it("counts pending work without writing anything", async () => {
		const game = makeGame();
		const report = await previewMigration(game, IDS);

		expect(report.documents).toBe(1);
		expect(report.settings).toBe(1);
		expect(game.actors.documentClass.updateDocuments).not.toHaveBeenCalled();
	});

	it("reports already-migrated documents separately", async () => {
		const actors = Object.assign(
			collection([{ _id: "a1", flags: { [OLD]: { herd: 1 }, [NEW]: { herd: 1, [CUTOVER_KEY]: OLD } } }]),
			{ invalidDocumentIds: new Set() }
		);
		const report = await previewMigration(makeGame({ actors }), IDS);
		expect(report).toMatchObject({ documents: 0, alreadyDone: 1 });
	});
});

describe("prepareWorld", () => {
	it("copies flags, settings and localStorage", async () => {
		const game = makeGame();
		const storage = new FakeStorage({ [`${OLD}.tabOrder`]: "[1]" });
		const result = await prepareWorld(game, { storage, ...IDS });

		expect(result.documents).toBe(1);
		expect(result.settings.created).toBe(1);
		expect(result.local.copied).toBe(1);
		expect(game.actors.documentClass.updateDocuments).toHaveBeenCalled();
	});

	it("writes the new scope additively, leaving the old one intact", async () => {
		const game = makeGame();
		await prepareWorld(game, { storage: new FakeStorage(), ...IDS });
		const [updates] = game.actors.documentClass.updateDocuments.mock.calls[0];
		expect(updates[0].flags[NEW]).toEqual({ herd: 1, [CUTOVER_KEY]: OLD });
		expect(updates[0].flags[OLD]).toBeUndefined();
	});

	it("reports progress per location", async () => {
		const seen = [];
		await prepareWorld(makeGame(), { storage: new FakeStorage(), onProgress: (p) => seen.push(p.phase), ...IDS });
		expect(seen).toContain("documents");
		expect(seen).toContain("settings");
	});

	it("does not touch world.json", async () => {
		const fetchImpl = vi.fn();
		await prepareWorld(makeGame(), { storage: new FakeStorage(), fetchImpl, ...IDS });
		expect(fetchImpl).not.toHaveBeenCalled();
	});
});

describe("flipAndShutDown", () => {
	it("flips, verifies, then shuts down", async () => {
		const game = makeGame();
		const result = await flipAndShutDown(game, { fetchImpl: fetchOk(), ...IDS, wait: async () => {} });
		expect(result).toEqual({ ok: true, stage: "done" });
		expect(game.shutDown).toHaveBeenCalled();
	});

	it("stops at the flip when the server refuses", async () => {
		const fetchImpl = vi.fn(async (url) => (String(url).includes("world.json")
			? { ok: true, json: async () => ({ system: NEW }) }
			: { ok: true, json: async () => ({ error: "not available for use!" }) }));
		const game = makeGame();
		const result = await flipAndShutDown(game, { fetchImpl, ...IDS, wait: async () => {} });

		expect(result).toMatchObject({ ok: false, stage: "flip" });
		expect(game.shutDown).not.toHaveBeenCalled();
	});

	// world.json is already correct at this point, so this is not a failed migration.
	it("still reports success when only the shutdown fails", async () => {
		const game = makeGame({ shutDown: vi.fn().mockRejectedValue(new Error("no")) });
		const result = await flipAndShutDown(game, { fetchImpl: fetchOk(), ...IDS, wait: async () => {} });
		expect(result.ok).toBe(true);
		expect(result.warning).toMatch(/do not keep playing/i);
	});

	// game.shutDown() resolves normally when the GM declines its confirm, so this path
	// previously reported a clean "done" while the session ran on past the flip.
	it("surfaces a declined shutdown as a stop sign rather than a silent success", async () => {
		const game = makeGame({ shutDown: vi.fn().mockResolvedValue(), ready: true, socket: { connected: true } });
		const result = await flipAndShutDown(game, { fetchImpl: fetchOk(), ...IDS, wait: async () => {} });

		expect(result.stage).toBe("shutdown");
		expect(result.warning).toMatch(/do not keep playing/i);
	});

	// The flip already landed by this point: the server echoed the applied system back.
	// Treating a failed read-back as a failed migration would skip the shutdown and leave
	// the session running past a one-way door, and on a hosted provider that read-back is
	// the request most likely to be unavailable.
	it("still shuts down when the change cannot be read back, and says so", async () => {
		const fetchImpl = vi.fn(async (url) => (String(url).includes("world.json")
			? { ok: false }
			: { ok: true, json: async () => ({ system: { id: NEW } }) }));
		const game = makeGame();
		const result = await flipAndShutDown(game, { fetchImpl, ...IDS, wait: async () => {} });

		expect(result.ok).toBe(true);
		expect(game.shutDown).toHaveBeenCalled();
		expect(result.warning).toMatch(/could not be read back/i);
	});

	it("reports the flip itself failing, and does not shut down", async () => {
		const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ error: "refused" }) }));
		const game = makeGame();
		const result = await flipAndShutDown(game, { fetchImpl, ...IDS, wait: async () => {} });

		expect(result).toMatchObject({ ok: false, stage: "flip" });
		expect(game.shutDown).not.toHaveBeenCalled();
	});
});

// The preview and the run must never disagree about what the migration covers, which is
// only guaranteed while both read the same target list.
describe("allTargets", () => {
	it("is the list both previewMigration and prepareWorld walk", async () => {
		const game = makeGame();
		const targets = await allTargets(game);
		const preview = await previewMigration(game, IDS);
		const prepared = await prepareWorld(game, { storage: new FakeStorage(), ...IDS });

		expect(preview.locations).toBe(targets.length);
		expect(prepared.locations).toBe(targets.length);
	});

	// Building the list loads every document of every unlocked world pack, so the assistant
	// scans once and hands the same list to the preview and then to the run.
	it("is reused when a caller supplies it, instead of being rebuilt", async () => {
		const pack = {
			metadata: { packageType: "world", label: "Homebrew" },
			locked: false,
			collection: "world.homebrew",
			documentClass: { updateDocuments: vi.fn().mockResolvedValue([]) },
			getDocuments: vi.fn(async () => [{ _id: "p1", flags: { [OLD]: { x: 1 } } }])
		};
		const game = makeGame({ packs: [pack] });
		const targets = await allTargets(game);
		pack.getDocuments.mockClear();

		await previewMigration(game, { ...IDS, targets });
		await prepareWorld(game, { ...IDS, targets, storage: new FakeStorage() });
		expect(pack.getDocuments).not.toHaveBeenCalled();
	});

	it("includes unlocked world-level compendium packs", async () => {
		const pack = {
			metadata: { packageType: "world", label: "Homebrew" },
			locked: false,
			collection: "world.homebrew",
			documentClass: { updateDocuments: vi.fn().mockResolvedValue([]) },
			getDocuments: async () => [{ _id: "p1", flags: { [OLD]: { x: 1 } } }]
		};
		const targets = await allTargets(makeGame({ packs: [pack] }));
		expect(targets.map(t => t.label)).toContain("Compendium: Homebrew");
	});
});
