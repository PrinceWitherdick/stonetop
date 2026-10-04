// @vitest-environment happy-dom
// Resolving a love letter (Book I p.568) from the reader: the sheet asks the standard roll prompt,
// rolls, and only then marks the letter resolved. A resolved letter is hidden from the player, not
// deleted, so the GM can Resend it. Backing out of the prompt keeps the letter unspent. A +Fortunes
// letter rolls the steading's Fortunes the way Requisition does.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createStonetopCharacterSheetClass } from "../../../module/actors/character/StonetopCharacterSheet.js";
import { FakeActorBuilder } from "../../fakes/FakeActorBuilder.js";
import { promptRoll } from "../../../module/dialogs/RollDialog.js";
import { settleSteadingRoll } from "../../../module/actors/steading/steading-roll.js";
import { STONETOP_SCOPE } from "../../../module/actors/character/StonetopFlags.js";
import {
	buildLoveLetterData, isResolvedLoveLetter, LOVE_LETTER_RESOLVED_FLAG,
} from "../../../module/actors/character/love-letters.js";

vi.mock("../../../module/dialogs/RollDialog.js", () => ({
	DEFAULT_ROLL_MODE: "normal",
	promptRoll: vi.fn(async () => ({ situational: 0 })),
}));
vi.mock("../../../module/actors/steading/steading-roll.js", () => ({
	settleSteadingRoll: vi.fn(async () => ({
		rollMode: "adv", missAsPartial: "", conditionNotes: ["Held advantage"], spend: vi.fn(async () => {}),
	})),
}));
vi.mock("../../../module/actors/steading/StonetopSteading.js", async importOriginal => ({
	...(await importOriginal()),
	StonetopSteading: class { getStatValue(key) { return key === "fortunes" ? 2 : 0; } },
}));

const RESOLVED_PATH = `flags.${STONETOP_SCOPE}.${LOVE_LETTER_RESOLVED_FLAG}`;

function letter(rollType) {
	return {
		_id: "ll1", id: "ll1", type: "move", name: "A Quiet Winter",
		system: { moveType: "other", rollType },
		flags: { [STONETOP_SCOPE]: { loveLetter: true } },
		update: vi.fn(async () => {}),
		roll: vi.fn(async () => ({ total: 8 })),
		delete: vi.fn(async () => {}),
	};
}

function sheetWith(item, { onRoll = async () => true, steading = null } = {}) {
	const actor = new FakeActorBuilder().withItems([item]).build();
	actor.items.get = id => (id === item._id ? item : null);
	actor.typedActor = {
		rollOffers: vi.fn(async () => []),
		onRoll: vi.fn(onRoll),
		getSteadingActor: () => steading,
	};
	const Base = class {
		constructor() { this._actor = actor; }
		get actor() { return this._actor; }
		get isEditable() { return true; }
		async getData() { return {}; }
		activateListeners() {}
		render = vi.fn();
	};
	const sheet = new (createStonetopCharacterSheetClass(Base))();
	sheet._stonetopCharacter = actor.typedActor;
	return sheet;
}

beforeEach(() => {
	// Reset, not Clear: a queued once-answer a test left unspent must not leak into the next.
	promptRoll.mockReset();
	promptRoll.mockImplementation(async () => ({ situational: 0 }));
	settleSteadingRoll.mockClear();
});

describe("resolving a stat love letter", () => {
	it("asks the roll prompt, rolls with its answer, then marks the letter resolved (not deleted)", async () => {
		promptRoll.mockResolvedValueOnce({ situational: 1, rollMode: "dis" });
		const item = letter("wis");
		const sheet = sheetWith(item);
		expect(await sheet._onResolveLoveLetter("ll1")).toBe(true);
		expect(promptRoll).toHaveBeenCalledTimes(1);
		expect(sheet._stonetopCharacter.onRoll.mock.calls[0][1]).toMatchObject({ situational: 1, rollMode: "dis" });
		expect(item.update).toHaveBeenCalledWith({ [RESOLVED_PATH]: true });
		expect(item.delete).not.toHaveBeenCalled();
	});

	it("keeps the letter when the player cancels the roll prompt", async () => {
		promptRoll.mockResolvedValueOnce(null);
		const item = letter("wis");
		const sheet = sheetWith(item);
		expect(await sheet._onResolveLoveLetter("ll1")).toBe(false);
		expect(sheet._stonetopCharacter.onRoll).not.toHaveBeenCalled();
		expect(item.update).not.toHaveBeenCalled();
	});

	it("keeps the letter when a later prompt (a weapon or target) is backed out of", async () => {
		const item = letter("str");
		const sheet = sheetWith(item, { onRoll: async () => "cancel" });
		expect(await sheet._onResolveLoveLetter("ll1")).toBe(false);
		expect(item.update).not.toHaveBeenCalled();
	});

	it("keeps the letter, and rethrows, when the roll fails", async () => {
		const item = letter("str");
		const sheet = sheetWith(item, { onRoll: async () => { throw new Error("boom"); } });
		await expect(sheet._onResolveLoveLetter("ll1")).rejects.toThrow("boom");
		expect(item.update).not.toHaveBeenCalled();
	});
});

