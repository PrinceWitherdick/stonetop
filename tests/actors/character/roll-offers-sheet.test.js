// The sheet hands the roll window the lines the character could spend on this roll
// (StonetopCharacter#rollOffers: a skin of fine whisky on a Persuade), off the move being rolled.
// The rules and the window each have their own tests (fine-whisky.test.js); this is the wire between.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createStonetopCharacterSheetClass } from "../../../module/actors/character/StonetopCharacterSheet.js";
import { FakeActorBuilder } from "../../fakes/FakeActorBuilder.js";
import { promptRoll } from "../../../module/dialogs/RollDialog.js";

vi.mock("../../../module/dialogs/RollDialog.js", () => ({
	DEFAULT_ROLL_MODE: "normal",
	promptRoll: vi.fn(async () => ({ situational: 0 })),
}));

const PERSUADE = { _id: "p1", type: "move", name: "Persuade (vs. NPCs)", system: { moveType: "basic", rollType: "cha" } };
const WHISKY = { key: "fine-whisky", label: "Share a skin of fine whisky (spend 1 use): advantage", applied: true };
const OATHBREAKER = { key: "binding-arbitration", label: "vs. an oathbreaker (Brennan): advantage", applied: false, source: "Binding Arbitration" };

function sheetWith(offers, direct = []) {
	const actor = new FakeActorBuilder().withItems([PERSUADE]).build();
	actor.items.get = id => actor.items.find(i => i._id === id) ?? null;
	actor.typedActor = {
		rollOffers: vi.fn(async () => offers),
		directRollOffers: vi.fn(async () => direct),
		onDirectStatRoll: vi.fn(async () => ({ total: 8 })),
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
const rollable = { closest: sel => (sel === ".item" ? { dataset: { itemId: "p1" } } : null), dataset: { roll: "cha" } };

beforeEach(() => promptRoll.mockClear());

describe("the sheet's roll window", () => {
	it("carries the character's offered lines for the move it rolls", async () => {
		await sheetWith([WHISKY])._promptRollOptions({ rollable });
		expect(promptRoll.mock.calls[0][0].offers).toEqual([WHISKY]);
	});

	it("carries them for a move whose stat was picked first (moveItem)", async () => {
		await sheetWith([WHISKY])._promptRollOptions({ title: "Persuade (vs. NPCs)", moveItem: PERSUADE });
		expect(promptRoll.mock.calls[0][0].offers).toEqual([WHISKY]);
	});

	it("passes no offers at all when there are none, or no move behind the roll", async () => {
		await sheetWith([])._promptRollOptions({ rollable });
		const bare = sheetWith([WHISKY], [OATHBREAKER]);
		await bare._promptRollOptions({ title: "Roll +CHA" });
		expect(promptRoll.mock.calls.map(c => "offers" in c[0])).toEqual([false, false]);
		expect(bare._stonetopCharacter.directRollOffers).not.toHaveBeenCalled();
	});
});

// A roll with no move item behind it (onDirectStatRoll's: a guided move, Improvise, Know Things about an
// arcanum, a bare stat) is offered its lines by the name it rolls under (StonetopCharacter#directRollOffers),
// and the window's answer rides on to onDirectStatRoll, which settles the ticked ones.
describe("the roll window of a roll with no move item", () => {
	it("carries the lines of the name it rolls under, and hands them back with the answer", async () => {
		promptRoll.mockResolvedValueOnce({ situational: 0, takenOffers: [OATHBREAKER.key] });
		const sheet = sheetWith([WHISKY], [OATHBREAKER]);
		const answer = await sheet._promptRollOptions({ title: "Trade & Barter", offersFor: "Trade & Barter" });
		expect(sheet._stonetopCharacter.directRollOffers).toHaveBeenCalledWith("Trade & Barter", { except: [] });
		expect(sheet._stonetopCharacter.rollOffers).not.toHaveBeenCalled();
		expect(promptRoll.mock.calls[0][0].offers).toEqual([OATHBREAKER]);
		expect(answer).toEqual({ situational: 0, takenOffers: [OATHBREAKER.key], offered: [OATHBREAKER] });
	});

	it("leaves out what the caller's own picker has asked (offersExcept)", async () => {
		const sheet = sheetWith([], []);
		await sheet._promptRollOptions({ title: "Know Things", offersFor: "Know Things", offersExcept: ["Polyglot", "Naturalist"] });
		expect(sheet._stonetopCharacter.directRollOffers).toHaveBeenCalledWith("Know Things", { except: ["Polyglot", "Naturalist"] });
	});

	it("asks a bare stat rollable for the lines of no move", async () => {
		const sheet = sheetWith([WHISKY], [OATHBREAKER]);
		await sheet._promptRollOptions({ rollable: { closest: () => null, dataset: { roll: "str" } } });
		expect(sheet._stonetopCharacter.directRollOffers).toHaveBeenCalledWith(null, { except: [] });
		expect(promptRoll.mock.calls[0][0]).toMatchObject({ title: "Roll +STR", offers: [OATHBREAKER] });
	});

	it("a guided move's roll button asks for its move's lines and hands the answer to onDirectStatRoll", async () => {
		promptRoll.mockResolvedValueOnce({ situational: 0, takenOffers: [OATHBREAKER.key] });
		const sheet = sheetWith([], [OATHBREAKER]);
		let dialog;
		global.Dialog = vi.fn(function (d) { dialog = d; this.render = vi.fn(); });
		await sheet._openGuidedCharacterMove({ name: "Trade & Barter", guide: { roll: "cha", trigger: "When you trade..." } }, null);
		await dialog.buttons.roll.callback([{ querySelector: () => null }]);
		expect(sheet._stonetopCharacter.directRollOffers).toHaveBeenCalledWith("Trade & Barter", { except: [] });
		expect(sheet._stonetopCharacter.onDirectStatRoll).toHaveBeenCalledWith("cha", expect.objectContaining({
			moveName: "Trade & Barter", takenOffers: [OATHBREAKER.key], offered: [OATHBREAKER],
		}));
		delete global.Dialog;
	});

	it("Improvise asks for Improvise's lines and hands the answer on", async () => {
		promptRoll.mockResolvedValueOnce({ situational: 0, takenOffers: [OATHBREAKER.key] });
		const sheet = sheetWith([], [OATHBREAKER]);
		await sheet._rollImprovise({ arcanumSlug: "mystery-card", moveSlug: "first-light", moveName: "FIRST LIGHT", cardTitle: "" });
		expect(sheet._stonetopCharacter.directRollOffers).toHaveBeenCalledWith("Improvise", { except: [] });
		expect(sheet._stonetopCharacter.onDirectStatRoll).toHaveBeenCalledWith("int", expect.objectContaining({
			moveName: "Improvise", takenOffers: [OATHBREAKER.key], offered: [OATHBREAKER],
		}));
	});
});

// A move that grants a weapon (Purifying Flames' holy light) is used by rolling the Clash it becomes. That
// roll's window was titled with the granting move and offered nothing, so a Clash made this way never saw
// Constant Vigilance's, Underestimated's or an oathbreaker's line. It is offered the Clash's own lines now,
// and the answer rides on to onRoll, which folds the ticked ones and pays for them as on any Clash.
describe("the roll window of a Clash made with a granted weapon", () => {
	const CLASH = { _id: "c1", id: "c1", type: "move", name: "Clash", system: { moveType: "basic", rollType: "str" } };
	const PURIFYING = { _id: "pf1", id: "pf1", type: "move", name: "Purifying Flames", system: { moveType: "playbook" } };
	const VIGILANCE = { key: "constant-vigilance", label: "Intercepting a sudden threat: advantage", applied: false, source: "Constant Vigilance" };

	it("offers the Clash's lines, titled with the granting move, and hands the answer to onRoll", async () => {
		promptRoll.mockResolvedValueOnce({ situational: 0, takenOffers: [VIGILANCE.key] });
		const sheet = sheetWith([VIGILANCE], [OATHBREAKER]);
		sheet._stonetopCharacter.onRoll = vi.fn(async () => true);
		const stand = { closest: () => ({ dataset: { itemId: "c1" } }), dataset: { roll: "str" } };
		sheet._makeSyntheticRollable = vi.fn(() => stand);
		sheet._onMoveRolled = vi.fn(async () => {});
		await sheet._rollGrantedWeaponAttack(PURIFYING, { item: CLASH, stat: "wis", weaponSlug: "holy-light" });
		expect(sheet._stonetopCharacter.rollOffers).toHaveBeenCalledWith(CLASH);
		expect(sheet._stonetopCharacter.directRollOffers).not.toHaveBeenCalled();
		expect(promptRoll.mock.calls[0][0]).toMatchObject({ title: "Purifying Flames", offers: [VIGILANCE] });
		expect(sheet._stonetopCharacter.onRoll).toHaveBeenCalledWith({ currentTarget: stand }, expect.objectContaining({
			statOverride: "wis", weaponSlug: "holy-light", takenOffers: [VIGILANCE.key], offered: [VIGILANCE],
		}));
		expect(sheet._onMoveRolled).toHaveBeenCalledWith(CLASH);
	});

	it("rolls nothing when the window is cancelled", async () => {
		promptRoll.mockResolvedValueOnce(null);
		const sheet = sheetWith([VIGILANCE]);
		sheet._stonetopCharacter.onRoll = vi.fn(async () => true);
		sheet._makeSyntheticRollable = vi.fn(() => ({ closest: () => null, dataset: { roll: "str" } }));
		sheet._onMoveRolled = vi.fn(async () => {});
		await sheet._rollGrantedWeaponAttack(PURIFYING, { item: CLASH, stat: "wis", weaponSlug: "holy-light" });
		expect(sheet._stonetopCharacter.onRoll).not.toHaveBeenCalled();
		expect(sheet._onMoveRolled).not.toHaveBeenCalled();
	});
});
