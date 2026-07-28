import { describe, it, expect, vi } from "vitest";
import { collectTargets, collectWorldPackTargets, WORLD_COLLECTIONS, ACTOR_FLAG_OPTIONS } from "../../module/migration/world-scan.js";
import { LEGACY_FLAG_SCOPES } from "../../module/system-id.js";
import { collection } from "../fakes/migration.js";

const labelsOf = (targets) => targets.map(t => t.label);

describe("collectTargets", () => {
	it("returns one target per non-empty world collection", () => {
		const game = {
			actors: collection([{ id: "a1", name: "Ari" }]),
			items: collection([{ id: "i1" }]),
			journal: collection([])
		};
		expect(labelsOf(collectTargets(game))).toEqual(["Actors", "Items"]);
	});

	it("skips collections the world does not have", () => {
		expect(collectTargets({})).toEqual([]);
		expect(collectTargets(undefined)).toEqual([]);
	});

	it("writes through the collection's documentClass with renders suppressed", async () => {
		const documentClass = { updateDocuments: vi.fn().mockResolvedValue([]) };
		const game = { actors: collection([{ id: "a1" }], documentClass) };
		const [target] = collectTargets(game);

		await target.apply([{ _id: "a1", flags: {} }]);
		expect(documentClass.updateDocuments).toHaveBeenCalledWith(
			[{ _id: "a1", flags: {} }],
			{ render: false, diff: false }
		);
	});

	it("walks embedded Items on actors", async () => {
		const actor = {
			id: "a1",
			name: "Ari",
			items: [{ id: "i1" }, { id: "i2" }],
			updateEmbeddedDocuments: vi.fn().mockResolvedValue([])
		};
		const targets = collectTargets({ actors: collection([actor]) });
		const embedded = targets.find(t => t.label === "Ari › Item");

		expect(embedded.docs).toHaveLength(2);
		await embedded.apply([{ _id: "i1" }]);
		expect(actor.updateEmbeddedDocuments).toHaveBeenCalledWith("Item", [{ _id: "i1" }], { render: false, diff: false });
	});

	it("walks journal pages", () => {
		const entry = { id: "j1", name: "Lore", pages: [{ id: "p1" }], updateEmbeddedDocuments: vi.fn() };
		const targets = collectTargets({ journal: collection([entry]) });
		expect(labelsOf(targets)).toContain("Lore › JournalEntryPage");
	});

	it("walks scene notes, which is where map-pin data lives", () => {
		const scene = { id: "s1", name: "Stonetop", notes: [{ id: "n1" }], updateEmbeddedDocuments: vi.fn() };
		const targets = collectTargets({ scenes: collection([scene]) });
		expect(labelsOf(targets)).toContain("Stonetop › Note");
	});

	// An unlinked token holds a full copy of the actor's flags in its delta.
	it("walks the ActorDelta of unlinked tokens", async () => {
		const token = {
			id: "t1",
			name: "Wolf",
			delta: { _id: "t1", flags: { stonetop_pwd: { hp: 3 } } },
			update: vi.fn().mockResolvedValue({})
		};
		const scene = { id: "s1", name: "Wild", tokens: [token], updateEmbeddedDocuments: vi.fn() };
		const targets = collectTargets({ scenes: collection([scene]) });
		const deltaTarget = targets.find(t => t.label === "Wild › Wolf › ActorDelta");

		expect(deltaTarget.docs).toEqual([token.delta]);
		await deltaTarget.apply([{ _id: "t1", flags: { x: 1 } }]);
		expect(token.update).toHaveBeenCalled();
	});

	// The delta is addressed through its token; an `_id: undefined` key still reaches the
	// schema, so it has to be dropped rather than blanked.
	it("sends the ActorDelta update without an _id", async () => {
		const token = {
			id: "t1",
			name: "Wolf",
			delta: { _id: "t1", flags: { stonetop_pwd: { hp: 3 } } },
			update: vi.fn().mockResolvedValue({})
		};
		const scene = { id: "s1", name: "Wild", tokens: [token], updateEmbeddedDocuments: vi.fn() };
		const [target] = collectTargets({ scenes: collection([scene]) }).filter(t => t.label.includes("ActorDelta"));

		await target.apply([{ _id: "t1", flags: { x: 1 } }]);
		const [payload] = token.update.mock.calls[0];
		expect(payload.delta).toEqual({ flags: { x: 1 } });
		expect("_id" in payload.delta).toBe(false);
	});

	it("ignores tokens with no delta flags", () => {
		const scene = { id: "s1", name: "Wild", tokens: [{ id: "t1", delta: null }], updateEmbeddedDocuments: vi.fn() };
		const targets = collectTargets({ scenes: collection([scene]) });
		expect(labelsOf(targets).some(l => l.includes("ActorDelta"))).toBe(false);
	});

	it("covers every collection listed in WORLD_COLLECTIONS", () => {
		const game = {};
		for (const [, key] of WORLD_COLLECTIONS) game[key] = collection([{ id: `${key}-1` }]);
		expect(collectTargets(game)).toHaveLength(WORLD_COLLECTIONS.length);
	});
});

