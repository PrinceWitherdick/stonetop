import { describe, expect, it, beforeEach, vi } from "vitest";
import { StonetopBrowserDialog } from "../../module/dialogs/StonetopBrowserDialog.js";
import { CatalogSource } from "../../module/dialogs/catalog/CatalogSource.js";
import { ArcanaSource } from "../../module/dialogs/catalog/ArcanaSource.js";
import { MonsterSource } from "../../module/dialogs/catalog/MonsterSource.js";
import { PeopleSource } from "../../module/dialogs/catalog/PeopleSource.js";

/**
 * "Browse Stonetop" is one window over three lists that used to be two windows, and the join
 * between the shell and those lists is pure dispatch: the tab strip, which source answers for
 * the current tab, and which source a world edit stales. That dispatch is what these cover —
 * a mis-wire there shows up as the wrong noun under the wrong tab, or as a monster edit
 * throwing away the people list, neither of which anything else would catch.
 */

/**
 * A dialog with no Foundry render behind it — every method under test is pure dispatch.
 *
 * `ownedSlugs` is seeded the way `open()` seeds it, through _retarget: it is the only writer,
 * and on an app that has not rendered yet that call cannot re-render.
 */
function browser({ ownedSlugs = [] } = {}) {
	const app = new StonetopBrowserDialog();
	app._retarget({ ownedSlugs });
	return app;
}

/** The shape the world hooks hand staleFor. */
function actorDoc({ type, isToken = false, pack = null } = {}) {
	return { documentName: "Actor", type, isToken, pack };
}

describe("StonetopBrowserDialog — the tab strip", () => {
	it("offers the three lists in reading order, each with a label and an icon", () => {
		expect(browser()._sourceList().map(({ key, label, icon }) => ({ key, label, icon }))).toEqual([
			{ key: "arcana",   label: "Arcana",   icon: "fas fa-wand-sparkles" },
			{ key: "monsters", label: "Monsters", icon: "fas fa-dragon" },
			{ key: "people",   label: "People",   icon: "fas fa-user-group" },
		]);
	});

	it("opens on the arcana", () => {
		expect(browser()._source).toBe("arcana");
	});

	it("hands the shell more than one source, so the tabs actually render", () => {
		// The shell only draws its tab strip for hasSources — sources.length > 1.
		expect(browser()._sourceList().length).toBeGreaterThan(1);
	});

	it("builds its sources once, so a source's row cache survives being asked for again", () => {
		const app = browser();
		expect(app._sourceList()).toBe(app._sourceList());
	});
});

describe("StonetopBrowserDialog#_selectSource", () => {
	it("switches to a real tab and says it changed", () => {
		const app = browser();
		expect(app._selectSource("people")).toBe(true);
		expect(app._source).toBe("people");
	});

	it("says nothing changed when it is already on that tab", () => {
		const app = browser();
		expect(app._selectSource("arcana")).toBe(false);
	});

	it("ignores a key no source answers to, rather than storing it", () => {
		// _sourceFor falls back to the first source, so a stored typo would draw the arcana
		// under no lit tab at all.
		const app = browser();
		expect(app._selectSource("bestiary")).toBe(false);
		expect(app._source).toBe("arcana");
	});

	it("ignores an absent key, so open() with no tab keeps the default", () => {
		const app = browser();
		expect(app._selectSource(undefined)).toBe(false);
		expect(app._source).toBe("arcana");
	});
});

describe("StonetopBrowserDialog — the copy around the current list", () => {
	it("counts each list in its own noun", () => {
		const app = browser();
		expect(app._countNoun()).toBe("arcana");
		app._selectSource("monsters");
		expect(app._countNoun()).toBe("monsters");
		app._selectSource("people");
		expect(app._countNoun()).toBe("people");
	});

	it("labels the search box for the list being searched", () => {
		const app = browser();
		const placeholder = key => app._sourceFor(key).search.placeholder;
		expect(placeholder("arcana")).toBe("Filter arcana…");
		expect(placeholder("monsters")).toBe("Filter monsters…");
		expect(placeholder("people")).toBe("Filter people…");
	});

	it("explains an empty arcana list, where Minor + a curse is legitimately empty", () => {
		expect(browser()._sourceFor("arcana").empty).toContain("Only Major arcana");
	});

	it("explains an empty people list, which a fresh world always has", () => {
		expect(browser()._sourceFor("people").empty).toContain("NPC actors");
	});

	it("falls back to the first list for a key no source answers to", () => {
		// _selectSource refuses to store an unknown key, so this only ever covers a caller
		// asking _sourceFor directly — but the window must still draw something.
		expect(browser()._sourceFor("bestiary").key).toBe("arcana");
	});
});

