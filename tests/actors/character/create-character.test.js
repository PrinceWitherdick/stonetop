import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createCharacterForUser } from "../../../module/actors/character/create-character.js";

// Minting a character for a player who already has one. The question this flow exists to ask —
// second character, or replacement? — has one destructive answer, so what these tests pin down is
// which answer each gesture produces and, above all, that nothing is deleted unless the deletion
// was the thing chosen.

const OWNER = 3;

/** The Dialog the flow opened, and the ways out of it. */
let opened = null;

/**
 * Stand in for core's Dialog, answering with `answer` the moment it renders:
 * "add" / "replace" press that button, null dismisses the window.
 */
function installDialog(answer, { ticked = null } = {}) {
	global.Dialog = class {
		constructor(config) { opened = config; }
		render() {
			if (answer === null) return opened.close?.();
			opened.buttons[answer]?.callback?.(renderedBoxes(opened.content, ticked));
		}
	};
}

/**
 * The replace list's checkboxes as the content draws them, in the shape core hands a button
 * callback (a jQuery-like list whose [0] is the root). `ticked`, when given, is what the user left
 * ticked; otherwise each box keeps the state it was drawn with.
 */
function renderedBoxes(content, ticked) {
	const boxes = [...String(content).matchAll(/<input type="checkbox" name="stonetop-replace" value="([^"]+)"( checked)?>/g)]
		.map(([, value, checked]) => ({ value, checked: ticked ? ticked.includes(value) : !!checked }));
	return [{ querySelectorAll: () => boxes }];
}

/** A character actor as `charactersOwnedBy` and the confirmation read one. */
function character(id, name, ownerId, { canDelete = true, progress = null, dead = false, owners = [] } = {}) {
	const ownership = ownerId ? { [ownerId]: OWNER } : {};
	for (const extra of owners) ownership[extra] = OWNER;
	return {
		id,
		name,
		type: "character",
		system: {},
		ownership,
		// Where Death's Door keeps its state: "dead" is someone through the Last Door.
		flags: dead ? { "stonetop_pwd": { deathsDoor: "dead" } } : {},
		getFlag: (_scope, key) => (key === "onboardingProgress" ? progress : undefined),
		canUserModify: () => canDelete,
	};
}

/**
 * A world with one player.
 *
 * @param {object} [world]
 * @param {Array}  [world.existing]   Characters that already exist.
 * @param {string} [world.assigned]   The id in the player's `User#character` slot, if any.
 * @param {boolean} [world.asGM]      Is the client pressing the button the GM?
 */
function makeWorld({ existing = [], assigned = null, asGM = true, others = [] } = {}) {
	const created = [];
	const deleted = [];
	const player = {
		id: "u1",
		name: "Aderyn",
		active: true,
		character: assigned ? { id: assigned } : null,
		update: vi.fn(async data => { player.character = { id: data.character }; }),
	};
	global.game = {
		...global.game,
		user: asGM ? { id: "gm1", isGM: true } : { id: "u1", isGM: false },
		users: { get: id => (id === "u1" ? player : null), contents: [player, ...others] },
		actors: { contents: existing },
	};
	global.getDocumentClass = () => ({
		create: async data => {
			const actor = { id: `new${created.length + 1}`, name: data.name, ...data };
			created.push(data);
			return actor;
		},
		deleteDocuments: async ids => { deleted.push(...ids); return ids; },
	});
	return { player, created, deleted };
}

let saved;

beforeEach(() => {
	saved = { game: global.game, ui: global.ui, CONST: global.CONST, gdc: global.getDocumentClass };
	global.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { OWNER } };
	global.ui = { notifications: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } };
	opened = null;
});

afterEach(() => {
	global.game = saved.game;
	global.ui = saved.ui;
	global.CONST = saved.CONST;
	global.getDocumentClass = saved.gdc;
	delete global.Dialog;
});

