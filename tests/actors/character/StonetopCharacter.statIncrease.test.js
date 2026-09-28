import { describe, expect, it, vi } from "vitest";
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

	it("a stat already at the cap is neither raised nor recorded, and the player is told", async () => {
		const warn = vi.fn();
		const saved = global.ui;
		global.ui = { notifications: { info: () => {}, warn, error: () => {} } };
		try {
			const { char, actor } = makeChar(new FakeStatBuilder().withDex(2));
			const raised = await char._applyStatIncreaseChoice({ id: "item2", name: "Improved Stat" }, "dex", 2);

			expect(raised).toBe(false);
			expect(actor.getFlag("stonetop-pwd", "improvedStatChoices")).toBeNull();
			expect(actor.update).not.toHaveBeenCalled();
			expect(warn).toHaveBeenCalledWith("Improved Stat: Dexterity is already at +2, so it was not raised. Choose another stat from the move's card.");
		} finally {
			global.ui = saved;
		}
	});

	it("a pick that found the stat at the cap drops a stale record for that instance (onboarding re-run)", async () => {
		const { char, actor } = makeChar(new FakeStatBuilder().withDex(2), { improvedStatChoices: { item2: "dex", other: "str" } });
		await char._applyStatIncreaseChoice({ id: "item2", name: "Improved Stat" }, "dex", 2);

		expect(actor.getFlag("stonetop-pwd", "improvedStatChoices")).toEqual({ other: "str" });
	});

	// The bug: a pick recorded at the cap raised nothing, yet removing the move took a point.
	it("removing a move whose pick found the stat at the cap leaves the stat alone", async () => {
		const { char, actor } = makeChar(new FakeStatBuilder().withDex(2));
		const item = { id: "item2", name: "Improved Stat" };
		await char._applyStatIncreaseChoice(item, "dex", 2);
		await char._revertStatIncreaseChoice(item);

		expect(actor.system.stats.dex.value).toBe(2);
	});

	it("apply then revert is an exact inverse when the stat rose", async () => {
		const { char, actor } = makeChar(new FakeStatBuilder().withDex(1));
		const item = { id: "item3", name: "Improved Stat" };
		expect(await char._applyStatIncreaseChoice(item, "dex", 2)).toBe(true);
		expect(actor.system.stats.dex.value).toBe(2);
		await char._revertStatIncreaseChoice(item);

		expect(actor.system.stats.dex.value).toBe(1);
		expect(actor.getFlag("stonetop-pwd", "improvedStatChoices")?.item3).toBeUndefined();
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
