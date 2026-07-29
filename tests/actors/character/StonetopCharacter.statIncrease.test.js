import { describe, expect, it } from "vitest";
import { TestCharacterBuilder } from "../../fakes/TestCharacterBuilder.js";
import { FakeActorBuilder, FakeStatBuilder } from "../../fakes/FakeActorBuilder.js";

// Build a character + its fake actor with the given stats and starting flags.
function makeChar(statBuilder, flags = {}) {
	const actor = new FakeActorBuilder()
		.withPlaybook("the-heavy", "The Heavy")
		.withLevel(6)
		.withStats(statBuilder)
		.withFlags(flags)
		.build();
	return { char: new TestCharacterBuilder(actor).build(), actor };
}

describe("StonetopCharacter._applyStatIncreaseChoice", () => {
	it("records the pick (keyed by item id) and bumps the chosen stat by +1", async () => {
		const { char, actor } = makeChar(new FakeStatBuilder().withStr(1));
		await char._applyStatIncreaseChoice({ id: "item1", name: "Improved Stat" }, "str", 2);

		expect(actor.getFlag("stonetop-pwd", "improvedStatChoices")).toEqual({ item1: "str" });
		// Bump tagged with the move name so the ledger reads "via Improved Stat".
		expect(actor.update).toHaveBeenCalledWith(
			{ "system.stats.str.value": 2 },
			{ stonetopMove: "Improved Stat" },
		);
	});

	it("clamps to the cap: a stat already at the cap is recorded but not raised", async () => {
		const { char, actor } = makeChar(new FakeStatBuilder().withDex(2));
		await char._applyStatIncreaseChoice({ id: "item2", name: "Improved Stat" }, "dex", 2);

		expect(actor.getFlag("stonetop-pwd", "improvedStatChoices")).toEqual({ item2: "dex" });
		expect(actor.update).not.toHaveBeenCalled();
	});

	it("uses the move's own cap — Superior Stat lifts a +2 stat to +3", async () => {
		const { char, actor } = makeChar(new FakeStatBuilder().withWis(2));
		await char._applyStatIncreaseChoice({ id: "sup1", name: "Superior Stat" }, "wis", 3);

		expect(actor.update).toHaveBeenCalledWith(
			{ "system.stats.wis.value": 3 },
			{ stonetopMove: "Superior Stat" },
		);
	});

	it("accumulates across repeatable instances without clobbering earlier picks", async () => {
		const { char, actor } = makeChar(new FakeStatBuilder().withStr(0), { improvedStatChoices: { item0: "con" } });
		await char._applyStatIncreaseChoice({ id: "item1", name: "Improved Stat" }, "str", 2);

		expect(actor.getFlag("stonetop-pwd", "improvedStatChoices")).toEqual({ item0: "con", item1: "str" });
	});

	it("ignores an unknown stat key (no flag write, no stat change)", async () => {
		const { char, actor } = makeChar(new FakeStatBuilder().withStr(0));
		await char._applyStatIncreaseChoice({ id: "item1", name: "Improved Stat" }, "bogus", 2);

		expect(actor.getFlag("stonetop-pwd", "improvedStatChoices")).toBeNull();
		expect(actor.update).not.toHaveBeenCalled();
	});
});
