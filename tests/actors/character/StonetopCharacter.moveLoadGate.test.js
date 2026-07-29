import { describe, expect, it } from "vitest";
import { FakePlaybookRepository } from "../../fakes/FakePlaybookRepository.js";
import { TestCharacterBuilder } from "../../fakes/TestCharacterBuilder.js";
import { FakeActorBuilder } from "../../fakes/FakeActorBuilder.js";

// The expedition Outfit readout gates load-limited moves (the Fox's Catlike, the Heavy's
// Uncanny Reflexes) on the move snapshot's maxLoad / requiresUnarmored fields. Those fields
// have to survive the data -> MoveDefinition -> PlaybookMoveEntry -> MoveSnapshot hop for
// BOTH a native playbook move and a move learned cross-playbook (Versatile/Worldly), because
// ExpeditionDialog._gatedMovesFor drops any owned move whose maxLoad is blank. A regression in
// either snapshot builder silently removes the move from the readout, which is exactly the
// case the feature exists to catch.

const HEAVY_PLAYBOOK = {
	slug: "the-heavy",
	name: "The Heavy",
	startingMovesNote: "Choose 2 to start.",
	backgrounds: [],
};

function movesByKey(snap, key) {
	return snap.moves.find(c => c.key === key)?.moves ?? [];
}

describe("buildSnapshot — move load-gate metadata", () => {
	it("carries maxLoad/requiresUnarmored onto a native playbook move snapshot", async () => {
		const actor = new FakeActorBuilder().withPlaybook("the-heavy", "The Heavy").build();
		const snap = await new TestCharacterBuilder(actor)
			.withPlaybookRepo(new FakePlaybookRepository(HEAVY_PLAYBOOK))
			.addPlaybookMove({
				_id: "pm1", name: "Uncanny Reflexes",
				system: { moveType: "playbook", maxLoad: "normal", requiresUnarmored: true },
			})
			.build().buildSnapshot();
		const move = movesByKey(snap, "playbook").find(m => m.name === "Uncanny Reflexes");
		expect(move.maxLoad).toBe("normal");
		expect(move.requiresUnarmored).toBe(true);
	});

	it("carries maxLoad onto a move learned from another playbook (Learned Moves category)", async () => {
		// A cross-playbook pick (Versatile) grants the Fox's Catlike to a Heavy: it lands in the
		// "Learned Moves" category, whose builder must still surface the load gate.
		const actor = new FakeActorBuilder()
			.withPlaybook("the-heavy", "The Heavy")
			.addItem({
				_id: "gm1", type: "move", name: "Catlike",
				system: { moveType: "playbook", playbook: "The Fox", maxLoad: "light" },
				flags: { "stonetop-pwd": { grantedBy: { move: "Versatile" } } },
			})
			.build();
		const snap = await new TestCharacterBuilder(actor)
			.withPlaybookRepo(new FakePlaybookRepository(HEAVY_PLAYBOOK))
			.build().buildSnapshot();
		const learned = movesByKey(snap, "learned").find(m => m.name === "Catlike");
		expect(learned).toBeDefined();
		expect(learned.owned).toBe(true);
		expect(learned.maxLoad).toBe("light");
	});
});