describe("CatalogSource#facetGroups — each list's own filter bar", () => {
	it("gives each list its own groups", () => {
		const app = browser();
		const keys = key => app._sourceFor(key).facetGroups([]).map(g => g.key);
		expect(keys("arcana")).toEqual(["tier", "kind", "curse"]);
		expect(keys("monsters")).toEqual(["section", "type", "organization"]);
		expect(keys("people")).toEqual(["status", "home"]);
	});

	it("never mints an empty chip key, which the filter layer reads as 'nothing lit'", () => {
		const app = browser();
		for (const key of ["arcana", "monsters", "people"]) {
			for (const group of app._sourceFor(key).facetGroups([])) {
				for (const chip of group.chips) expect(chip.key).toBeTruthy();
			}
		}
	});
});

describe("CatalogSource#dragType — what each list's rows drag out AS", () => {
	it("drags an arcanum as the Item it is, so a sheet and the Items directory both take it", () => {
		expect(new ArcanaSource().dragType).toBe("Item");
	});

	it("drags a stat block and a person as Actors, so a scene places their token", () => {
		expect(new MonsterSource().dragType).toBe("Actor");
		expect(new PeopleSource().dragType).toBe("Actor");
	});

	it("leaves rows undraggable for a source that names no type", () => {
		expect(new CatalogSource({ key: "k", label: "L", icon: "i", noun: "n", search: {}, empty: "" }).dragType).toBe("");
	});
});

describe("CatalogBrowserDialog#getData — the drag stamp on each row", () => {
	/** A browser whose current list is already cached, so getData reads rows without a pack. */
	function withRows(source, rows) {
		const app = browser();
		app._selectSource(source);
		app._rowCache.set(source, rows);
		return app;
	}

	it("stamps the current source's drag type on its rows, which is what makes them draggable", async () => {
		const data = await withRows("people", [{ key: "a", uuid: "Actor.abc", facets: {} }]).getData();
		expect(data.rows[0].dragType).toBe("Actor");
	});

	it("gives a row with nothing to point at no drag type at all", async () => {
		// A draggable row with an empty payload reads to every drop target as a FAILED drop,
		// which is worse than a row that simply doesn't drag.
		const data = await withRows("people", [{ key: "a", uuid: "", facets: {} }]).getData();
		expect(data.rows[0].dragType).toBe("");
	});
});

describe("CatalogSource#staleFor — which list a world edit invalidates", () => {
	const arcana   = new ArcanaSource();
	const monsters = new MonsterSource();
	const people   = new PeopleSource();

	it("routes an NPC edit to the people alone", () => {
		const doc = actorDoc({ type: "npc" });
		expect(people.staleFor(doc)).toBe(true);
		expect(monsters.staleFor(doc)).toBe(false);
		expect(arcana.staleFor(doc)).toBe(false);
	});

	it("routes a monster edit to the monsters alone", () => {
		const doc = actorDoc({ type: "monster" });
		expect(monsters.staleFor(doc)).toBe(true);
		expect(people.staleFor(doc)).toBe(false);
	});

	it("ignores a token's synthetic actor, which is in neither list", () => {
		// It wears its base actor's type, so without the isToken test a follower's token taking
		// a hit in combat would re-render the window out from under the viewer.
		expect(people.staleFor(actorDoc({ type: "npc", isToken: true }))).toBe(false);
		expect(monsters.staleFor(actorDoc({ type: "monster", isToken: true }))).toBe(false);
	});

	it("ignores a compendium actor, whose rows are cached deliberately", () => {
		expect(monsters.staleFor(actorDoc({ type: "monster", pack: "stonetop.bestiary" }))).toBe(false);
	});

	it("ignores documents that aren't actors at all", () => {
		for (const source of [arcana, monsters, people]) {
			expect(source.staleFor({ documentName: "Item", type: "move" })).toBe(false);
			expect(source.staleFor(null)).toBe(false);
		}
	});
});

