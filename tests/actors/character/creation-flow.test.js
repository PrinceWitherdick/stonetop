import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	trackCreationFlow,
	creationFlowOpen,
	closeCreationFlowFor,
	registerCreationFlowCleanup,
} from "../../../module/actors/character/creation-flow.js";

// A creation window as the tracker sees one: `rendered` is how it tells live from closed,
// and close() is what it calls. Mirrors Application's contract, which flips `rendered`
// false the moment close() runs.
function fakeWindow() {
	const win = {
		rendered: true,
		closed:   false,
		close:    vi.fn(async () => { win.rendered = false; win.closed = true; }),
	};
	return win;
}

/**
 * The same window as FOUNDRY hands it over: registered on the synchronous return from
 * `render(true)`, at which point `_state` is RENDERING and `rendered` is still FALSE — it only
 * flips true once _render has finished awaiting getData and the template fetch.
 *
 * That gap is the whole reason liveness is read off the render state. Every window here is
 * registered inside it, so a `rendered`-only test dropped each one microseconds after it was
 * added — leaving the duplicate-dialog guards with nothing to find.
 */
const RENDER_STATES = { ERROR: -3, CLOSING: -2, CLOSED: -1, NONE: 0, RENDERING: 1, RENDERED: 2 };
function foundryWindow(state = RENDER_STATES.RENDERING) {
	const win = {
		_state:   state,
		closed:   false,
		get rendered() { return win._state === RENDER_STATES.RENDERED; },
		close:    vi.fn(async () => { win._state = RENDER_STATES.CLOSED; win.closed = true; }),
	};
	return win;
}

const actor = (id, over = {}) => ({ id, type: "character", name: `PC ${id}`, ...over });

beforeEach(() => {
	// The module keeps one map for the life of the client; clear it between tests by
	// closing everything it might still hold from the previous one.
	for (const id of ["a1", "a2", "a3"]) closeCreationFlowFor(id);
	global.ui = { notifications: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } };
});

describe("creationFlowOpen", () => {
	it("is false with nothing open", () => {
		expect(creationFlowOpen()).toBe(false);
		expect(creationFlowOpen("a1")).toBe(false);
	});

	it("answers both 'anyone?' and 'this character?'", () => {
		trackCreationFlow(fakeWindow(), "a1");
		expect(creationFlowOpen()).toBe(true);
		expect(creationFlowOpen("a1")).toBe(true);
		// Another character's flow still counts as "someone is mid-creation on this screen",
		// which is what stops a fresh greeting burying it.
		expect(creationFlowOpen("a2")).toBe(false);
	});

	it("forgets a window once it has closed, without needing a close hook", () => {
		const win = trackCreationFlow(fakeWindow(), "a1");
		win.rendered = false;
		expect(creationFlowOpen()).toBe(false);
	});

	// The window is registered BEFORE it has finished painting, which is the state every caller
	// hands it over in (`trackCreationFlow(new Dialog(…), id).render(true)`). Counting it as gone
	// let the ready hook's synchronous sweep over game.actors open a second dialog with the same
	// DOM id — the exact duplication both this and CharacterCreationDialog.open guard against.
	it("counts a window that is still painting as open", () => {
		trackCreationFlow(foundryWindow(RENDER_STATES.RENDERING), "a1");
		expect(creationFlowOpen()).toBe(true);
		expect(creationFlowOpen("a1")).toBe(true);
	});

	it("still forgets one that has really closed", () => {
		const win = trackCreationFlow(foundryWindow(RENDER_STATES.RENDERED), "a1");
		expect(creationFlowOpen()).toBe(true);
		win._state = RENDER_STATES.CLOSED;
		expect(creationFlowOpen()).toBe(false);
	});

	// A window mid-render is exactly the one an actor delete is most likely to catch, and it
	// could not be closed at all while it was being pruned on arrival.
	it("closes a window whose character is deleted while it is still painting", () => {
		const win = trackCreationFlow(foundryWindow(RENDER_STATES.RENDERING), "a1");
		expect(closeCreationFlowFor("a1")).toBe(1);
		expect(win.closed).toBe(true);
	});

	it("ignores a bad registration rather than recording a window with no owner", () => {
		trackCreationFlow(fakeWindow(), null);
		trackCreationFlow(null, "a1");
		expect(creationFlowOpen()).toBe(false);
	});

	it("hands the window back so callers can chain .render()", () => {
		const win = fakeWindow();
		expect(trackCreationFlow(win, "a1")).toBe(win);
	});
});

describe("closeCreationFlowFor", () => {
	it("closes only the windows building that character", () => {
		const mine  = trackCreationFlow(fakeWindow(), "a1");
		const other = trackCreationFlow(fakeWindow(), "a2");
		expect(closeCreationFlowFor("a1")).toBe(1);
		expect(mine.closed).toBe(true);
		expect(other.closed).toBe(false);
	});

	it("closes every window for one character — intro, picker and walkthrough can overlap", () => {
		const first  = trackCreationFlow(fakeWindow(), "a1");
		const second = trackCreationFlow(fakeWindow(), "a1");
		expect(closeCreationFlowFor("a1")).toBe(2);
		expect(first.closed).toBe(true);
		expect(second.closed).toBe(true);
	});

	it("reports nothing closed for an unknown character", () => {
		expect(closeCreationFlowFor("nobody")).toBe(0);
		expect(closeCreationFlowFor(null)).toBe(0);
	});

	it("keeps going when one window refuses to close", () => {
		const bad  = trackCreationFlow(fakeWindow(), "a1");
		bad.close  = vi.fn(async () => { throw new Error("nope"); });
		const good = trackCreationFlow(fakeWindow(), "a1");
		expect(() => closeCreationFlowFor("a1")).not.toThrow();
		expect(good.closed).toBe(true);
	});
});

describe("registerCreationFlowCleanup", () => {
	// Capture the deleteActor handler the module registers.
	function handler() {
		let fn = null;
		global.Hooks = { on: (name, cb) => { if (name === "deleteActor") fn = cb; }, once: () => {} };
		registerCreationFlowCleanup();
		return fn;
	}

	it("closes a flow whose character was deleted, and says why", () => {
		const onDelete = handler();
		const win = trackCreationFlow(fakeWindow(), "a1");
		onDelete(actor("a1"));
		expect(win.closed).toBe(true);
		// A walkthrough vanishing mid-sentence with no explanation reads as a crash.
		expect(ui.notifications.warn).toHaveBeenCalledWith(expect.stringContaining("PC a1"));
	});

	it("stays quiet when the deleted character had no flow open", () => {
		const onDelete = handler();
		trackCreationFlow(fakeWindow(), "a1");
		onDelete(actor("a2"));
		expect(ui.notifications.warn).not.toHaveBeenCalled();
	});

	it("leaves non-characters alone", () => {
		const onDelete = handler();
		const win = trackCreationFlow(fakeWindow(), "a1");
		onDelete({ id: "a1", type: "npc", name: "A follower" });
		expect(win.closed).toBe(false);
	});
});
