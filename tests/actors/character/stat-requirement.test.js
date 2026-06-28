import { describe, it, expect } from "vitest";
import { statRequirementLabel, statRequirementsUnmet } from "../../../module/actors/character/stat-requirement.js";

describe("statRequirementLabel", () => {
	it("renders a single stat gate as 'ABBR +N'", () => {
		expect(statRequirementLabel({ str: 2 })).toBe("STR +2");
	});

	it("joins multiple stat gates with a comma", () => {
		expect(statRequirementLabel({ str: 2, dex: 1 })).toBe("STR +2, DEX +1");
	});

	it("returns null for an absent or empty map", () => {
		expect(statRequirementLabel(null)).toBeNull();
		expect(statRequirementLabel({})).toBeNull();
	});
});

describe("statRequirementsUnmet", () => {
	it("is true when any listed stat is below its minimum", () => {
		expect(statRequirementsUnmet({ str: 2 }, { str: 1 })).toBe(true);
		expect(statRequirementsUnmet({ str: 2, dex: 1 }, { str: 2, dex: 0 })).toBe(true);
	});

	it("is false when every listed stat meets or exceeds its minimum", () => {
		expect(statRequirementsUnmet({ str: 2 }, { str: 2 })).toBe(false);
		expect(statRequirementsUnmet({ str: 2 }, { str: 3 })).toBe(false);
	});

	it("treats a missing stat as 0", () => {
		expect(statRequirementsUnmet({ str: 2 }, {})).toBe(true);
		expect(statRequirementsUnmet({ str: 2 })).toBe(true);
	});

	it("is never unmet for an absent requirement (non-stat-gated moves)", () => {
		expect(statRequirementsUnmet(null, { str: 0 })).toBe(false);
		expect(statRequirementsUnmet(undefined, {})).toBe(false);
	});
});
