import { describe, expect, it, vi } from "vitest";
import { StonetopArcanaInspireDialog } from "../../module/item/StonetopArcanaInspireDialog.js";
import { NATURES, MATERIALS, RED_CRYSTAL_REDWOOD, SPIRITS } from "../../module/data/artifact-creation-tables.js";

// The Artifact Creation wizard shows the book's follow-up tables beneath the row that sends you
// to them (Book II pp. 499-506), and follows a "roll again" row for you, picked or rolled.

function wizard() {
	const dlg = new StonetopArcanaInspireDialog({ onCreate: vi.fn() });
	dlg.render = vi.fn();
	return dlg;
}
const keys = (dlg, step) => dlg._fieldsForStep(step).map(f => f.key);

describe("the inspiration wizard's follow-up fields", () => {
	it("asks which god under 'Gods and religion'", () => {
		const dlg = wizard();
		dlg._picks.origin = 4;
		expect(keys(dlg, "origin")).toEqual(["origin", "god"]);
	});

	it("opens the red crystal/redwood table, and the tables its rows send you to", () => {
		const dlg = wizard();
		dlg._picks.nature = NATURES.findIndex(n => n.key === "material");
		dlg._picks.material = MATERIALS.findIndex(m => m.min === 11);
		dlg._picks.crystal = RED_CRYSTAL_REDWOOD.findIndex(r => r.min === 8);
		expect(keys(dlg, "detail")).toEqual(["material", "crystal", "binding", "spirit"]);
	});

	it("marks follow-ups and carries the page each table is printed on", () => {
		const dlg = wizard();
		dlg._step = "detail";
		dlg._picks.nature = NATURES.findIndex(n => n.key === "property");
		const fields = dlg.getData().fields;
		expect(fields.map(f => [f.key, f.page, f.followUp])).toEqual([["property", 501, false], ["extra", 501, false]]);
	});

	it("rolls again for you when a 'roll again' row is picked by hand, and draws it", () => {
		const dlg = wizard();
		dlg._step = "detail";
		dlg._picks.nature = NATURES.findIndex(n => n.key === "spirit");
		dlg._pickField("spirit", String(SPIRITS.findIndex(s => /fledgling/.test(s.text))));
		expect(keys(dlg, "detail")).toEqual(["binding", "spirit", "spirit-again"]);
		expect(Number.isInteger(dlg._picks["spirit-again"])).toBe(true);
		expect(dlg.render).toHaveBeenCalled();
		// A plain row takes the reroll away again.
		dlg._pickField("spirit", "1");
		expect(keys(dlg, "detail")).toEqual(["binding", "spirit"]);
		expect(dlg._picks["spirit-again"]).toBeUndefined();
	});

	it("seeds the card with the follow-up results too", () => {
		const dlg = wizard();
		dlg._picks.origin = 4;
		dlg._picks.god = 0;
		const lines = dlg._chosenLines();
		expect(lines).toContainEqual({ label: "Which god", text: "Aratis" });
	});
});
