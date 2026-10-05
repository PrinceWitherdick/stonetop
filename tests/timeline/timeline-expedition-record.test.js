import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// THE ONE WRITER FOR A TRIP'S ROW. The walkthrough and the Return Triumphant move both reach it, and
// it works on whichever copy of the expedition log is live: an open walkthrough's own, else the
// world setting. These drive it against a store and fakes for the threads it writes on.

const fakes = vi.hoisted(() => ({
	recordOnTracks: vi.fn(async () => []),
	timelineNow:    vi.fn(() => ({ season: "autumn", year: 2 })),
	characters:     [],
	steading:       { id: "steading" },
	setting:        null,
	setWorldSetting: vi.fn(async () => {}),
}));

vi.mock("../../module/timeline/timeline-record.js", () => ({
	recordOnTracks: fakes.recordOnTracks,
	timelineNow:    fakes.timelineNow,
}));
vi.mock("../../module/utils/playbook-actors.js", () => ({ getPlayerCharacters: () => fakes.characters }));
vi.mock("../../module/utils/world.js", () => ({ getStonetopSteadingActor: () => fakes.steading }));
vi.mock("../../module/actors/character/deaths-door-actor.js", () => ({ isOutOfPlay: pc => !!pc.dead }));
vi.mock("../../module/settings.js", () => ({
	getSetting:      () => fakes.setting,
	setWorldSetting: fakes.setWorldSetting,
}));

const { recordTrip, tripLogStore } = await import("../../module/timeline/timeline-expedition-record.js");

/** A store over an in-memory log, the shape the walkthrough hands over. */
function memoryStore(log, { mints = false } = {}) {
	const store = {
		log,
		read:  () => store.log,
		write: vi.fn(async next => { store.log = next; }),
	};
	if (mints) store.newTrip = () => ({ id: "minted", title: "", createdAt: 1 });
	return store;
}

const trip = (extra = {}) => ({ id: "t1", title: "The Ford", journey: { destination: "the-maw" }, ...extra });

beforeEach(() => {
	game.user = { isGM: true };
	fakes.characters = [{ id: "a", name: "Bram" }, { id: "b", name: "Cora" }, { id: "c", name: "Dov", dead: true }];
	fakes.recordOnTracks.mockClear();
	fakes.setWorldSetting.mockClear();
	fakes.setting = null;
});

afterEach(() => {
	delete game.user;
	delete globalThis.ui;
});

describe("writing the row", () => {
	it("puts it on everyone who went, and Stonetop's", async () => {
		const store = memoryStore({ currentId: "t1", list: [trip({ partyOut: { b: true } })] });
		expect(await recordTrip({ store })).toBe(true);

		const [targets, milestone] = fakes.recordOnTracks.mock.calls[0];
		// Cora stayed home; Dov is past the Door.
		expect(targets.map(t => t.id)).toEqual(["a", "steading"]);
		expect(milestone).toEqual(expect.objectContaining({
			key: "expedition:t1", title: "The Ford", place: "the Maw",
		}));
		expect(milestone.body).toContain("Bram");
	});

	it("stamps the season it first went down in, and keeps that stamp on a rewrite", async () => {
		const store = memoryStore({ currentId: "t1", list: [trip()] });
		await recordTrip({ store });
		expect(store.log.list[0].timelineRecorded).toEqual({ season: "autumn", year: 2 });

		fakes.timelineNow.mockReturnValueOnce({ season: "winter", year: 2 });
		await recordTrip({ store });
		expect(store.log.list[0].timelineRecorded).toEqual({ season: "autumn", year: 2 });
	});

	// A triumph is part of the trip once made: recording again from the walkthrough's button must
	// not take it back off the row.
	it("keeps a triumph once it has been marked", async () => {
		const store = memoryStore({ currentId: "t1", list: [trip()] });
		await recordTrip({ store, triumphant: true });
		expect(store.log.list[0].returnedTriumphant).toBe(true);

		await recordTrip({ store });
		expect(fakes.recordOnTracks.mock.calls[1][1].body).toContain("Returned triumphant.");
	});

	// The store's log is the window's draft; the writer works on a copy and hands the whole back.
	it("does not touch the log it was handed until it writes", async () => {
		const before = { currentId: "t1", list: [trip()] };
		const store = memoryStore(before);
		await recordTrip({ store, triumphant: true });
		expect(before.list[0].returnedTriumphant).toBeUndefined();
		expect(store.write).toHaveBeenCalledOnce();
	});

	it("writes nothing for a player", async () => {
		game.user = { isGM: false };
		const store = memoryStore({ currentId: "t1", list: [trip()] });
		expect(await recordTrip({ store, triumphant: true })).toBe(false);
		expect(store.write).not.toHaveBeenCalled();
		expect(fakes.recordOnTracks).not.toHaveBeenCalled();
	});
});

