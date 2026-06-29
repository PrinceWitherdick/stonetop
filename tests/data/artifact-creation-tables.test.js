import { describe, it, expect } from "vitest";
import {
	ORIGINS, NATURES, WHAT_IS_IT, SIZES, USAGE, PROPERTIES,
	DETAIL_FIELDS, FORM_FIELDS, detailFieldsForNature,
	weightOf, rollOnTable, seedDescriptionHtml,
} from "../../module/data/artifact-creation-tables.js";

// A deterministic rng stub returning a fixed float in [0, 1).
const rng = v => () => v;

describe("artifact-creation tables", () => {
	it("ORIGINS and the seq() tables are a straight 1d12", () => {
		expect(ORIGINS).toHaveLength(12);
		ORIGINS.forEach((e, i) => {
			expect(e.min).toBe(i + 1);
			expect(e.max).toBe(i + 1);
			expect(e.text).toBeTruthy();
		});
	});

	it("NATURES covers all 12 rolls contiguously and every key has detail fields", () => {
		// Ranges tile 1..12 with no gaps or overlaps.
		const covered = [];
		for (const n of NATURES) for (let r = n.min; r <= n.max; r++) covered.push(r);
		expect(covered.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
		for (const n of NATURES) expect(DETAIL_FIELDS[n.key], n.key).toBeTruthy();
	});

	it("detailFieldsForNature branches and is empty for unknown keys", () => {
		expect(detailFieldsForNature("magic").map(f => f.key)).toEqual(["function", "drawback", "usage"]);
		expect(detailFieldsForNature("mundane")).toHaveLength(1);
		expect(detailFieldsForNature("nope")).toEqual([]);
	});

	it("FORM_FIELDS exposes the size + what-is-it fields with real tables", () => {
		expect(FORM_FIELDS.map(f => f.key)).toEqual(["size", "form"]);
		expect(FORM_FIELDS[0].table).toBe(SIZES);
		expect(FORM_FIELDS[1].table).toBe(WHAT_IS_IT);
		// Every field the wizard renders must carry a key, a label, and a non-empty table.
		for (const f of FORM_FIELDS) {
			expect(f.label).toBeTruthy();
			expect(Array.isArray(f.table) && f.table.length).toBeTruthy();
		}
	});

	it("every detail field across all natures carries key/label/table", () => {
		for (const fields of Object.values(DETAIL_FIELDS)) {
			for (const f of fields) {
				expect(f.key).toBeTruthy();
				expect(f.label).toBeTruthy();
				expect(Array.isArray(f.table) && f.table.length).toBeTruthy();
			}
		}
	});

	it("WHAT_IS_IT blends two 1d12 tables with a 2:1 common:less-common weight", () => {
		expect(WHAT_IS_IT).toHaveLength(24);
		const common = WHAT_IS_IT.filter(e => e.group === "more common");
		const less   = WHAT_IS_IT.filter(e => e.group === "less common");
		expect(common).toHaveLength(12);
		expect(less).toHaveLength(12);
		expect(common.every(e => e.weight === 2)).toBe(true);
		expect(less.every(e => e.weight === 1)).toBe(true);
	});
});

describe("weightOf", () => {
	it("uses explicit weight, then 1d12 span, then 1", () => {
		expect(weightOf({ weight: 2 })).toBe(2);
		expect(weightOf({ min: 1, max: 3 })).toBe(3);
		expect(weightOf({ min: 7, max: 7 })).toBe(1);
		expect(weightOf({ text: "x" })).toBe(1);
		expect(weightOf(null)).toBe(1);
	});
});

describe("rollOnTable", () => {
	it("maps the low end of the [0,1) range to the first entry", () => {
		expect(rollOnTable(PROPERTIES, rng(0))).toBe(PROPERTIES[0]);
	});

	it("maps the high end to the last entry", () => {
		expect(rollOnTable(PROPERTIES, rng(0.999))).toBe(PROPERTIES[11]);
	});

	it("respects range spans (USAGE 1–3 fills the first 3/12 of the range)", () => {
		// total span = 12; r = floor(0.2 * 12) = 2 → still inside the [1,3] first entry.
		expect(rollOnTable(USAGE, rng(0.2))).toBe(USAGE[0]);
		// r = floor(0.3 * 12) = 3 → second entry ([4,6]).
		expect(rollOnTable(USAGE, rng(0.3))).toBe(USAGE[1]);
	});

	it("weights common 'What is it?' entries twice as heavily as less-common ones", () => {
		// total weight = 12*2 + 12*1 = 36; the 12 common entries fill the first 24/36.
		expect(rollOnTable(WHAT_IS_IT, rng(0))).toBe(WHAT_IS_IT[0]);
		expect(rollOnTable(WHAT_IS_IT, rng(23 / 36 + 0.001)).group).toBe("more common");
		expect(rollOnTable(WHAT_IS_IT, rng(24 / 36 + 0.001)).group).toBe("less common");
	});

	it("returns null for an empty/invalid table", () => {
		expect(rollOnTable([], rng(0))).toBeNull();
		expect(rollOnTable(null, rng(0))).toBeNull();
	});

	it("SIZES covers all 12 rolls", () => {
		const covered = [];
		for (const e of SIZES) for (let r = e.min; r <= e.max; r++) covered.push(r);
		expect(covered.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
	});
});

describe("seedDescriptionHtml", () => {
	it("builds an italic heading + a bullet per non-empty line", () => {
		const html = seedDescriptionHtml([
			{ label: "Origin", text: "The Rime Lords" },
			{ label: "Form", text: "A small item" },
		]);
		expect(html).toContain("<em>Inspiration (Artifact Creation)</em>");
		expect(html).toContain("<li><strong>Origin:</strong> The Rime Lords</li>");
		expect(html).toContain("<li><strong>Form:</strong> A small item</li>");
	});

	it("skips blank lines and returns '' when there's nothing to seed", () => {
		expect(seedDescriptionHtml([{ label: "Origin", text: "" }, null])).toBe("");
		expect(seedDescriptionHtml([])).toBe("");
		expect(seedDescriptionHtml(undefined)).toBe("");
	});

	it("escapes HTML in labels and text", () => {
		const html = seedDescriptionHtml([{ label: "A & B", text: "<script>x</script>" }]);
		expect(html).toContain("A &amp; B");
		expect(html).toContain("&lt;script&gt;");
		expect(html).not.toContain("<script>");
	});
});
