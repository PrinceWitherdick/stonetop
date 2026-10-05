import { describe, it, expect } from "vitest";
import {
	ORIGINS, NATURES, WHAT_IS_IT, SIZES, USAGE, PROPERTIES,
	DETAIL_FIELDS, FORM_FIELDS, detailFieldsForNature,
	weightOf, rollOnTable, seedDescriptionHtml,
	GODS, RED_CRYSTAL_REDWOOD, EXTRA_CHARACTERISTIC, WHY_THEY_CARE, MATERIALS, SPIRITS, KNOWLEDGE,
	RECORDING, FUNCTIONS, DRAWBACKS, PRICELESS, BINDINGS,
	FIELDS, MAX_AGAIN_DEPTH, againTable, againFields, expandFields, rollField, clearAgainPicks,
} from "../../module/data/artifact-creation-tables.js";

// A deterministic rng stub returning a fixed float in [0, 1).
const rng = v => () => v;
// A sequenced rng that walks a list of floats, then repeats the last.
const seq = (...vals) => { let i = 0; return () => vals[Math.min(i++, vals.length - 1)]; };
const tiles1to12 = table => {
	const covered = [];
	for (const e of table) for (let r = e.min; r <= e.max; r++) covered.push(r);
	return covered.sort((a, b) => a - b);
};
const ALL12 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const keysOf = fields => fields.map(f => f.key);

describe("the three follow-up sub-tables", () => {
	it("each tile 1d12 as printed (gods p. 499, red crystal/redwood p. 500, extra characteristic p. 501)", () => {
		expect(tiles1to12(GODS)).toEqual(ALL12);
		expect(tiles1to12(RED_CRYSTAL_REDWOOD)).toEqual(ALL12);
		expect(tiles1to12(EXTRA_CHARACTERISTIC)).toEqual(ALL12);
		expect(GODS.map(g => [g.min, g.max, g.text])).toEqual([[1, 2, "Aratis"], [3, 4, "Danu"], [5, 6, "Helior"], [7, 8, "Tor"], [9, 12, "Other gods"]]);
	});

	it("come up beneath the row that sends you to them", () => {
		expect(keysOf(expandFields([FIELDS.origin], { origin: 4 }))).toEqual(["origin", "god"]);
		expect(keysOf(expandFields([FIELDS.origin], { origin: 3 }))).toEqual(["origin"]);
		// Red crystal (9-10) opens its table; its 5-7 row opens step 2d with the extra question,
		// and an extra characteristic of 9-10 opens step 2f.
		const crystal = MATERIALS.findIndex(m => m.min === 9);
		const property = RED_CRYSTAL_REDWOOD.findIndex(r => r.min === 5);
		const lore = EXTRA_CHARACTERISTIC.findIndex(r => r.min === 9);
		expect(keysOf(expandFields(DETAIL_FIELDS.material, { material: crystal, crystal: property, extra: lore })))
			.toEqual(["material", "crystal", "property", "extra", "knowledge", "recording"]);
	});

	it("asks the extra-characteristic question of every extraordinary property", () => {
		expect(keysOf(detailFieldsForNature("property"))).toEqual(["property", "extra"]);
	});

	it("sends lore 10-12 to function and drawback, and recording 1 to the spirit tables", () => {
		expect(keysOf(expandFields(DETAIL_FIELDS.lore, { knowledge: KNOWLEDGE.length - 1, recording: 0 })))
			.toEqual(["knowledge", "function", "drawback", "recording", "binding", "spirit"]);
	});

	it("only ever opens fields that exist", () => {
		for (const field of Object.values(FIELDS)) {
			for (const row of field.table) for (const key of row.opens ?? []) expect(FIELDS[key], `${field.key} -> ${key}`).toBeTruthy();
			expect(field.page, field.key).toBeGreaterThanOrEqual(499);
		}
	});
});

