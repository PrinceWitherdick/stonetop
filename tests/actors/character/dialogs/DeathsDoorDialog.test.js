import { describe, it, expect } from "vitest";
import { DeathsDoorDialog } from "../../../../module/actors/character/dialogs/DeathsDoorDialog.js";

// A character at the Door, with only what the 10+ path touches: the hit point it hands back and
// the wound list the mark goes into. The wound store is the real shape (add returns an id, patch
// finds by it), because "does the second write patch the first wound or add another one" is the
// whole question these tests are asking.
function makeCharacter() {
	const wounds = [];
	let next = 0;
	return {
		_actor: { id: "actor-1" },
		wounds,
		restored: false,
		async returnToOneHp() { this.restored = true; },
		async addWound(data) {
			const id = `w${++next}`;
			wounds.push({ id, ...data });
			return id;
		},
		async updateWound(id, patch) {
			const w = wounds.find(x => x.id === id);
			if (w) Object.assign(w, patch);
		},
	};
}

function makeDialog(character) {
	return new DeathsDoorDialog(character, () => {});
}

describe("DeathsDoorDialog — the 10+ mark records itself", () => {
	it("a 10+ puts the mark on the sheet with no button pressed", async () => {
		const character = makeCharacter();
		const dialog = makeDialog(character);

		await dialog._applyTier("success");

		// The mark is not a choice the move offers ("say how your brush with death has marked
		// you"), so the tier writes it the same way it writes the hit point.
		expect(character.restored).toBe(true);
		expect(character.wounds).toHaveLength(1);
		expect(character.wounds[0]).toMatchObject({ status: "permanent", origin: "deaths-door" });
		// Undescribed, it carries the question rather than sitting blank.
		expect(character.wounds[0].text).toMatch(/describe the mark/i);
	});

	it("describing it patches that wound instead of adding a second", async () => {
		const character = makeCharacter();
		const dialog = makeDialog(character);
		await dialog._applyTier("success");

		await dialog._saveMark("a lost eye");
		await dialog._saveMark("a lost eye, and the crows that took it");

		expect(character.wounds).toHaveLength(1);
		expect(character.wounds[0].text).toBe("a lost eye, and the crows that took it");
	});

	it("clearing the field leaves the mark standing, back on its prompt", async () => {
		const character = makeCharacter();
		const dialog = makeDialog(character);
		await dialog._applyTier("success");
		await dialog._saveMark("a nasty scar");

		await dialog._saveMark("   ");

		// They were marked whether or not they can say how — only the sheet's own trash
		// affordance takes a Death's-Door wound back.
		expect(character.wounds).toHaveLength(1);
		expect(character.wounds[0].text).toMatch(/describe the mark/i);
	});

	it("a re-rolled 10+ is still one visit to the Door, so still one mark", async () => {
		const character = makeCharacter();
		const dialog = makeDialog(character);

		await dialog._applyTier("success");
		await dialog._applyTier("success");

		expect(character.wounds).toHaveLength(1);
	});

	it("saves racing the seed write join it rather than minting a second mark", async () => {
		const character = makeCharacter();
		const dialog = makeDialog(character);

		// A chip clicked while the seed is still going out — both resolve against one wound.
		await Promise.all([dialog._applyTier("success"), dialog._saveMark("visions of the Last Door")]);

		expect(character.wounds).toHaveLength(1);
		expect(character.wounds[0].text).toBe("visions of the Last Door");
	});

	it("a save with no seeded wound records the mark on its own", async () => {
		const character = makeCharacter();
		const dialog = makeDialog(character);

		// The close() flush on a window reopened at the result step: nothing seeded it here, and
		// the mark still has to land.
		await dialog._saveMark("a murder of crows, always nearby");

		expect(character.wounds).toHaveLength(1);
		expect(character.wounds[0]).toMatchObject({
			text: "a murder of crows, always nearby",
			status: "permanent",
			origin: "deaths-door",
		});
	});

	it("a failed seed doesn't sink the tier, and the next save retries it", async () => {
		const character = makeCharacter();
		const add = character.addWound.bind(character);
		let failed = false;
		character.addWound = async (data) => {
			if (failed) return add(data);
			failed = true;
			throw new Error("no connection");
		};
		const dialog = makeDialog(character);

		// The HP and the chat card must not go down with a wound that couldn't be written.
		await expect(dialog._applyTier("success")).resolves.toBeUndefined();
		expect(character.restored).toBe(true);
		expect(character.wounds).toHaveLength(0);

		await dialog._saveMark("a nasty scar");
		expect(character.wounds).toHaveLength(1);
		expect(character.wounds[0].text).toBe("a nasty scar");
	});
});

