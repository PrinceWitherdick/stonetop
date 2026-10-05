import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The greeting a player gets on load (and on a GM's mint) for a character still being made.

const fakes = vi.hoisted(() => ({
	open: vi.fn(async () => ({})),
	snapshots: new Map(),
}));
vi.mock("../../module/actors/character/dialogs/CharacterCreationDialog.js", () => ({
	CharacterCreationDialog: { open: fakes.open },
}));
vi.mock("../../module/actors/character/onboarding-resume.js", () => ({
	readOnboardingResume: actor => fakes.snapshots.get(actor.id) ?? null,
	clearOnboardingResume: vi.fn(),
	writeOnboardingResume: vi.fn(),
}));

const { _maybeOpenCharacterCreation } = await import("../../module/hooks/Ready.js");

const OWNER = 3;
const SCOPE = "stonetop_pwd";

/** One of the player's characters, as the greeting reads it. */
function mine(id, { playbook = null, flags = {}, onNew = vi.fn(async () => {}) } = {}) {
	const actor = {
		id, name: `PC ${id}`, type: "character",
		ownership: { u1: OWNER },
		system: { playbook: playbook ? { slug: playbook, name: "The Fox" } : null },
		flags: { [SCOPE]: { ...flags } },
		getFlag: (_scope, key) => actor.flags[SCOPE][key],
		unsetFlag: vi.fn(async () => {}),
		sheet: { _onNewCharacter: onNew, render: vi.fn() },
	};
	return actor;
}

let saved;
beforeEach(() => {
	saved = { game: global.game, CONST: global.CONST };
	const user = { id: "u1", isGM: false, character: null };
	global.game = { ...global.game, user, users: [user] };
	global.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { OWNER } };
	fakes.open.mockClear();
	fakes.snapshots.clear();
});
afterEach(() => {
	global.game = saved.game;
	global.CONST = saved.CONST;
});

describe("the load-time sweep", () => {
	// The resume path awaits its playbook before its window exists, and the sweep over the
	// player's characters is synchronous: the second half-built character's intro opened beside
	// the first character's walkthrough.
	it("opens one flow at a time for a player with two half-built characters", async () => {
		let resumed;
		const first = mine("a1", { onNew: vi.fn(() => new Promise(resolve => { resumed = resolve; })) });
		const second = mine("a2");
		fakes.snapshots.set("a1", { playbookUuid: "Compendium.x.fox", selections: {} });

		_maybeOpenCharacterCreation(first);
		_maybeOpenCharacterCreation(second);

		expect(first.sheet._onNewCharacter).toHaveBeenCalledWith({ openSheetWhenDone: true, resume: true });
		expect(fakes.open, "the second waits for the next load").not.toHaveBeenCalled();
		resumed();
	});
});

describe("tidying a character with a committed playbook", () => {
	it("keeps the progress of one saved and closed part-way through", () => {
		const saved = mine("a1", { playbook: "the-fox", flags: { onboardingProgress: { state: "exited", playbook: "The Fox" } } });
		_maybeOpenCharacterCreation(saved);
		expect(saved.unsetFlag).not.toHaveBeenCalledWith(SCOPE, "onboardingProgress");
	});

	it("still clears a stale progress note off a finished one", () => {
		const done = mine("a1", {
			playbook: "the-fox",
			flags: { onboardingProgress: { state: "exited" }, creationFinished: true },
		});
		_maybeOpenCharacterCreation(done);
		expect(done.unsetFlag).toHaveBeenCalledWith(SCOPE, "onboardingProgress");
	});
});
