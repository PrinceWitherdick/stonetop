import { describe, it, expect } from "vitest";
import {
	MOVE_TIERS,
	TIER_KEYS,
	TIER_LABELS,
	buildMoveTierResults,
	parseTierInput,
	pickLeadText,
} from "../../module/utils/move-results.js";

// module/utils/move-results.js is where the three tiers' keys, order and labels live for the whole
// system, and where custom moves and love letters shape the results they store. It had no test of
// its own: only what other modules happened to pass through it was ever checked.
describe("the tier table", () => {
	it("is the three tiers in card order, each with the label it prints under", () => {
		expect(MOVE_TIERS).toEqual([
			{ key: "success", label: "10+" },
			{ key: "partial", label: "7-9" },
			{ key: "failure", label: "6-" },
		]);
		expect(TIER_KEYS).toEqual(["success", "partial", "failure"]);
		expect(TIER_LABELS).toEqual({ success: "10+", partial: "7-9", failure: "6-" });
	});

	// Shared by every importer, so a caller that mutates it would change every card's labels.
	it("cannot be changed by a caller", () => {
		expect(Object.isFrozen(MOVE_TIERS)).toBe(true);
		expect(Object.isFrozen(MOVE_TIERS[0])).toBe(true);
		expect(Object.isFrozen(TIER_KEYS)).toBe(true);
		expect(Object.isFrozen(TIER_LABELS)).toBe(true);
	});
});

describe("buildMoveTierResults", () => {
	it("shapes the three texts as labelled rows, with no pick key when no picks are given", () => {
		expect(buildMoveTierResults({ success: "You win.", partial: "You mostly win." })).toEqual({
			success: { label: "10+", value: "You win." },
			partial: { label: "7-9", value: "You mostly win." },
			failure: { label: "6-", value: "" },
		});
	});

	// The love letter shape: every tier carries a count, 0 where the letter gave none.
	it("adds a pick count per tier when picks are given, 0 for a tier left out", () => {
		const results = buildMoveTierResults({ success: "A" }, { success: 2, partial: 1 });
		expect(results).toEqual({
			success: { label: "10+", value: "A", pick: 2 },
			partial: { label: "7-9", value: "", pick: 1 },
			failure: { label: "6-", value: "", pick: 0 },
		});
	});
});

describe("parseTierInput", () => {
	const ALLOWED = ["str", "wis", "ask"];

	it("lower-cases and trims the roll type, and trims each tier's text", () => {
		expect(parseTierInput({ rollType: " WIS ", results: { success: "  a ", partial: "b\n", failure: " " } }, ALLOWED))
			.toEqual({ rollType: "wis", success: "a", partial: "b", failure: "" });
	});

	it("collapses a roll type outside the builder's list to a no-roll move", () => {
		expect(parseTierInput({ rollType: "luck" }, ALLOWED).rollType).toBe("");
	});

	it("reads missing or non-string input as empty rather than throwing", () => {
		expect(parseTierInput(undefined, ALLOWED)).toEqual({ rollType: "", success: "", partial: "", failure: "" });
		expect(parseTierInput({ rollType: 7, results: { success: 3, partial: null } }, ALLOWED))
			.toEqual({ rollType: "", success: "3", partial: "", failure: "" });
	});
});

describe("pickLeadText", () => {
	const WORDS = { pick: "Pick", fromList: "from the list below" };

	it("names the count, and the shared list when there is one", () => {
		expect(pickLeadText(2, false, WORDS)).toBe("Pick 2");
		expect(pickLeadText(1, true, WORDS)).toBe("Pick 1 from the list below");
	});

	it("reads a count stored as a string", () => {
		expect(pickLeadText("3", false, WORDS)).toBe("Pick 3");
	});

	it("says nothing for a count of zero, below zero, or none at all", () => {
		expect(pickLeadText(0, true, WORDS)).toBe("");
		expect(pickLeadText(-1, true, WORDS)).toBe("");
		expect(pickLeadText(undefined, true, WORDS)).toBe("");
		expect(pickLeadText("lots", true, WORDS)).toBe("");
	});
});
