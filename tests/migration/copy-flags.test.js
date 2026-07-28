import { describe, it, expect, vi } from "vitest";
import { buildFlagUpdate, batchUpdates, copyFlags, previewFlags, BATCH_SIZE } from "../../module/migration/copy-flags.js";
import { CUTOVER_KEY } from "../../module/system-id.js";
import { OLD_ID as OLD, NEW_ID as NEW, MIGRATION_IDS as IDS } from "../fakes/migration.js";

const doc = (id, flags) => ({ _id: id, flags });

describe("buildFlagUpdate", () => {
	it("copies the old scope into the new one and stamps it", () => {
		const update = buildFlagUpdate(doc("a1", { [OLD]: { herd: { size: 12 } } }), IDS);
		expect(update).toEqual({
			_id: "a1",
			flags: { [NEW]: { herd: { size: 12 }, [CUTOVER_KEY]: OLD } }
		});
	});

	it("deep-clones so the update cannot alias live document state", () => {
		const flags = { [OLD]: { herd: { size: 12 } } };
		const update = buildFlagUpdate(doc("a1", flags), IDS);
		update.flags[NEW].herd.size = 99;
		expect(flags[OLD].herd.size).toBe(12);
	});

	it("leaves the old scope in place (the update is additive only)", () => {
		const update = buildFlagUpdate(doc("a1", { [OLD]: { x: 1 } }), IDS);
		expect(update.flags[OLD]).toBeUndefined();
		expect(Object.keys(update)).toEqual(["_id", "flags"]);
	});

	it("skips a document that is already stamped, so the pass is re-runnable", () => {
		const already = doc("a1", { [OLD]: { x: 1 }, [NEW]: { x: 1, [CUTOVER_KEY]: OLD } });
		expect(buildFlagUpdate(already, IDS)).toBeNull();
	});

	it("ignores documents with no old-scope data", () => {
		expect(buildFlagUpdate(doc("a1", { core: { sheetClass: "x" } }), IDS)).toBeNull();
		expect(buildFlagUpdate(doc("a1", {}), IDS)).toBeNull();
		expect(buildFlagUpdate(doc("a1", { [OLD]: {} }), IDS)).toBeNull();
		expect(buildFlagUpdate({}, IDS)).toBeNull();
	});

	it("does not touch the deliberately-decoupled item content scope", () => {
		const update = buildFlagUpdate(doc("i1", { stonetop: { checks: { c0: true } }, [OLD]: { a: 1 } }), IDS);
		expect(update.flags[NEW]).toEqual({ a: 1, [CUTOVER_KEY]: OLD });
		expect(update.flags.stonetop).toBeUndefined();
	});

	it("accepts `id` as well as `_id`", () => {
		expect(buildFlagUpdate({ id: "z9", flags: { [OLD]: { a: 1 } } }, IDS)._id).toBe("z9");
	});
});

// Stamping a document is what makes the read paths stop consulting its fallback rungs, so
// anything only those rungs held has to come along or it silently becomes unreachable.
describe("buildFlagUpdate legacy fold", () => {
	const ANCIENT = "ancient-sys";
	const opts = { ...IDS, legacyScopes: [ANCIENT] };

	it("carries a key that only the legacy rung holds", () => {
		const d = doc("a1", { [ANCIENT]: { herd: { size: 7 } }, [OLD]: { playbook: "Seeker" } });
		expect(buildFlagUpdate(d, opts).flags[NEW]).toEqual({
			herd: { size: 7 }, playbook: "Seeker", [CUTOVER_KEY]: OLD
		});
	});

	it("lets the source bag win any key both bags have", () => {
		const d = doc("a1", { [ANCIENT]: { playbook: "Marshal" }, [OLD]: { playbook: "Seeker" } });
		expect(buildFlagUpdate(d, opts).flags[NEW].playbook).toBe("Seeker");
	});

	// The fold is shallow for exactly this reason: a deep merge would put the box back.
	it("does not resurrect a sub-key the source bag deliberately dropped", () => {
		const d = doc("a1", {
			[ANCIENT]: { arcana: { boxes: { "hectumel:1": true } } },
			[OLD]:     { arcana: { boxes: {} } }
		});
		expect(buildFlagUpdate(d, opts).flags[NEW].arcana).toEqual({ boxes: {} });
	});

	it("carries the literal dotted keys the pre-namespace scopes wrote", () => {
		const d = doc("a1", { [ANCIENT]: { "playbook.origin": "Marshedge" }, [OLD]: { x: 1 } });
		expect(buildFlagUpdate(d, opts).flags[NEW]["playbook.origin"]).toBe("Marshedge");
	});

	it("applies newest-first rungs in precedence order", () => {
		const d = doc("a1", { older: { a: "old" }, newer: { a: "new" }, [OLD]: { b: 1 } });
		const update = buildFlagUpdate(d, { ...IDS, legacyScopes: ["newer", "older"] });
		expect(update.flags[NEW].a).toBe("new");
	});

	it("clones, so the fold cannot alias the legacy bag", () => {
		const flags = { [ANCIENT]: { herd: { size: 7 } }, [OLD]: { x: 1 } };
		buildFlagUpdate(doc("a1", flags), opts).flags[NEW].herd.size = 99;
		expect(flags[ANCIENT].herd.size).toBe(7);
	});

	it("still ignores a document with no source bag, however much legacy it has", () => {
		expect(buildFlagUpdate(doc("a1", { [ANCIENT]: { herd: 1 } }), opts)).toBeNull();
	});
});