describe("minting a player's first character", () => {
	it("asks nothing, and hands them ownership and the assignment", async () => {
		const { player, created } = makeWorld();
		installDialog(null); // never reached

		const actor = await createCharacterForUser("u1");

		expect(opened, "nothing to ask about — this player has no characters").toBeNull();
		expect(actor).toBeTruthy();
		expect(created[0].ownership).toEqual({ u1: OWNER });
		expect(created[0].flags["stonetop_pwd"].autoOpenFor).toBe("u1");
		expect(player.update).toHaveBeenCalledWith({ character: actor.id });
	});
});

describe("a player who already has a character", () => {
	const withWren = () => makeWorld({ existing: [character("a1", "Wren", "u1")], assigned: "a1" });

	it("offers the addition first, and defaults to it", async () => {
		withWren();
		installDialog("add");
		await createCharacterForUser("u1");
		// Order is what renders, so the non-destructive answer leads and Replace never sits
		// where a reflexive click lands. The default settles a stray Enter the same way.
		expect(Object.keys(opened.buttons)).toEqual(["add", "replace", "cancel"]);
		expect(opened.default).toBe("add");
	});

	it("adds a second character without deleting the first", async () => {
		const { deleted, created } = withWren();
		installDialog("add");

		const actor = await createCharacterForUser("u1");

		expect(actor).toBeTruthy();
		expect(deleted, "adding must never delete").toEqual([]);
		expect(created).toHaveLength(1);
		expect(created[0].ownership).toEqual({ u1: OWNER });
	});

	// `User#character` holds a single id. Taking it for the new sheet would swing the player's
	// list entry, their C hotkey and their default speaker onto a character that does not exist
	// yet, away from the one they are in the middle of playing.
	it("leaves the assignment on the character they already play", async () => {
		const { player } = withWren();
		installDialog("add");

		await createCharacterForUser("u1");

		expect(player.update).not.toHaveBeenCalled();
		expect(player.character.id).toBe("a1");
	});

	// The exception: characters handed over by ownership alone leave the slot empty, and an empty
	// slot keeps re-triggering the "no character yet" orientation on every load.
	it("takes the assignment when nothing holds it", async () => {
		const { player } = makeWorld({ existing: [character("a1", "Wren", "u1")], assigned: null });
		installDialog("add");

		const actor = await createCharacterForUser("u1");

		expect(player.update).toHaveBeenCalledWith({ character: actor.id });
	});

	it("replaces on request: the old one is deleted and the new one takes the slot", async () => {
		const { deleted, player } = withWren();
		installDialog("replace");

		const actor = await createCharacterForUser("u1");

		expect(deleted).toEqual(["a1"]);
		expect(player.update).toHaveBeenCalledWith({ character: actor.id });
	});

	it("creates nothing when the question is dismissed", async () => {
		const { created, deleted } = withWren();
		installDialog(null);

		expect(await createCharacterForUser("u1")).toBeNull();
		expect(created).toEqual([]);
		expect(deleted).toEqual([]);
	});

	it("names a half-built character before offering to delete it", async () => {
		makeWorld({
			existing: [character("a1", "Wren", "u1", { progress: { state: "onboarding", step: 4, total: 9 } })],
			assigned: "a1",
		});
		installDialog("add");
		await createCharacterForUser("u1");
		expect(opened.content).toContain("on page 4 of 9");
	});

	// Deleting an Actor is Assistant GM or better, whoever owns the sheet. A player pressing the
	// sidebar's Create Actor button used to be turned away here; the answer they CAN act on is
	// the one that adds, so that is the only one they are shown.
	it("offers a player who cannot delete the addition alone", async () => {
		const { deleted, created } = makeWorld({
			existing: [character("a1", "Wren", "u1", { canDelete: false })],
			assigned: "a1",
			asGM: false,
		});
		installDialog("add");

		const actor = await createCharacterForUser("u1");

		expect(Object.keys(opened.buttons)).toEqual(["add", "cancel"]);
		expect(opened.content).toContain("only your GM can do");
		expect(actor).toBeTruthy();
		expect(created).toHaveLength(1);
		expect(deleted).toEqual([]);
	});

	// A replace that cannot delete must not go on to create: that would leave the player holding
	// both the character they asked to be rid of and its replacement.
	it("stops when the delete fails, rather than creating anyway", async () => {
		const { created } = withWren();
		global.getDocumentClass = () => ({
			create: async () => { created.push("should not happen"); return { id: "nope" }; },
			deleteDocuments: async () => { throw new Error("no"); },
		});
		installDialog("replace");

		expect(await createCharacterForUser("u1")).toBeNull();
		expect(created).toEqual([]);
		expect(global.ui.notifications.error).toHaveBeenCalled();
	});
});

