import { afterEach, describe, expect, it, vi } from "vitest";
import { createStonetopCharacterSheetClass } from "../../../module/actors/character/StonetopCharacterSheet.js";
import { FakeActorBuilder } from "../../fakes/FakeActorBuilder.js";

// Using an Invocation is a MOVE, not just a chat post: every Lightbearer starts with Invoke
// the Sun God, so tapping one asks whether to roll +WIS — and, for a 6th-level Lightbearer,
// whether to pay an extra consequence to empower it. These cover the whole decision table,
// plus the contract that makes ✕ safe: dismissing means the Invocation was never used.

const BLINDING_FLASH = "<p>Your light blazes; any in range who look at it are blinded.</p>"
	+ "<p><strong>Reduced:</strong> the light flares only for a moment.</p>"
	+ "<p><strong>Empowered:</strong> if you wish, your allies are unaffected.</p>";
const NO_EMPOWERED = "<p>Your light steadies.</p><p><strong>Reduced:</strong> only briefly.</p>";

const move = name => ({ type: "move", name });

/** The Dialog the sheet opened, plus the two ways out of it. */
let opened = null;

function installDialogStub() {
	global.Dialog = class {
		constructor(config, options) {
			opened = { ...config, options, closed: false };
		}
		render() { return this; }
	};
	// Whatever the callbacks read out of the window. `checked` drives the empower checkbox.
	const fakeHtml = ({ checked = false } = {}) => ({ find: () => [{ checked }] });
	return {
		press(button, { empowerChecked = false } = {}) {
			opened.buttons[button].callback(fakeHtml({ checked: empowerChecked }));
			opened.close();
		},
		dismiss() { opened.close(); },
	};
}

function makeSheet({ moves = [], editable = true } = {}) {
	const actor = new FakeActorBuilder().withItems(moves).build();
	actor.isOwner = true;
	// Only the holy-light state is read out of the character model on this path.
	actor.typedActor = { holyLight: false };
	const Base = class {
		constructor() { this._actor = actor; }
		get actor() { return this._actor; }
		get isEditable() { return editable; }
		activateListeners() {}
		render = vi.fn();
	};
	const sheet = new (createStonetopCharacterSheetClass(Base))();
	// One shared log, so the ORDER of card-then-roll can be asserted, not just the calls.
	const calls = [];
	sheet._postMoveCard = vi.fn(async (title, body) => { calls.push({ card: { title, body } }); return { title, body }; });
	sheet.rollMoveByName = vi.fn(async (name, opts) => { calls.push({ roll: { name, opts } }); });
	sheet._pastDeathWindowClasses = classes => classes;
	return { sheet, actor, calls };
}

afterEach(() => { delete global.Dialog; opened = null; });

