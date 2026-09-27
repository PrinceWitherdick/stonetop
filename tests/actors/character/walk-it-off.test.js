// The Ranger's Walk It Off (level 6+): "When you'd mark a debility, you can mark this move instead to
// no ill effect. Clear it as you would a debility." One box on the move, standing in for a debility
// wherever one is marked or cleared (module/actors/character/walk-it-off.js).
//
// Driven against the stateful LiveCharacter harness, so what markDebility and receiveHealing write
// is read back the way the sheet reads it.

import { describe, it, expect, vi, afterEach } from "vitest";
import { buildLiveCharacter, makeLiveItem, sourceMovesFor } from "../../fakes/LiveCharacter.js";
import { stubConfirm } from "../../fakes/confirm.js";
import { WALK_IT_OFF, WALK_IT_OFF_KEY, askWalkItOffInstead, debilityData } from "../../../module/actors/character/walk-it-off.js";
import { debilityPayments } from "../../../module/actors/character/invoke-consequences.js";
import { battleJoyTierActions } from "../../../module/actors/character/battle-joy.js";
import { createStonetopCharacterSheetClass } from "../../../module/actors/character/StonetopCharacterSheet.js";

const SOURCE = sourceMovesFor("The Ranger").find(d => d.name === WALK_IT_OFF);

/** A Ranger holding Walk It Off (or not), learned or switched off, with its box marked or clear. */
function ranger({ held = true, learned = true, marked = false, hp = 8 } = {}) {
	const items = held
		? [makeLiveItem({ name: WALK_IT_OFF, type: "move", system: structuredClone(SOURCE.system),
			flags: learned ? undefined : { "stonetop-pwd": { learned: false } } })]
		: [];
	const { char, actor } = buildLiveCharacter({ slug: "the-ranger", name: "The Ranger", level: 6, items,
		flags: marked ? { "moves.backgroundChoices": { [WALK_IT_OFF]: 1 } } : {} });
	actor.system.attributes.hp = { value: hp, max: 20 };
	actor.typedActor = char;
	return { char, actor };
}

const boxMarked = actor => actor.flags["stonetop-pwd"].moves?.backgroundChoices?.[WALK_IT_OFF] ?? 0;
const debilitiesMarked = actor => Object.entries(actor.system.attributes.debilities.options)
	.filter(([, o]) => o.value).map(([key]) => key);
const walkItOffOf = char => char.debilityChoices.find(d => d.key === WALK_IT_OFF_KEY);

afterEach(() => { delete globalThis.foundry?.applications?.api?.DialogV2; });

describe("the move's box", () => {
	it("ships as one box, as the sheet prints it", () => {
		expect(SOURCE.system.resource).toMatchObject({ max: 1 });
	});
});

describe("offered wherever a debility is marked", () => {
	it("is offered while the move is learned and its box is clear", () => {
		const { char, actor } = ranger();
		expect(walkItOffOf(char)).toMatchObject({ name: WALK_IT_OFF, marked: false, standIn: true });
		// Invoke the Sun God's price and Burn Twice as Bright pay from this list.
		expect(debilityPayments(actor).map(p => p.key)).toContain(WALK_IT_OFF_KEY);
		// Battle Joy's 6- grows one button per unmarked entry.
		expect(battleJoyTierActions(char.debilityChoices).failure).toContain(`data-choice="${WALK_IT_OFF_KEY}"`);
	});

	it("is not offered once its box is marked, nor while the move is switched off, nor without it", () => {
		const full = ranger({ marked: true });
		expect(walkItOffOf(full.char)).toMatchObject({ marked: true });
		expect(debilityPayments(full.actor).map(p => p.key)).not.toContain(WALK_IT_OFF_KEY);

		expect(walkItOffOf(ranger({ learned: false }).char)).toBeUndefined();
		const none = ranger({ held: false });
		expect(none.char.debilityChoices.map(d => d.key)).toEqual(["weakened", "dazed", "miserable"]);
	});
});

describe("marking it instead", () => {
	it("fills the box and marks no debility, in the one write that carries the HP", async () => {
		const { char, actor } = ranger({ hp: 0 });
		expect(await char.markDebility(WALK_IT_OFF_KEY, { hp: 1, moveName: "Hard to Kill" })).toBe(true);
		expect(boxMarked(actor)).toBe(1);
		expect(debilitiesMarked(actor)).toEqual([]);
		expect(char.hp).toBe(1);
		expect(actor.update).toHaveBeenCalledTimes(1);
	});

	it("never adds disadvantage to a roll", async () => {
		const { char } = ranger();
		await char.markDebility(WALK_IT_OFF_KEY);
		for (const stat of ["str", "dex", "con", "int", "wis", "cha"]) {
			const out = char.applyDebilityRollMode(stat, { rollMode: "normal" });
			expect(out.rollMode).toBe("normal");
			expect(out.stonetopDebility).toBeUndefined();
		}
	});

	it("refuses a marked box, and a move switched off", async () => {
		expect(await ranger({ marked: true }).char.markDebility(WALK_IT_OFF_KEY)).toBe(false);
		const off = ranger({ learned: false });
		expect(await off.char.markDebility(WALK_IT_OFF_KEY)).toBe(false);
		expect(boxMarked(off.actor)).toBe(0);
	});
});

