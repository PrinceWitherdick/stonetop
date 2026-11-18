import { describe, it, expect, vi, beforeEach } from "vitest";

// Spring's "Ask the most hopeful to roll" posts its chat card BEFORE it spends the hold and closes
// the step, so a card that fails to post costs no sacrifice. When a write after the card throws,
// the button comes back; the retry must finish the bookkeeping without posting a second card
// (which would also be at advantage again, if the hold had not been cleared).

const { promptRoll, settleSteadingRoll, postSeasonsRollPrompt } = vi.hoisted(() => ({
	promptRoll: vi.fn(),
	settleSteadingRoll: vi.fn(),
	postSeasonsRollPrompt: vi.fn(async () => {}),
}));
vi.mock("../../../module/dialogs/RollDialog.js", async importOriginal => ({
	...(await importOriginal()), promptRoll,
}));
vi.mock("../../../module/actors/steading/steading-roll.js", async importOriginal => ({
	...(await importOriginal()), settleSteadingRoll,
}));
vi.mock("../../../module/utils/roll-engine.js", async importOriginal => ({
	...(await importOriginal()), postSeasonsRollPrompt,
}));

import { handOffSpringRoll } from "../../../module/actors/steading/seasons-change-dialog.js";

function ctx({ setFlags }) {
	return {
		sheet: { _sheetRollMode: () => "normal" },
		actor: { isOwner: true },
		year: 2, seasonId: "spring", view: { label: "Spring" },
		repaint: vi.fn(),
		steading: {
			getStatValue: () => 1,
			openingFortunesFlags: () => ({ opening: 1 }),
			seasonStepFlags: () => ({ step: "fortunesRoll" }),
			setFlags,
		},
	};
}

describe("handOffSpringRoll", () => {
	let spend;
	beforeEach(() => {
		vi.clearAllMocks();
		spend = vi.fn(async () => {});
		promptRoll.mockResolvedValue({ rollMode: "adv", situational: 0, takenOffers: [] });
		settleSteadingRoll.mockResolvedValue({ held: { source: "Rites of the Land" }, rollMode: "adv", spend });
	});

	it("posts the card, spends the hold and closes the step, in that order", async () => {
		const order = [];
		postSeasonsRollPrompt.mockImplementationOnce(async () => { order.push("post"); });
		spend.mockImplementation(async () => { order.push("spend"); });
		const setFlags = vi.fn(async () => { order.push("flags"); });
		const onHandedOver = vi.fn();
		const c = ctx({ setFlags });
		await handOffSpringRoll(c, onHandedOver)();
		expect(order).toEqual(["post", "spend", "flags"]);
		expect(setFlags).toHaveBeenCalledWith({ opening: 1, step: "fortunesRoll" });
		expect(onHandedOver).toHaveBeenCalledTimes(1);
		expect(c.repaint).toHaveBeenCalledTimes(1);
	});

	it("does not post a second card when the retry follows a failed write", async () => {
		const setFlags = vi.fn()
			.mockRejectedValueOnce(new Error("socket dropped"))
			.mockResolvedValueOnce(undefined);
		const run = handOffSpringRoll(ctx({ setFlags }));

		await expect(run()).rejects.toThrow("socket dropped");
		await run();

		expect(postSeasonsRollPrompt).toHaveBeenCalledTimes(1);
		expect(promptRoll).toHaveBeenCalledTimes(1);
		expect(settleSteadingRoll).toHaveBeenCalledTimes(1);
		expect(spend).toHaveBeenCalledTimes(1);
		expect(setFlags).toHaveBeenCalledTimes(2);
	});

	it("retries the spend, still without re-posting, when the spend itself threw", async () => {
		spend.mockRejectedValueOnce(new Error("no")).mockResolvedValueOnce(undefined);
		const setFlags = vi.fn(async () => {});
		const run = handOffSpringRoll(ctx({ setFlags }));

		await expect(run()).rejects.toThrow("no");
		expect(setFlags).not.toHaveBeenCalled();
		await run();

		expect(postSeasonsRollPrompt).toHaveBeenCalledTimes(1);
		expect(spend).toHaveBeenCalledTimes(2);
		expect(setFlags).toHaveBeenCalledTimes(1);
	});

	it("posts a card on the next click when the first never got one up", async () => {
		postSeasonsRollPrompt.mockRejectedValueOnce(new Error("chat down"));
		const setFlags = vi.fn(async () => {});
		const run = handOffSpringRoll(ctx({ setFlags }));

		await expect(run()).rejects.toThrow("chat down");
		expect(spend).not.toHaveBeenCalled();
		await run();

		expect(postSeasonsRollPrompt).toHaveBeenCalledTimes(2);
		expect(spend).toHaveBeenCalledTimes(1);
	});

	it("gives the button back, with nothing posted, when the prompt is dismissed", async () => {
		promptRoll.mockResolvedValueOnce(null);
		const setFlags = vi.fn(async () => {});
		expect(await handOffSpringRoll(ctx({ setFlags }))()).toBe(false);
		expect(postSeasonsRollPrompt).not.toHaveBeenCalled();
		expect(setFlags).not.toHaveBeenCalled();
	});
});