describe("using an Invocation", () => {
	it("just posts it for someone with neither move — no window at all", async () => {
		installDialogStub();
		const { sheet, calls } = makeSheet({ moves: [move("Guardian")] });
		await sheet._postInvocationCard("Blinding Flash", BLINDING_FLASH);
		expect(opened).toBeNull();
		expect(calls).toHaveLength(1);
		expect(calls[0].card.title).toBe("Blinding Flash");
		expect(calls[0].card.body).not.toMatch(/Empowered/);
	});

	// Invoke the Sun God is "choose an Invocation YOU KNOW and roll +WIS", and the tab lists
	// all ten whether or not they're learned — a 1st-level Lightbearer knows two. Reading an
	// un-learned one stays free; rolling it must not be on offer.
	it("reads out an un-learned Invocation without offering the roll", async () => {
		installDialogStub();
		const { sheet, calls } = makeSheet({ moves: [move("Invoke the Sun God"), move("Empowered Invocations")] });
		await sheet._postInvocationCard("Blinding Flash", BLINDING_FLASH, { known: false });

		expect(opened, "an un-learned Invocation must not open the invoke window").toBeNull();
		expect(calls).toHaveLength(1);
		expect(calls[0].card.title).toBe("Blinding Flash");
		expect(sheet.rollMoveByName).not.toHaveBeenCalled();
		// ...and the empowered effect is still stripped, exactly as on a learned one.
		expect(calls[0].card.body).not.toMatch(/allies are unaffected/);
	});

	it("offers no roll to a viewer who can't edit the sheet", async () => {
		installDialogStub();
		const { sheet } = makeSheet({ moves: [move("Invoke the Sun God")], editable: false });
		await sheet._postInvocationCard("Blinding Flash", BLINDING_FLASH);
		// rollMoveById bails silently when the sheet isn't editable, so a roll button there
		// would do nothing at all — better to post the card and say nothing.
		expect(opened).toBeNull();
	});

	it("asks a plain Lightbearer to roll, with no empower checkbox", async () => {
		installDialogStub();
		const { sheet } = makeSheet({ moves: [move("Invoke the Sun God")] });
		const posting = sheet._postInvocationCard("Blinding Flash", BLINDING_FLASH);
		expect(Object.keys(opened.buttons)).toEqual(["roll", "no"]);
		expect(opened.buttons.roll.label).toBe("Invoke the Sun God (+WIS)");
		expect(opened.content).not.toMatch(/name="empower"/);
		expect(opened.content).not.toMatch(/allies are unaffected/);
		opened.close();
		await posting;
	});

	// The button set must not shuffle as the character levels: this window opens on every
	// single Invocation use, so empowering rides a checkbox rather than a third button.
	it("keeps the same two buttons at 6th level, adding only the checkbox", async () => {
		installDialogStub();
		const { sheet } = makeSheet({ moves: [move("Invoke the Sun God"), move("Empowered Invocations")] });
		const posting = sheet._postInvocationCard("Blinding Flash", BLINDING_FLASH);
		expect(Object.keys(opened.buttons)).toEqual(["roll", "no"]);
		expect(opened.content).toMatch(/name="empower"/);
		expect(opened.content).toMatch(/allies are unaffected/);
		opened.close();
		await posting;
	});

	it("offers no empower checkbox for an Invocation that has no empowered effect", async () => {
		installDialogStub();
		const { sheet } = makeSheet({ moves: [move("Invoke the Sun God"), move("Empowered Invocations")] });
		const posting = sheet._postInvocationCard("Steady Light", NO_EMPOWERED);
		expect(opened.content).not.toMatch(/name="empower"/);
		opened.close();
		await posting;
	});

	it("posts the card and then rolls +WIS", async () => {
		const dialog = installDialogStub();
		const { sheet, calls } = makeSheet({ moves: [move("Invoke the Sun God")] });
		const posting = sheet._postInvocationCard("Blinding Flash", BLINDING_FLASH);
		dialog.press("roll");
		await posting;

		expect(calls.map(c => Object.keys(c)[0])).toEqual(["card", "roll"]);
		expect(calls[0].card.title).toBe("Blinding Flash");
		expect(calls[0].card.body).not.toMatch(/Empowered/);
		expect(calls[1].roll).toEqual({ name: "Invoke the Sun God", opts: { shiftKey: false } });
	});

	it("marks the card empowered and still rolls when the box is ticked", async () => {
		const dialog = installDialogStub();
		const { sheet, calls } = makeSheet({ moves: [move("Invoke the Sun God"), move("Empowered Invocations")] });
		const posting = sheet._postInvocationCard("Blinding Flash", BLINDING_FLASH);
		dialog.press("roll", { empowerChecked: true });
		await posting;

		expect(calls[0].card.title).toBe("Blinding Flash (Empowered)");
		expect(calls[0].card.body).toMatch(/extra consequence/);
		expect(calls[0].card.body).toMatch(/allies are unaffected/);
		expect(calls[1].roll.name).toBe("Invoke the Sun God");
	});

	it("posts without rolling on 'Just show it'", async () => {
		const dialog = installDialogStub();
		const { sheet, calls } = makeSheet({ moves: [move("Invoke the Sun God")] });
		const posting = sheet._postInvocationCard("Blinding Flash", BLINDING_FLASH);
		dialog.press("no");
		await posting;

		expect(calls).toHaveLength(1);
		expect(calls[0].card).toBeTruthy();
	});

	// The load-bearing contract: the choices are made BEFORE the roll, so backing out of the
	// window means the Invocation was never used — no card, no roll, nothing.
	it("does nothing at all when the window is dismissed", async () => {
		const dialog = installDialogStub();
		const { sheet, calls } = makeSheet({ moves: [move("Invoke the Sun God")] });
		const posting = sheet._postInvocationCard("Blinding Flash", BLINDING_FLASH);
		dialog.dismiss();
		await expect(posting).resolves.toBeNull();
		expect(calls).toHaveLength(0);
	});

	it("carries Shift through to the roll, so the modifier prompt can still be skipped", async () => {
		const dialog = installDialogStub();
		const { sheet, calls } = makeSheet({ moves: [move("Invoke the Sun God")] });
		const posting = sheet._postInvocationCard("Blinding Flash", BLINDING_FLASH, { shiftKey: true });
		dialog.press("roll");
		await posting;
		expect(calls[1].roll.opts).toEqual({ shiftKey: true });
	});

	it("says so when no holy light is lit, without blocking the roll", async () => {
		installDialogStub();
		const { sheet, actor } = makeSheet({ moves: [move("Invoke the Sun God")] });
		const unlit = sheet._postInvocationCard("Blinding Flash", BLINDING_FLASH);
		expect(opened.content).toMatch(/stonetop-invoke-nolight/);
		expect(Object.keys(opened.buttons)).toContain("roll");
		opened.close();
		await unlit;

		actor.typedActor.holyLight = true;
		const lit = sheet._postInvocationCard("Blinding Flash", BLINDING_FLASH);
		expect(opened.content).not.toMatch(/stonetop-invoke-nolight/);
		opened.close();
		await lit;
	});

	it("keeps the window in the system's chrome", async () => {
		installDialogStub();
		const { sheet } = makeSheet({ moves: [move("Invoke the Sun God")] });
		const posting = sheet._postInvocationCard("Blinding Flash", BLINDING_FLASH);
		// Without "stonetop" the window renders as a bare core dialog; the empower classes are
		// what the sun-tinted effect band hangs off.
		expect(opened.options.classes).toContain("stonetop");
		expect(opened.options.classes).toContain("stonetop-empower-dialog");
		expect(opened.options.classes).toContain("stonetop-invoke-dialog");
		opened.close();
		await posting;
	});
});
