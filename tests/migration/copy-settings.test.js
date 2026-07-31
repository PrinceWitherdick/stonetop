import { describe, it, expect, vi } from "vitest";
import { rekey, sourceValue, planSettingCopies, copySettings, copyLocalStorage, adoptLegacyClientSettings } from "../../module/migration/copy-settings.js";
import { OLD_ID as OLD, NEW_ID as NEW, MIGRATION_IDS as IDS, FakeStorage } from "../fakes/migration.js";

const setting = (id, key, value) => ({ _id: id, key, _source: { value } });

describe("rekey", () => {
	it("swaps the namespace and keeps the rest of the key", () => {
		expect(rekey(`${OLD}.seedingComplete`, OLD, NEW)).toBe(`${NEW}.seedingComplete`);
	});

	it("preserves dotted keys beyond the namespace", () => {
		expect(rekey(`${OLD}.book2Art.root`, OLD, NEW)).toBe(`${NEW}.book2Art.root`);
	});

	it("ignores other packages' settings", () => {
		expect(rekey("core.sheetClasses", OLD, NEW)).toBeNull();
		expect(rekey("stonetop.checks", OLD, NEW)).toBeNull();
		expect(rekey(undefined, OLD, NEW)).toBeNull();
	});

	it("does not match a namespace that merely starts the same", () => {
		expect(rekey(`${OLD}x.thing`, OLD, NEW)).toBeNull();
	});
});

describe("sourceValue", () => {
	// The initialized value is re-cast on read, so a stored "123" comes back as a number.
	it("prefers the serialized source value over the initialized one", () => {
		expect(sourceValue({ _source: { value: "\"123\"" }, value: 123 })).toBe("\"123\"");
	});

	it("falls back to value when there is no _source", () => {
		expect(sourceValue({ value: "true" })).toBe("true");
	});
});

describe("planSettingCopies", () => {
	it("creates a target setting for each old-namespace setting", () => {
		const plan = planSettingCopies([setting("s1", `${OLD}.seedingComplete`, "true")], IDS);
		expect(plan.creates).toEqual([{ key: `${NEW}.seedingComplete`, value: "true" }]);
		expect(plan.updates).toEqual([]);
	});

	it("updates instead of creating when the target key already exists", () => {
		const plan = planSettingCopies([
			setting("s1", `${OLD}.herd`, "12"),
			setting("s2", `${NEW}.herd`, "0")
		], IDS);
		expect(plan.creates).toEqual([]);
		expect(plan.updates).toEqual([{ _id: "s2", value: "12" }]);
	});

	it("reports an already-identical target as unchanged", () => {
		const plan = planSettingCopies([
			setting("s1", `${OLD}.herd`, "12"),
			setting("s2", `${NEW}.herd`, "12")
		], IDS);
		expect(plan.creates).toEqual([]);
		expect(plan.updates).toEqual([]);
		expect(plan.unchanged).toEqual([`${NEW}.herd`]);
	});

	it("leaves other packages' settings alone", () => {
		const plan = planSettingCopies([
			setting("s1", "core.sheetClasses", "{}"),
			setting("s2", "stonetop.checks", "{}")
		], IDS);
		expect(plan.creates).toEqual([]);
		expect(plan.updates).toEqual([]);
	});

	it("ignores a shadowed duplicate rather than copying it twice", () => {
		const plan = planSettingCopies([
			setting("s1", `${OLD}.herd`, "12"),
			setting("s2", `${OLD}.herd`, "99")
		], IDS);
		expect(plan.creates).toEqual([{ key: `${NEW}.herd`, value: "12" }]);
	});

	it("handles an empty world", () => {
		expect(planSettingCopies([], IDS)).toEqual({ creates: [], updates: [], unchanged: [] });
		expect(planSettingCopies(undefined, IDS).creates).toEqual([]);
	});
});

describe("copySettings", () => {
	it("creates and updates through the provided io", async () => {
		const io = { create: vi.fn().mockResolvedValue(), update: vi.fn().mockResolvedValue() };
		const result = await copySettings([
			setting("s1", `${OLD}.a`, "1"),
			setting("s2", `${OLD}.b`, "2"),
			setting("s3", `${NEW}.b`, "old")
		], io, IDS);

		expect(result).toEqual({ created: 1, updated: 1, unchanged: 0, skipped: 0 });
		expect(io.create).toHaveBeenCalledWith([{ key: `${NEW}.a`, value: "1" }]);
		expect(io.update).toHaveBeenCalledWith([{ _id: "s3", value: "2" }]);
	});

	// The repair path's one deviation: long after the rename, a value already under the new
	// id is the GM's current choice and the old one is a fossil. Missing keys are still
	// filled in. See rescue.js.
	it("fills in missing keys without overwriting existing ones when asked", async () => {
		const io = { create: vi.fn().mockResolvedValue(), update: vi.fn().mockResolvedValue() };
		const result = await copySettings([
			setting("s1", `${OLD}.a`, "1"),
			setting("s2", `${OLD}.b`, "2"),
			setting("s3", `${NEW}.b`, "the GM's current choice")
		], io, { ...IDS, overwriteExisting: false });

		expect(result).toEqual({ created: 1, updated: 0, unchanged: 0, skipped: 1 });
		expect(io.create).toHaveBeenCalledWith([{ key: `${NEW}.a`, value: "1" }]);
		expect(io.update).not.toHaveBeenCalled();
	});

	it("writes nothing when there is nothing to do", async () => {
		const io = { create: vi.fn(), update: vi.fn() };
		await copySettings([setting("s1", "core.x", "1")], io, IDS);
		expect(io.create).not.toHaveBeenCalled();
		expect(io.update).not.toHaveBeenCalled();
	});
});