// Replace is a checklist: only what is left ticked goes, and a character another player holds as
// their own is never on the list at all, however much ownership this player was given over it.
describe("replacing from a checklist", () => {
	const alice = { id: "u2", name: "Bryn", character: { id: "alicePc" } };

	it("never lists, and never deletes, a character assigned to another player", async () => {
		const { deleted } = makeWorld({
			existing: [
				character("a1", "Wren", "u1"),
				// Bryn's PC, which Aderyn was made an owner of to run it while Bryn is away.
				character("alicePc", "Holt", "u2", { owners: ["u1"] }),
			],
			assigned: "a1",
			others: [alice],
		});
		installDialog("replace");

		await createCharacterForUser("u1");

		expect(opened.content).not.toContain("Holt");
		expect(deleted).toEqual(["a1"]);
	});

	it("asks nothing when the only character this player owns is someone else's", async () => {
		const { deleted, player } = makeWorld({
			existing: [character("alicePc", "Holt", "u2", { owners: ["u1"] })],
			others: [alice],
		});
		installDialog("replace");

		const actor = await createCharacterForUser("u1");

		expect(opened).toBeNull();
		expect(deleted).toEqual([]);
		expect(player.update).toHaveBeenCalledWith({ character: actor.id });
	});

	it("deletes only the ones left ticked, and keeps the assignment on a survivor", async () => {
		const { deleted, player } = makeWorld({
			existing: [character("a1", "Wren", "u1"), character("a2", "Ash", "u1")],
			assigned: "a1",
		});
		installDialog("replace", { ticked: ["a2"] });

		await createCharacterForUser("u1");

		expect(deleted).toEqual(["a2"]);
		expect(player.update).not.toHaveBeenCalled();
	});

	it("starts the dead unticked and the living ticked", async () => {
		const { deleted } = makeWorld({
			existing: [character("a1", "Wren", "u1"), character("a2", "Ash", "u1", { dead: true })],
			assigned: "a1",
		});
		installDialog("replace");

		await createCharacterForUser("u1");

		expect(opened.content).toContain("Ash</strong> (dead)");
		expect(deleted).toEqual(["a1"]);
	});

	// The usual replacement after a death keeps the fallen sheet (it starts unticked), and nobody
	// plays it: the slot must not stay on the corpse.
	it("hands the slot on from a dead assigned character that the replace kept", async () => {
		const ash = character("a2", "Ash", "u1", { dead: true });
		const { player, deleted } = makeWorld({ existing: [ash], assigned: "a2" });
		player.character = ash;
		installDialog("replace");

		const actor = await createCharacterForUser("u1");

		expect(deleted).toEqual([]);
		expect(player.update).toHaveBeenCalledWith({ character: actor.id });
	});

	it("adds alongside, deleting nothing, when Replace is pressed with nothing ticked", async () => {
		const { deleted, created, player } = makeWorld({
			existing: [character("a1", "Wren", "u1")],
			assigned: "a1",
		});
		installDialog("replace", { ticked: [] });

		const actor = await createCharacterForUser("u1");

		expect(actor).toBeTruthy();
		expect(created).toHaveLength(1);
		expect(deleted).toEqual([]);
		expect(player.update).not.toHaveBeenCalled();
	});
});
