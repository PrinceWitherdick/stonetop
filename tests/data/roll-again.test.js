import { describe, it, expect } from "vitest";
import { againPool, againSpec } from "../../module/data/roll-again.js";
import { siteManner } from "../../module/data/site-tables.js";
import { FIELDS } from "../../module/data/artifact-creation-tables.js";

// One "roll again" shape and one reader for every generator table (roll-again.js). The site
// tables used to say it as a bare number, the artifact tables as a range object.

describe("againSpec", () => {
	it("reads the narrowings a row leaves set, and how many rerolls", () => {
		expect(againSpec({ again: {} })).toEqual({ min: null, max: null, group: null, count: 1 });
		expect(againSpec({ again: { min: 2, max: 9 } })).toMatchObject({ min: 2, max: 9 });
		expect(againSpec({ again: { group: "more common" }, againCount: 2 })).toMatchObject({ group: "more common", count: 2 });
		expect(againSpec({ text: "A ruin" })).toBeNull();
	});

	it("reads no bare number: the tables carry the one shape", () => {
		expect(againSpec({ again: 8 })).toBeNull();
	});
});

describe("againPool", () => {
	const table = [1, 2, 3, 4].map(n => ({ min: n, max: n, text: `r${n}`, group: n > 2 ? "b" : "a" }));

	it("narrows by min, max and group, and never offers the row itself", () => {
		const row = { ...table[3], again: { min: 2, max: 3 } };
		expect(againPool([...table.slice(0, 3), row], row).map(r => r.text)).toEqual(["r2", "r3"]);
		const grouped = { ...table[0], again: { group: "b" } };
		expect(againPool([grouped, ...table.slice(1)], grouped).map(r => r.text)).toEqual(["r3", "r4"]);
	});

	it("offers nothing for a row that asks nothing", () => {
		expect(againPool(table, table[0])).toEqual([]);
	});
});

describe("every generator table", () => {
	it("writes every roll-again in the shared shape", () => {
		const rows = [
			...siteManner("greenLord").tables.flatMap(t => t.rows ?? []),
			...Object.values(FIELDS).flatMap(f => f?.table ?? []),
		];
		const asking = rows.filter(r => r && "again" in r);
		expect(asking.length).toBeGreaterThan(0);
		for (const r of asking) expect(typeof r.again, r.text).toBe("object");
	});
});
