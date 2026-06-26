import { describe, it, expect } from "vitest";
import { PlaybookMoveEntry } from "../../../module/actors/character/PlaybookMoveEntry.js";
import { MoveDefinition } from "../../../module/model/MoveDefinition.js";

// Helper: build a repeatable, non-starting move definition (e.g. Improved Stat).
function repeatableEntry({ repeatMax = 3 } = {}) {
	return new MoveDefinition({
		_id: "imp-stat",
		name: "Improved Stat",
		system: { playbook: "The Heavy", description: "<p>+1 stat.</p>", repeatMax },
	});
}

const NO_BG = new Set();
const NO_OWNED_BY_NAME = new Set();

describe("PlaybookMoveEntry (repeatable moves)", () => {
	it("exposes repeatMax from the move definition", () => {
		const entry = new PlaybookMoveEntry(repeatableEntry({ repeatMax: 3 }), [], NO_BG, NO_OWNED_BY_NAME, 1, "The Heavy");
		expect(entry.repeatable).toBe(true);
		expect(entry.repeatMax).toBe(3);
	});

	it("maps each repeat checkbox to its own owned instance id (not the last)", () => {
		// Two instances owned; the third slot is still open.
		const owned = [{ _id: "inst-a" }, { _id: "inst-b" }];
		const entry = new PlaybookMoveEntry(repeatableEntry({ repeatMax: 3 }), owned, NO_BG, NO_OWNED_BY_NAME, 1, "The Heavy");

		expect(entry.repeatChecks).toHaveLength(3);
		// Each checked box deletes the instance it actually represents — regression test
		// for the bug where every checked box pointed at the most-recent instance id.
		expect(entry.repeatChecks[0]).toMatchObject({ checked: true, ownedId: "inst-a" });
		expect(entry.repeatChecks[1]).toMatchObject({ checked: true, ownedId: "inst-b" });
		expect(entry.repeatChecks[2]).toMatchObject({ checked: false, ownedId: null });
	});

	it("a locked repeatable move's next box is NOT disabled by the lock (learnable in edit mode)", () => {
		// Locked by an unmet level gate. The lock fades the row (.move-locked) but must
		// not disable the checkbox — a player may deliberately take it anyway. The
		// template's (not movesEdit) gate is what keeps it read-only outside edit mode.
		const def = new MoveDefinition({
			_id: "rep-locked", name: "Repeatable Locked",
			system: { playbook: "The Heavy", repeatMax: 3, requirement: { level: 6 } },
		});
		const entry = new PlaybookMoveEntry(def, [], NO_BG, NO_OWNED_BY_NAME, 1, "The Heavy");
		expect(entry.locked).toBe(true);
		expect(entry.repeatChecks[0].disabled).toBe(false);
		// Out-of-sequence later boxes stay disabled (must be taken in order).
		expect(entry.repeatChecks[1].disabled).toBe(true);
	});

	it("non-repeatable moves have no repeatChecks and repeatMax 1", () => {
		const def = new MoveDefinition({ _id: "well-versed", name: "Well-Versed", system: { playbook: "The Heavy" } });
		const entry = new PlaybookMoveEntry(def, [], NO_BG, NO_OWNED_BY_NAME, 1, "The Heavy");
		expect(entry.repeatable).toBe(false);
		expect(entry.repeatMax).toBe(1);
		expect(entry.repeatChecks).toBeNull();
	});
});

describe("PlaybookMoveEntry (stat-increase cap)", () => {
	it("exposes the move's stat cap (drives the level-up stat picker); null when absent", () => {
		const imp = new MoveDefinition({ _id: "imp", name: "Improved Stat", system: { playbook: "The Heavy", cap: 2, repeatMax: 3 } });
		const plain = new MoveDefinition({ _id: "x", name: "Berserker", system: { playbook: "The Heavy" } });
		expect(new PlaybookMoveEntry(imp, [], NO_BG, NO_OWNED_BY_NAME, 6, "The Heavy").cap).toBe(2);
		expect(new PlaybookMoveEntry(plain, [], NO_BG, NO_OWNED_BY_NAME, 6, "The Heavy").cap).toBeNull();
	});
});