// The last step's rail. Only the CURSOR is tested here: what the questions are, and whether each
// is answered, is post-death-choices.js's to say (and its own tests'). This is the window's half —
// which one panel is on screen, and what moves it.
function withChoices(steps) {
	const dialog = makeDialog(makeCharacter());
	dialog._choices = { slug: "ghost", name: "Ghost", group: "g", steps, outstanding: steps.filter(s => !s.done).length };
	return dialog;
}

const GHOST_STEPS = () => [
	{ key: "purpose",     done: false },
	{ key: "consequence", done: false },
	{ key: "instinct",    done: false },
	{ key: "tether",      done: false },
];

describe("DeathsDoorDialog — the rail through what the insert asks", () => {
	it("opens on the first question that hasn't been answered", () => {
		const steps = GHOST_STEPS();
		steps[0].done = true;
		const dialog = withChoices(steps);

		dialog._latchChoiceStep();

		// A player who took their insert, answered the Purpose and closed the window comes back to
		// where they left off rather than to the top of a list they've half filled in.
		expect(dialog._choiceStep).toBe("consequence");
	});

	it("stays on the question being answered instead of walking itself forward", () => {
		const dialog = withChoices(GHOST_STEPS());
		dialog._latchChoiceStep();
		expect(dialog._choiceStep).toBe("purpose");

		// Every answer re-renders through _refreshChoices. If the cursor were re-derived there, the
		// click that settles the Purpose would swap the panel out before the player had read what
		// taking it did to them.
		dialog._choices.steps[0].done = true;
		dialog._latchChoiceStep();

		expect(dialog._choiceStep).toBe("purpose");
	});

	it("keeps the player's own pick, answered or not", () => {
		const dialog = withChoices(GHOST_STEPS());
		dialog._goToChoice("tether");

		dialog._latchChoiceStep();

		expect(dialog._activeChoiceKey()).toBe("tether");
	});

	it("re-latches when the steps change under it, rather than showing nothing", () => {
		const dialog = withChoices(GHOST_STEPS());
		dialog._goToChoice("tether");

		// A Thrall's questions are not a Ghost's: "tether" is gone, and a cursor left pointing at
		// it would render an empty panel beside a rail that still worked.
		dialog._choices.steps = [{ key: "master", done: false }, { key: "impulse", done: false }];
		dialog._latchChoiceStep();

		expect(dialog._choiceStep).toBe("master");
	});

	it("walks the rail with Back and Next, and stops at both ends", () => {
		const dialog = withChoices(GHOST_STEPS());
		dialog._latchChoiceStep();

		dialog._stepChoice(-1);
		expect(dialog._activeChoiceKey()).toBe("purpose");   // already at the first

		dialog._stepChoice(1);
		expect(dialog._activeChoiceKey()).toBe("consequence");
		dialog._stepChoice(1);
		dialog._stepChoice(1);
		expect(dialog._activeChoiceKey()).toBe("tether");
		dialog._stepChoice(1);
		expect(dialog._activeChoiceKey()).toBe("tether");    // already at the last

		dialog._stepChoice(-1);
		expect(dialog._activeChoiceKey()).toBe("instinct");
	});

	it("ignores a key that names no question", () => {
		const dialog = withChoices(GHOST_STEPS());
		dialog._latchChoiceStep();

		dialog._goToChoice("wight");

		expect(dialog._activeChoiceKey()).toBe("purpose");
	});

	it("draws exactly one panel, and marks its rail entry", () => {
		const steps = GHOST_STEPS();
		steps[0].done = true;
		const dialog = withChoices(steps);
		dialog._step = "choices";
		dialog._latchChoiceStep();

		const data = dialog.getData();

		// One question on screen: the whole point of the rail is that the other three aren't.
		expect(data.choices.steps.filter(s => s.isActive).map(s => s.key)).toEqual(["consequence"]);
		expect(data.choiceTabs).toHaveLength(4);
		expect(data.choiceTabs[0]).toMatchObject({ key: "purpose", done: true, isActive: false });
		expect(data.atFirstChoice).toBe(false);
		expect(data.atLastChoice).toBe(false);
	});

	it("doesn't leak the cursor into the view model the next refresh reads back", () => {
		const dialog = withChoices(GHOST_STEPS());
		dialog._step = "choices";
		dialog._latchChoiceStep();

		dialog.getData();

		expect(dialog._choices.steps.every(s => !("isActive" in s))).toBe(true);
	});
});
