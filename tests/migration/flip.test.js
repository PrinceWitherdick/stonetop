import { describe, it, expect, vi } from "vitest";
import { preflight, flipWorldSystem, verifyFlip, shutdownWorld, onHostedProvider } from "../../module/migration/flip.js";
import { OLD_ID as SOURCE, NEW_ID as TARGET, MIGRATION_IDS as IDS, makeGame } from "../fakes/migration.js";

const okManifest = (over = {}) => ({ id: TARGET, compatibility: { minimum: "13" }, ...over });

function fetchOk(manifest = okManifest()) {
	return vi.fn().mockResolvedValue({ ok: true, json: async () => manifest });
}

describe("preflight", () => {
	it("passes on a clean world", async () => {
		const result = await preflight(makeGame(), { fetchImpl: fetchOk(), ...IDS });
		expect(result.ok).toBe(true);
		expect(result.blockers).toEqual([]);
	});

	// world-scan skips locked world packs rather than unlocking them behind the GM's back,
	// so the count they see must not quietly omit them.
	it("warns about locked world compendiums, without blocking", async () => {
		const packs = [
			{ metadata: { packageType: "world", label: "Homebrew" }, locked: true, collection: "world.homebrew" },
			{ metadata: { packageType: "world", label: "Open" }, locked: false, collection: "world.open" },
			{ metadata: { packageType: "system", label: "Shipped" }, locked: true, collection: "sys.shipped" }
		];
		const result = await preflight(makeGame({ packs }), { fetchImpl: fetchOk(), ...IDS });

		expect(result.ok).toBe(true);
		expect(result.warnings.join(" ")).toMatch(/Homebrew/);
		expect(result.warnings.join(" ")).not.toMatch(/Open|Shipped/);
	});

	it("blocks a non-GM", async () => {
		const result = await preflight(makeGame({ user: { isGM: false } }), { fetchImpl: fetchOk(), ...IDS });
		expect(result.ok).toBe(false);
		expect(result.blockers.join(" ")).toMatch(/Gamemaster/);
	});

	it("blocks while other people are logged in", async () => {
		const game = makeGame({ users: [
			{ name: "GM", active: true, isSelf: true },
			{ name: "Rowan", active: true, isSelf: false }
		] });
		const result = await preflight(game, { fetchImpl: fetchOk(), ...IDS });
		expect(result.blockers.join(" ")).toMatch(/Rowan/);
	});

	// The single check standing between the user and an unlaunchable world.
	it("blocks when the renamed system is not installed", async () => {
		const fetchImpl = vi.fn().mockResolvedValue({ ok: false });
		const result = await preflight(makeGame(), { fetchImpl, ...IDS });
		expect(result.ok).toBe(false);
		expect(result.blockers.join(" ")).toMatch(/not installed/);
	});

	it("blocks when the fetch itself fails", async () => {
		const fetchImpl = vi.fn().mockRejectedValue(new Error("offline"));
		const result = await preflight(makeGame(), { fetchImpl, ...IDS });
		expect(result.ok).toBe(false);
	});

	it("blocks when the installed manifest reports a different id", async () => {
		const result = await preflight(makeGame(), { fetchImpl: fetchOk(okManifest({ id: "something-else" })), ...IDS });
		expect(result.blockers.join(" ")).toMatch(/something-else/);
	});

	it("blocks when the target needs a newer Foundry than this server", async () => {
		const game = makeGame({ release: { generation: 13 } });
		const result = await preflight(game, { fetchImpl: fetchOk(okManifest({ compatibility: { minimum: "14" } })), ...IDS });
		expect(result.blockers.join(" ")).toMatch(/needs Foundry v14/);
	});

	it("blocks on an unsatisfied required module", async () => {
		const manifest = okManifest({ relationships: { requires: [{ id: "lib-wrapper" }] } });
		const modules = [];
		modules.get = () => undefined;
		const game = makeGame({ modules });
		const result = await preflight(game, { fetchImpl: fetchOk(manifest), ...IDS });
		expect(result.blockers.join(" ")).toMatch(/lib-wrapper/);
	});

	// System-scoped modules are erased from the world by the flip, packs and all.
	it("blocks on an active module tied to the old system id", async () => {
		const modules = [{ id: "st-extras", title: "Stonetop Extras", active: true, relationships: { systems: [{ id: SOURCE }] } }];
		modules.get = () => undefined;
		const result = await preflight(makeGame({ modules }), { fetchImpl: fetchOk(), ...IDS });
		expect(result.blockers.join(" ")).toMatch(/Stonetop Extras/);
	});

	it("ignores an inactive system-scoped module", async () => {
		const modules = [{ id: "st-extras", active: false, relationships: { systems: [{ id: SOURCE }] } }];
		modules.get = () => undefined;
		const result = await preflight(makeGame({ modules }), { fetchImpl: fetchOk(), ...IDS });
		expect(result.ok).toBe(true);
	});

	// The Forge replaces Foundry's setup route with its own when Game Manager is on, and
	// gates it by Forge account ownership rather than Foundry role. That route is both what
	// the flip needs and how a mis-pointed world would be recovered, so refuse rather than
	// gamble on an unverified environment.
	it("blocks on a hosted provider", async () => {
		const result = await preflight(makeGame(), { fetchImpl: fetchOk(), ...IDS, scope: { ForgeVTT: { usingTheForge: true } } });
		expect(result.ok).toBe(false);
		expect(result.blockers.join(" ")).toMatch(/hosted Foundry/i);
	});

	it("does not block a self-hosted world", async () => {
		const result = await preflight(makeGame(), { fetchImpl: fetchOk(), ...IDS, scope: {} });
		expect(result.ok).toBe(true);
	});

	it("blocks when the world has unloadable actors", async () => {
		const game = makeGame({ actors: { invalidDocumentIds: new Set(["a1", "a2"]) } });
		const result = await preflight(game, { fetchImpl: fetchOk(), ...IDS });
		expect(result.blockers.join(" ")).toMatch(/2 actor/);
	});

	it("warns rather than blocks when backups are disabled", async () => {
		const game = makeGame({ data: { options: { noBackups: true } } });
		const result = await preflight(game, { fetchImpl: fetchOk(), ...IDS });
		expect(result.ok).toBe(true);
		expect(result.warnings.join(" ")).toMatch(/backups disabled/);
	});
});