describe("restored roll-again and go-to instructions", () => {
	it("keeps the printed instruction in each row's text", () => {
		expect(WHY_THEY_CARE[10].text).toMatch(/roll 1d10 again/);
		expect(SPIRITS[0].text).toMatch(/roll again/);
		expect(SPIRITS[9].text).toMatch(/roll 1d8\+1 again/);
		expect(SPIRITS[11].text).toMatch(/roll again/);
		expect(KNOWLEDGE[KNOWLEDGE.length - 1].text).toMatch(/function and drawback/);
		expect(RECORDING[0].text).toMatch(/step 2e/);
		expect(SIZES[4].text).toMatch(/^Roll 1d8 again/);
		expect(SIZES[5].text).toMatch(/^Roll 1d10 again/);
		expect(WHAT_IS_IT.find(e => /^Religion/.test(e.text)).text).toMatch(/roll again/);
		expect(MATERIALS[0].text).toMatch(/p\. 388/);
		expect(PRICELESS[PRICELESS.length - 1].text).toMatch(/as many times as you like/);
	});

	it("reads SIZES 3-4 and 5-6 as an item and a large item", () => {
		expect(SIZES[1].text).toBe("An item or object");
		expect(SIZES[2].text).toBe("A large item or object");
	});

	it("narrows each reroll as the book does, never onto the row itself", () => {
		expect(againTable(SIZES, SIZES[4]).map(r => r.max)).toEqual([2, 4, 6, 8]);
		expect(againTable(SIZES, SIZES[5]).map(r => r.max)).toEqual([2, 4, 6, 8, 10]);
		expect(againTable(WHY_THEY_CARE, WHY_THEY_CARE[10]).map(r => r.min)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
		expect(againTable(SPIRITS, SPIRITS[9]).map(r => r.min)).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
		expect(againTable(SPIRITS, SPIRITS[0])).toHaveLength(11);
		expect(againTable(SPIRITS, SPIRITS[0])).not.toContain(SPIRITS[0]);
		const decorated = WHAT_IS_IT[WHAT_IS_IT.length - 1];
		expect(againTable(WHAT_IS_IT, decorated).every(r => r.group === "more common")).toBe(true);
		expect(againTable(WHAT_IS_IT, decorated)).toHaveLength(12);
		expect(againTable(BINDINGS, BINDINGS[0])).toEqual([]);
	});

	it("gives 'roll twice' two rerolls", () => {
		expect(keysOf(againFields(FIELDS.function, FUNCTIONS[11]))).toEqual(["function-again1", "function-again2"]);
		expect(keysOf(againFields(FIELDS.drawback, DRAWBACKS[11]))).toHaveLength(2);
		expect(keysOf(againFields(FIELDS.property, PROPERTIES[11]))).toHaveLength(2);
	});
});

describe("rollField follows the rerolls", () => {
	it("chains size 11-12 into 1d10, then 9-10 into 1d8", () => {
		// 0.99 lands 11-12; on 1..10 (weights 2,2,2,2,2) 0.9 lands 9-10; on 1..8, 0 lands 1-2.
		const picks = rollField(FIELDS.size, {}, seq(0.99, 0.9, 0));
		expect(SIZES[picks.size].min).toBe(11);
		const fields = expandFields(FORM_FIELDS, picks);
		expect(keysOf(fields)).toEqual(["size", "size-again", "size-again-again", "form"]);
		const last = fields[2];
		expect(last.table[picks["size-again-again"]].text).toBe("A small item");
	});

	it("rolls both halves of a 'roll twice'", () => {
		const picks = rollField(FIELDS.function, {}, seq(0.99, 0, 0.5));
		expect(Number.isInteger(picks["function-again1"])).toBe(true);
		expect(Number.isInteger(picks["function-again2"])).toBe(true);
	});

	it("clears a reroll's stale follow-ups when the parent is rolled again", () => {
		const picks = rollField(FIELDS.size, {}, seq(0.99, 0.9, 0));
		rollField(FIELDS.size, picks, rng(0));
		expect(Object.keys(picks)).toEqual(["size"]);
		expect(clearAgainPicks("size", { size: 1, "size-again": 0, form: 2 })).toEqual({ size: 1, form: 2 });
	});

	it("stops a chain that would never end at MAX_AGAIN_DEPTH", () => {
		const loop = { key: "x", label: "X", table: [{ min: 1, max: 1, text: "a", again: {} }, { min: 2, max: 2, text: "b", again: {} }] };
		const picks = rollField(loop, {}, Math.random);
		expect(Object.keys(picks)).toHaveLength(MAX_AGAIN_DEPTH + 1);
	});
});

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
