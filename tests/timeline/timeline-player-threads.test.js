import { describe, it, expect, beforeEach, afterEach } from "vitest";

// A PLAYER'S FULL TIMELINE OPENS ON THEIR OWN STORY (user, 2026-10-03). Until they tick a thread in
// the Filter menu, the aggregate hides every thread but their own characters'; a GM is never
// defaulted. Their first tick changes that one thread, starting from what they are looking at, and
// from then on their own list is what counts.

const { TimelineWindow } = await import("../../module/dialogs/TimelineWindow.js");

const TRACKS = [
	{ trackId: "steading", trackKind: "steading", name: "Stonetop", actor: { isOwner: true }, entries: [] },
	{ trackId: "pc-ellis", trackKind: "character", name: "Ellis",    actor: { isOwner: true }, entries: [] },
	{ trackId: "pc-kefta", trackKind: "character", name: "Kefta",    actor: { isOwner: false }, entries: [] },
];

let savedGame;
let store;
function aggregate() {
	const window = new TimelineWindow({});
	window._tracks = () => TRACKS;
	window.render = () => {};
	return window;
}

beforeEach(() => {
	savedGame = globalThis.game;
	store = new Map();
	globalThis.game = {
		...globalThis.game,
		user: { isGM: false },
		settings: {
			get: (_scope, key) => store.get(key),
			set: async (_scope, key, value) => { store.set(key, value); return value; },
		},
	};
});
afterEach(() => { globalThis.game = savedGame; });

describe("a player's aggregate before they choose", () => {
	it("shows only their own characters' threads", () => {
		expect(aggregate()._hiddenTracks(TRACKS)).toEqual(["steading", "pc-kefta"]);
	});

	it("leaves a GM's board whole", () => {
		game.user.isGM = true;
		expect(aggregate()._hiddenTracks(TRACKS)).toEqual([]);
	});
});

describe("once they choose", () => {
	// From what they were looking at: ticking Stonetop on must not throw Kefta back on too.
	it("changes only the thread they ticked, and the default is spent", async () => {
		const window = aggregate();
		await window._onShowThread("steading", true);
		expect(store.get("timelineThreadsChosen")).toBe(true);
		expect(window._hiddenTracks(TRACKS)).toEqual(["pc-kefta"]);
	});

	it("shows everything on Show everything, and keeps it", async () => {
		const window = aggregate();
		await window._onShowAll();
		expect(window._hiddenTracks(TRACKS)).toEqual([]);
	});
});
