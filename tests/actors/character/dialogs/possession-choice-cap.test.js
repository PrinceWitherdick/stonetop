import { describe, expect, it } from "vitest";
import { effectiveSubgroupMax, buildChoiceGroupsView } from "../../../../module/actors/character/dialogs/possession-choice-cap.js";

describe("effectiveSubgroupMax", () => {
	// The Blessed's sacred-pouch remarkable-trait line.
	const TRAIT_LINE = {
		multiSelect: true,
		maxSelect: 1,
		maxSelectBonus: { moveBonus: [{ moveName: "Big Magic", perInstance: 1 }] },
		options: [{ slug: "a" }, { slug: "b" }, { slug: "c" }, { slug: "d" }],
	};

	it("returns null for a subgroup with no maxSelect (unlimited)", () => {
		expect(effectiveSubgroupMax({ multiSelect: true, options: [] })).toBeNull();
		expect(effectiveSubgroupMax(null)).toBeNull();
		expect(effectiveSubgroupMax(undefined)).toBeNull();
	});

	it("returns the base maxSelect with no qualifying moves", () => {
		expect(effectiveSubgroupMax(TRAIT_LINE)).toBe(1);
		expect(effectiveSubgroupMax(TRAIT_LINE, {})).toBe(1);
		expect(effectiveSubgroupMax(TRAIT_LINE, { "Some Other Move": 3 })).toBe(1);
	});

	it("adds the move bonus per instance (Big Magic → +1 trait each)", () => {
		expect(effectiveSubgroupMax(TRAIT_LINE, { "Big Magic": 1 })).toBe(2);
		expect(effectiveSubgroupMax(TRAIT_LINE, { "Big Magic": 2 })).toBe(3);
	});

	it("respects a perInstance other than 1", () => {
		const line = { maxSelect: 0, maxSelectBonus: { moveBonus: [{ moveName: "X", perInstance: 2 }] } };
		expect(effectiveSubgroupMax(line, { X: 3 })).toBe(6);
	});

	it("sums multiple move bonuses and never goes below 0", () => {
		const line = {
			maxSelect: 1,
			maxSelectBonus: { moveBonus: [
				{ moveName: "Big Magic", perInstance: 1 },
				{ moveName: "Other", perInstance: 1 },
			] },
		};
		expect(effectiveSubgroupMax(line, { "Big Magic": 2, "Other": 1 })).toBe(4);
		expect(effectiveSubgroupMax({ maxSelect: 0 }, {})).toBe(0);
	});

	it("treats a maxSelect of 0 as a real (non-null) cap", () => {
		expect(effectiveSubgroupMax({ maxSelect: 0 })).toBe(0);
	});
});

describe("buildChoiceGroupsView", () => {
	// Mirrors the Blessed's sacred pouch: a "pick 1 each line" flavor group + the
	// capped "remarkable trait" multi-select.
	const GROUPS = [
		{ heading: "Your sacred pouch is...", note: "choose 1 on each line", subgroups: [
			{ options: [{ slug: "origin-heirloom", label: "an heirloom" }, { slug: "origin-own", label: "your own work" }] },
			{ options: [{ slug: "mat-fur", label: "fur" }, { slug: "mat-woven", label: "woven" }] },
		]},
		{ heading: "What remarkable trait does it possess?", note: "choose 1", subgroups: [
			{ multiSelect: true, maxSelect: 1, maxSelectBonus: { moveBonus: [{ moveName: "Big Magic", perInstance: 1 }] },
			  options: [{ slug: "t-a", label: "A" }, { slug: "t-b", label: "B" }, { slug: "t-c", label: "C" }] },
		]},
	];

	it("returns [] for empty/missing choiceGroups", () => {
		expect(buildChoiceGroupsView(null)).toEqual([]);
		expect(buildChoiceGroupsView([])).toEqual([]);
	});

	it("carries heading/note and stable groupIds + slugsCsv", () => {
		const view = buildChoiceGroupsView(GROUPS, [], {});
		expect(view[0].heading).toBe("Your sacred pouch is...");
		expect(view[0].note).toBe("choose 1 on each line");
		expect(view[0].subgroups[0].groupId).toBe("cg0-sg0");
		expect(view[0].subgroups[1].groupId).toBe("cg0-sg1");
		expect(view[1].subgroups[0].groupId).toBe("cg1-sg0");
		expect(view[0].subgroups[0].slugsCsv).toBe("origin-heirloom,origin-own");
	});

	it("radio (non-multiSelect) subgroups have max null and never disable", () => {
		const sg = buildChoiceGroupsView(GROUPS, ["origin-heirloom"], {})[0].subgroups[0];
		expect(sg.multiSelect).toBe(false);
		expect(sg.max).toBeNull();
		expect(sg.options.find(o => o.slug === "origin-heirloom").checked).toBe(true);
		expect(sg.options.every(o => o.disabled === false)).toBe(true);
	});

	it("marks picked options checked and reports the count", () => {
		const traitSg = buildChoiceGroupsView(GROUPS, ["origin-heirloom", "t-b"], {})[1].subgroups[0];
		expect(traitSg.selectedCount).toBe(1);
		expect(traitSg.options.find(o => o.slug === "t-b").checked).toBe(true);
	});

	it("caps the trait line at 1 without Big Magic — extra options disable", () => {
		const traitSg = buildChoiceGroupsView(GROUPS, ["t-a"], {})[1].subgroups[0];
		expect(traitSg.max).toBe(1);
		expect(traitSg.options.find(o => o.slug === "t-a").disabled).toBe(false); // chosen stays toggleable
		expect(traitSg.options.find(o => o.slug === "t-b").disabled).toBe(true);  // at cap → locked
		expect(traitSg.options.find(o => o.slug === "t-c").disabled).toBe(true);
	});

	it("Big Magic raises the trait cap so a second pick is allowed", () => {
		const traitSg = buildChoiceGroupsView(GROUPS, ["t-a"], { "Big Magic": 1 })[1].subgroups[0];
		expect(traitSg.max).toBe(2);
		// One chosen, cap 2 → the others stay open.
		expect(traitSg.options.find(o => o.slug === "t-b").disabled).toBe(false);
		expect(traitSg.options.find(o => o.slug === "t-c").disabled).toBe(false);
	});
});
