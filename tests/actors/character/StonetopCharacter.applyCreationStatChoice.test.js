import { describe, expect, it } from "vitest";
import { TestCharacterBuilder } from "../../fakes/TestCharacterBuilder.js";
import { FakeActorBuilder, FakeStatBuilder } from "../../fakes/FakeActorBuilder.js";

// A stat-increase move taken at creation (the Would-Be Hero's Improved Stat) carries a
// "+1 to which stat?" pick. Onboarding finalize rewrites base stats first — which drops any
// previously-applied +1 — so the pick has to be (re-)applied against the OWNED move instance,
// not gated on addMove's return (which is null once the move is already owned, e.g. on an
// onboarding re-run). applyCreationStatChoice is that re-application; it must work even when
// nothing was freshly added.

function makeCharacter({ str = 1, ownItem = true } = {}) {
	const builder = new FakeActorBuilder()
		.withPlaybook("the-would-be-hero", "The Would-Be Hero")
		.withStats(new FakeStatBuilder().withStr(str));
	if (ownItem) {
		// Real Foundry items expose `id` as an alias of `_id`; the fake stores raw objects.
		builder.addItem({ _id: "imp1", id: "imp1", type: "move", name: "Improved Stat", system: { moveType: "playbook", cap: 2 } });
	}
	const actor = builder.build();
	const character = new TestCharacterBuilder(actor)
		.addPlaybookMove({ _id: "pm-imp", name: "Improved Stat", system: { moveType: "playbook", cap: 2 } })
		.build();
	return { actor, character };
}

describe("StonetopCharacter.applyCreationStatChoice", () => {
	it("records the pick and bumps the chosen stat on an already-owned move (re-run path)", async () => {
		const { actor, character } = makeCharacter({ str: 1 });
		await character.applyCreationStatChoice("pm-imp", "str");
		expect(actor.setFlag).toHaveBeenCalledWith("stonetop_pwd", "improvedStatChoices", { imp1: "str" });
		expect(actor.update).toHaveBeenCalledWith(
			{ "system.stats.str.value": 2 },
			expect.objectContaining({ stonetopMove: "Improved Stat" }),
		);
	});

	it("caps the bump at the move's stat cap", async () => {
		const { actor, character } = makeCharacter({ str: 2 });
		await character.applyCreationStatChoice("pm-imp", "str");
		// Already at cap 2 — no stat write (next === current), but the pick is still recorded.
		expect(actor.setFlag).toHaveBeenCalledWith("stonetop_pwd", "improvedStatChoices", { imp1: "str" });
		expect(actor.update).not.toHaveBeenCalled();
	});

	it("is a no-op when no stat was chosen", async () => {
		const { actor, character } = makeCharacter();
		await character.applyCreationStatChoice("pm-imp", "");
		expect(actor.setFlag).not.toHaveBeenCalled();
		expect(actor.update).not.toHaveBeenCalled();
	});

	it("is a no-op when the move isn't owned", async () => {
		const { actor, character } = makeCharacter({ ownItem: false });
		await character.applyCreationStatChoice("pm-imp", "str");
		expect(actor.setFlag).not.toHaveBeenCalled();
		expect(actor.update).not.toHaveBeenCalled();
	});
});
