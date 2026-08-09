import { describe, it, expect, afterEach, vi } from "vitest";
import { StonetopFlags, resolvedFlags, resolvedFlagProperty, STONETOP_SCOPE, ITEM_FLAG_SCOPE } from "../../../module/actors/character/StonetopFlags.js";
import { SYSTEM_ID, LEGACY_FLAG_SCOPES, CUTOVER_KEY } from "../../../module/system-id.js";

// Minimal actor stub: getFlag resolves a dot-path the way Foundry's does.
function makeActor(flags = {}) {
	return {
		flags,
		getFlag: (scope, path) => foundry.utils.getProperty(flags[scope] ?? {}, path),
		update: vi.fn(async () => {}),
	};
}

const LEGACY = LEGACY_FLAG_SCOPES[0];

describe("StonetopFlags scope resolution", () => {
	it("reads the active scope through a dotted key", () => {
		const actor = makeActor({ [SYSTEM_ID]: { playbook: { origin: "Barrier Pass" } } });
		expect(new StonetopFlags(actor, "playbook").getFlag("origin")).toBe("Barrier Pass");
	});

	it("falls back to a legacy scope when the active scope has no value", () => {
		const actor = makeActor({ [LEGACY]: { "playbook.origin": "Marshedge" } });
		expect(new StonetopFlags(actor, "playbook").getFlag("origin")).toBe("Marshedge");
	});

	it("prefers the active scope over a legacy scope", () => {
		const actor = makeActor({
			[SYSTEM_ID]: { playbook: { origin: "Barrier Pass" } },
			[LEGACY]: { "playbook.origin": "Marshedge" }
		});
		expect(new StonetopFlags(actor, "playbook").getFlag("origin")).toBe("Barrier Pass");
	});

	// The migration leaves the old scope in place as a rollback path, so once a document
	// is stamped the old copy is stale and must stop showing through.
	it("stops falling back once the document is cut over", () => {
		const actor = makeActor({
			[SYSTEM_ID]: { [CUTOVER_KEY]: "stonetop-pwd" },
			[LEGACY]: { "playbook.origin": "Marshedge" }
		});
		expect(new StonetopFlags(actor, "playbook").getFlag("origin")).toBeUndefined();
	});

	// The migration folds the legacy rungs into the active bag verbatim, literal dotted
	// keys and all, so the active read has to try the literal key as well as the path.
	it("reads a folded-in literal dotted key from the active scope", () => {
		const actor = makeActor({
			[SYSTEM_ID]: { [CUTOVER_KEY]: "stonetop", "playbook.origin": "Marshedge" }
		});
		expect(new StonetopFlags(actor, "playbook").getFlag("origin")).toBe("Marshedge");
	});

	it("still prefers a real nested value over a literal dotted key", () => {
		const actor = makeActor({
			[SYSTEM_ID]: { playbook: { origin: "Barrier Pass" }, "playbook.origin": "Marshedge" }
		});
		expect(new StonetopFlags(actor, "playbook").getFlag("origin")).toBe("Barrier Pass");
	});

	it("does not resurrect a sub-key deleted after cutover", () => {
		const actor = makeActor({
			[SYSTEM_ID]: { [CUTOVER_KEY]: "stonetop-pwd", arcana: { boxes: {} } },
			[LEGACY]: { arcana: { boxes: { "hectumel:1": true } } }
		});
		expect(resolvedFlags(actor).arcana.boxes["hectumel:1"]).toBeUndefined();
	});
});

describe("resolvedFlags", () => {
	it("returns the active scope bag", () => {
		const actor = makeActor({ [SYSTEM_ID]: { herd: { size: 12 } } });
		expect(resolvedFlags(actor)).toEqual({ herd: { size: 12 } });
	});

	it("returns a legacy bag when the active scope is absent", () => {
		const actor = makeActor({ [LEGACY]: { herd: { size: 7 } } });
		expect(resolvedFlags(actor)).toEqual({ herd: { size: 7 } });
	});

	it("returns an empty object when nothing is stored", () => {
		expect(resolvedFlags(makeActor())).toEqual({});
	});

	it("reads a nested path via resolvedFlagProperty", () => {
		const actor = makeActor({ [SYSTEM_ID]: { steading: { population: 320 } } });
		expect(resolvedFlagProperty(actor, "steading.population")).toBe(320);
	});
});

describe("batch deletions", () => {
	afterEach(() => { delete globalThis.game; });

	// v14 still applies the legacy "-=key" form, but logs a deprecation for EVERY key — a prune
	// that drops a dozen answers (swapping one post-death insert for another) filled the console
	// with them. Route through deletionEntry so each core gets the form it prefers.
	it("deletes sub-keys with a ForcedDeletion instance on v14+", async () => {
		globalThis.game = { release: { generation: 14 } };
		const actor = makeActor();
		await new StonetopFlags(actor, "postDeathLore").batch({ deletes: { counts: ["marks:red-wrath"] } });
		const data = actor.update.mock.calls[0][0];
		expect(Object.keys(data)).toEqual([`flags.${SYSTEM_ID}.postDeathLore.counts.marks:red-wrath`]);
		expect(Object.values(data)[0]).toBeInstanceOf(foundry.data.operators.ForcedDeletion);
	});

	it("falls back to the legacy `-=` leaf key below v14", async () => {
		globalThis.game = { release: { generation: 13 } };
		const actor = makeActor();
		await new StonetopFlags(actor, "postDeathLore").batch({ deletes: { texts: ["impulse:erode-hope"] } });
		expect(actor.update.mock.calls[0][0]).toEqual({
			[`flags.${SYSTEM_ID}.postDeathLore.texts.-=impulse:erode-hope`]: null,
		});
	});

	it("still writes `sets` wholesale alongside the deletions", async () => {
		globalThis.game = { release: { generation: 13 } };
		const actor = makeActor();
		await new StonetopFlags(actor, "postDeathLore").batch({
			sets:    { counts: { "favor:favor-track": 2 } },
			deletes: { texts: ["impulse:erode-hope"] },
		});
		expect(actor.update.mock.calls[0][0]).toEqual({
			[`flags.${SYSTEM_ID}.postDeathLore.counts`]: { "favor:favor-track": 2 },
			[`flags.${SYSTEM_ID}.postDeathLore.texts.-=impulse:erode-hope`]: null,
		});
	});
});

describe("scope constants", () => {
	it("exposes the system id as the actor flag scope", () => {
		expect(STONETOP_SCOPE).toBe(SYSTEM_ID);
	});

	// Shipped compendium content, journal checkbox progress and hover summaries live under
	// this scope on purpose. A system-id rename must NOT move it.
	it("keeps the item flag scope decoupled from the system id", () => {
		expect(ITEM_FLAG_SCOPE).toBe("stonetop");
		expect(LEGACY_FLAG_SCOPES).toContain("stonetop");
	});
});