// The steading sheet's door cannot see which trip is meant, so it credits only one that came home
// this season: never one still being planned, never one that came home seasons ago.
describe("a triumph made from the steading sheet", () => {
	it("credits the trip that came home this season", async () => {
		const store = memoryStore({ currentId: "t1", list: [trip({ timelineRecorded: { season: "autumn", year: 2 } })] });
		expect(await recordTrip({ store, triumphant: true, homeOnly: true })).toBe(true);
		expect(store.log.list[0].returnedTriumphant).toBe(true);
	});

	it("leaves a trip that has not come home alone, even in an open walkthrough that could mint one", async () => {
		const store = memoryStore({ currentId: "t1", list: [trip({ setOut: { season: "autumn", year: 2 } })] }, { mints: true });
		expect(await recordTrip({ store, triumphant: true, homeOnly: true })).toBe(false);
		const empty = memoryStore({ currentId: null, list: [] }, { mints: true });
		expect(await recordTrip({ store: empty, triumphant: true, homeOnly: true })).toBe(false);
		expect(store.write).not.toHaveBeenCalled();
		expect(empty.write).not.toHaveBeenCalled();
		expect(fakes.recordOnTracks).not.toHaveBeenCalled();
	});

	it("leaves a trip that came home in an earlier season alone", async () => {
		const store = memoryStore({ currentId: "t1", list: [trip({ timelineRecorded: { season: "summer", year: 2 } })] });
		expect(await recordTrip({ store, triumphant: true, homeOnly: true })).toBe(false);
		expect(fakes.recordOnTracks).not.toHaveBeenCalled();
	});
});

describe("a log with no trip in it", () => {
	// The steading sheet's door: a world that never logged an expedition has no trip to credit.
	it("is left alone by a store that cannot mint one", async () => {
		const store = memoryStore({ currentId: null, list: [] });
		expect(await recordTrip({ store, triumphant: true })).toBe(false);
		expect(store.write).not.toHaveBeenCalled();
		expect(fakes.recordOnTracks).not.toHaveBeenCalled();
	});

	// The walkthrough's door: a GM standing in it is on a trip, typed into or not.
	it("gets one from a store that can", async () => {
		const store = memoryStore({ currentId: null, list: [] }, { mints: true });
		expect(await recordTrip({ store })).toBe(true);
		expect(store.log.currentId).toBe("minted");
		expect(fakes.recordOnTracks.mock.calls[0][1].title).toBe("Expedition 1");
	});
});

describe("which copy of the log", () => {
	// Its draft is the log while it is up; writing the setting under it would be undone by its next save.
	it("is an open walkthrough's own, when one is up", () => {
		const own = { read: () => null, write: async () => {} };
		globalThis.ui = { windows: { 1: { id: "stonetop-expedition", rendered: true, tripLogStore: () => own } } };
		expect(tripLogStore()).toBe(own);
	});

	it("is the world setting otherwise, read normalized and written whole", async () => {
		fakes.setting = { list: [trip()] };
		const store = tripLogStore();
		expect(store.newTrip).toBeUndefined();
		expect(store.read()).toEqual({ currentId: "t1", list: [trip()] });

		await recordTrip({ triumphant: true });
		expect(fakes.setWorldSetting).toHaveBeenCalledWith("expeditionAnswers", expect.objectContaining({ currentId: "t1" }));
		expect(fakes.setWorldSetting.mock.calls[0][1].list[0].returnedTriumphant).toBe(true);
	});
});
