import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addCharacterToSteadingPlayers } from "../../../module/actors/steading/steading-people.js";

// Filing a finished player character on the steading's Player Characters roster. Called at
// the end of character creation (StonetopCharacterSheet#_launchOnboarding) so a character
// made outside the first-session guide still turns up in the village, instead of waiting for
// someone to drag the sheet onto the steading.

let steading;
let addPlayerRow;

/** A steading stub with the model method the helper delegates to. */
function makeSteading({ canModify = true } = {}) {
	addPlayerRow = vi.fn(async () => true);
	return {
		id: "steading-1",
		name: "Stonetop",
		type: "stonetop",
		canUserModify: vi.fn(() => canModify),
		typedActor: { addPlayerRow },
	};
}

const wren = { id: "hero", uuid: "Actor.hero", name: "Wren", img: "wren.webp", type: "character" };

beforeEach(() => {
	steading = makeSteading();
	global.game.user = { id: "user-1", isGM: false };
	global.game.actors = { find: fn => [steading].find(fn) ?? null };
});

afterEach(() => {
	delete global.game.user;
	delete global.game.actors;
	vi.restoreAllMocks();
});

describe("addCharacterToSteadingPlayers", () => {
	it("files a finished character on the world's steading", async () => {
		expect(await addCharacterToSteadingPlayers(wren)).toBe(true);
		expect(addPlayerRow).toHaveBeenCalledWith(wren);
	});

	it("reports false when the character is already listed", async () => {
		addPlayerRow.mockResolvedValue(false);

		expect(await addCharacterToSteadingPlayers(wren)).toBe(false);
	});

	// The steading is owned by every player (StonetopSingleton#_ensureStartingValues), so the
	// finishing player writes their own row. A world where the GM has narrowed that simply
	// doesn't get the row — a permission error must never be what a player meets at the end
	// of character creation.
	it("stands down when the finishing player can't write the steading", async () => {
		steading = makeSteading({ canModify: false });

		expect(await addCharacterToSteadingPlayers(wren)).toBe(false);
		expect(addPlayerRow).not.toHaveBeenCalled();
	});

	it("does nothing when the world has no steading yet", async () => {
		global.game.actors = { find: () => null };

		expect(await addCharacterToSteadingPlayers(wren)).toBe(false);
	});

	it("ignores anything that isn't a player character", async () => {
		expect(await addCharacterToSteadingPlayers({ id: "n1", name: "Marek", type: "npc" })).toBe(false);
		expect(await addCharacterToSteadingPlayers(null)).toBe(false);
		expect(addPlayerRow).not.toHaveBeenCalled();
	});

	// A failed write is logged, not thrown: the caller is the last step of character
	// creation, and the player's finished sheet must open regardless.
	it("swallows a failed roster write", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		addPlayerRow.mockRejectedValue(new Error("no permission"));

		expect(await addCharacterToSteadingPlayers(wren)).toBe(false);
		expect(console.warn).toHaveBeenCalled();
	});

	it("accepts an explicit steading, for a world with more than one", async () => {
		const other = makeSteading();
		const otherAdd = addPlayerRow;
		steading = makeSteading();

		expect(await addCharacterToSteadingPlayers(wren, other)).toBe(true);
		expect(otherAdd).toHaveBeenCalledWith(wren);
		expect(addPlayerRow).not.toHaveBeenCalled();
	});
});
