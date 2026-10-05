import { beforeEach, describe, expect, it } from "vitest";
import { pruneCharacterChoices, registerUserConfigCharacterFilter } from "../../module/hooks/user-config-characters.js";

// The env is node, so fake the slice of DOM the prune touches: a select holding
// optgroups of options, each removable from its parent.

function node(tag, props = {}) {
	return { tag, children: [], parent: null, ...props,
		remove() { const c = this.parent.children; c.splice(c.indexOf(this), 1); } };
}
function append(parent, child) { child.parent = parent; parent.children.push(child); return child; }
function all(n, tag) { return n.children.flatMap(c => [...(c.tag === tag ? [c] : []), ...all(c, tag)]); }
function query(n) { n.querySelectorAll = tag => all(n, tag); n.querySelector = tag => all(n, tag)[0] ?? null; return n; }

/** Build core's select: a blank option then Owner / Observer groups of actor ids. */
function userConfig(groups) {
	const select = query(node("select"));
	append(select, node("option", { value: "" }));
	for (const [label, ids] of Object.entries(groups)) {
		const g = query(append(select, node("optgroup", { label })));
		for (const id of ids) append(g, node("option", { value: id }));
	}
	return { root: { querySelector: s => (s === "select[name=character]" ? select : null) }, select };
}
const values = select => all(select, "option").map(o => o.value);
const labels = select => all(select, "optgroup").map(g => g.label);

beforeEach(() => {
	const types = { pc1: "character", pc2: "character", npc1: "npc", mon1: "monster", home: "stonetop", gmt: "gmToolkit" };
	global.game = { actors: { get: id => (types[id] ? { id, type: types[id] } : undefined) } };
});

describe("User Configuration character choices", () => {
	it("registers on renderUserConfig", () => {
		const registered = [];
		global.Hooks = { on: (name, fn) => registered.push([name, fn]) };
		registerUserConfigCharacterFilter();
		expect(registered).toEqual([["renderUserConfig", pruneCharacterChoices]]);
	});

	it("keeps only playbook characters and the blank choice", () => {
		const { root, select } = userConfig({ Owner: ["pc1", "npc1", "home", "gmt"], Observer: ["pc2", "mon1"] });
		pruneCharacterChoices({ document: { character: null } }, root);
		expect(values(select)).toEqual(["", "pc1", "pc2"]);
	});

	it("drops a group left empty", () => {
		const { root, select } = userConfig({ Owner: ["pc1"], Observer: ["npc1", "mon1"] });
		pruneCharacterChoices({ document: { character: null } }, root);
		expect(labels(select)).toEqual(["Owner"]);
	});

	it("keeps a non-PC the user already has, so Save does not release it", () => {
		const { root, select } = userConfig({ Owner: ["pc1", "npc1", "mon1"] });
		pruneCharacterChoices({ document: { character: { id: "npc1" } } }, root);
		expect(values(select)).toEqual(["", "pc1", "npc1"]);
	});

	it("leaves a window without the select alone", () => {
		expect(() => pruneCharacterChoices({}, { querySelector: () => null })).not.toThrow();
	});
});
