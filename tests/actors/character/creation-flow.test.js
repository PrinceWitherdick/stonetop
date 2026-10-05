import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	trackCreationFlow,
	creationFlowOpen,
	closeCreationFlowFor,
	registerCreationFlowCleanup,
	holdCreationFlow,
	closeAndSettle,
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

/**
 * A window whose close() behaves as core's AppV1 one does (application-v1.mjs): it does nothing
 * at all unless the window is RENDERED or ERROR, and otherwise goes to CLOSING, staying there
 * until `finishFade()` (core's 200ms slide-up) takes it to CLOSED.
 */
function coreWindow(state = RENDER_STATES.RENDERED) {
	const win = {
		_state: state,
		closed: false,
		get rendered() { return win._state === RENDER_STATES.RENDERED; },
		close: vi.fn(async () => {
			if (![RENDER_STATES.RENDERED, RENDER_STATES.ERROR].includes(win._state)) return;
			win._state = RENDER_STATES.CLOSING;
			win.closed = true;
		}),
		finishFade() { win._state = RENDER_STATES.CLOSED; },
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

	// A window mid-render is exactly the one an actor delete is most likely to catch (the
	// walkthrough re-renders on every click). Core's close() is a NO-OP on a window that is still
	// painting, so a close sent then was simply lost and the window appeared over a dead actor.
	it("closes a window whose character is deleted while it is still painting", async () => {
		const win = trackCreationFlow(coreWindow(RENDER_STATES.RENDERING), "a1");
		expect(closeCreationFlowFor("a1")).toBe(1);
		expect(win.closed, "nothing to close until the paint lands").toBe(false);
		win._state = RENDER_STATES.RENDERED;
		await vi.waitFor(() => expect(win.closed).toBe(true));
		expect(win._suppressOnClose).toBe(true);
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

// Starting a flow can await before its window exists (the resume path fetches its playbook
// first). The ready-time sweep is synchronous, so without a hold a second character's greeting
// opened in that gap, beside the first flow.
describe("holdCreationFlow", () => {
	it("counts a flow as open from the moment it starts, until it settles", async () => {
		let finish;
		const started = new Promise(resolve => { finish = resolve; });
		expect(holdCreationFlow("a2", started)).toBe(started);
		expect(creationFlowOpen()).toBe(true);
		expect(creationFlowOpen("a2")).toBe(true);
		finish();
		await started;
		await Promise.resolve();
		expect(creationFlowOpen()).toBe(false);
	});

	it("lets go of a flow that failed to start", async () => {
		const failed = Promise.reject(new Error("no playbook"));
		holdCreationFlow("a3", failed);
		await failed.catch(() => {});
		await Promise.resolve();
		expect(creationFlowOpen("a3")).toBe(false);
	});
});

describe("closeAndSettle", () => {
	// The replacement greeting shares the old one's DOM id. Opened while the old element was still
	// fading out, it drew INTO that element (core finds an element by id) and vanished with it.
	it("resolves only once the window has finished fading out", async () => {
		const win = coreWindow(RENDER_STATES.RENDERED);
		let settled = false;
		const done = closeAndSettle(win).then(() => { settled = true; });
		await new Promise(resolve => setTimeout(resolve, 40));
		expect(win._state).toBe(RENDER_STATES.CLOSING);
		expect(settled).toBe(false);
		win.finishFade();
		await done;
		expect(settled).toBe(true);
	});

	it("waits out a window that is already fading, which core's close() returns from at once", async () => {
		const win = coreWindow(RENDER_STATES.CLOSING);
		let settled = false;
		const done = closeAndSettle(win).then(() => { settled = true; });
		await new Promise(resolve => setTimeout(resolve, 40));
		expect(settled).toBe(false);
		win.finishFade();
		await done;
		expect(settled).toBe(true);
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

	// A flow already on its way (awaiting its playbook) when its character is deleted registers
	// afterwards; it is closed on arrival rather than opening over the dead actor.
	it("closes a window that registers for a character already deleted", () => {
		const onDelete = handler();
		onDelete(actor("a9"));
		const late = trackCreationFlow(fakeWindow(), "a9");
		expect(late.closed).toBe(true);
		expect(late._suppressOnClose).toBe(true);
		expect(creationFlowOpen("a9")).toBe(false);
	});

	// The real callers register BEFORE rendering: `trackCreationFlow(new X(), id).render(true)`.
	// Core's close() is a no-op in NONE, so closing would let the chained render paint it anyway.
	it("stops a not-yet-rendered window for a deleted character from ever rendering", () => {
		const onDelete = handler();
		onDelete(actor("a8"));
		const win = coreWindow(RENDER_STATES.NONE);
		const render = vi.fn(() => { win._state = RENDER_STATES.RENDERING; return win; });
		win.render = render;
		const back = trackCreationFlow(win, "a8").render(true);
		expect(back).toBe(win);
		expect(render).not.toHaveBeenCalled();
		expect(win._state).toBe(RENDER_STATES.NONE);
		expect(win._suppressOnClose).toBe(true);
		expect(creationFlowOpen("a8")).toBe(false);
	});

	it("leaves non-characters alone", () => {
		const onDelete = handler();
		// Its own id: a character deleted earlier in this file stays deleted for the module's life,
		// exactly as an actor id does in a world.
		const win = trackCreationFlow(fakeWindow(), "a5");
		onDelete({ id: "a5", type: "npc", name: "A follower" });
		expect(win.closed).toBe(false);
		closeCreationFlowFor("a5");
	});
});