/**
 * What activateListeners actually leaves behind.
 *
 * These exist because the wiring was once written as a SECOND `activateListeners` further down
 * the same class body — which is not two handlers but the later definition replacing the earlier,
 * so every listener above it silently vanished and the whole window went inert. Nothing else here
 * would have noticed: every other test in this file calls the dispatch methods directly, and the
 * window renders fine with no listeners on it at all. So these assert the two halves TOGETHER —
 * the DOM handlers and the world hook — which is exactly what one definition eating the other
 * breaks.
 */
describe("StonetopBrowserDialog#activateListeners", () => {
	let hooked;

	/** The handful of DOM methods the wiring actually touches. */
	function el(children = {}) {
		return {
			listeners: {},
			classList: { toggle: () => {}, remove: () => {}, contains: () => false },
			addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); },
			querySelector: sel => children[sel] ?? null,
			querySelectorAll: sel => children[sel] ?? [],
		};
	}

	/** An app wired against `root`, with the Foundry chrome above it stubbed out. */
	function wired(root) {
		const app = browser();
		app._frontOnOpen = { start: () => {}, stop: () => {} };
		app.element = [el({ ".stonetop-catalog": root })];
		app.render = vi.fn();
		app.activateListeners([root]);
		return app;
	}

	beforeEach(() => {
		hooked = [];
		global.Application.prototype.activateListeners = () => {};
		global.Hooks = { on: (name) => hooked.push(name), off: () => {}, once: () => {} };
	});

	it("wires the list AND registers the world hook — one definition cannot eat the other", () => {
		const count = { textContent: "" };
		const root  = el({ ".stonetop-catalog-count": count });

		const app = wired(root);

		// The gestures: a tab, a chip, a row, a dropdown facet, dragging a row out, and the
		// keyboard's share of it.
		expect(Object.keys(root.listeners).sort()).toEqual(["change", "click", "dragstart", "keydown"]);
		// And the count line, which only the first paint's _updateCount writes.
		expect(count.textContent).toBe("0 arcana");
		// And the world hooks, which the source list asks for because two of the three lists are
		// built out of world actors.
		expect(hooked).toEqual(["createActor", "updateActor", "deleteActor"]);
		expect(app._worldHook).toBeTypeOf("function");
	});

	it("switches tabs when one is clicked", () => {
		const root = el();
		const app  = wired(root);
		const tab  = { dataset: { source: "people" } };

		root.listeners.click[0]({ preventDefault: () => {}, target: { closest: s => (s === ".stonetop-catalog-source" ? tab : null) } });

		expect(app._source).toBe("people");
		expect(app.render).toHaveBeenCalledWith(false);
	});

	/** A dragstart on `row`, returning what was written into the drag payload. */
	function dragged(app, root, row) {
		const written = {};
		root.listeners.dragstart[0]({
			target: { closest: sel => (row && sel === ".stonetop-catalog-row[draggable='true']" ? row : null) },
			dataTransfer: { setData: (fmt, value) => { written[fmt] = value; }, set effectAllowed(v) { written.effect = v; } },
		});
		return written;
	}

	it("hands out core's own {type, uuid} payload, which is what every drop target already reads", () => {
		// The whole feature rests on this being byte-for-byte what the sidebar emits: nothing in
		// this system teaches the canvas, the directories or the character sheet a private shape.
		const root = el();
		const app  = wired(root);

		const written = dragged(app, root, { dataset: { uuid: "Actor.abc", dragType: "Actor" } });

		expect(JSON.parse(written["text/plain"])).toEqual({ type: "Actor", uuid: "Actor.abc" });
		expect(written.effect).toBe("copy");
	});

	it("reads the type off the ROW, not off whichever tab happens to be up", () => {
		// The rendered rows and _currentSource do agree today, but a handler that depends on that
		// agreement is one stray paint away from dropping arcana as actors.
		const root = el();
		const app  = wired(root);
		app._selectSource("people");

		const written = dragged(app, root, { dataset: { uuid: "Compendium.x.y.Item.z", dragType: "Item" } });

		expect(JSON.parse(written["text/plain"]).type).toBe("Item");
	});

	it("writes nothing when the drag did not start on a draggable row", () => {
		const root = el();
		const app  = wired(root);
		expect(dragged(app, root, null)).toEqual({});
		expect(dragged(app, root, { dataset: { uuid: "", dragType: "Actor" } })).toEqual({});
	});

	it("refuses a tab whose data-source no list answers to", () => {
		// The click path used to assign `_source` raw, skipping the one writer that validates it.
		// _sourceFor falls back to the first source, so a bogus key drew the arcana under no lit
		// tab at all — and cached those rows under the bogus key, miscounting the real tab.
		const root = el();
		const app  = wired(root);
		const tab  = { dataset: { source: "bestiary" } };

		root.listeners.click[0]({ preventDefault: () => {}, target: { closest: s => (s === ".stonetop-catalog-source" ? tab : null) } });

		expect(app._source).toBe("arcana");
		expect(app.render).not.toHaveBeenCalled();
	});
});

