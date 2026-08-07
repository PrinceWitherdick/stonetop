import { describe, it, expect } from "vitest";
import { buildFacetGroups, facetChipsFromRows, isRowHidden, rowMatchesChip, toggleChip } from "../../module/utils/catalog-filters.js";

const row = (key, facets) => ({ key, facets });

const ROWS = [
	row("a", { tier: "major", kind: ["relic", "power"], curse: "ruinous" }),
	row("b", { tier: "minor", kind: ["power"],          curse: "" }),
	row("c", { tier: "minor", kind: [],                 curse: "" }),
	row("d", { tier: "major", kind: ["relic"],          curse: "mild" }),
];

describe("rowMatchesChip", () => {
	it("compares a scalar facet by equality", () => {
		expect(rowMatchesChip(ROWS[0], "tier", "major")).toBe(true);
		expect(rowMatchesChip(ROWS[0], "tier", "minor")).toBe(false);
	});

	it("treats an array facet as membership — an entry can hold several at once", () => {
		expect(rowMatchesChip(ROWS[0], "kind", "relic")).toBe(true);
		expect(rowMatchesChip(ROWS[0], "kind", "power")).toBe(true);
		expect(rowMatchesChip(ROWS[0], "kind", "conduit")).toBe(false);
	});

	it("is false for an unknown group or a row with no facets", () => {
		expect(rowMatchesChip(ROWS[0], "nope", "x")).toBe(false);
		expect(rowMatchesChip({}, "tier", "major")).toBe(false);
		expect(rowMatchesChip(null, "tier", "major")).toBe(false);
	});
});

describe("isRowHidden", () => {
	it("hides nothing when no chip is lit", () => {
		expect(ROWS.filter(r => isRowHidden(r, {}))).toEqual([]);
		expect(ROWS.filter(r => isRowHidden(r, { tier: "", kind: "" }))).toEqual([]);
	});

	it("ANDs the groups together", () => {
		const shown = ROWS.filter(r => !isRowHidden(r, { tier: "major", kind: "relic" }));
		expect(shown.map(r => r.key)).toEqual(["a", "d"]);
	});

	it("returns an empty set for a real but unsatisfiable combination", () => {
		// Minor + any curse: only Major arcana carry a Consequences track, so this is
		// reachable and legitimately empty rather than a bug.
		const shown = ROWS.filter(r => !isRowHidden(r, { tier: "minor", curse: "ruinous" }));
		expect(shown).toEqual([]);
	});

	it("hides a row whose facet value is blank when that group is filtering", () => {
		expect(isRowHidden(ROWS[1], { curse: "mild" })).toBe(true);
	});
});

describe("toggleChip", () => {
	it("lights a chip, and clears it when clicked again", () => {
		const lit = toggleChip({}, "tier", "major");
		expect(lit).toEqual({ tier: "major" });
		expect(toggleChip(lit, "tier", "major")).toEqual({ tier: "" });
	});

	it("replaces the lit chip within a group — the groups are single-select", () => {
		expect(toggleChip({ tier: "major" }, "tier", "minor")).toEqual({ tier: "minor" });
	});

	it("leaves the other groups alone", () => {
		expect(toggleChip({ tier: "major", kind: "relic" }, "kind", "power"))
			.toEqual({ tier: "major", kind: "power" });
	});

	it("does not mutate the map it was given", () => {
		const before = { tier: "major" };
		toggleChip(before, "tier", "minor");
		expect(before).toEqual({ tier: "major" });
	});
});

describe("buildFacetGroups", () => {
	const DEFS = [{
		key: "tier",
		label: "Tier",
		chips: [{ key: "major", label: "Major" }, { key: "minor", label: "Minor" }],
	}];

	it("stamps each chip with its count and whether it's lit", () => {
		const [group] = buildFacetGroups(DEFS, ROWS, { tier: "minor" });
		expect(group.label).toBe("Tier");
		expect(group.chips.map(c => [c.key, c.count, c.active])).toEqual([
			["major", 2, false],
			["minor", 2, true],
		]);
	});

	it("counts against the WHOLE row set, not what the other lit chips leave", () => {
		// So the number says the same thing whichever order you click things in.
		const [group] = buildFacetGroups(DEFS, ROWS, { curse: "ruinous" });
		expect(group.chips.map(c => c.count)).toEqual([2, 2]);
	});

	it("keeps a chip that matches nothing rather than dropping it", () => {
		const defs = [{ key: "tier", label: "Tier", chips: [{ key: "mythic", label: "Mythic" }] }];
		const [group] = buildFacetGroups(defs, ROWS, {});
		expect(group.chips).toHaveLength(1);
		expect(group.chips[0].count).toBe(0);
	});

	it("marks a chip group as not-a-dropdown, with nothing selected", () => {
		const [group] = buildFacetGroups(DEFS, ROWS, {});
		expect(group.isSelect).toBe(false);
		expect(group.anyActive).toBe(false);
	});

	it("resolves `control: select` to a boolean and carries the group's own fields", () => {
		// The template has no comparison helper, so the JS decides which control to render.
		const defs = [{ key: "tier", label: "Tier", control: "select", allLabel: "Any tier", chips: DEFS[0].chips }];
		const [group] = buildFacetGroups(defs, ROWS, { tier: "major" });
		expect(group.isSelect).toBe(true);
		expect(group.allLabel).toBe("Any tier");
		expect(group.anyActive).toBe(true);
	});

	it("reports anyActive false when the lit key matches no chip in the group", () => {
		const defs = [{ key: "tier", label: "Tier", control: "select", chips: DEFS[0].chips }];
		expect(buildFacetGroups(defs, ROWS, { tier: "mythic" })[0].anyActive).toBe(false);
	});

	it("carries the chip's own presentation fields through untouched", () => {
		const defs = [{ key: "tier", label: "Tier", chips: [{ key: "major", label: "Major", icon: "fas fa-star", hint: "h", mod: "m" }] }];
		expect(buildFacetGroups(defs, ROWS, {})[0].chips[0])
			.toMatchObject({ icon: "fas fa-star", hint: "h", mod: "m" });
	});
});

describe("facetChipsFromRows", () => {
	const PEOPLE = [
		row("1", { home: "Marshedge" }),
		row("2", { home: "Stonetop" }),
		row("3", { home: "Marshedge" }),
		row("4", { home: "Barrier Pass" }),
	];

	it("takes the distinct values the world actually holds", () => {
		expect(facetChipsFromRows(PEOPLE, "home").map(c => c.key))
			.toEqual(["Barrier Pass", "Marshedge", "Stonetop"]);
	});

	it("pins `first` to the front and sorts the rest", () => {
		expect(facetChipsFromRows(PEOPLE, "home", { first: "Stonetop" }).map(c => c.key))
			.toEqual(["Stonetop", "Barrier Pass", "Marshedge"]);
	});

	it("skips blank values — an empty chip key could never light", () => {
		const rows = [row("1", { home: "" }), row("2", { home: "Gordin's Delve" })];
		expect(facetChipsFromRows(rows, "home").map(c => c.key)).toEqual(["Gordin's Delve"]);
	});

	it("returns nothing for a group no row carries", () => {
		expect(facetChipsFromRows(PEOPLE, "nope")).toEqual([]);
	});
});
