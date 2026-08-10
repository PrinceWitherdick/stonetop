import { describe, expect, it, beforeEach } from "vitest";
import { getSheetSize, setSheetSize } from "../../module/settings.js";
import { restoreSheetSize, persistSheetSize, scheduleSheetSizeSave, withSheetSizeMemory } from "../../module/utils/sheet-size.js";

// An actor sheet reopens at the size its user last left it — character, steading, monster
// and NPC alike. This used to be character-only and width-only, under a
// "characterSheetWidths" map of actorId -> number; it now remembers both dimensions for
// every actor sheet under "sheetSizes" as actorId -> {width, height}.
//
// Two things here are easy to get wrong and would be quiet about it:
//
//  • The legacy map still has to be READ, or every user who already had a width remembered
//    silently loses it on upgrade. (It is also why that setting stays registered — the
//    settings-registration suite fails any registered setting nothing reads.)
//  • The two dimensions have to be stored INDEPENDENTLY. The caller passes null for a
//    dimension whose current reading is junk — a minimized window, or a height still the
//    string "auto" because setPosition has not run yet. If null overwrote, one bad reading
//    would wipe a good stored value.
//  • Only a size the USER DRAGGED may be recorded. Core reflows every render through
//    setPosition, so anything keyed off "the size changed" records core's own measurement and
//    freezes the sheet at it. See the withSheetSizeMemory block at the bottom.

/** Comfortably past the mixin's 500ms debounce, for the "nothing lands later" assertions. */
const SAVE_DEBOUNCE_TEST_MS = 600;

let store;

beforeEach(() => {
	store = { characterSheetWidths: {}, sheetSizes: {} };
	global.game = {
		settings: {
			get: (_ns, key) => store[key],
			set: (_ns, key, value) => { store[key] = value; return Promise.resolve(value); },
		},
	};
});

describe("character sheet size persistence", () => {
	it("has nothing to say about a sheet that was never sized", () => {
		expect(getSheetSize("actor-1")).toEqual({ width: null, height: null });
	});

	it("round-trips both dimensions", async () => {
		await setSheetSize("actor-1", { width: 1200, height: 900 });
		expect(getSheetSize("actor-1")).toEqual({ width: 1200, height: 900 });
	});

	it("keeps sheets apart", async () => {
		await setSheetSize("actor-1", { width: 1200, height: 900 });
		await setSheetSize("actor-2", { width: 700, height: 500 });
		expect(getSheetSize("actor-1")).toEqual({ width: 1200, height: 900 });
		expect(getSheetSize("actor-2")).toEqual({ width: 700, height: 500 });
	});

	it("still honours a width remembered by the old width-only map", () => {
		store.characterSheetWidths = { "actor-1": 1180 };
		// No height was ever stored under the old scheme, so the sheet keeps its default one.
		expect(getSheetSize("actor-1")).toEqual({ width: 1180, height: null });
	});

	it("lets a new write supersede the legacy width", async () => {
		store.characterSheetWidths = { "actor-1": 1180 };
		await setSheetSize("actor-1", { width: 1300 });
		expect(getSheetSize("actor-1").width).toBe(1300);
	});

	it("does not let a null dimension wipe the other one", async () => {
		await setSheetSize("actor-1", { width: 1200, height: 900 });
		// A frame that could only measure the width — the height reading was unusable.
		await setSheetSize("actor-1", { width: 1250, height: null });
		expect(getSheetSize("actor-1")).toEqual({ width: 1250, height: 900 });
		// ...and the same in reverse.
		await setSheetSize("actor-1", { width: null, height: 950 });
		expect(getSheetSize("actor-1")).toEqual({ width: 1250, height: 950 });
	});

	it("ignores values that aren't a real pixel measurement", async () => {
		await setSheetSize("actor-1", { width: 1200, height: 900 });
		// "auto" is what `position.height` reads as on a window nothing has sized yet.
		for (const junk of ["auto", 0, -50, NaN, undefined, null, "wide"]) {
			await setSheetSize("actor-1", { width: junk, height: junk });
		}
		expect(getSheetSize("actor-1")).toEqual({ width: 1200, height: 900 });
	});

	it("rounds to whole pixels", async () => {
		await setSheetSize("actor-1", { width: 1200.4, height: 899.6 });
		expect(getSheetSize("actor-1")).toEqual({ width: 1200, height: 900 });
	});

	it("skips the write when nothing actually changed", async () => {
		await setSheetSize("actor-1", { width: 1200, height: 900 });
		const written = store.sheetSizes;
		await setSheetSize("actor-1", { width: 1200, height: 900 });
		// Same object identity: settings.set was never called again. This matters because the
		// save is debounced off every resize frame and a client set round-trips the server.
		expect(store.sheetSizes).toBe(written);
	});

	it("ignores a sheet with no id rather than writing under a junk key", async () => {
		await setSheetSize(undefined, { width: 1200, height: 900 });
		expect(store.sheetSizes).toEqual({});
		expect(getSheetSize(undefined)).toEqual({ width: null, height: null });
	});
});

