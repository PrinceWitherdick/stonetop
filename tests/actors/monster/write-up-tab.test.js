import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createStonetopMonsterSheetClass } from "../../../module/actors/monster/StonetopMonsterSheet.js";
import { artEmbed } from "../../../module/book2-art/world-journal-art.js";
import { readRepo } from "../../fakes/css.js";

/**
 * The monster sheet's Details: the creature's codex prose, atop its Notes tab.
 *
 * Every one of the 212 shipped stat blocks carries a `system.entry` pointing at a bestiary
 * page whose description is the prose a GM actually reads at the table, and for a long time
 * the only route to it was a window-header button. This suite pins the parts of lifting it
 * onto the sheet that are not derivable from reading any one file on its own.
 */

function makeSheet(actor, { editable = true } = {}) {
	const Base = class {
		// getData walks the move list; no test here cares about moves, so stand one up.
		constructor() { this._actor = { items: { filter: () => [] }, ...actor }; }
		get actor() { return this._actor; }
		get isEditable() { return editable; }
		async getData() { return {}; }
		activateListeners() {}
		async close() { return "closed"; }
	};
	return new (createStonetopMonsterSheetClass(Base))();
}

/** A bestiary page hung under a JournalEntry, the shape every shipped stat block links. */
function makeEntry({ description = "<p>It waits in the reeds.</p>", name = "Crinwin", permitted = true } = {}) {
	const page = { documentName: "JournalEntryPage", type: "bestiary", name, system: { description } };
	const entry = {
		documentName: "JournalEntry",
		uuid: `JournalEntry.${name}`,
		name,
		pages: { find: cb => [page].find(cb), contents: [page] },
		testUserPermission: () => permitted,
	};
	page.parent = entry;
	return entry;
}

// The journal hooks the sheet listens on, so a test can fire the change a GM's edit would.
let hooks;
const fireHook = (name, ...args) => (hooks.get(name) ?? []).forEach(fn => fn(...args));

let savedGame, savedFromUuid, savedHooks;
beforeEach(() => {
	savedGame = globalThis.game;
	savedFromUuid = globalThis.fromUuid;
	savedHooks = globalThis.Hooks;
	globalThis.game = { ...(globalThis.game ?? {}), user: { id: "gm" }, journal: [] };
	hooks = new Map();
	let nextId = 1;
	globalThis.Hooks = {
		...savedHooks,
		on: vi.fn((name, fn) => { hooks.set(name, [...(hooks.get(name) ?? []), fn]); return nextId++; }),
		off: vi.fn(),
	};
});
afterEach(() => {
	globalThis.game = savedGame;
	globalThis.fromUuid = savedFromUuid;
	globalThis.Hooks = savedHooks;
});

