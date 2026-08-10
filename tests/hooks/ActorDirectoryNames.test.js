import { afterEach, describe, expect, it } from "vitest";
import { decorateNameRow, onUpdateActorPlaybookName } from "../../module/hooks/ActorDirectoryNames.js";
import { decorateActorDirectoryRows } from "../../module/hooks/actor-directory-rows.js";

// Production registers ONE walk that runs every row decorator (see stonetop.js); these tests
// drive that same walk with only this feature's decorator, so the collection guard and the
// row lookup under test are the real ones.
const onRenderActorDirectoryNames = (app, element) =>
	decorateActorDirectoryRows(app, element, [decorateNameRow]);
import { WBH_HERO_FLAG } from "../../module/actors/character/WouldBeHeroAsterisk.js";
import { SYSTEM_ID } from "../../module/system-id.js";

// The pass appends each player character's playbook to their Actors sidebar row. The test env
// is node, so we fake just the DOM surface it touches: the row list, each row's name anchor,
// and appendChild/remove.

class El {
	constructor(tag, className = "") {
		this.tag = tag;
		this.className = className;
		this.children = [];
		this.parent = null;
		this.dataset = {};
		this.text = "";
	}
	get textContent() { return this.text + this.children.map(c => c.textContent).join(""); }
	set textContent(v) { this.text = v; this.children = []; }
	appendChild(k) { k.parent = this; this.children.push(k); return k; }
	remove() {
		if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this);
		this.parent = null;
	}
	_descendants(out = []) { for (const c of this.children) { out.push(c); c._descendants(out); } return out; }
	querySelector(sel) {
		if (sel === ":scope > .entry-name") return this.children.find(n => n.className.split(" ").includes("entry-name")) ?? null;
		if (sel === ":scope > .stonetop-dir-playbook") return this.children.find(n => n.className === "stonetop-dir-playbook") ?? null;
		// The single-row lookup the update hook makes.
		const byId = sel.match(/^li\.directory-item\.document\[data-entry-id="(.+)"\]$/);
		if (byId) return this._descendants().find(n => n.tag === "li" && n.dataset.entryId === byId[1]) ?? null;
		throw new Error(`unexpected selector ${sel}`);
	}
	querySelectorAll(sel) {
		if (sel !== "li.directory-item.document[data-entry-id]") throw new Error(`unexpected selector ${sel}`);
		return this._descendants().filter(n => n.tag === "li" && n.dataset.entryId);
	}
}

const originalDocument = globalThis.document;
globalThis.document = { createElement: (tag) => new El(tag) };
afterEach(() => {
	globalThis.document = originalDocument ?? { createElement: (tag) => new El(tag) };
	delete globalThis.ui;
});

/** A rendered Actors directory: one <li> per actor, drawn the way core's partial draws it. */
function render(actors) {
	const root = new El("div");
	for (const a of actors) {
		const li = new El("li", "directory-item entry document actor");
		li.dataset.entryId = a.id;
		const name = new El("a", "entry-name ellipsis");
		name.textContent = a.name;
		li.appendChild(name);
		root.appendChild(li);
	}
	return root;
}

const pc = (id, name, playbook, over = {}) => ({
	id, name, type: "character", items: [],
	system: playbook ? { playbook: { name: playbook, slug: "x" } } : {},
	...over,
});

const collection = (actors, over = {}) => ({
	documentName: "Actor",
	get: (id) => actors.find(a => a.id === id) ?? null,
	...over,
});

/** The row's name as a reader sees it, epithet and all. */
const rowName = (root, i = 0) =>
	root.querySelectorAll("li.directory-item.document[data-entry-id]")[i].querySelector(":scope > .entry-name").textContent;
const rowEpithet = (root, i = 0) =>
	root.querySelectorAll("li.directory-item.document[data-entry-id]")[i]
		.querySelector(":scope > .entry-name").querySelector(":scope > .stonetop-dir-playbook");

