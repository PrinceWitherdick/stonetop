import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import Handlebars from "handlebars";

// The introductions pre-check, COMPILED AND RENDERED against the shape getData builds for it.
//
// The order used to be set in the Combat tracker ("roll or set initiative"), and the tracker is
// now the Fight tab, which has no initiative at all. So the screen must not send anybody there,
// and the controls that replaced it (Randomize and the per-row arrows) must reach the GM only,
// wired to the right character.

const ROOT = path.resolve(import.meta.dirname, "../..");
const read = p => fs.readFileSync(path.join(ROOT, p), "utf8");

Handlebars.registerPartial("stonetop.guide-toc", read("templates/dialogs/partials/guide-toc.hbs"));
Handlebars.registerPartial("stonetop.intros-capture-head", read("templates/dialogs/partials/intros-capture-head.hbs"));
const template = Handlebars.compile(read("templates/dialogs/introductions.hbs"));

const row = (id, name, i, n) => ({
	id, name, first: i === 0, last: i === n - 1,
	upLabel: `Move ${name} earlier`, downLabel: `Move ${name} later`,
});

const precheck = ({ isGM = true, names = ["Aeliana", "Bram", "Cadi"] } = {}) => {
	const canReorder = isGM && names.length > 1;
	return {
		isPreCheck: true,
		isGM,
		canReorder,
		canBegin: names.length > 0,
		hasNone: names.length === 0,
		pcCount: names.length,
		pcs: names.map((name, i) => row(name.toLowerCase(), name, i, names.length)),
	};
};

describe("the introductions pre-check", () => {
	it("never points anyone at the Combat tracker or initiative", () => {
		for (const isGM of [true, false]) {
			const html = template(precheck({ isGM })).toLowerCase();
			expect(html).not.toContain("combat");
			expect(html).not.toContain("initiative");
			expect(html).not.toContain("tracker");
		}
	});

	it("lists every PC in the saved order", () => {
		const html = template(precheck());
		const names = [...html.matchAll(/class="stonetop-intros-order-name">([^<]*)</g)].map(m => m[1]);
		expect(names).toEqual(["Aeliana", "Bram", "Cadi"]);
	});

	it("gives a GM an earlier and a later arrow per row, disabled off either end", () => {
		const html = template(precheck());
		const buttons = [...html.matchAll(/<button type="button" class="stonetop-intros-move"([^>]*)>/g)].map(m => m[1]);
		expect(buttons).toHaveLength(6);
		expect(buttons[0]).toContain('data-actor-id="aeliana" data-delta="-1"');
		expect(buttons[0]).toContain(" disabled");
		expect(buttons[1]).toContain('data-delta="1"');
		expect(buttons[1]).not.toContain(" disabled");
		expect(buttons[5]).toContain('data-actor-id="cadi" data-delta="1"');
		expect(buttons[5]).toContain(" disabled");
		expect(buttons[2]).toContain('aria-label="Move Bram earlier"');
		expect(buttons[2]).toContain('data-tooltip-text="Move Bram earlier"');
		expect(html).toContain('class="stonetop-intros-shuffle"');
		expect(html).toContain("move someone up or down");
	});

	it("shows a player the order without anything to press", () => {
		const html = template(precheck({ isGM: false }));
		expect(html).toContain('class="stonetop-intros-order-name">Bram<');
		expect(html).not.toContain("stonetop-intros-move");
		expect(html).not.toContain("stonetop-intros-shuffle");
		expect(html).not.toContain("move someone up or down");
	});

	it("offers no arrows for a table of one", () => {
		const html = template(precheck({ names: ["Aeliana"] }));
		expect(html).not.toContain("stonetop-intros-move");
		expect(html).not.toContain("stonetop-intros-shuffle");
	});

	it("still says when there are no player characters", () => {
		const html = template(precheck({ names: [] }));
		expect(html).toContain("No characters with a playbook were found");
		expect(html).not.toContain("stonetop-intros-order");
	});
});
