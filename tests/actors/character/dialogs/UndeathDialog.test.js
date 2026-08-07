import { describe, it, expect } from "vitest";
import { UndeathDialog } from "../../../../module/actors/character/dialogs/UndeathDialog.js";
import { zeroHpResolution } from "../../../../module/actors/character/deaths-door.js";

// A Revenant facing Undying. Only what the dialog reads off the character before it applies
// anything: the resolution spec (the real one, so the tiers and effects are the book's).
function makeRevenantDialog() {
	const dialog = new UndeathDialog({ zeroHpResolution: zeroHpResolution("revenant") }, () => {});
	// refreshSections() would load these from the compendium; one unmarked consequence is enough
	// for "mark a consequence" to count as available rather than exhausted.
	dialog._sections.consequences = [{ slug: "cold-to-the-touch", label: "Cold to the touch", blocked: false, marked: false }];
	return dialog;
}

describe("UndeathDialog — the Revenant's destroyed-body tick", () => {
	it("ticking it resolves as a 6-, which takes all three effects", () => {
		const dialog = makeRevenantDialog();
		dialog._setForcedMiss(true);

		expect(dialog._step).toBe("resolve");
		expect(dialog._tierKey).toBe("failure");
		expect([...dialog._picked].sort()).toEqual(["consequence", "maim", "out-of-action"]);
	});

	it("un-ticking it drops the picks the 6- forced, not just the tier", () => {
		const dialog = makeRevenantDialog();
		dialog._setForcedMiss(true);
		dialog._choices.consequence = "cold-to-the-touch";

		dialog._setForcedMiss(false);

		// Undying has no `always` tier, so the un-tick leaves no tier at all. Keeping the three
		// picks through it would carry them into a later 10+ — which takes ONE — and leave Apply
		// dead forever, since the gate counts picks against the tier's `pick`.
		expect(dialog._step).toBe("roll");
		expect(dialog._tierKey).toBeNull();
		expect(dialog._picked.size).toBe(0);
		expect(dialog._choices.consequence).toBeUndefined();
	});

	it("re-ticking it still forces the full three", () => {
		const dialog = makeRevenantDialog();
		dialog._setForcedMiss(true);
		dialog._setForcedMiss(false);
		dialog._setForcedMiss(true);

		expect([...dialog._picked].sort()).toEqual(["consequence", "maim", "out-of-action"]);
	});
});

describe("UndeathDialog — a move that doesn't roll", () => {
	it("keeps the Ghost's single forced pick: Tethered's `always` tier is a real tier", () => {
		const dialog = new UndeathDialog({ zeroHpResolution: zeroHpResolution("ghost") }, () => {});
		dialog._sections.consequences = [{ slug: "faded", label: "Faded", blocked: false, marked: false }];

		dialog._syncForcedPicks();

		expect(dialog._step).toBe("resolve");
		expect([...dialog._picked]).toEqual(["consequence"]);
	});
});