describe("onRenderActorDirectoryNames", () => {
	it("names a player character by their playbook", () => {
		const actors = [pc("a1", "Pim", "The Lightbearer")];
		const root = render(actors);
		onRenderActorDirectoryNames({ collection: collection(actors) }, root);

		expect(rowName(root)).toBe("Pim The Lightbearer");
		// Appended INSIDE core's anchor, so the row truncates as one name rather than laying
		// the playbook out as a second flex item.
		expect(rowEpithet(root)).not.toBeNull();
	});

	it("leaves alone an actor with no playbook, and every non-character", () => {
		const actors = [pc("a1", "Blank", null), { id: "a2", name: "Wolf", type: "monster", system: {} }];
		const root = render(actors);
		onRenderActorDirectoryNames({ collection: collection(actors) }, root);

		expect(rowName(root, 0)).toBe("Blank");
		expect(rowName(root, 1)).toBe("Wolf");
	});

	it("follows the Would-Be Hero's cross-off", () => {
		const hero = pc("a1", "Wren", "The Would-Be Hero", { getFlag: (_s, k) => k === WBH_HERO_FLAG });
		const root = render([hero]);
		onRenderActorDirectoryNames({ collection: collection([hero]) }, root);

		expect(rowName(root)).toBe("Wren The Hero");
	});

	it("re-renders without doubling the epithet up", () => {
		const actors = [pc("a1", "Pim", "The Lightbearer")];
		const root = render(actors);
		onRenderActorDirectoryNames({ collection: collection(actors) }, root);
		onRenderActorDirectoryNames({ collection: collection(actors) }, root);

		expect(rowName(root)).toBe("Pim The Lightbearer");
	});

	it("stays out of every other sidebar tab, and out of compendium rows", () => {
		const actors = [pc("a1", "Pim", "The Lightbearer")];
		// renderDocumentDirectory fires for Items, Journals, Scenes… as well.
		const items = render(actors);
		onRenderActorDirectoryNames({ collection: collection(actors, { documentName: "Item" }) }, items);
		expect(rowName(items)).toBe("Pim");

		// A pack renders off its INDEX, which carries no system.playbook.
		const pack = render(actors);
		onRenderActorDirectoryNames({ collection: collection(actors, { index: new Map() }) }, pack);
		expect(rowName(pack)).toBe("Pim");
	});

	it("survives a row whose actor is gone, and a call with nothing to work on", () => {
		const root = render([pc("a1", "Pim", "The Lightbearer")]);
		expect(() => onRenderActorDirectoryNames({ collection: collection([]) }, root)).not.toThrow();
		expect(rowName(root)).toBe("Pim");
		expect(() => onRenderActorDirectoryNames({}, render([]))).not.toThrow();
		expect(() => onRenderActorDirectoryNames(undefined, render([]))).not.toThrow();
	});
});

// Core redraws the directory for name / img / sort / folder and nothing else. A playbook lives
// in `system`, so without this half the sidebar kept the old name until the world was reloaded.
describe("onUpdateActorPlaybookName", () => {
	/** A rendered directory standing in for the sidebar tab. */
	const sidebar = (actors, root) => ({ collection: collection(actors), element: root });

	it("names the row the moment a playbook is picked", () => {
		const blank = [pc("a1", "Pim", null)];
		const root = render(blank);
		onRenderActorDirectoryNames(sidebar(blank, root), root);
		expect(rowName(root)).toBe("Pim");

		const picked = pc("a1", "Pim", "The Lightbearer");
		globalThis.ui = { actors: sidebar([picked], root) };
		onUpdateActorPlaybookName(picked, { system: { playbook: { name: "The Lightbearer", slug: "the-lightbearer" } } });

		expect(rowName(root)).toBe("Pim The Lightbearer");
	});

	it("swaps the epithet when the playbook is swapped, and drops it when cleared", () => {
		const actors = [pc("a1", "Pim", "The Lightbearer")];
		const root = render(actors);
		onRenderActorDirectoryNames(sidebar(actors, root), root);

		const swapped = pc("a1", "Pim", "The Fox");
		globalThis.ui = { actors: sidebar([swapped], root) };
		onUpdateActorPlaybookName(swapped, { system: { playbook: { name: "The Fox", slug: "the-fox" } } });
		expect(rowName(root)).toBe("Pim The Fox");

		// Foundry's deletion key — dropping a playbook has to drop the epithet.
		const cleared = pc("a1", "Pim", null);
		globalThis.ui = { actors: sidebar([cleared], root) };
		onUpdateActorPlaybookName(cleared, { system: { "-=playbook": null } });
		expect(rowName(root)).toBe("Pim");
		expect(rowEpithet(root)).toBeNull();
	});

	it("repaints when the Would-Be Hero's cross-off flag is written", () => {
		const wbh = [pc("a1", "Wren", "The Would-Be Hero")];
		const root = render(wbh);
		onRenderActorDirectoryNames(sidebar(wbh, root), root);
		expect(rowName(root)).toBe("Wren The Would-Be Hero");

		const crossed = pc("a1", "Wren", "The Would-Be Hero", { getFlag: (_s, k) => k === WBH_HERO_FLAG });
		globalThis.ui = { actors: sidebar([crossed], root) };
		onUpdateActorPlaybookName(crossed, { flags: { [SYSTEM_ID]: { [WBH_HERO_FLAG]: true } } });

		expect(rowName(root)).toBe("Wren The Hero");
	});

	it("ignores updates that cannot have changed the name", () => {
		const actors = [pc("a1", "Pim", "The Lightbearer")];
		const root = render(actors);
		onRenderActorDirectoryNames(sidebar(actors, root), root);

		// No `ui` at all: if the guard let these through, collecting the rendered directories
		// would be reached and this would matter. It must return before that.
		expect(() => onUpdateActorPlaybookName(actors[0], { system: { attributes: { hp: { value: 3 } } } })).not.toThrow();
		expect(() => onUpdateActorPlaybookName(actors[0], { img: "new.webp" })).not.toThrow();
		expect(() => onUpdateActorPlaybookName({ id: "a2", type: "npc" }, { system: { playbook: {} } })).not.toThrow();
		expect(rowName(root)).toBe("Pim The Lightbearer");
	});
});