/** A stand-in for a sheet at construction time: the surface restoreSheetSize touches. */
function fakeSheet(actorId, options = {}) {
	return {
		actor: { id: actorId },
		options: { width: 800, height: 600, ...options },
		position: { width: 800, height: 600, ...options },
	};
}

describe("restoreSheetSize", () => {
	it("does nothing to a sheet with nothing remembered", () => {
		const app = fakeSheet("actor-1");
		expect(restoreSheetSize(app)).toEqual({ width: null, height: null });
		expect(app.options.width).toBe(800);
		expect(app.options.height).toBe(600);
		expect(app._stonetopHeightLocked).toBeUndefined();
	});

	it("applies a remembered size to both options and position", async () => {
		await setSheetSize("actor-1", { width: 1200, height: 900 });
		const app = fakeSheet("actor-1");
		restoreSheetSize(app);
		// options is what core consults on later setPosition calls; position is what the
		// window is actually drawn at. Both have to agree or the first reflow undoes it.
		expect(app.options).toMatchObject({ width: 1200, height: 900 });
		expect(app.position).toMatchObject({ width: 1200, height: 900 });
	});

	it("takes over an auto-height sheet, so its own refits stop discarding the size", async () => {
		// The NPC sheet's case, and the whole reason this is not a two-line assignment.
		// `height: "auto"` tells core to blank the inline height and refit on EVERY
		// setPosition — including the sheet's own `{height: "auto"}` refits, which key off
		// the argument rather than the option. Writing a number into options.height is only
		// half of it; the lock flag is what makes those refits drop their height.
		await setSheetSize("npc-1", { width: 620, height: 880 });
		const app = fakeSheet("npc-1", { height: "auto" });
		restoreSheetSize(app);
		expect(app.options.height).toBe(880);
		expect(app._stonetopHeightLocked).toBe(true);
	});

	it("leaves an auto-height sheet auto when only a width is remembered", async () => {
		await setSheetSize("npc-2", { width: 620 });
		const app = fakeSheet("npc-2", { height: "auto" });
		restoreSheetSize(app);
		// Still fits its content on open, which is the point of auto-height.
		expect(app.options.height).toBe("auto");
		expect(app.options.width).toBe(620);
		expect(app._stonetopHeightLocked).toBeUndefined();
	});

	it("reports what it restored, so a sheet can stand down its own initial sizing", async () => {
		// The monster sheet measures itself once to put Notes below the fold. That is a good
		// first guess and a bad second one — it must not fire over a restored height.
		await setSheetSize("monster-1", { width: 760, height: 1000 });
		expect(restoreSheetSize(fakeSheet("monster-1")).height).toBe(1000);
		expect(restoreSheetSize(fakeSheet("monster-2")).height).toBeNull();
	});
});

describe("persistSheetSize", () => {
	it("stores the window's current size", async () => {
		const app = fakeSheet("actor-1");
		app.position = { width: 1111, height: 777 };
		await persistSheetSize(app);
		expect(getSheetSize("actor-1")).toEqual({ width: 1111, height: 777 });
	});

	it("declines to record a minimized window", async () => {
		await setSheetSize("actor-1", { width: 1200, height: 900 });
		const app = fakeSheet("actor-1");
		app.position = { width: 200, height: 40 };
		app._minimized = true;
		await persistSheetSize(app);
		expect(getSheetSize("actor-1")).toEqual({ width: 1200, height: 900 });
	});

	it("declines a dimension under the window's own floor", async () => {
		const app = fakeSheet("actor-1", {});
		app.options.minWidth = 800;
		app.position = { width: 400, height: 700 };
		await persistSheetSize(app);
		// The too-narrow width is refused; the good height still lands.
		expect(getSheetSize("actor-1")).toEqual({ width: null, height: 700 });
	});

	it("does not store a height that is still \"auto\"", async () => {
		const app = fakeSheet("actor-1");
		app.position = { width: 620, height: "auto" };
		await persistSheetSize(app);
		expect(getSheetSize("actor-1")).toEqual({ width: 620, height: null });
	});

	// The timer holds a reference to the sheet, and through it the DOM it was rendering. Left
	// armed on a closing sheet it keeps both alive for the rest of the debounce window — and
	// would then write again, after close() already wrote.
	it("cancels a queued save, so a closing sheet leaves no timer behind", async () => {
		const app = fakeSheet("actor-1");
		app.position = { width: 1111, height: 777 };
		scheduleSheetSizeSave(app);
		expect(app._sizeSaveTimer).toBeDefined();
		await persistSheetSize(app);
		// Node returns a Timeout object; clearTimeout on it is what matters, so assert the
		// observable half: no second write lands once the debounce window has passed.
		const written = store.sheetSizes;
		await new Promise(r => setTimeout(r, 20));
		expect(store.sheetSizes).toBe(written);
	});
});

