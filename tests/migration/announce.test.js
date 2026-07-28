import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renamedSystemInstalled, maybeOfferMigration, resetMigrationOffer } from "../../module/migration/announce.js";
import { MigrationAssistant } from "../../module/migration/MigrationAssistant.js";

// Fixture id rather than the live constant, which becomes null once the rename is done.
const TARGET = "renamed-sys";

const installed = () => vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: TARGET }) });
const notInstalled = () => vi.fn().mockResolvedValue({ ok: false });

describe("renamedSystemInstalled", () => {
	it("is true when the manifest is present and reports the expected id", async () => {
		expect(await renamedSystemInstalled(installed(), TARGET)).toBe(true);
	});

	it("is false when the manifest is missing", async () => {
		expect(await renamedSystemInstalled(notInstalled(), TARGET)).toBe(false);
	});

	it("is false when a manifest is served but reports a different id", async () => {
		const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "something-else" }) });
		expect(await renamedSystemInstalled(fetchImpl, TARGET)).toBe(false);
	});

	it("is false rather than throwing when the request fails", async () => {
		expect(await renamedSystemInstalled(vi.fn().mockRejectedValue(new Error("offline")), TARGET)).toBe(false);
	});
});

describe("maybeOfferMigration", () => {
	let open;

	beforeEach(() => {
		resetMigrationOffer();
		open = vi.spyOn(MigrationAssistant, "open").mockImplementation(() => {});
		globalThis.game = { user: { isGM: true } };
	});

	afterEach(() => {
		open.mockRestore();
		delete globalThis.game;
	});

	it("opens the assistant once the renamed system is installed", async () => {
		expect(await maybeOfferMigration({ fetchImpl: installed(), target: TARGET })).toBe(true);
		expect(open).toHaveBeenCalledTimes(1);
	});

	it("stays silent until the renamed system exists", async () => {
		expect(await maybeOfferMigration({ fetchImpl: notInstalled(), target: TARGET })).toBe(false);
		expect(open).not.toHaveBeenCalled();
	});

	it("never offers to a player", async () => {
		globalThis.game = { user: { isGM: false } };
		expect(await maybeOfferMigration({ fetchImpl: installed(), target: TARGET })).toBe(false);
		expect(open).not.toHaveBeenCalled();
	});

	it("offers only once per session", async () => {
		await maybeOfferMigration({ fetchImpl: installed(), target: TARGET });
		await maybeOfferMigration({ fetchImpl: installed(), target: TARGET });
		expect(open).toHaveBeenCalledTimes(1);
	});

	it("can be forced open again", async () => {
		await maybeOfferMigration({ fetchImpl: installed(), target: TARGET });
		await maybeOfferMigration({ fetchImpl: installed(), force: true, target: TARGET });
		expect(open).toHaveBeenCalledTimes(2);
	});
});