describe("resolving a no-roll love letter", () => {
	it("posts it as a description card and marks it resolved, with no prompt", async () => {
		const item = letter("");
		const sheet = sheetWith(item);
		expect(await sheet._onResolveLoveLetter("ll1")).toBe(true);
		expect(promptRoll).not.toHaveBeenCalled();
		expect(item.roll).toHaveBeenCalledWith({ descriptionOnly: true });
		expect(item.update).toHaveBeenCalledWith({ [RESOLVED_PATH]: true });
	});
});

describe("resolving a +Fortunes love letter", () => {
	const steadingActor = { isOwner: true, getFlag: () => "normal" };

	it("rolls the steading's Fortunes, settled as a steading roll, as the character", async () => {
		promptRoll.mockResolvedValueOnce({ situational: -1 });
		const item = letter("fortunes");
		const sheet = sheetWith(item, { steading: steadingActor });
		expect(await sheet._onResolveLoveLetter("ll1")).toBe(true);
		expect(settleSteadingRoll.mock.calls[0][1]).toMatchObject({ statKey: "fortunes", moveName: "A Quiet Winter", canSpend: true });
		expect(item.roll).toHaveBeenCalledWith({
			statOverride: "fortunes", statValue: 2, rollMode: "adv", modifier: -1, conditionNotes: ["Held advantage"],
		});
		expect(sheet._stonetopCharacter.onRoll).not.toHaveBeenCalled();
		expect(item.update).toHaveBeenCalledWith({ [RESOLVED_PATH]: true });
	});

	it("keeps the letter when the character has no steading", async () => {
		const item = letter("fortunes");
		const sheet = sheetWith(item, { steading: null });
		expect(await sheet._onResolveLoveLetter("ll1")).toBe(false);
		expect(promptRoll).not.toHaveBeenCalled();
		expect(item.update).not.toHaveBeenCalled();
	});

	it("keeps the letter when the roll prompt is cancelled", async () => {
		promptRoll.mockResolvedValueOnce(null);
		const item = letter("fortunes");
		const sheet = sheetWith(item, { steading: steadingActor });
		expect(await sheet._onResolveLoveLetter("ll1")).toBe(false);
		expect(settleSteadingRoll).not.toHaveBeenCalled();
		expect(item.update).not.toHaveBeenCalled();
	});

	// The hotbar's door (rollMoveById) used to reach the character's own, absent, Fortunes and roll +0.
	it("rolls the steading's Fortunes from the hotbar too, without resolving the letter", async () => {
		const item = letter("fortunes");
		const sheet = sheetWith(item, { steading: steadingActor });
		await sheet.rollMoveById("ll1");
		expect(settleSteadingRoll).toHaveBeenCalledTimes(1);
		expect(item.roll.mock.calls[0][0]).toMatchObject({ statOverride: "fortunes", statValue: 2 });
		expect(sheet._stonetopCharacter.onRoll).not.toHaveBeenCalled();
		expect(item.update).not.toHaveBeenCalled();
	});
});

describe("love letter data", () => {
	it("accepts Fortunes as a roll type", () => {
		const data = buildLoveLetterData({ name: "Lean Times", rollType: "fortunes", results: { success: "The stores hold." } });
		expect(data.system.rollType).toBe("fortunes");
		expect(data.system.moveResults.success.value).toBe("The stores hold.");
	});

	it("keeps per-result words alongside a pick list", () => {
		const data = buildLoveLetterData({
			name: "Trouble at Home", rollType: "cha",
			options: "Owain\nWini", picks: { success: 1, partial: 2, failure: 0 },
			results: { success: "", partial: "And word gets around.", failure: "" },
		});
		expect(data.system.pickOptions).toEqual(["Owain", "Wini"]);
		expect(data.system.moveResults.partial).toMatchObject({ pick: 2, value: "And word gets around." });
	});

	it("reads the resolved flag", () => {
		expect(isResolvedLoveLetter(letter("str"))).toBe(false);
		const resolved = letter("str");
		resolved.flags[STONETOP_SCOPE][LOVE_LETTER_RESOLVED_FLAG] = true;
		expect(isResolvedLoveLetter(resolved)).toBe(true);
	});
});