describe("what Details reads", () => {
	it("lifts the description off the bestiary page the stat block links", async () => {
		globalThis.fromUuid = vi.fn(async () => makeEntry());
		const sheet = makeSheet({ name: "Crinwin", system: { entry: "Compendium.x.Y.JournalEntry.abc" } });

		const writeUp = await sheet._resolveWriteUp();

		expect(writeUp.html).toBe("<p>It waits in the reeds.</p>");
		expect(globalThis.fromUuid).toHaveBeenCalledWith("Compendium.x.Y.JournalEntry.abc");
	});

	// `system.entry` holds a whole JournalEntry on all 212 shipped blocks (the merged journal
	// pack), not the page, so resolving has to walk into `pages` rather than read `.system`
	// off whatever came back.
	it("walks into the entry's bestiary page rather than reading the entry itself", async () => {
		const entry = makeEntry({ description: "<p>Bronze, and patient.</p>" });
		entry.system = { description: "<p>WRONG - the entry's own system.</p>" };
		globalThis.fromUuid = vi.fn(async () => entry);
		const sheet = makeSheet({ name: "Bronze Colossus", system: { entry: "uuid" } });

		expect((await sheet._resolveWriteUp()).html).toBe("<p>Bronze, and patient.</p>");
	});

	// The Book II art pass prepends the creature's illustration to its page, and that picture is
	// already this sheet's portrait.
	it("leaves the illustration off, because it is already the sheet's portrait", async () => {
		const art = artEmbed("stonetop-book-art/assets/bestiary/crinwin.webp", "Crinwin");
		globalThis.fromUuid = vi.fn(async () => makeEntry({ description: `${art}<p>It waits in the reeds.</p>` }));
		const sheet = makeSheet({ name: "Crinwin", system: { entry: "uuid" } });

		expect((await sheet._resolveWriteUp()).html).toBe("<p>It waits in the reeds.</p>");
	});

	it("has nothing to show when the page holds only its illustration", async () => {
		const art = artEmbed("stonetop-book-art/assets/bestiary/crinwin.webp", "Crinwin");
		globalThis.fromUuid = vi.fn(async () => makeEntry({ description: art }));
		const sheet = makeSheet({ name: "Crinwin", system: { entry: "uuid" } });

		expect(await sheet._resolveWriteUp()).toBe(null);
	});

	it("has nothing to show for a monster with no linked entry", async () => {
		globalThis.fromUuid = vi.fn();
		const sheet = makeSheet({ name: "Homebrew Thing", system: { entry: "" } });

		expect(await sheet._resolveWriteUp()).toBe(null);
		expect(globalThis.fromUuid).not.toHaveBeenCalled();
	});

	it("shows nothing when the entry resolves to nothing", async () => {
		globalThis.fromUuid = vi.fn(async () => null);
		const sheet = makeSheet({ name: "Orphan", system: { entry: "dangling" } });

		expect(await sheet._resolveWriteUp()).toBe(null);
	});

	/**
	 * A bestiary page ships `ownership.default: -1` (INHERIT), so asking the PAGE inherits
	 * nothing and reads as permitted. The gate has to be the parent JournalEntry, whose
	 * default is 0 (NONE), or lifting the prose onto the stat block hands every player the
	 * GM's write-up of a creature they are currently fighting.
	 */
	it("withholds the write-up when the parent entry withholds it", async () => {
		globalThis.fromUuid = vi.fn(async () => makeEntry({ permitted: false }));
		const sheet = makeSheet({ name: "Crinwin", system: { entry: "uuid" } });

		expect(await sheet._resolveWriteUp()).toBe(null);
	});

	it("shows nothing when the page's description is empty", async () => {
		globalThis.fromUuid = vi.fn(async () => makeEntry({ description: "<p></p>" }));
		const sheet = makeSheet({ name: "Crinwin", system: { entry: "uuid" } });

		expect(await sheet._resolveWriteUp()).toBe(null);
	});

	// The sheet re-renders on every HP change, and this walks the compendium.
	it("resolves once and reuses the answer across renders", async () => {
		globalThis.fromUuid = vi.fn(async () => makeEntry());
		const sheet = makeSheet({ name: "Crinwin", system: { entry: "uuid" } });

		await sheet._resolveWriteUp();
		await sheet._resolveWriteUp();
		await sheet._resolveWriteUp();

		expect(globalThis.fromUuid).toHaveBeenCalledTimes(1);
	});

	// ...but a GM who imports the entry and edits the prose should not be reading the copy
	// taken during the last fight, so the memo goes with the window.
	it("drops the memo when the sheet closes", async () => {
		globalThis.fromUuid = vi.fn(async () => makeEntry());
		const sheet = makeSheet({ name: "Crinwin", system: { entry: "uuid" } });

		await sheet._resolveWriteUp();
		await sheet.close();
		await sheet._resolveWriteUp();

		expect(globalThis.fromUuid).toHaveBeenCalledTimes(2);
	});

	// Nor is the memo a snapshot kept for the life of the window: a GM who opens the entry from
	// the header and edits it is looking at a monster sheet that is already open.
	it("reads the page again once the page is edited", async () => {
		const entry = makeEntry();
		globalThis.fromUuid = vi.fn(async () => entry);
		const sheet = makeSheet({ name: "Crinwin", system: { entry: "uuid" } });

		await sheet._resolveWriteUp();
		const page = entry.pages.contents[0];
		page.system.description = "<p>It has left the reeds.</p>";
		fireHook("updateJournalEntryPage", page);

		expect((await sheet._resolveWriteUp()).html).toBe("<p>It has left the reeds.</p>");
	});

	it("hears the entry's permission change, and withholds what it was showing", async () => {
		const entry = makeEntry();
		globalThis.fromUuid = vi.fn(async () => entry);
		const sheet = makeSheet({ name: "Crinwin", system: { entry: "uuid" } });

		expect(await sheet._resolveWriteUp()).not.toBe(null);
		entry.testUserPermission = () => false;
		fireHook("updateJournalEntry", entry);

		expect(await sheet._resolveWriteUp()).toBe(null);
	});

	// Importing the entry into the world makes the world copy the one to read.
	it("hears a world copy of the entry being made", async () => {
		const entry = makeEntry();
		globalThis.fromUuid = vi.fn(async () => entry);
		const sheet = makeSheet({ name: "Crinwin", system: { entry: "uuid" } });
		await sheet._resolveWriteUp();

		fireHook("createJournalEntry",
			{ documentName: "JournalEntry", uuid: "JournalEntry.copy", _stats: { compendiumSource: entry.uuid } });

		await sheet._resolveWriteUp();
		expect(globalThis.fromUuid).toHaveBeenCalledTimes(2);
	});

	it("keeps the memo through changes to journals it was not read from", async () => {
		globalThis.fromUuid = vi.fn(async () => makeEntry());
		const sheet = makeSheet({ name: "Crinwin", system: { entry: "uuid" } });
		await sheet._resolveWriteUp();

		fireHook("updateJournalEntry", { documentName: "JournalEntry", uuid: "JournalEntry.elsewhere" });
		fireHook("updateJournalEntryPage",
			{ documentName: "JournalEntryPage", parent: { documentName: "JournalEntry", uuid: "JournalEntry.elsewhere" } });

		await sheet._resolveWriteUp();
		expect(globalThis.fromUuid).toHaveBeenCalledTimes(1);
	});

	it("stops listening when the sheet closes", async () => {
		globalThis.fromUuid = vi.fn(async () => makeEntry());
		const sheet = makeSheet({ name: "Crinwin", system: { entry: "uuid" } });
		await sheet._resolveWriteUp();
		await sheet.close();

		expect(globalThis.Hooks.on).toHaveBeenCalledTimes(6);
		expect(globalThis.Hooks.off).toHaveBeenCalledTimes(6);
	});

	/**
	 * 171 of 181 codex pages own exactly one stat block, so naming the entry would just repeat
	 * the creature's own name. It earns its place only on the blocks that share a page with
	 * their kin.
	 */
	it("names the entry only when it is not the creature's own name", async () => {
		globalThis.fromUuid = vi.fn(async () => makeEntry({ name: "Crinwin" }));

		const lone = makeSheet({ name: "Crinwin", system: { entry: "uuid" } });
		expect((await lone.getData()).stonetop.writeUp.name).toBe("");

		const kin = makeSheet({ name: "Crinwin Broodfather", system: { entry: "uuid" } });
		expect((await kin.getData()).stonetop.writeUp.name).toBe("Crinwin");
	});

	// Blanking the name must not reach back into the memo, or the second render of a shared
	// page would find the name already stripped.
	it("blanks the name on the context without editing the memo behind it", async () => {
		globalThis.fromUuid = vi.fn(async () => makeEntry({ name: "Crinwin" }));
		const sheet = makeSheet({ name: "Crinwin", system: { entry: "uuid" } });

		await sheet.getData();

		expect((await sheet._resolveWriteUp()).name).toBe("Crinwin");
	});

	it("knows when a creature has notes, for the empty moves line", async () => {
		globalThis.fromUuid = vi.fn(async () => null);

		const withNotes = await makeSheet({ name: "Fire Spirit", system: { entry: "", notes: "<p>It burns.</p>" } }).getData();
		expect(withNotes.stonetop.hasNotes).toBe(true);

		const without = await makeSheet({ name: "Crinwin", system: { entry: "", notes: "<p></p>" } }).getData();
		expect(without.stonetop.hasNotes).toBe(false);
	});

	// "Not linked" and "linked but blank" are different answers, and ask different things of
	// the GM: one wants a link, the other wants writing.
	it("tells an unlinked creature from a linked one with nothing to show", async () => {
		globalThis.fromUuid = vi.fn(async () => makeEntry({ description: "<p></p>" }));

		const linked = await makeSheet({ name: "Crinwin", system: { entry: "uuid" } }).getData();
		expect(linked.stonetop.writeUp).toBe(null);
		expect(linked.stonetop.writeUpLinked).toBe(true);

		const unlinked = await makeSheet({ name: "Homebrew", system: { entry: "" } }).getData();
		expect(unlinked.stonetop.writeUpLinked).toBe(false);
	});
});