// Actors are the only documents read through StonetopFlags/resolvedFlags, so they are the
// only ones whose fallback rungs must be folded into the copy. Applying it wider would
// duplicate ITEM_FLAG_SCOPE content, which shares the "stonetop" spelling but is live.
describe("per-target flag options", () => {
	it("folds the legacy rungs for actors", () => {
		const [actors] = collectTargets({ actors: collection([{ id: "a1" }]) });
		expect(actors.flagOptions).toBe(ACTOR_FLAG_OPTIONS);
		expect(ACTOR_FLAG_OPTIONS.legacyScopes).toBe(LEGACY_FLAG_SCOPES);
	});

	it("folds them for an unlinked token's ActorDelta too", () => {
		const token = { id: "t1", name: "Wolf", delta: { flags: { x: 1 } }, update: vi.fn() };
		const scene = { id: "s1", name: "Wild", tokens: [token], updateEmbeddedDocuments: vi.fn() };
		const target = collectTargets({ scenes: collection([scene]) }).find(t => t.label.includes("ActorDelta"));
		expect(target.flagOptions).toBe(ACTOR_FLAG_OPTIONS);
	});

	it("leaves every other target alone", () => {
		const actor = { id: "a1", name: "Ari", items: [{ id: "i1" }], updateEmbeddedDocuments: vi.fn() };
		const game = { actors: collection([actor]), items: collection([{ id: "i2" }]), journal: collection([{ id: "j1" }]) };
		const folded = collectTargets(game).filter(t => t.flagOptions);
		expect(folded.map(t => t.label)).toEqual(["Actors"]);
	});
});

describe("collectWorldPackTargets", () => {
	const pack = (packageType, docs, extra = {}) => ({
		metadata: { packageType, label: "Homebrew" },
		collection: "world.homebrew",
		documentClass: { updateDocuments: vi.fn().mockResolvedValue([]) },
		getDocuments: vi.fn().mockResolvedValue(docs),
		...extra
	});

	it("includes world-level packs", async () => {
		const targets = await collectWorldPackTargets({ packs: [pack("world", [{ id: "d1" }])] });
		expect(labelsOf(targets)).toEqual(["Compendium: Homebrew"]);
	});

	it("excludes packs shipped by the system or a module", async () => {
		const targets = await collectWorldPackTargets({ packs: [pack("system", [{ id: "d1" }]), pack("module", [{ id: "d2" }])] });
		expect(targets).toEqual([]);
	});

	it("skips locked packs rather than failing on them", async () => {
		const targets = await collectWorldPackTargets({ packs: [pack("world", [{ id: "d1" }], { locked: true })] });
		expect(targets).toEqual([]);
	});

	it("routes writes through the pack", async () => {
		const p = pack("world", [{ id: "d1" }]);
		const [target] = await collectWorldPackTargets({ packs: [p] });
		await target.apply([{ _id: "d1" }]);
		expect(p.documentClass.updateDocuments).toHaveBeenCalledWith([{ _id: "d1" }], { render: false, pack: "world.homebrew" });
	});

	it("tolerates a world with no packs", async () => {
		expect(await collectWorldPackTargets({})).toEqual([]);
	});
});
