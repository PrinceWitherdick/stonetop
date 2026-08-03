import { describe, it, expect, vi } from "vitest";
import { rewriteCoreSettings, scanResiduals, runFinishOnce, FINISH_SETTING } from "../../module/migration/finish-run.js";

const SYSTEM = "renamed-sys";
const OLD = "legacy-sys";
const IDS = { systemId: SYSTEM, priorIds: [OLD] };

function makeSettings(values = {}) {
	const store = { ...values };
	return {
		store,
		get: vi.fn((ns, key) => store[`${ns}.${key}`]),
		set: vi.fn(async (ns, key, value) => { store[`${ns}.${key}`] = value; })
	};
}

const target = (label, docs) => ({ label, docs, apply: vi.fn().mockResolvedValue([]) });

describe("rewriteCoreSettings", () => {
	// A stale entry here does not merely lose the GM's choice: it suppresses makeDefault
	// on the newly registered sheets, so actors open on Foundry's generic sheet.
	it("re-keys sheet classes onto the active id", async () => {
		const settings = makeSettings({ "core.sheetClasses": { Actor: { character: `${OLD}.StonetopCharacterSheet` } } });
		const result = await rewriteCoreSettings({ settings }, IDS);

		expect(result.changed).toContain("core.sheetClasses");
		expect(settings.store["core.sheetClasses"].Actor.character).toBe(`${SYSTEM}.StonetopCharacterSheet`);
	});

	it("re-keys compendium configuration", async () => {
		const settings = makeSettings({ "core.compendiumConfiguration": { [`${OLD}.stonetop-items`]: { locked: true } } });
		const result = await rewriteCoreSettings({ settings }, IDS);

		expect(result.changed).toContain("core.compendiumConfiguration");
		expect(settings.store["core.compendiumConfiguration"][`${SYSTEM}.stonetop-items`]).toEqual({ locked: true });
	});

	it("writes nothing when both settings are already current", async () => {
		const settings = makeSettings({
			"core.sheetClasses": { Actor: { character: `${SYSTEM}.StonetopCharacterSheet` } },
			"core.compendiumConfiguration": { "core.x": {} }
		});
		const result = await rewriteCoreSettings({ settings }, IDS);
		expect(result.changed).toEqual([]);
		expect(settings.set).not.toHaveBeenCalled();
	});

	it("tolerates a world where the settings are absent", async () => {
		const settings = makeSettings();
		await expect(rewriteCoreSettings({ settings }, IDS)).resolves.toEqual({ changed: [] });
	});
});

describe("scanResiduals", () => {
	it("totals leftovers and names the worst offenders", async () => {
		const targets = [
			target("Journals", [{ text: `systems/${OLD}/a.webp systems/${OLD}/b.webp` }]),
			target("Actors", [{ img: `Compendium.${OLD}.stonetop-items.Item.x` }]),
			target("Clean", [{ img: `systems/${SYSTEM}/a.webp` }])
		];
		const result = await scanResiduals(targets, { systemIds: [SYSTEM, OLD], systemId: SYSTEM });

		expect(result.total).toBe(3);
		expect(result.worst[0]).toEqual({ label: "Journals", count: 2 });
		expect(result.worst.map(w => w.label)).not.toContain("Clean");
	});

	it("is zero for a fully swept world", async () => {
		const targets = [target("Actors", [{ img: `systems/${SYSTEM}/a.webp` }])];
		await expect(scanResiduals(targets, { systemIds: [SYSTEM, OLD], systemId: SYSTEM }))
			.resolves.toEqual({ total: 0, worst: [] });
	});

	// The bar has to cross every target, not just the ones that turn out to be dirty: a clean
	// world does the same full walk and would otherwise show nothing at all.
	it("reports a fraction for every target, clean ones included", async () => {
		const targets = [
			target("Journals", [{ text: `systems/${OLD}/a.webp` }]),
			target("Clean", [{ img: `systems/${SYSTEM}/a.webp` }])
		];
		const seen = [];
		await scanResiduals(targets, { systemIds: [SYSTEM, OLD], systemId: SYSTEM, onProgress: p => seen.push(p) });

		expect(seen).toEqual([
			{ fraction: 0.5, detail: "Journals" },
			{ fraction: 1, detail: "Clean" }
		]);
	});
});

describe("runFinishOnce", () => {
	const world = (docs) => ({
		settings: makeSettings(),
		actors: Object.assign([...docs], { documentClass: { updateDocuments: vi.fn().mockResolvedValue([]) } }),
		packs: []
	});

	it("does nothing when this system has never been renamed", async () => {
		const result = await runFinishOnce(world([]), { ...IDS, priorIds: [] });
		expect(result).toEqual({ ran: false, reason: "no-prior-ids" });
	});

	// Two connected GMs must not both sweep the same world.
	it("defers to the primary GM", async () => {
		const result = await runFinishOnce(world([]), { ...IDS, canRun: () => false });
		expect(result).toEqual({ ran: false, reason: "not-primary-gm" });
	});

	// isPrimaryGM() is true when NO GM is connected, so the caller's gate must also test
	// isGM or a lone player runs the whole sweep and then fails on the world write.
	it("does not sweep for a player, even one alone in the world", async () => {
		const g = world([{ _id: "a1", img: `systems/${OLD}/a.webp` }]);
		const result = await runFinishOnce(g, { ...IDS, canRun: () => false });
		expect(result.ran).toBe(false);
		expect(g.actors.documentClass.updateDocuments).not.toHaveBeenCalled();
	});

	it("skips a world already swept for this id", async () => {
		const result = await runFinishOnce(world([]), { ...IDS, read: () => SYSTEM });
		expect(result).toEqual({ ran: false, reason: "already-done" });
	});

	// The stamp stores an id, not a boolean, so a later rename sweeps again.
	it("still runs when the stamp names an older id", async () => {
		const g = world([{ _id: "a1", img: `systems/${OLD}/a.webp` }]);
		const write = vi.fn();
		const result = await runFinishOnce(g, { ...IDS, read: () => OLD, write });

		expect(result.ran).toBe(true);
		expect(write).toHaveBeenCalledWith(SYSTEM);
	});

	it("rewrites documents and stamps completion", async () => {
		const g = world([{ _id: "a1", img: `systems/${OLD}/a.webp` }]);
		const write = vi.fn();
		const result = await runFinishOnce(g, { ...IDS, write });

		expect(result.ran).toBe(true);
		expect(result.documents).toBe(1);
		expect(result.residual.total).toBe(0);
		expect(write).toHaveBeenCalledWith(SYSTEM);
		expect(g.actors.documentClass.updateDocuments).toHaveBeenCalled();
	});

	it("asks for a reload only when sheet classes moved", async () => {
		const plain = world([]);
		expect((await runFinishOnce(plain, { ...IDS })).needsReload).toBe(false);

		const withSheets = world([]);
		withSheets.settings = makeSettings({ "core.sheetClasses": { Actor: { character: `${OLD}.Sheet` } } });
		expect((await runFinishOnce(withSheets, { ...IDS })).needsReload).toBe(true);
	});

	it("exposes the setting key it stamps", () => {
		expect(FINISH_SETTING).toBe("idMigrationFinishedFor");
	});
});