describe("CatalogSource#_once — the pack memo", () => {
	const source = () => new CatalogSource({
		key: "k", label: "L", icon: "i", noun: "n", search: {}, empty: "",
	});

	it("pulls once and serves the same answer after", async () => {
		const src = source();
		const pull = vi.fn(async () => ["row"]);
		expect(await src._once("rows", pull)).toEqual(["row"]);
		expect(await src._once("rows", pull)).toEqual(["row"]);
		expect(pull).toHaveBeenCalledTimes(1);
	});

	it("retries after a failure rather than serving the rejection for the window's whole life", async () => {
		// A pack locked mid-rebuild used to poison its tab permanently: the rejected promise was
		// memoised exactly as happily as a resolved one, so every later render re-awaited the same
		// error and nothing but closing the window would clear it.
		const src = source();
		let calls = 0;
		const flaky = async () => {
			calls += 1;
			if (calls === 1) throw new Error("pack is locked");
			return ["row"];
		};

		await expect(src._once("rows", flaky)).rejects.toThrow("pack is locked");
		expect(await src._once("rows", flaky)).toEqual(["row"]);
		await src._once("rows", flaky);
		expect(calls).toBe(2);
	});
});

describe("StonetopBrowserDialog#_retarget", () => {
	let rendered;

	beforeEach(() => {
		rendered = 0;
	});

	/** A browser that counts renders instead of doing one. */
	function stub({ ownedSlugs = [] } = {}) {
		const app = browser({ ownedSlugs });
		app.rendered = true;
		app.render = () => { rendered += 1; };
		return app;
	}

	it("switches an open window to the tab the caller asked for", () => {
		const app = stub();
		app._retarget({ source: "people" });
		expect(app._source).toBe("people");
		expect(rendered).toBe(1);
	});

	it("leaves a window alone when nothing it was asked for changed", () => {
		// Re-running the macro on the tab you're already on must not throw away your scroll
		// position or your half-typed search term.
		const app = stub();
		app._retarget({ source: "arcana", ownedSlugs: [] });
		expect(rendered).toBe(0);
	});

	it("rebuilds the arcana when the opening character holds a different hand", () => {
		const app = stub({ ownedSlugs: ["the-bloody-hand"] });
		app._rowCache.set("arcana", [{ key: "the-bloody-hand" }]);

		app._retarget({ ownedSlugs: ["the-bloody-hand", "ineffable-words"] });

		const source = app._sources.find(s => s instanceof ArcanaSource);
		expect([...source.ownedSlugs].sort()).toEqual(["ineffable-words", "the-bloody-hand"]);
		expect(app._rowCache.has("arcana")).toBe(false);
		expect(rendered).toBe(1);
	});

	it("does not re-pull the 82-card pack when the same hand is passed again", () => {
		const app = stub({ ownedSlugs: ["ineffable-words"] });
		app._rowCache.set("arcana", [{ key: "ineffable-words" }]);

		app._retarget({ ownedSlugs: ["ineffable-words"] });

		expect(app._rowCache.has("arcana")).toBe(true);
		expect(rendered).toBe(0);
	});

	it("rebuilds the arcana but does not re-render while another tab is up", () => {
		const app = stub();
		app._selectSource("monsters");
		app._rowCache.set("arcana", [{ key: "old" }]);

		app._retarget({ source: "monsters", ownedSlugs: ["the-bloody-hand"] });

		expect(app._rowCache.has("arcana")).toBe(false);
		expect(rendered).toBe(0);
	});
});