describe("withSheetSizeMemory", () => {
	/** A minimal AppV1-shaped base: enough for the mixin's three hooks to run against. */
	class FakeBase {
		closed = false;
		resized = 0;
		constructor(actorId) {
			this.actor = { id: actorId };
			this.options = { width: 800, height: 600 };
			this.position = { width: 800, height: 600 };
		}
		setPosition(options = {}) { Object.assign(this.position, options); return this.position; }
		_onResize() { this.resized += 1; }
		async close() { this.closed = true; }
	}
	const Sheet = withSheetSizeMemory(FakeBase);

	it("restores the remembered size at construction and exposes what it found", async () => {
		await setSheetSize("actor-1", { width: 1200, height: 900 });
		const app = new Sheet("actor-1");
		expect(app._restoredSheetSize).toEqual({ width: 1200, height: 900 });
		expect(app.options.width).toBe(1200);
		expect(app.position.height).toBe(900);
	});

	it("reports nothing restored when there is nothing stored", () => {
		expect(new Sheet("actor-1")._restoredSheetSize).toEqual({ width: null, height: null });
	});

	// The whole point of hanging off _onResize. Core ends EVERY _render with
	// `setPosition(this.position)`, and `this.position` always carries a width and a height, so
	// a setPosition-driven save fires on plain renders — and setPosition never leaves a height
	// as "auto" either (it computes offsetHeight+1 and clamps that in). Between them, an
	// untouched sheet would store its own auto-measured size on first open and be pinned to it
	// from then on: no auto-height, and no way to ever ship a new default.
	it("records nothing for a sheet nobody resized", async () => {
		const app = new Sheet("actor-1");
		app.setPosition({ left: 10, top: 20 });          // a drag
		app.setPosition({ width: 800, height: 742 });    // core's own per-render reflow
		expect(app._sizeSaveTimer, "neither may arm the debounce").toBeUndefined();
		await app.close();
		expect(getSheetSize("actor-1")).toEqual({ width: null, height: null });
	});

	// Draggable#_onResizeMouseUp is the one caller of _onResize, so it is exactly "the user let
	// go of the resize handle" and nothing else.
	it("queues a save once the user has dragged the resize handle", () => {
		const app = new Sheet("actor-1");
		app._onResize(new Event("pointerup"));
		expect(app._stonetopUserSized).toBe(true);
		expect(app._sizeSaveTimer, "the drag must arm the debounce").toBeDefined();
		expect(app.resized, "the base's own _onResize must still run").toBe(1);
		clearTimeout(app._sizeSaveTimer);
	});

	it("writes immediately on close once resized, then continues up the chain", async () => {
		const app = new Sheet("actor-1");
		app._onResize(new Event("pointerup"));
		app.position = { width: 1111, height: 777 };
		await app.close();
		expect(getSheetSize("actor-1")).toEqual({ width: 1111, height: 777 });
		expect(app.closed, "super.close() must still run").toBe(true);
	});

	it("leaves no timer behind on a sheet it declines to record", async () => {
		const app = new Sheet("actor-1");
		app._onResize(new Event("pointerup"));
		app._stonetopUserSized = false;  // as if the drag had never happened
		app.position = { width: 1111, height: 777 };
		await app.close();
		await new Promise(r => setTimeout(r, SAVE_DEBOUNCE_TEST_MS));
		expect(getSheetSize("actor-1")).toEqual({ width: null, height: null });
	});
});
