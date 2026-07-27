import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Window restore persists the sheets this client had open — geometry, active tab, and the
// Stonetop edit/lock mode — and replays them on ready. These tests drive the module through
// its real hooks: install it, fire renderActorSheet/closeActorSheet with fake sheets, let the
// debounce flush, then run restoreOpenWindows() against the state it wrote.

let hooks;      // hook name -> array of callbacks
let settings;   // setting key -> value
let docs;       // uuid -> fake document
let listeners;  // window event name -> callbacks

let installWindowRestore;
let restoreOpenWindows;

function fire(hook, ...args) {
	(hooks[hook] ?? []).forEach((fn) => fn(...args));
}

// A stand-in for one of our AppV1 sheets: a positioned window over a world document, with
// the edit/lock mode as a plain instance field the way the real sheets carry it.
function fakeSheet({ uuid = "Actor.abc", editMode = false, isEditable = true, position = { left: 100, top: 50, width: 800, height: 600 } } = {}) {
	const doc = { uuid, sheet: null };
	const sheet = {
		document: doc,
		position,
		isEditable,
		_editMode: editMode,
		render: vi.fn(),
		testUserPermission: () => true,
	};
	doc.sheet = sheet;
	doc.testUserPermission = () => true;
	docs[uuid] = doc;
	return sheet;
}

beforeEach(async () => {
	vi.useFakeTimers();
	hooks = {};
	listeners = {};
	docs = {};
	settings = { restoreWindowsOnReload: true, openWindowsState: {} };

	global.Hooks = {
		on: (name, fn) => { (hooks[name] ??= []).push(fn); },
		once: (name, fn) => { (hooks[name] ??= []).push(fn); },
	};
	global.game = {
		...global.game,
		settings: {
			get: (_scope, key) => settings[key],
			set: (_scope, key, value) => { settings[key] = value; return Promise.resolve(value); },
		},
	};
	global.window = {
		innerWidth: 1920,
		innerHeight: 1080,
		addEventListener: (name, fn) => { (listeners[name] ??= []).push(fn); },
	};
	global.fromUuid = async (uuid) => docs[uuid] ?? null;

	// Fresh module instance per test — the live registry of open sheets is module state.
	vi.resetModules();
	({ installWindowRestore, restoreOpenWindows } = await import("../../module/utils/window-restore.js"));
	installWindowRestore();
});

afterEach(() => { vi.useRealTimers(); });

const saved = (uuid) => settings.openWindowsState[uuid];

describe("snapshotting open sheets", () => {
	it("records the edit/lock mode alongside the geometry", () => {
		fire("renderActorSheet", fakeSheet({ uuid: "Actor.edit", editMode: true }));
		vi.advanceTimersByTime(500);
		expect(saved("Actor.edit")).toMatchObject({ left: 100, top: 50, editMode: true });
	});

	it("records a locked sheet as locked, not as absent", () => {
		fire("renderActorSheet", fakeSheet({ uuid: "Actor.locked", editMode: false }));
		vi.advanceTimersByTime(500);
		expect(saved("Actor.locked").editMode).toBe(false);
	});

	it("stores no mode for a sheet that has none (core sheets, journals)", () => {
		const plain = fakeSheet({ uuid: "Actor.plain" });
		delete plain._editMode;
		fire("renderActorSheet", plain);
		vi.advanceTimersByTime(500);
		expect("editMode" in saved("Actor.plain")).toBe(false);
	});

	it("follows a mode toggled after the first render", () => {
		const sheet = fakeSheet({ uuid: "Actor.toggled", editMode: false });
		fire("renderActorSheet", sheet);
		vi.advanceTimersByTime(500);
		// The header wrench flips the flag and re-renders.
		sheet._editMode = true;
		fire("renderActorSheet", sheet);
		vi.advanceTimersByTime(500);
		expect(saved("Actor.toggled").editMode).toBe(true);
	});

	it("drops a closed sheet from the snapshot", () => {
		const sheet = fakeSheet({ uuid: "Actor.closed", editMode: true });
		fire("renderActorSheet", sheet);
		vi.advanceTimersByTime(500);
		fire("closeActorSheet", sheet);
		vi.advanceTimersByTime(500);
		expect(saved("Actor.closed")).toBeUndefined();
	});
});

describe("restoring the edit/lock mode", () => {
	// Restore renders on a stagger; run the queued timers and let the awaited fromUuid settle.
	async function restore() {
		await restoreOpenWindows();
		await vi.runAllTimersAsync();
	}

	it("reopens a sheet left in edit mode in edit mode", async () => {
		// A sheet constructed fresh after the reload defaults to locked.
		const sheet = fakeSheet({ uuid: "Actor.edit", editMode: false });
		settings.openWindowsState = { "Actor.edit": { left: 10, top: 20, width: 800, height: 600, editMode: true } };
		await restore();
		expect(sheet._editMode).toBe(true);
		expect(sheet.render).toHaveBeenCalled();
	});

	it("reopens a sheet left locked as locked, even when it constructed itself in edit mode", async () => {
		// Mirrors the "Open Sheets in Edit Mode" client setting being on.
		const sheet = fakeSheet({ uuid: "Actor.locked", editMode: true });
		settings.openWindowsState = { "Actor.locked": { left: 10, top: 20, editMode: false } };
		await restore();
		expect(sheet._editMode).toBe(false);
	});

	it("sets the mode before the sheet renders, so the first render is in that mode", async () => {
		const sheet = fakeSheet({ uuid: "Actor.order", editMode: false });
		let modeAtRender = null;
		sheet.render = vi.fn(() => { modeAtRender = sheet._editMode; });
		settings.openWindowsState = { "Actor.order": { left: 10, top: 20, editMode: true } };
		await restore();
		expect(modeAtRender).toBe(true);
	});

	it("leaves a sheet this user cannot edit in play mode", async () => {
		const sheet = fakeSheet({ uuid: "Actor.readonly", editMode: false, isEditable: false });
		settings.openWindowsState = { "Actor.readonly": { left: 10, top: 20, editMode: true } };
		await restore();
		expect(sheet._editMode).toBe(false);
		expect(sheet.render).toHaveBeenCalled();
	});

	it("restores nothing when the reopen setting is off", async () => {
		const sheet = fakeSheet({ uuid: "Actor.edit", editMode: false });
		settings.restoreWindowsOnReload = false;
		settings.openWindowsState = { "Actor.edit": { left: 10, top: 20, editMode: true } };
		await restore();
		expect(sheet._editMode).toBe(false);
		expect(sheet.render).not.toHaveBeenCalled();
	});
});
