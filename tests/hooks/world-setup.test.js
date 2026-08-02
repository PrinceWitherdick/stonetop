import { describe, it, expect, beforeEach, vi } from "vitest";

// The gates around the first-load setup run: which imports it says are still owed, and the
// once-per-world "you already have these maps — want the Scenes?" offer. The imports
// themselves are covered by their own seed tests; what matters here is that the offer never
// nags, never asks about nothing, and stays askable for a GM who imports maps later.

const posterMapScenePlan = vi.fn();
const createPosterMapScenes = vi.fn();
const ask = vi.fn();

vi.mock("../../module/book2-art/poster-maps.js", () => ({
	posterMapScenePlan: (...args) => posterMapScenePlan(...args),
	createPosterMapScenes: (...args) => createPosterMapScenes(...args),
}));
vi.mock("../../module/dialogs/PosterMapScenesDialog.js", () => ({
	PosterMapScenesDialog: { ask: (...args) => ask(...args) },
}));
// Pulled in only for its side-effect-free exports; the setup window and the seeds are not
// exercised here and would drag Foundry's Application in.
vi.mock("../../module/dialogs/WorldSetupDialog.js", () => ({ WorldSetupDialog: { open: () => null } }));

const { pendingSetupWork, offerPosterMapScenesOnce } = await import("../../module/hooks/WorldSetup.js");

const MAP = (slug) => ({ map: { slug, name: slug }, src: `art/${slug}.webp`, hasScene: false });

let store;

function harness({ isGM = true, activeGmId = "gm-1", settings = {}, packs = ["stonetop-pwd.stonetop-bestiary", "stonetop-pwd.stonetop-items"] } = {}) {
	store = {
		seedingComplete: false,
		bestiaryActorsSeeded: false,
		treasureItemsSeeded: false,
		posterMapScenesOffered: false,
		book2ArtRoot: "stonetop-book-art",
		...settings,
	};
	global.game = {
		user: { id: "gm-1", isGM },
		users: { activeGM: { id: activeGmId }, find: () => null },
		settings: {
			get: (_ns, key) => store[key],
			set: async (_ns, key, value) => { store[key] = value; },
			settings: new Map(),
		},
		scenes: [],
		// The bestiary/treasure guards check their pack exists before claiming the work is
		// owed, so a dev build without one doesn't get a row for an import that can't run.
		packs: { get: (id) => (packs.includes(id) ? { collection: id } : undefined) },
		system: { id: "stonetop-pwd", version: "9.9.9" },
	};
	global.ui = {
		notifications: {
			// Core hands back a live handle when asked for a progress notification, and only
			// then. That is what utils/progress-notification.js drives, so the fake has to make
			// the same distinction or a bar test passes against nothing.
			info: vi.fn((_message, { progress } = {}) => (progress ? { update: vi.fn(), remove: vi.fn() } : undefined)),
			warn: vi.fn(),
			error: vi.fn(),
		},
	};
}

/** The handle handed to the most recent progress notification, or undefined if none was opened. */
function progressBar() {
	return globalThis.ui.notifications.info.mock.results.map(r => r.value).findLast(v => v?.update);
}

beforeEach(() => {
	vi.clearAllMocks();
	posterMapScenePlan.mockResolvedValue([]);
	createPosterMapScenes.mockResolvedValue({ created: 0, updated: 0, pins: 0, failures: [] });
	ask.mockResolvedValue([]);
	harness();
});

describe("pendingSetupWork", () => {
	it("owes everything on a brand-new world", () => {
		expect(pendingSetupWork()).toEqual({ journals: true, monsters: true, treasures: true });
	});

	it("owes nothing once every seed flag is set", () => {
		harness({ settings: { seedingComplete: true, bestiaryActorsSeeded: true, treasureItemsSeeded: true } });
		expect(pendingSetupWork()).toEqual({ journals: false, monsters: false, treasures: false });
	});

	it("reports each import independently, so an established world still gains a new library", () => {
		harness({ settings: { seedingComplete: true, bestiaryActorsSeeded: true } });
		expect(pendingSetupWork()).toEqual({ journals: false, monsters: false, treasures: true });
	});

	it("hides the primary-GM-only imports from a second GM", () => {
		// Both are gated on isPrimaryGM inside the seeds themselves, so listing them for a
		// secondary GM would show rows that instantly tick themselves off doing nothing.
		harness({ activeGmId: "gm-2" });
		expect(pendingSetupWork()).toEqual({ journals: true, monsters: false, treasures: false });
	});

	it("hides an import whose pack is absent, as a dev build without it would be", () => {
		harness({ packs: [] });
		expect(pendingSetupWork()).toEqual({ journals: true, monsters: false, treasures: false });
	});
});

