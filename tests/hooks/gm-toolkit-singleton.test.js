import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { registerStonetopSingletonHooks } from "../../module/hooks/StonetopSingleton.js";

// The GM Toolkit is a world SINGLETON, on the same two hooks the steading uses.
//
// One rather than one-per-GM because nothing on the sheet is per-GM: GmToolkitModel's schema is
// empty, the Moves and Core Loop tabs are reference transcribed from the playbook, and the
// Threats and Sites tabs read their storage off the steading. A second toolkit would be a second
// window onto identical data. What does vary between gamemasters is which sheet their "C" key
// opens, and that is a flag on their own User document.
//
// Enforced in preCreateActor rather than in the Create-Actor picker because this is the only
// place that catches every path: a macro, a duplicate, a compendium import and a drag-drop all
// go through the hook and none of them go near the picker. The delete guard is what lets the
// ready hook stay a plain find-or-mint, so it is load-bearing rather than a nicety: with
// deletion refused, "no toolkit in this world" can only mean "never made one".

/** Capture the two hook handlers the module registers. */
function registerHooks() {
	const handlers = {};
	globalThis.Hooks = { on: vi.fn((event, fn) => { (handlers[event] ??= []).push(fn); }) };
	registerStonetopSingletonHooks();
	return {
		preCreate: (...args) => handlers.preCreateActor.map(fn => fn(...args)).find(r => r === false) ?? undefined,
		preDelete: (...args) => handlers.preDeleteActor.map(fn => fn(...args)).find(r => r === false) ?? undefined,
	};
}

const toolkit = (id = "t1") => ({ id, type: "gmToolkit" });
const steading = (id = "s1") => ({ id, type: "stonetop" });

let warn, saved;
beforeEach(() => {
	saved = { game: globalThis.game, ui: globalThis.ui, Hooks: globalThis.Hooks };
	warn = vi.fn();
	globalThis.ui = { notifications: { warn } };
	globalThis.game = { actors: [], user: { isGM: true } };
});
afterEach(() => {
	globalThis.game = saved.game;
	globalThis.ui = saved.ui;
	globalThis.Hooks = saved.Hooks;
});

describe("the GM Toolkit is one per world", () => {
	it("lets the first one through", () => {
		const hooks = registerHooks();
		expect(hooks.preCreate({ type: "gmToolkit" }, { type: "gmToolkit" }, {})).not.toBe(false);
		expect(warn).not.toHaveBeenCalled();
	});

	it("vetoes a second, and says why", () => {
		globalThis.game.actors = [toolkit()];
		const hooks = registerHooks();
		expect(hooks.preCreate({ type: "gmToolkit" }, { type: "gmToolkit" }, {})).toBe(false);
		expect(warn).toHaveBeenCalledWith(expect.stringContaining("already has a GM Toolkit"));
	});

	// A duplicate carries the source document's full data rather than a bare {name, type}, and a
	// compendium import carries `keepId`. Neither is a special case here: the count is the whole
	// rule, so every path that reaches preCreateActor is covered by the same line.
	it("vetoes a duplicate and a compendium import too", () => {
		globalThis.game.actors = [toolkit()];
		const hooks = registerHooks();
		const dupe = { type: "gmToolkit", name: "GM Toolkit (Copy)", _stats: { duplicateSource: "Actor.t1" } };
		expect(hooks.preCreate(dupe, dupe, {})).toBe(false);
		expect(hooks.preCreate({ type: "gmToolkit" }, { type: "gmToolkit" }, { keepId: true })).toBe(false);
	});

	it("leaves every other actor type alone", () => {
		globalThis.game.actors = [toolkit()];
		const hooks = registerHooks();
		for (const type of ["character", "npc", "follower"]) {
			expect(hooks.preCreate({ type }, { type }, {}), type).not.toBe(false);
		}
	});
});

describe("the GM Toolkit cannot be deleted away", () => {
	// The guard the ready hook's simplicity rests on. Without it, "no toolkit" would be
	// ambiguous between never-made and thrown-away, and telling those apart is what the
	// per-user mint latch used to be for.
	it("refuses to delete the only one", () => {
		const only = toolkit();
		globalThis.game.actors = [only];
		const hooks = registerHooks();
		expect(hooks.preDelete(only)).toBe(false);
		expect(warn).toHaveBeenCalledWith(expect.stringContaining("cannot be deleted"));
	});

	// A world that somehow acquired two (made before the create guard shipped) can be tidied
	// back down to one, which is the only way out of that state.
	it("allows deleting a duplicate down to the last", () => {
		const [a, b] = [toolkit("t1"), toolkit("t2")];
		globalThis.game.actors = [a, b];
		const hooks = registerHooks();
		expect(hooks.preDelete(b)).not.toBe(false);
	});

	it("leaves every other actor type alone", () => {
		globalThis.game.actors = [toolkit()];
		const hooks = registerHooks();
		for (const type of ["character", "npc", "follower"]) {
			expect(hooks.preDelete({ id: "x", type }), type).not.toBe(false);
		}
	});
});

// The steading's own guards are older than the toolkit's and share the same two handlers, so
// these are here to catch a toolkit branch that swallowed the steading's.
describe("the steading's guards still hold", () => {
	it("vetoes a second steading and protects the last", () => {
		const only = steading();
		globalThis.game.actors = [only];
		const hooks = registerHooks();
		expect(hooks.preCreate({ type: "stonetop" }, { type: "stonetop" }, {})).toBe(false);
		expect(hooks.preDelete(only)).toBe(false);
	});

	it("lets the first steading through", () => {
		const hooks = registerHooks();
		expect(hooks.preCreate({ type: "stonetop" }, { type: "stonetop" }, {})).not.toBe(false);
	});
});