describe("PlaybookMoveEntry (broken prerequisites on a learned move)", () => {
	// Move B requires Move A. The actor learned B, then edited their moves and
	// removed A — B should flag `requirementsUnmet` so the sheet can warn.
	const moveB = new MoveDefinition({
		_id: "move-b", name: "Move B",
		system: { playbook: "The Heavy", requirement: { moves: ["Move A"] } },
	});
	const OWNED = [{ _id: "b1" }];

	it("flags an OWNED move whose required move is no longer owned", () => {
		const entry = new PlaybookMoveEntry(moveB, OWNED, NO_BG, new Set(["Move B"]), 6, "The Heavy");
		expect(entry.owned).toBe(true);
		expect(entry.locked).toBe(true);
		expect(entry.requirementsUnmet).toBe(true);
	});

	it("does NOT flag when the required move is still owned", () => {
		const entry = new PlaybookMoveEntry(moveB, OWNED, NO_BG, new Set(["Move A", "Move B"]), 6, "The Heavy");
		expect(entry.locked).toBe(false);
		expect(entry.requirementsUnmet).toBe(false);
	});

	it("does NOT flag an un-owned move whose prereq is missing (just locked, not broken)", () => {
		const entry = new PlaybookMoveEntry(moveB, [], NO_BG, NO_OWNED_BY_NAME, 6, "The Heavy");
		expect(entry.locked).toBe(true);
		expect(entry.owned).toBe(false);
		expect(entry.requirementsUnmet).toBe(false);
	});

	it("does NOT flag an owned move that only has a display-only requirement note", () => {
		const def = new MoveDefinition({
			_id: "mb", name: "Musclebound",
			system: { playbook: "The Heavy", requirement: { note: "Strength +2 or higher" } },
		});
		const entry = new PlaybookMoveEntry(def, [{ _id: "mb1" }], NO_BG, new Set(["Musclebound"]), 6, "The Heavy");
		expect(entry.requirementsUnmet).toBe(false);
	});
});

describe("PlaybookMoveEntry (display-only requirement note)", () => {
	it("shows requirement.note in the label but never uses it to lock the move", () => {
		// "Strength +2 or higher" is a prose prereq the engine can't check; with only a
		// note (no real move/playbook/level gate) the move must stay unlocked.
		const def = new MoveDefinition({
			_id: "mb", name: "Musclebound",
			system: { playbook: "The Heavy", requirement: { note: "Strength +2 or higher" } },
		});
		const entry = new PlaybookMoveEntry(def, [], NO_BG, NO_OWNED_BY_NAME, 6, "The Heavy");
		expect(entry.locked).toBe(false);
		expect(entry.requiresLabel).toBe("Strength +2 or higher");
	});

	it("combines a note with a real level gate (WBH Superior Stat) without locking on the note", () => {
		const def = new MoveDefinition({
			_id: "wbh-sup", name: "Superior Stat",
			system: { playbook: "The Would-Be Hero", cap: 3, requirement: { level: 6, note: "All 6 marks in Potential for Greatness" } },
		});
		// At level 6 the level gate is met → unlocked, and the note rides along in the label.
		const unlocked = new PlaybookMoveEntry(def, [], NO_BG, NO_OWNED_BY_NAME, 6, "The Would-Be Hero");
		expect(unlocked.locked).toBe(false);
		expect(unlocked.requiresLabel).toContain("All 6 marks in Potential for Greatness");
		expect(unlocked.requiresLabel).toContain("level 6+");
		// Below level 6 it's locked by the level gate (not the note).
		expect(new PlaybookMoveEntry(def, [], NO_BG, NO_OWNED_BY_NAME, 5, "The Would-Be Hero").locked).toBe(true);
	});
});
