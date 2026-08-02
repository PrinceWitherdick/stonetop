import { describe, it, expect } from "vitest";
import {
	LEDGER_SCOPE, LEDGER_KEY, LEDGER_FLAG_PATH,
	appendLedgerEntries, listMerge, numericMerge,
} from "../../module/utils/ledger-core.js";

// appendLedgerEntries is the seam between a caller's chronological list of what just happened
// and the newest-first array the flag stores (and that mergeRuns walks). These cover the flip,
// which is invisible until one update produces several entries at once.

function makeActor(stored = []) {
	const actor = {
		type: "character",
		written: null,
		getFlag: (scope, key) => (scope === LEDGER_SCOPE && key === LEDGER_KEY ? stored : undefined),
		update: async data => { actor.written = data[LEDGER_FLAG_PATH]; },
	};
	return actor;
}

const actions = actor => actor.written.map(e => e.action);

describe("appendLedgerEntries ordering", () => {
	it("accumulates a list run in the order the entries happened", async () => {
		// Picking all four appearance lines lands as ONE update, so all four entries arrive in
		// a single call. Walked backwards they read "ceremonial robes, curvy, imperious voice,
		// fresh-faced" — every line right, the sequence inverted.
		const actor = makeActor();
		const picks = ["fresh-faced", "imperious voice", "curvy", "ceremonial robes"];
		await appendLedgerEntries(actor, picks.map(value => ({
			action: `Appearance set to ${value}`,
			merge: listMerge("Appearance", "appearance", [value]),
		})));

		expect(actions(actor)).toEqual([
			"Appearance set to fresh-faced, imperious voice, curvy, ceremonial robes",
		]);
	});

	it("puts the last thing that happened at the head of the ledger", async () => {
		const actor = makeActor();
		await appendLedgerEntries(actor, [
			{ action: "Background set to Sheriff" },
			{ action: "Instinct set to Protective" },
		]);
		// Newest first: the instinct was chosen after the background.
		expect(actions(actor)).toEqual(["Instinct set to Protective", "Background set to Sheriff"]);
	});

	it("folds the newest entry into a stored run even when a sibling shares the update", async () => {
		// One update writing both XP and Level hands over two entries. Whichever order
		// flattenObject produced them in, the XP entry is the one adjacent to the stored XP
		// run once the list is newest-first — so it merges instead of being blocked.
		const actor = makeActor([{
			id: "old", timestamp: Date.now(), userId: null, userName: "GM", move: null,
			action: "XP changed from 0 to 1",
			merge: numericMerge("XP", "system.attributes.xp.value", 0, 1),
		}]);

		await appendLedgerEntries(actor, [
			{ action: "XP changed from 1 to 2", merge: numericMerge("XP", "system.attributes.xp.value", 1, 2) },
			{ action: "Level changed from 1 to 2", merge: numericMerge("Level", "system.attributes.level.value", 1, 2) },
		]);

		expect(actions(actor)).toEqual(["Level changed from 1 to 2", "XP changed from 0 to 2"]);
	});

	it("stamps a category and leaves an explicit one alone", async () => {
		const actor = makeActor();
		await appendLedgerEntries(
			actor,
			[{ action: "Surplus changed from 1 to 2" }, { action: "Notes edited", category: "notes" }],
			{ defaultCategory: "steading" },
		);
		expect(actor.written.map(e => e.category)).toEqual(["notes", "steading"]);
	});
});
