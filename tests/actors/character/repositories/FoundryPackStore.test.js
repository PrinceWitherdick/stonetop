import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { FoundryPackStore } from "../../../../module/actors/character/repositories/FoundryPackStore.js";
import { resetPackIndexFields } from "../../../../module/utils/pack-index.js";

// -- Helpers ------------------------------------------------------------------

const ENTRY_A = { _id: "id001", system: { slug: "alpha" } };
const ENTRY_B = { _id: "id002", system: { slug: "beta" } };
const DOC_A   = { name: "Alpha Doc", system: { slug: "alpha" } };

function makePack(entries = [], docsById = {}) {
	return {
		getIndex:    vi.fn(async () => {}),
		index:       entries,
		getDocument: vi.fn(async (id) => docsById[id] ?? null),
	};
}

function stubGame(pack) {
	vi.stubGlobal("game", { packs: { get: () => pack } });
}

function stubGameNoPack() {
	vi.stubGlobal("game", { packs: { get: () => null } });
}

// The per-pack field union is remembered across calls, so each test starts from an empty registry.
beforeEach(() => resetPackIndexFields());
afterEach(() => vi.unstubAllGlobals());

// -- Tests --------------------------------------------------------------------

describe("FoundryPackStore", () => {
	describe("findEntry", () => {
		it("returns null when pack not registered", async () => {
			stubGameNoPack();
			const store = new FoundryPackStore("stonetop.test", ["system.slug"]);
			expect(await store.findEntry(e => e.system?.slug === "alpha")).toBeNull();
		});

		it("returns null when no entry matches predicate", async () => {
			stubGame(makePack([ENTRY_A], {}));
			const store = new FoundryPackStore("stonetop.test", ["system.slug"]);
			expect(await store.findEntry(e => e.system?.slug === "missing")).toBeNull();
		});

		it("returns matching entry", async () => {
			stubGame(makePack([ENTRY_A, ENTRY_B], {}));
			const store  = new FoundryPackStore("stonetop.test", ["system.slug"]);
			const result = await store.findEntry(e => e.system?.slug === "beta");
			expect(result).toEqual(ENTRY_B);
		});
	});

	describe("filterEntries", () => {
		it("returns [] when pack not registered", async () => {
			stubGameNoPack();
			const store = new FoundryPackStore("stonetop.test", ["system.slug"]);
			expect(await store.filterEntries(() => true)).toEqual([]);
		});

		it("returns only entries matching predicate", async () => {
			stubGame(makePack([ENTRY_A, ENTRY_B], {}));
			const store   = new FoundryPackStore("stonetop.test", ["system.slug"]);
			const results = await store.filterEntries(e => e.system?.slug === "alpha");
			expect(results).toHaveLength(1);
			expect(results[0]).toEqual(ENTRY_A);
		});

		it("returns all entries when predicate always true", async () => {
			stubGame(makePack([ENTRY_A, ENTRY_B], {}));
			const store = new FoundryPackStore("stonetop.test", ["system.slug"]);
			expect(await store.filterEntries(() => true)).toHaveLength(2);
		});
	});

	describe("getAll", () => {
		it("returns [] when pack not registered", async () => {
			stubGameNoPack();
			const store = new FoundryPackStore("stonetop.test", ["system.slug"]);
			expect(await store.getAll()).toEqual([]);
		});

		it("returns all index entries", async () => {
			stubGame(makePack([ENTRY_A, ENTRY_B], {}));
			const store = new FoundryPackStore("stonetop.test", ["system.slug"]);
			expect(await store.getAll()).toHaveLength(2);
		});
	});

	describe("getDocument", () => {
		it("returns null when pack not registered", async () => {
			stubGameNoPack();
			const store = new FoundryPackStore("stonetop.test", ["system.slug"]);
			expect(await store.getDocument("id001")).toBeNull();
		});

		it("returns the document by id", async () => {
			stubGame(makePack([ENTRY_A], { id001: DOC_A }));
			const store = new FoundryPackStore("stonetop.test", ["system.slug"]);
			expect(await store.getDocument("id001")).toEqual(DOC_A);
		});
	});

	describe("getIndex (via _ensureIndexed)", () => {
		it("passes the configured fields to getIndex", async () => {
			const pack = makePack([], {});
			stubGame(pack);
			const store = new FoundryPackStore("stonetop.test", ["system.slug", "system.name"]);
			await store.findEntry(() => false);
			expect(pack.getIndex).toHaveBeenCalledWith({ fields: ["system.slug", "system.name"] });
		});

		// Deliberately NOT "only once": the pack is asked on every query, because a getIndex it has
		// already covered returns without a round trip, while one it hasn't is exactly the case that
		// needs re-indexing — another store having narrowed the pack's indexed fields.
		it("asks the pack on every query", async () => {
			const pack = makePack([ENTRY_A], {});
			stubGame(pack);
			const store = new FoundryPackStore("stonetop.test", ["system.slug"]);
			await store.findEntry(e => e.system?.slug === "alpha");
			await store.filterEntries(() => true);
			await store.getAll();
			expect(pack.getIndex).toHaveBeenCalledTimes(3);
		});

		// The bug this guards: v14 rebuilds a document's index entry out of the fields the pack was
		// LAST indexed on, dropping every other one. Two stores sharing a pack with different lists
		// therefore un-indexed each other's fields, and any entry whose document had been loaded lost
		// them — post-death inserts vanishing from "Choose Your Fate" once opened. So every store's
		// request carries the union of what all of them have asked for.
		it("asks for the union of every store's fields on the same pack", async () => {
			const pack = makePack([ENTRY_A], {});
			stubGame(pack);
			const slugStore = new FoundryPackStore("stonetop.test", ["system.slug"]);
			const typeStore = new FoundryPackStore("stonetop.test", ["system.moveType"]);
			await slugStore.getAll();
			await typeStore.getAll();
			await slugStore.getAll();
			for (const call of pack.getIndex.mock.calls.slice(1)) {
				expect(call[0].fields).toEqual(expect.arrayContaining(["system.slug", "system.moveType"]));
			}
		});

		it("keeps the field sets of different packs apart", async () => {
			const packs = { a: makePack([], {}), b: makePack([], {}) };
			vi.stubGlobal("game", { packs: { get: (id) => packs[id] ?? null } });
			await new FoundryPackStore("a", ["system.slug"]).getAll();
			await new FoundryPackStore("b", ["system.moveType"]).getAll();
			expect(packs.b.getIndex).toHaveBeenCalledWith({ fields: ["system.moveType"] });
		});
	});
});