describe("flipWorldSystem", () => {
	const route = () => "/setup";

	it("sends the partial editWorld body and reports success", async () => {
		const fetchImpl = vi.fn().mockResolvedValue({ json: async () => ({ system: { id: TARGET } }) });
		const result = await flipWorldSystem({ game: makeGame(), fetchImpl, route, target: TARGET });

		expect(result).toEqual({ ok: true });
		const [url, init] = fetchImpl.mock.calls[0];
		expect(url).toBe("/setup");
		expect(JSON.parse(init.body)).toEqual({ action: "editWorld", id: "my-world", system: TARGET });
	});

	// A server-side throw arrives as HTTP 200 with an error body.
	it("treats an {error} body as failure even though the request succeeded", async () => {
		const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ error: "not available for use!" }) });
		const result = await flipWorldSystem({ game: makeGame(), fetchImpl, route, target: TARGET });
		expect(result).toEqual({ ok: false, error: "not available for use!" });
	});

	it("fails when the server echoes back a different system", async () => {
		const fetchImpl = vi.fn().mockResolvedValue({ json: async () => ({ system: { id: SOURCE } }) });
		const result = await flipWorldSystem({ game: makeGame(), fetchImpl, route, target: TARGET });
		expect(result.ok).toBe(false);
	});

	it("fails cleanly with no active world", async () => {
		const result = await flipWorldSystem({ game: makeGame({ world: null }), fetchImpl: vi.fn(), route, target: TARGET });
		expect(result).toEqual({ ok: false, error: "No active world." });
	});

	it("reports a network error instead of throwing", async () => {
		const fetchImpl = vi.fn().mockRejectedValue(new Error("socket hang up"));
		const result = await flipWorldSystem({ game: makeGame(), fetchImpl, route, target: TARGET });
		expect(result).toEqual({ ok: false, error: "socket hang up" });
	});
});

describe("verifyFlip", () => {
	it("confirms the change landed on disk", async () => {
		const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ system: TARGET }) });
		expect(await verifyFlip({ worldId: "my-world", fetchImpl, target: TARGET })).toEqual({ ok: true, system: TARGET });
	});

	it("cache-busts the read", async () => {
		const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ system: TARGET }) });
		await verifyFlip({ worldId: "my-world", fetchImpl, target: TARGET });
		expect(fetchImpl.mock.calls[0][0]).toMatch(/worlds\/my-world\/world\.json\?ts=/);
	});

	it("reports the still-old value when the flip did not land", async () => {
		const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ system: SOURCE }) });
		const result = await verifyFlip({ worldId: "my-world", fetchImpl, target: TARGET });
		expect(result.ok).toBe(false);
		expect(result.system).toBe(SOURCE);
	});
});

describe("shutdownWorld", () => {
	// A real shutdown tears the socket down and navigates away.
	const goneAfter = () => ({ shutDown: vi.fn().mockResolvedValue(), ready: false });

	it("succeeds when the world actually goes down", async () => {
		const game = goneAfter();
		expect(await shutdownWorld(game, { wait: async () => {} })).toEqual({ ok: true });
		expect(game.shutDown).toHaveBeenCalled();
	});

	it("reports a thrown failure instead of throwing", async () => {
		const game = { shutDown: vi.fn().mockRejectedValue(new Error("nope")) };
		expect(await shutdownWorld(game, { wait: async () => {} })).toEqual({ ok: false, error: "nope" });
	});

	// THE trap: game.shutDown() resolves NORMALLY when the GM declines its "other users
	// are connected" confirm. Reporting success there would leave the session running past
	// the flip, which is the one state this must never end in.
	it("detects a declined confirm, which resolves normally but shuts nothing down", async () => {
		const game = { shutDown: vi.fn().mockResolvedValue(), ready: true, socket: { connected: true } };
		const result = await shutdownWorld(game, { wait: async () => {} });

		expect(result.ok).toBe(false);
		expect(result.declined).toBe(true);
		expect(result.error).toMatch(/without shutting the world down/i);
	});

	it("treats a closed socket as a real shutdown", async () => {
		const game = { shutDown: vi.fn().mockResolvedValue(), ready: true, socket: { connected: false } };
		expect(await shutdownWorld(game, { wait: async () => {} })).toEqual({ ok: true });
	});

	it("waits before judging, so a slow teardown is not misread as a decline", async () => {
		const wait = vi.fn().mockResolvedValue();
		await shutdownWorld(goneAfter(), { wait, settleMs: 1234 });
		expect(wait).toHaveBeenCalledWith(1234);
	});
});

describe("onHostedProvider", () => {
	it("detects The Forge", () => {
		expect(onHostedProvider({ ForgeVTT: { usingTheForge: true } })).toBe(true);
	});

	it("is false for self-hosted, and for a Forge global that is not in use", () => {
		expect(onHostedProvider({})).toBe(false);
		expect(onHostedProvider({ ForgeVTT: { usingTheForge: false } })).toBe(false);
		expect(onHostedProvider(undefined)).toBe(false);
	});
});
