import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The GM's macro pass finds each system macro by name AND command, the same match the re-snap and
// the player pass use. Found by name alone, a GM's own macro that happened to be called "Die of
// Fate" would be adopted as the system one: its icon overwritten, its ownership raised to everyone,
// and ours never created.

const settings = new Map([["systemHotbarLayoutVersion", 999]]); // past every re-snap
vi.mock("../../module/settings.js", () => ({
	getSetting: key => settings.get(key),
	setSetting: async (key, value) => { settings.set(key, value); },
}));
vi.mock("../../module/book2-art/macro.js", () => ({
	BOOK2_ART_MACRO_NAME: "Import Book Art",
	findBook2ArtWorldMacro: () => null,
	loadBook2ArtMacroSource: async () => null,
}));

const { ensureSystemMacros } = await import("../../module/hooks/system-macros.js");

const DIE_OF_FATE_CMD = "game.stonetop?.rollDieOfFate?.()";

function macroDoc(id, data) {
	const doc = { id, ownership: { default: 0 }, ...data };
	doc.update = vi.fn(async patch => {
		for (const [k, v] of Object.entries(patch)) {
			if (k === "ownership.default") doc.ownership.default = v; else doc[k] = v;
		}
	});
	return doc;
}

let priorGame;
beforeEach(() => {
	priorGame = global.game;
	global.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3 } };
	global.fetch = vi.fn(async () => ({ ok: false }));
});
afterEach(() => {
	global.game = priorGame;
	delete global.Macro;
});

function world(macros) {
	const list = Object.assign([...macros], { get: id => list.find(m => m.id === id) });
	const user = {
		hotbar: {},
		toObject() { return { hotbar: { ...user.hotbar } }; },
		async update() {},
		async assignHotbarMacro(m, slot) { if (m) user.hotbar[slot] = m.id; else delete user.hotbar[slot]; },
	};
	let n = 0;
	global.Macro = {
		create: vi.fn(async data => { const doc = macroDoc(`new${++n}`, data); list.push(doc); return doc; }),
		deleteDocuments: vi.fn(async () => {}),
	};
	global.game = { ...priorGame, macros: list, user, folders: [] };
	return list;
}

describe("ensureSystemMacros", () => {
	it("leaves a GM's own same-named macro alone and creates the system one beside it", async () => {
		const theirs = macroDoc("theirs", { name: "Die of Fate", command: "ui.notifications.info('mine')", img: "my.png" });
		world([theirs]);
		await ensureSystemMacros();

		expect(theirs.update).not.toHaveBeenCalled();
		expect(theirs.img).toBe("my.png");
		expect(theirs.ownership.default).toBe(0);
		const created = global.Macro.create.mock.calls.map(([d]) => d).find(d => d.name === "Die of Fate");
		expect(created?.command).toBe(DIE_OF_FATE_CMD);
	});

	it("still adopts the system copy and refreshes its drifted icon", async () => {
		const ours = macroDoc("ours", { name: "Die of Fate", command: DIE_OF_FATE_CMD, img: "old.svg" });
		world([ours]);
		await ensureSystemMacros();

		expect(ours.img).toMatch(/die-of-fate\.svg$/);
		expect(global.Macro.create.mock.calls.map(([d]) => d.name)).not.toContain("Die of Fate");
		expect(Object.values(global.game.user.hotbar)).toContain("ours");
	});

	// One macro that will not create must not leave every macro after it off the bar.
	it("places the rest when one macro fails to create", async () => {
		world([]);
		const create = global.Macro.create;
		global.Macro.create = vi.fn(async data => {
			if (data.name === "Run an Expedition") throw new Error("create refused");
			return create(data);
		});
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		await ensureSystemMacros();
		spy.mockRestore();

		const names = global.game.macros.map(m => m.name);
		expect(names).not.toContain("Run an Expedition");
		expect(names).toEqual(expect.arrayContaining(["Welcome to Stonetop", "Die of Fate", "The Chronicle", "End of Session"]));
		const placed = Object.values(global.game.user.hotbar);
		expect(placed).toHaveLength(names.length);
	});
});