describe("copyLocalStorage", () => {
	it("copies namespaced keys across", () => {
		const storage = new FakeStorage({ [`${OLD}.tabOrder`]: "[1,2]", "core.theme": "dark" });
		expect(copyLocalStorage(storage, IDS)).toEqual({ copied: 1, skipped: 0 });
		expect(storage.getItem(`${NEW}.tabOrder`)).toBe("[1,2]");
	});

	it("leaves the original in place as a rollback path", () => {
		const storage = new FakeStorage({ [`${OLD}.tabOrder`]: "[1,2]" });
		copyLocalStorage(storage, IDS);
		expect(storage.getItem(`${OLD}.tabOrder`)).toBe("[1,2]");
	});

	it("never clobbers a value the new system already wrote", () => {
		const storage = new FakeStorage({ [`${OLD}.tabOrder`]: "[1,2]", [`${NEW}.tabOrder`]: "[9]" });
		expect(copyLocalStorage(storage, IDS)).toEqual({ copied: 0, skipped: 1 });
		expect(storage.getItem(`${NEW}.tabOrder`)).toBe("[9]");
	});

	it("tolerates a missing storage", () => {
		expect(copyLocalStorage(null, IDS)).toEqual({ copied: 0, skipped: 0 });
	});
});

// localStorage is per-browser, so the GM's migration only ever fixes the GM's machine.
// Every other player needs their own copy on first load or they silently lose ~24
// preferences, two of which are behavioural (reduce motion, open-sheets-in-edit-mode).
describe("adoptLegacyClientSettings", () => {
	const ACTIVE = "renamed-sys";

	it("adopts keys from a prior id", () => {
		const storage = new FakeStorage({ "old-sys.sheetFont": '"avara"' });
		expect(adoptLegacyClientSettings(storage, { systemId: ACTIVE, priorIds: ["old-sys"] }))
			.toEqual({ copied: 1, skipped: 0 });
		expect(storage.getItem(`${ACTIVE}.sheetFont`)).toBe('"avara"');
	});

	it("never clobbers a preference already set under the active id", () => {
		const storage = new FakeStorage({ "old-sys.sheetFont": '"avara"', [`${ACTIVE}.sheetFont`]: '"mine"' });
		expect(adoptLegacyClientSettings(storage, { systemId: ACTIVE, priorIds: ["old-sys"] }))
			.toEqual({ copied: 0, skipped: 1 });
		expect(storage.getItem(`${ACTIVE}.sheetFont`)).toBe('"mine"');
	});

	it("lets the newest prior id win when several hold the same key", () => {
		const storage = new FakeStorage({ "newer.tabOrder": "[9]", "older.tabOrder": "[1]" });
		adoptLegacyClientSettings(storage, { systemId: ACTIVE, priorIds: ["newer", "older"] });
		expect(storage.getItem(`${ACTIVE}.tabOrder`)).toBe("[9]");
	});

	it("leaves other packages' keys alone", () => {
		const storage = new FakeStorage({ "core.theme": "dark", "dnd5e.x": "1" });
		expect(adoptLegacyClientSettings(storage, { systemId: ACTIVE, priorIds: ["old-sys"] }))
			.toEqual({ copied: 0, skipped: 0 });
		expect(storage.getItem("core.theme")).toBe("dark");
	});

	it("is a no-op when the system has never been renamed", () => {
		const storage = new FakeStorage({ [`${ACTIVE}.sheetFont`]: '"avara"' });
		expect(adoptLegacyClientSettings(storage, { systemId: ACTIVE, priorIds: [] }))
			.toEqual({ copied: 0, skipped: 0 });
	});

	it("is safe to run on every load", () => {
		const storage = new FakeStorage({ "old-sys.sheetFont": '"avara"' });
		const opts = { systemId: ACTIVE, priorIds: ["old-sys"] };
		adoptLegacyClientSettings(storage, opts);
		expect(adoptLegacyClientSettings(storage, opts)).toEqual({ copied: 0, skipped: 1 });
	});

	it("tolerates a missing storage", () => {
		expect(adoptLegacyClientSettings(null, { systemId: ACTIVE, priorIds: ["old-sys"] }))
			.toEqual({ copied: 0, skipped: 0 });
	});
});