describe("cleared as a debility is", () => {
	it("is cleared by a healing move's 'clears a debility'", async () => {
		const { char, actor } = ranger({ marked: true });
		const result = await char.receiveHealing({ clearDebilities: [WALK_IT_OFF_KEY], moveName: "Bath of Healing Light" });
		expect(result.cleared).toEqual([{ key: WALK_IT_OFF_KEY, name: WALK_IT_OFF }]);
		expect(boxMarked(actor)).toBe(0);
	});

	it("can still be cleared with the move switched off", async () => {
		const { char, actor } = ranger({ marked: true, learned: false });
		expect(walkItOffOf(char)).toMatchObject({ marked: true });
		await char.receiveHealing({ clearDebilities: [WALK_IT_OFF_KEY] });
		expect(boxMarked(actor)).toBe(0);
	});

	it("rides the snapshot's debilities, which Convalesce and Make Camp clear, touching no stat", async () => {
		const { char } = ranger({ marked: true });
		const snapshot = await char.buildSnapshot();
		expect(snapshot.debilities.at(-1)).toMatchObject({ key: WALK_IT_OFF_KEY, name: WALK_IT_OFF, active: true, stats: [] });
		expect((await ranger({ held: false }).char.buildSnapshot()).debilities).toHaveLength(3);
	});

	it("writes the move's own track, never a debility box", () => {
		expect(debilityData(WALK_IT_OFF_KEY, false)).toEqual({ [`flags.stonetop-pwd.moves.backgroundChoices.${WALK_IT_OFF}`]: 0 });
		expect(debilityData("dazed", false)).toEqual({ "system.attributes.debilities.options.dazed.value": false });
	});
});

describe("a debility box ticked by hand on the sheet", () => {
	function sheetFor(char, actor) {
		const Base = class {
			get actor() { return actor; }
			get isEditable() { return true; }
			async getData() { return {}; }
			activateListeners() {}
			render = vi.fn();
		};
		const sheet = new (createStonetopCharacterSheetClass(Base))();
		sheet._stonetopCharacter = char;
		return sheet;
	}
	const tick = (key, checked = true) =>
		({ currentTarget: { name: `system.attributes.debilities.options.${key}.value`, checked }, stopPropagation: vi.fn() });

	it("asks first, holding the tick back from the form, and marks the move when told to", async () => {
		const { char, actor } = ranger();
		const asked = stubConfirm(true);
		const ev = tick("weakened");
		sheetFor(char, actor)._onDebilityBoxTick(ev);
		expect(ev.stopPropagation).toHaveBeenCalled();
		expect(ev.currentTarget.checked).toBe(false);
		await vi.waitFor(() => expect(boxMarked(actor)).toBe(1));
		expect(asked.mock.calls[0][0].buttons.map(b => b.label)).toEqual(["Mark Walk It Off instead", "Mark Weakened"]);
		expect(debilitiesMarked(actor)).toEqual([]);
	});

	it("marks the debility when that is the answer", async () => {
		const { char, actor } = ranger();
		stubConfirm(false);
		sheetFor(char, actor)._onDebilityBoxTick(tick("dazed"));
		await vi.waitFor(() => expect(debilitiesMarked(actor)).toEqual(["dazed"]));
		expect(boxMarked(actor)).toBe(0);
	});

	it("leaves the form alone with nothing to stand in, and when unticking", () => {
		const full = ranger({ marked: true });
		const ev = tick("weakened");
		sheetFor(full.char, full.actor)._onDebilityBoxTick(ev);
		expect(ev.stopPropagation).not.toHaveBeenCalled();

		const { char, actor } = ranger();
		const off = tick("weakened", false);
		sheetFor(char, actor)._onDebilityBoxTick(off);
		expect(off.stopPropagation).not.toHaveBeenCalled();
	});

	it("does nothing when the question is closed", async () => {
		stubConfirm(null);
		expect(await askWalkItOffInstead({ key: "weakened", name: "Weakened" })).toBeNull();
	});
});
