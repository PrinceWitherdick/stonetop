import { describe, it, expect, beforeAll } from "vitest";
import { LoveLetterDialog } from "../../module/dialogs/LoveLetterDialog.js";

// loveLetterRollOptions() (reached by getData) labels the stat dropdown via the
// statLabel Handlebars helper; the app registers it at init, so stub it for the harness.
beforeAll(() => {
	globalThis.Handlebars ??= {};
	globalThis.Handlebars.helpers ??= {};
	globalThis.Handlebars.helpers.statLabel ??= (k) => String(k);
});

// getData().resultStyle decides which of the two mutually-exclusive result panels opens
// for an existing letter, and the save path persists ONLY the shown style's fields. The
// regression this guards: a letter authored with the pre-rename dialog (which showed a
// "Pick N" box beside every prose tier) can carry a non-zero pick count ALONGSIDE real
// prose. If resultStyle flipped to "list" for it, the prose panel would hide and the next
// save would blank the freeform outcomes — silent data loss. So the pool (pickOptions),
// not stray pick counts, decides list style; prose is preferred whenever prose exists.

function styleFor(system) {
	const dlg = Object.create(LoveLetterDialog.prototype);
	dlg._item = { system };
	return dlg.getData().resultStyle;
}

describe("LoveLetterDialog result-style classification", () => {
	it("keeps a legacy prose letter that also carries a stray pick count in prose mode", () => {
		expect(styleFor({
			rollType: "STR",
			moveResults: {
				success: { value: "You win big.", pick: 1 },
				partial: { value: "At a cost.", pick: 0 },
				failure: { value: "It goes wrong.", pick: 0 },
			},
			pickOptions: [],
		})).toBe("prose");
	});

	it("opens list mode when the letter has a shared pick-list pool", () => {
		expect(styleFor({
			rollType: "STR",
			moveResults: { success: { pick: 1 }, partial: { pick: 2 }, failure: { pick: 3 } },
			pickOptions: ["Give ground", "Lose face"],
		})).toBe("list");
	});

	it("opens list mode for a bare pick-count letter with no pool and no prose", () => {
		expect(styleFor({
			rollType: "STR",
			moveResults: { success: { pick: 1 }, partial: {}, failure: {} },
			pickOptions: [],
		})).toBe("list");
	});

	it("defaults a plain prose letter (no picks, no pool) to prose", () => {
		expect(styleFor({
			rollType: "STR",
			moveResults: { success: { value: "x" }, partial: { value: "" }, failure: { value: "" } },
			pickOptions: [],
		})).toBe("prose");
	});
});
