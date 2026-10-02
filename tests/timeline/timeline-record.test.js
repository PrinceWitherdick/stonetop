import { describe, it, expect } from "vitest";
import { inTurn } from "../../module/utils/turn-queue.js";
import { trackTurnKey } from "../../module/timeline/timeline-store.js";

const serializeTrackWrite = (trackId, work) => inTurn(trackTurnKey(trackId), work);
import { timelineNow } from "../../module/timeline/timeline-record.js";
import { levelUpMilestone, levelUpsFromLedger } from "../../module/timeline/timeline-backfill.js";

// THE WRITER'S TWO QUIET PROMISES: a burst of milestones on one track never loses a row, and a
// milestone is filed in the season the table is actually in.

describe("writes to one track", () => {
	// Read-whole-array, write-whole-array: two writes that both read before either lands keep only
	// the last. One Apply that drops three foes, or an arcanum found and identified together, is
	// exactly that burst.
	it("run one after another, each seeing what the last one stored", async () => {
		let stored = [];
		const write = row => serializeTrackWrite("pc1", async () => {
			const seen = [...stored];
			await new Promise(resolve => setTimeout(resolve, 5));
			stored = [...seen, row];
		});
		await Promise.all([write("a"), write("b"), write("c")]);
		expect(stored).toEqual(["a", "b", "c"]);
	});

	it("keep going after one of them fails", async () => {
		const ran = [];
		const failed = serializeTrackWrite("pc2", async () => { throw new Error("no page"); });
		const next = serializeTrackWrite("pc2", async () => { ran.push("next"); });
		await expect(failed).rejects.toThrow("no page");
		await next;
		expect(ran).toEqual(["next"]);
	});
});

describe("timelineNow", () => {
	const steading = flags => ({ getFlag: (_scope, key) => flags[key] });

	it("is the season the clock is stamped in", () => {
		expect(timelineNow(steading({ seasonsCurrent: { season: "autumn", year: 2 }, seasonsCurrentYear: 2 })))
			.toEqual({ season: "autumn", year: 2 });
	});

	// The header reads Spring, Year One for a world whose first Seasons Change is not recorded yet,
	// and a table three sessions in is still IN its first spring, not "before the record".
	it("is Spring of the picker's year for a world that has not stamped its clock", () => {
		expect(timelineNow(steading({}))).toEqual({ season: "spring", year: 1 });
	});

	it("is undated only for a world with no steading at all", () => {
		expect(timelineNow(null)).toEqual({ season: "", year: 1 });
	});
});

describe("the level-up backfill", () => {
	const merged = (from, to, timestamp) => ({
		timestamp, action: `Level changed from ${from} to ${to}`,
		merge: { kind: "numeric", key: "system.attributes.level.value", from, to },
	});

	it("reads one level-up per level, oldest first, from a newest-first ledger", () => {
		const ledger = [merged(3, 4, 300), merged(2, 3, 200), { timestamp: 100, action: "XP changed from 1 to 2" }];
		expect(levelUpsFromLedger(ledger)).toEqual([{ level: 3, timestamp: 200 }, { level: 4, timestamp: 300 }]);
	});

	// Two quick clicks fold into one ledger line; they are still two levels.
	it("expands a merged run into each level it covers", () => {
		expect(levelUpsFromLedger([merged(1, 3, 50)]).map(u => u.level)).toEqual([2, 3]);
	});

	it("reads entries written before the ledger merged, by their words", () => {
		expect(levelUpsFromLedger([{ timestamp: 9, action: "Level changed from 4 to 5" }])).toEqual([{ level: 5, timestamp: 9 }]);
	});

	// A GM correcting a mis-click has not given the character a second fourth level.
	it("counts a level reached once, at the first time, and never a level lost", () => {
		const ledger = [merged(3, 4, 300), merged(4, 3, 200), merged(3, 4, 100)];
		expect(levelUpsFromLedger(ledger)).toEqual([{ level: 4, timestamp: 100 }]);
	});

	// The live row and the backfilled row share a key, so a level the timeline already has is
	// never written twice, whichever got there first.
	it("keys a backfilled level-up exactly as a live one", () => {
		expect(levelUpMilestone(4)).toEqual({ source: "levelup", key: "levelup:4", title: "Reached level 4" });
	});
});
