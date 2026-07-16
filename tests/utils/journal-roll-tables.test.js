import { describe, expect, it } from "vitest";
import { parseRange, planTableRoll, outcomeFor, composeTableLabelParts } from "../../module/utils/journal-roll-tables.js";

// The module's DOM wiring (icon injection, click → chat) is thin; the logic worth
// guarding is the pure trio: how a Roll-cell parses, how the die/label are picked
// from a caption (or inferred), and which row a rolled total lands on.

describe("parseRange", () => {
	it("parses single numbers and ranges (both dash forms)", () => {
		expect(parseRange("1")).toEqual({ lo: 1, hi: 1 });
		expect(parseRange(" 7 ")).toEqual({ lo: 7, hi: 7 });
		expect(parseRange("3-4")).toEqual({ lo: 3, hi: 4 });
		expect(parseRange("11–12")).toEqual({ lo: 11, hi: 12 });
	});

	it("rejects cells that aren't a clean roll value", () => {
		expect(parseRange("5'-8'")).toBeNull();
		expect(parseRange("a chimera")).toBeNull();
		expect(parseRange("")).toBeNull();
	});
});

describe("planTableRoll", () => {
	const rows = [{ lo: 1, hi: 1 }, { lo: 2, hi: 5 }, { lo: 6, hi: 6 }];

	it("takes the die and label from the caption", () => {
		expect(planTableRoll({ captionText: "1d6 encounter", rows }))
			.toEqual({ formula: "1d6", label: "encounter" });
	});

	it("infers a flat 1dN over the highest row when the caption has no formula", () => {
		expect(planTableRoll({ captionText: "", headingText: "Hazards", rows }))
			.toEqual({ formula: "1d6", label: "Hazards" });
	});

	it("falls back to a generic label when there's no caption or heading", () => {
		expect(planTableRoll({ rows }).label).toBe("Random table");
	});
});

describe("composeTableLabelParts", () => {
	it("puts the page name on line 1 and the title-cased table label on line 2", () => {
		// A dedicated single-table section ("Themes") collapses, leaving a plain line 2.
		expect(composeTableLabelParts({ pageName: "The Things Below", subheadings: ["Themes"], label: "theme" }))
			.toEqual(["The Things Below", "Theme"]);
	});

	it("prefixes line 2 with a distinct section name", () => {
		expect(composeTableLabelParts({ pageName: "The Things Below", subheadings: ["Artifacts"], label: "minor arcanum" }))
			.toEqual(["The Things Below", "Artifacts: Minor Arcanum"]);
	});

	it("comma-joins nested sections on line 2, outermost→innermost", () => {
		expect(composeTableLabelParts({ pageName: "The Things Below", subheadings: ["Dangers", "Corruption"], label: "gift" }))
			.toEqual(["The Things Below", "Dangers, Corruption: Gift"]);
	});

	it("only drops the innermost section when it restates the label", () => {
		expect(composeTableLabelParts({ pageName: "The Fae", subheadings: ["Sites & structures", "Signs"], label: "sign" }))
			.toEqual(["The Fae", "Sites & structures: Sign"]);
	});

	it("preserves acronyms and contractions in the shown label", () => {
		expect(composeTableLabelParts({ pageName: "Ustrina", subheadings: [], label: "what they’re offering" }))
			.toEqual(["Ustrina", "What They’re Offering"]);
	});

	it("falls back to a single line when there's no page or section context", () => {
		expect(composeTableLabelParts({ label: "encounter" })).toEqual(["Encounter"]);
		expect(composeTableLabelParts({})).toEqual(["Random table"]);
	});
});

describe("outcomeFor", () => {
	const rows = [
		{ lo: 1, hi: 1, html: "one" },
		{ lo: 2, hi: 5, html: "few" },
		{ lo: 6, hi: 6, html: "six" },
	];

	it("returns the html of the row whose range covers the total", () => {
		expect(outcomeFor(rows, 1)).toBe("one");
		expect(outcomeFor(rows, 4)).toBe("few");
		expect(outcomeFor(rows, 6)).toBe("six");
	});

	it("returns null when no row covers the total", () => {
		expect(outcomeFor(rows, 7)).toBeNull();
	});
});
