import { describe, it, expect } from "vitest";
import { stepMode, betterMode, worseMode, foldModes } from "../../module/utils/roll-mode.js";

// Advantage and disadvantage cancel (p.230), and neither stacks with itself. One rule, one home --
// asked from the roller's side, the defender's side, and every ticked line on the damage window.

describe("stepMode: one mode meeting another", () => {
	it("lays a mode on a roll nobody has spoken about yet", () => {
		expect(stepMode("", "adv")).toBe("adv");
		expect(stepMode("", "dis")).toBe("dis");
		// "not a mode I know" and "no mode" are the same thing to this rule.
		expect(stepMode("sideways", "dis")).toBe("dis");
	});

	it("cancels the opposite and ignores its own repeat", () => {
		expect(stepMode("adv", "dis")).toBe("normal");
		expect(stepMode("dis", "adv")).toBe("normal");
		expect(stepMode("adv", "adv")).toBe("adv");
		expect(stepMode("dis", "dis")).toBe("dis");
	});

	it("changes nothing when nothing is laid on", () => {
		expect(stepMode("adv", "")).toBe("adv");
		expect(stepMode("adv", "normal")).toBe("adv");
	});

	it("names the two directions", () => {
		expect(betterMode("dis")).toBe("normal");
		expect(worseMode("adv")).toBe("normal");
	});
});

describe("foldModes: every mode in play at once", () => {
	// THE BUG THIS EXISTS FOR. Folding a list through stepMode one at a time loses the difference
	// between a straight roll nobody spoke about and a straight roll REACHED BY CANCELLING, so the
	// second "dis" lands on the latter as though it were the former. Big Damn Hero's locked eyes plus
	// a Never Gonna Keep Me Down against an advantaged blow rolled at disadvantage, when the rule both
	// of them quote says they cancel.
	it("cancels ONCE however many voices say the same thing", () => {
		expect(foldModes(["dis", "dis"], "adv")).toBe("normal");
		expect(foldModes(["adv", "adv"], "dis")).toBe("normal");
		expect(foldModes(["dis", "dis", "dis"], "adv")).toBe("normal");
		// Which the sequential fold got wrong, and is why this function exists.
		expect(["dis", "dis"].reduce(stepMode, "adv")).toBe("dis");
	});

	it("is the one side that spoke when only one did", () => {
		expect(foldModes(["dis", "dis"])).toBe("dis");
		expect(foldModes(["adv"], "")).toBe("adv");
		expect(foldModes([], "dis")).toBe("dis");
	});

	it("gives the roll back its own mode when nothing changes it", () => {
		expect(foldModes([], "")).toBe("");
		expect(foldModes(["", "normal"], "normal")).toBe("normal");
		expect(foldModes(["normal"], "adv")).toBe("adv");
	});

	it("tolerates nothing to fold", () => {
		expect(foldModes(null, "adv")).toBe("adv");
		expect(foldModes(undefined)).toBe("");
	});
});