/**
 * The tab structure is one fact spread across four files: the controller's options in the sheet,
 * the panels and the rail in the template, and the glyphs in the stylesheet. None of them can see
 * the others, and each mismatch fails quietly: a rail button with no panel does nothing, a panel
 * with no button is unreachable, and a key with no glyph rule paints a solid slab.
 */
describe("the monster sheet's two tabs", () => {
	const hbsCode = src => src.replace(/\{\{!--[\s\S]*?--\}\}/g, "");
	const jsCode = src => src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

	const SHEET = jsCode(readRepo("module/actors/monster/StonetopMonsterSheet.js"));
	const HBS = hbsCode(readRepo("templates/actor/monster.hbs"));
	const CSS = readRepo("styles/stonetop.css").replace(/\/\*[\s\S]*?\*\//g, "");
	const NAV = HBS.match(/<nav\b[^>]*stonetop-tab-rail[\s\S]*?<\/nav>/)?.[0] ?? "";
	const KEYS = ["statblock", "notes"];

	it("puts a panel behind every rail button, and a button on the rail for every panel", () => {
		expect([...NAV.matchAll(/tab="([^"]+)"/g)].map(m => m[1])).toEqual(KEYS);
		for (const key of KEYS) expect(HBS).toContain(`data-group="primary" data-tab="${key}"`);
	});

	it("lands on the stat block, inside the body the controller is bound to", () => {
		expect(SHEET).toMatch(
			/tabs:\s*\[\{\s*navSelector:\s*"\.sheet-tabs",\s*contentSelector:\s*"\.stonetop-monster-body",\s*initial:\s*"statblock"\s*\}\]/
		);
		expect(HBS).toContain('class="stonetop-monster-body"');
		expect(NAV).toMatch(/class="sheet-tabs[^"]*stonetop-tab-rail/);
	});

	// A reader who navigates by position (Magnifier shows a sliver of the window) must find the
	// same button in the same place on every creature.
	it("keeps every button in a fixed place, whatever the creature carries", () => {
		expect(NAV).not.toContain("{{#if");
		expect(NAV).not.toContain("{{#unless");
	});

	it("gives every rail button a glyph", () => {
		for (const key of KEYS) {
			expect(CSS).toMatch(new RegExp(`\\.stonetop-tab-rail \\.item\\[data-tab="${key}"\\]\\s*\\{\\s*--st-tab-icon:`));
		}
	});

	// _applyInitialHeight fits the opening window to the Stat Block panel. Only the landing panel
	// is sure to be showing at open; a hidden one has no layout box to measure.
	it("sizes the opening window against the panel the sheet opens on", () => {
		expect(HBS).toContain('class="tab stonetop-monster-tab stonetop-monster-statblock" data-group="primary" data-tab="statblock"');
		expect(SHEET).toContain('querySelector(".stonetop-monster-statblock")');
		expect(SHEET).not.toContain('querySelector(".stonetop-monster-notes")');
	});

	it("opens the Notes tab on a Details heading, the write-up under it, then the notes editor", () => {
		const statblock = HBS.indexOf('data-tab="statblock"');
		const notesTab = HBS.indexOf('data-tab="notes"');
		const heading = HBS.indexOf('localize "stonetop.monster.details"');
		const writeUp = HBS.indexOf("stonetop-monster-writeup-body");
		const notes = HBS.indexOf("stonetop-monster-notes-editor");
		expect(statblock).toBeGreaterThan(-1);
		expect(notesTab).toBeGreaterThan(statblock);
		expect(heading).toBeGreaterThan(notesTab);
		expect(writeUp).toBeGreaterThan(heading);
		expect(notes).toBeGreaterThan(writeUp);
		expect(HBS.slice(statblock, notesTab)).not.toContain("stonetop-monster-writeup");
	});

	// The creatures with no moves keep everything they do in Notes, so the empty moves line has to
	// say where it went rather than leave the landing tab reading as blank.
	it("points a creature with no moves at its Notes tab", () => {
		expect(HBS).toMatch(
			/\{\{#if stonetop\.hasNotes\}\}\{\{localize "stonetop\.monster\.noMovesSeeNotes"\}\}\{\{else\}\}\{\{localize "stonetop\.monster\.noMoves"\}\}\{\{\/if\}\}/
		);
	});

	it("says why Details is empty", () => {
		expect(HBS).toContain('localize "stonetop.monster.noEntry"');
		expect(HBS).toContain('localize "stonetop.monster.noWriteUp"');
	});
});