describe("batchUpdates", () => {
	it("splits on document count", () => {
		const updates = Array.from({ length: BATCH_SIZE * 2 + 5 }, (_, i) => ({ _id: `d${i}`, flags: {} }));
		const batches = batchUpdates(updates);
		expect(batches.length).toBe(3);
		expect(batches[0].length).toBe(BATCH_SIZE);
		expect(batches.at(-1).length).toBe(5);
	});

	it("splits on serialized size before the count limit", () => {
		const fat = (i) => ({ _id: `d${i}`, flags: { [NEW]: { blob: "x".repeat(600) } } });
		const batches = batchUpdates([fat(1), fat(2), fat(3)], { bytes: 1200 });
		expect(batches.length).toBeGreaterThan(1);
	});

	it("still emits a single oversized document rather than dropping it", () => {
		const huge = { _id: "big", flags: { [NEW]: { blob: "x".repeat(5000) } } };
		const batches = batchUpdates([huge], { bytes: 10 });
		expect(batches).toEqual([[huge]]);
	});

	it("returns nothing for an empty input", () => {
		expect(batchUpdates([])).toEqual([]);
	});
});

describe("copyFlags", () => {
	it("applies batched updates and reports counts", async () => {
		const docs = [
			doc("a", { [OLD]: { x: 1 } }),
			doc("b", { core: {} }),
			doc("c", { [OLD]: { y: 2 } })
		];
		const apply = vi.fn().mockResolvedValue(undefined);
		const result = await copyFlags(docs, apply, IDS);

		expect(result).toEqual({ considered: 3, updated: 2, batches: 1 });
		expect(apply).toHaveBeenCalledTimes(1);
		expect(apply.mock.calls[0][0].map(u => u._id)).toEqual(["a", "c"]);
	});

	it("does not call apply when there is nothing to migrate", async () => {
		const apply = vi.fn();
		const result = await copyFlags([doc("a", {})], apply, IDS);
		expect(apply).not.toHaveBeenCalled();
		expect(result.updated).toBe(0);
	});

	it("reports progress per batch", async () => {
		const docs = Array.from({ length: 3 }, (_, i) => doc(`d${i}`, { [OLD]: { x: i } }));
		const seen = [];
		await copyFlags(docs, async () => {}, { ...IDS, size: 2, onProgress: (p) => seen.push(p) });
		expect(seen).toEqual([{ done: 2, total: 3 }, { done: 3, total: 3 }]);
	});

	it("propagates a write failure rather than reporting success", async () => {
		const apply = vi.fn().mockRejectedValue(new Error("socket closed"));
		await expect(copyFlags([doc("a", { [OLD]: { x: 1 } })], apply, IDS)).rejects.toThrow("socket closed");
	});

	it("is idempotent: a second run over already-stamped docs writes nothing", async () => {
		const docs = [doc("a", { [OLD]: { x: 1 }, [NEW]: { x: 1, [CUTOVER_KEY]: OLD } })];
		const apply = vi.fn();
		const result = await copyFlags(docs, apply, IDS);
		expect(apply).not.toHaveBeenCalled();
		expect(result.updated).toBe(0);
	});
});

describe("previewFlags", () => {
	it("separates pending work from work already done", () => {
		const docs = [
			doc("a", { [OLD]: { x: 1 } }),
			doc("b", { [OLD]: { x: 1 }, [NEW]: { x: 1, [CUTOVER_KEY]: OLD } }),
			doc("c", {})
		];
		expect(previewFlags(docs, IDS)).toEqual({ pending: 1, alreadyDone: 1 });
	});

	it("writes nothing", () => {
		const docs = [doc("a", { [OLD]: { x: 1 } })];
		previewFlags(docs, IDS);
		expect(docs[0].flags[NEW]).toBeUndefined();
	});
});
