import { describe, expect, it } from "vitest";
import { FakePlaybookRepository } from "../../fakes/FakePlaybookRepository.js";
import { TestCharacterBuilder } from "../../fakes/TestCharacterBuilder.js";
import { FakeActorBuilder, FakeStatBuilder } from "../../fakes/FakeActorBuilder.js";

// A move card shows a "needs your input" cue (statChoiceNeeded) when the character owns an
// Improved/Superior Stat move whose stat was never chosen — e.g. a character created before
// onboarding collected the pick, so the move silently boosts nothing. The cue must clear once
// a stat is recorded, and must not appear when no stat can still be raised (all at the cap).

const HEAVY_PLAYBOOK = {
	slug: "the-heavy",
	name: "The Heavy",
	startingMovesNote: "Choose 2 to start.",
	backgrounds: [],
};

function makeMove(id, name, overrides = {}) {
	return { _id: id, name, system: { moveType: "playbook", isStartingMove: false, rollType: null, ...overrides } };
}

// Build a snapshot for a Heavy owning one "Improved Stat" (cap 2) with the given stats + flags.
async function buildImprovedStatSnap({ stats, flags = {} } = {}) {
	const actor = new FakeActorBuilder()
		.withPlaybook("the-heavy", "The Heavy")
		.withStats(stats ?? new FakeStatBuilder().withStr(1).withDex(0).withCon(0).withInt(0).withWis(0).withCha(-1))
		.addItem({ _id: "is1", type: "move", name: "Improved Stat", system: { moveType: "playbook", cap: 2 } })
		.withFlags(flags)
		.build();
	const snap = await new TestCharacterBuilder(actor)
		.withPlaybookRepo(new FakePlaybookRepository(HEAVY_PLAYBOOK))
		.addPlaybookMove(makeMove("pm1", "Improved Stat", { cap: 2, repeatMax: 3 }))
		.build().buildSnapshot();
	return snap.moves.find(c => c.key === "playbook").moves.find(m => m.name === "Improved Stat");
}

describe("buildSnapshot — statChoiceNeeded cue", () => {
	it("flags an owned Improved Stat with no stat chosen", async () => {
		const move = await buildImprovedStatSnap();
		expect(move.statChoiceNeeded).toEqual({ count: 1, cap: 2 });
		// No chip renders while unfilled.
		expect(move.statChoices).toEqual([]);
	});

	it("clears the cue once a stat is recorded", async () => {
		const move = await buildImprovedStatSnap({ flags: { improvedStatChoices: { is1: "str" } } });
		expect(move.statChoiceNeeded).toBeNull();
		expect(move.statChoices).toEqual([{ ownedId: "is1", statKey: "str", statAbbr: "STR" }]);
	});

	it("does not flag when every stat is already at the cap (no choice possible)", async () => {
		const allMaxed = new FakeStatBuilder().withStr(2).withDex(2).withCon(2).withInt(2).withWis(2).withCha(2);
		const move = await buildImprovedStatSnap({ stats: allMaxed });
		expect(move.statChoiceNeeded).toBeNull();
	});

	it("still flags when only one stat remains below the cap", async () => {
		const oneOpen = new FakeStatBuilder().withStr(2).withDex(2).withCon(2).withInt(2).withWis(2).withCha(1);
		const move = await buildImprovedStatSnap({ stats: oneOpen });
		expect(move.statChoiceNeeded).toEqual({ count: 1, cap: 2 });
	});
});
