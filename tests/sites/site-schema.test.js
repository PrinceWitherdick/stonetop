import { describe, it, expect } from "vitest";
import { MAX_ROW_SPAN, SITE_PAIR_LISTS, clampRowSpan, expandTableRows, keyedRows, numberTableRows, pairKeys, shapePairList, someText, tableRowRanges } from "../../module/sites/site-schema.js";

// The one table four things read — the wizard, the shaper, the card view-model and the review
// tally — and the one rule for what a keyed row is worth keeping. These were three private copies
// before, and the copies had already drifted over which blank counts as blank.

describe("keyedRows", () => {
	it("trims every key and keeps a row that has text in any of them", () => {
		expect(keyedRows([{ a: "  x ", b: "" }], ["a", "b"])).toEqual([{ a: "x", b: "" }]);
		expect(keyedRows([{ a: "", b: " y" }], ["a", "b"])).toEqual([{ a: "", b: "y" }]);
	});

	it("drops a row whose every key is blank or whitespace", () => {
		expect(keyedRows([{ a: "", b: "   " }, { a: "keep", b: "" }], ["a", "b"]))
			.toEqual([{ a: "keep", b: "" }]);
	});

	it("fills a key the row never had, so every row is the same shape", () => {
		expect(keyedRows([{ a: "x" }], ["a", "b"])).toEqual([{ a: "x", b: "" }]);
	});

	it("leaves the keys named in `keep` exactly as typed", () => {
		// A textarea's interior line breaks and its indentation are the GM's own paragraphing.
		const [row] = keyedRows([{ a: " t ", b: "\nline1\n\n  line2\n" }], ["a", "b"], ["b"]);
		expect(row).toEqual({ a: "t", b: "\nline1\n\n  line2\n" });
	});

	it("still drops a row whose only content is untrimmed whitespace", () => {
		// `keep` says "do not rewrite this value", not "this counts as text".
		expect(keyedRows([{ a: "", b: "  \n  " }], ["a", "b"], ["b"])).toEqual([]);
	});

	it("survives a non-array, a null row and a non-string value", () => {
		expect(keyedRows(null, ["a"])).toEqual([]);
		expect(keyedRows(undefined, ["a"])).toEqual([]);
		expect(keyedRows([null, { a: 7 }], ["a"])).toEqual([{ a: "7" }]);
	});
});

describe("someText", () => {
	it("is false only when every key is blank", () => {
		expect(someText({ a: "", b: " " }, ["a", "b"])).toBe(false);
		expect(someText({ a: "", b: "x" }, ["a", "b"])).toBe(true);
		// A key the caller did not name cannot keep the row alive.
		expect(someText({ a: "", z: "x" }, ["a"])).toBe(false);
	});
});

describe("SITE_PAIR_LISTS", () => {
	it("names areas' four keys, not two", () => {
		// The list that broke the old fixed keyA/keyB renderer: it rendered the first two and
		// silently dropped the rest, which were still seeded, saved and shaped.
		expect(pairKeys("areas")).toEqual(["title", "description", "contents", "exits"]);
	});

	it("is null for a list that is not a paired one, which is how the wizard tells them apart", () => {
		expect(pairKeys("dangers")).toBeNull();
		expect(pairKeys("")).toBeNull();
		expect(pairKeys(undefined)).toBeNull();
	});

	it("declares every multiline key as one of that list's own keys", () => {
		for (const [list, spec] of Object.entries(SITE_PAIR_LISTS)) {
			for (const key of spec.multiline ?? []) {
				expect(spec.keys, `${list}.multiline names "${key}"`).toContain(key);
			}
		}
	});
});

describe("shapePairList", () => {
	it("keeps an area's textarea keys as typed and trims its single-line ones", () => {
		const [area] = shapePairList("areas", [{
			title: "  Entrance chamber (A) ",
			description: "Dimly lit.\n\nBeyond, the floor is filthy.\n",
			contents: "  a crinwin\n  a hoard  ",
			exits: "  north  ",
		}]);
		expect(area.title).toBe("Entrance chamber (A)");
		expect(area.exits).toBe("north");
		expect(area.description).toBe("Dimly lit.\n\nBeyond, the floor is filthy.\n");
		expect(area.contents).toBe("  a crinwin\n  a hoard  ");
	});

	it("trims both halves of a list with no multiline keys", () => {
		expect(shapePairList("questions", [{ prompt: " why? ", answer: " because " }]))
			.toEqual([{ prompt: "why?", answer: "because" }]);
	});

	it("is empty for a list that is not a paired one", () => {
		expect(shapePairList("dangers", [{ x: "y" }])).toEqual([]);
	});
});

// A table row the book prints as a range ("1-3 In shrine, alert") is stored as one row per face.
describe("tableRowRanges / expandTableRows", () => {
	it("merges consecutive identical rows into one ranged row, and expands it back", () => {
		const stored = ["alert", "alert", "alert", "hunting", "hunting", "asleep"];
		const ranged = tableRowRanges(stored);
		expect(ranged.map(r => [r.roll, r.text, r.span])).toEqual([["1-3", "alert", 3], ["4-5", "hunting", 2], ["6", "asleep", 1]]);
		expect(expandTableRows(ranged)).toEqual(stored);
	});

	it("never merges blank rows (two fresh rows stay two rows) or non-adjacent repeats", () => {
		expect(tableRowRanges(["", ""]).length).toBe(2);
		expect(tableRowRanges(["a", "b", "a"]).map(r => r.roll)).toEqual(["1", "2", "3"]);
	});

	it("splits a run longer than maxSpan rather than letting the editor clamp faces away", () => {
		const stored = Array(30).fill("Nothing");
		expect(tableRowRanges(stored).map(r => r.roll)).toEqual(["1-30"]);
		const ranged = tableRowRanges(stored, { maxSpan: MAX_ROW_SPAN });
		expect(ranged.map(r => [r.roll, r.span])).toEqual([[`1-${MAX_ROW_SPAN}`, MAX_ROW_SPAN], [`${MAX_ROW_SPAN + 1}-30`, 30 - MAX_ROW_SPAN]]);
		expect(expandTableRows(ranged)).toEqual(stored);
	});

	it("numbers ranged rows by the faces they cover", () => {
		expect(numberTableRows([{ span: 3 }, { span: 1 }]).map(r => [r.from, r.to, r.roll])).toEqual([[1, 3, "1-3"], [4, 4, "4"]]);
	});

	it("clamps a span to 1..MAX_ROW_SPAN", () => {
		expect(clampRowSpan("")).toBe(1);
		expect(clampRowSpan(2.7)).toBe(2);
		expect(clampRowSpan(999)).toBe(MAX_ROW_SPAN);
		expect(expandTableRows([{ text: "x", span: 0 }])).toEqual(["x"]);
		expect(expandTableRows([{ text: "x", span: 999 }]).length).toBe(MAX_ROW_SPAN);
		expect(expandTableRows([{ text: "x", span: "3" }])).toEqual(["x", "x", "x"]);
	});
});