describe("offerPosterMapScenesOnce", () => {
	it("asks when a map is on disk with no Scene, and builds what was ticked", async () => {
		const rows = [MAP("vicinity"), MAP("marshedge")];
		posterMapScenePlan.mockResolvedValue(rows);
		ask.mockResolvedValue([rows[0]]);
		createPosterMapScenes.mockResolvedValue({ created: 1, updated: 0, pins: 8, failures: [] });

		await offerPosterMapScenesOnce();

		expect(ask).toHaveBeenCalledWith(rows);
		expect(createPosterMapScenes).toHaveBeenCalledWith([rows[0]], { onProgress: expect.any(Function) });
		expect(store.posterMapScenesOffered).toBe(true);
	});

	// The builder has always reported per map; for a long time nothing was listening, so the
	// only feedback was a toast that faded after five seconds while the work carried on.
	it("drives a progress bar off the builder's per-map reports", async () => {
		const rows = [MAP("vicinity"), MAP("marshedge")];
		posterMapScenePlan.mockResolvedValue(rows);
		ask.mockResolvedValue(rows);
		createPosterMapScenes.mockImplementation(async (built, { onProgress } = {}) => {
			built.forEach((_row, i) => onProgress?.({ fraction: (i + 1) / built.length, detail: `${i + 1} of ${built.length} maps` }));
			return { created: 2, updated: 0, pins: 0, failures: [] };
		});

		await offerPosterMapScenesOnce();

		const bar = progressBar();
		// Core takes pct on 0..1, not a percentage, and escapes the note via `format`.
		expect(bar.update).toHaveBeenCalledWith(expect.objectContaining({
			pct: 0.5,
			format: expect.objectContaining({ detail: "1 of 2 maps" }),
		}));
		expect(bar.update).toHaveBeenCalledWith(expect.objectContaining({ pct: 1 }));
	});

	// A bar that stops at 99% stays on screen for the rest of the session: core exempts progress
	// notifications from the usual timeout and dismisses one only at exactly 1. So a run that dies
	// part-way must still take its bar away — but by REMOVING it, not by completing it. close()
	// would drive it to 100% first, telling the GM the scenes were built when they were not.
	it("takes the bar away, without completing it, when a map fails to build", async () => {
		const rows = [MAP("vicinity")];
		posterMapScenePlan.mockResolvedValue(rows);
		ask.mockResolvedValue(rows);
		createPosterMapScenes.mockRejectedValue(new Error("unreadable image"));

		await expect(offerPosterMapScenesOnce()).rejects.toThrow("unreadable image");

		const bar = progressBar();
		expect(bar.remove).toHaveBeenCalled();
		expect(bar.update).not.toHaveBeenCalledWith(expect.objectContaining({ pct: 1 }));
	});

	it("records the offer even when the GM declines, so it never nags", async () => {
		posterMapScenePlan.mockResolvedValue([MAP("vicinity")]);
		ask.mockResolvedValue([]);

		await offerPosterMapScenesOnce();

		expect(createPosterMapScenes).not.toHaveBeenCalled();
		expect(store.posterMapScenesOffered).toBe(true);
	});

	it("says nothing — and stays askable — when no map art is on disk", async () => {
		posterMapScenePlan.mockResolvedValue([]);

		await offerPosterMapScenesOnce();

		expect(ask).not.toHaveBeenCalled();
		// Left unset on purpose: a GM who imports their maps next month still gets asked.
		expect(store.posterMapScenesOffered).toBe(false);
	});

	it("stays askable when every map on disk already has its Scene", async () => {
		posterMapScenePlan.mockResolvedValue([{ ...MAP("vicinity"), hasScene: true }]);

		await offerPosterMapScenesOnce();

		expect(ask).not.toHaveBeenCalled();
		expect(store.posterMapScenesOffered).toBe(false);
	});

	it("does not browse at all once the offer has been made", async () => {
		harness({ settings: { posterMapScenesOffered: true } });

		await offerPosterMapScenesOnce();

		expect(posterMapScenePlan).not.toHaveBeenCalled();
	});

	it("never runs for a player or a second GM", async () => {
		harness({ isGM: false });
		await offerPosterMapScenesOnce();
		expect(posterMapScenePlan).not.toHaveBeenCalled();

		harness({ activeGmId: "gm-2" });
		await offerPosterMapScenesOnce();
		expect(posterMapScenePlan).not.toHaveBeenCalled();
	});

	it("warns about a map whose Scene could not be built, without losing the others", async () => {
		const rows = [MAP("vicinity"), MAP("marshedge")];
		posterMapScenePlan.mockResolvedValue(rows);
		ask.mockResolvedValue(rows);
		createPosterMapScenes.mockResolvedValue({ created: 1, updated: 0, pins: 0, failures: ["Marshedge"] });

		await offerPosterMapScenesOnce();

		expect(global.ui.notifications.info).toHaveBeenCalled();
		expect(global.ui.notifications.warn.mock.calls[0][0]).toContain("Marshedge");
	});
});
