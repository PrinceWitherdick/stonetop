import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStonetopCharacterSheetClass } from "../../../module/actors/character/StonetopCharacterSheet.js";

// Backgrounds that name neighbors (the Ranger's Wide Wanderer names five) file them on the
// steading's Neighbors roster as they're applied, as the NPC actors every other roster row is
// backed by. Gated on the ACTOR_CREATE permission the system grants players, not on isGM — so
// this works for whoever is at the keyboard. A world whose GM revoked that permission falls
// back to plain-text rows for a GM client to convert (see steading-people.js).

// The real Wide Wanderer setup block, trimmed to three of its five (data/playbooks.json).
const WIDE_WANDERER = {
	neighbors: [
		{ name: "Ennis",  origin: "Marshedge",       traitKey: "ennis",  traitLabel: "Ennis trait" },
		{ name: "Shahar", origin: "Gordin's Delve",  traitKey: "shahar", traitLabel: "Shahar trait" },
		{ name: "Yannic", origin: "the Hillfolk",    traitKey: "yannic", traitLabel: "Yannic trait" },
	],
};

const TRAIT_PICKS = { backgroundSetup: { neighborTraits: { ennis: "wary", shahar: "greedy", yannic: "proud" } } };

let actors;
let steading;
let nextId;

/** The steading the sheet writes the roster onto, with the flag shape setFlags merges into. */
function makeSteading(neighbors = []) {
	const flags = { neighbors };
	return {
		type: "stonetop",
		flags: { "stonetop-pwd": { steading: flags } },
		typedActor: { setFlags: vi.fn(async patch => Object.assign(flags, patch)) },
		get neighbors() { return flags.neighbors; },
	};
}

/** The sheet method under test, on a bare prototype — it touches no sheet state. */
function makeSheet() {
	const Sheet = createStonetopCharacterSheetClass(class {});
	return Object.create(Sheet.prototype);
}

beforeEach(() => {
	actors = [];
	nextId = 0;
	steading = makeSteading();
	global.game.user = { isGM: true };
	global.game.actors = {
		get: id => actors.find(a => a.id === id) ?? null,
		find: fn => [steading, ...actors].find(fn) ?? null,
	};
	global.game.folders = { find: () => ({ id: "folder-1" }) };
	global.Folder = { canUserCreate: () => true, create: async () => ({ id: "folder-1" }) };
	global.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { OBSERVER: 2 } };
	global.Actor = {
		// The permission Ready.js#_ensurePlayerActorCreationGrant hands players once per world.
		canUserCreate: () => true,
		create: vi.fn(async data => {
			const id = `npc${++nextId}`;
			const actor = {
				id, uuid: `Actor.${id}`, name: data.name, type: data.type,
				system: data.system, isOwner: true, update: vi.fn(async () => {}),
			};
			actors.push(actor);
			return actor;
		}),
	};
});

afterEach(() => {
	for (const key of ["user", "actors", "folders"]) delete global.game[key];
	delete global.Folder;
	delete global.CONST;
	delete global.Actor;
});

describe("_applyBackgroundNeighbors", () => {
	it("creates an NPC per named neighbor, and files pointer rows", async () => {
		await makeSheet()._applyBackgroundNeighbors(WIDE_WANDERER, TRAIT_PICKS);

		expect(steading.neighbors).toEqual([
			{ uuid: "Actor.npc1", id: "npc1", name: "Ennis",  checked: true },
			{ uuid: "Actor.npc2", id: "npc2", name: "Shahar", checked: true },
			{ uuid: "Actor.npc3", id: "npc3", name: "Yannic", checked: true },
		]);
		// The background's place of origin belongs in the NPC's Home, its chosen trait in Traits.
		expect(actors.map(a => [a.name, a.system.home, a.system.traits])).toEqual([
			["Ennis", "Marshedge", "wary"],
			["Shahar", "Gordin's Delve", "greedy"],
			["Yannic", "the Hillfolk", "proud"],
		]);
	});

	// A player holds ACTOR_CREATE, so being a player is not what decides this.
	it("creates the NPCs for a player too, not just a GM", async () => {
		global.game.user = { isGM: false };

		await makeSheet()._applyBackgroundNeighbors(WIDE_WANDERER, TRAIT_PICKS);

		expect(global.Actor.create).toHaveBeenCalledTimes(3);
		expect(steading.neighbors.every(row => row.uuid)).toBe(true);
	});

	// Only a revoked permission falls back to text, for a GM client to pick up later
	// (steading-people.js#onSteadingPeopleUpdate / #migrateSteadingPeople).
	it("leaves plain-text rows when actor creation has been revoked", async () => {
		global.Actor.canUserCreate = () => false;

		await makeSheet()._applyBackgroundNeighbors(WIDE_WANDERER, TRAIT_PICKS);

		expect(global.Actor.create).not.toHaveBeenCalled();
		expect(steading.neighbors).toEqual([
			{ name: "Ennis",  home: "Marshedge",      traits: "wary",   checked: true },
			{ name: "Shahar", home: "Gordin's Delve", traits: "greedy", checked: true },
			{ name: "Yannic", home: "the Hillfolk",   traits: "proud",  checked: true },
		]);
	});

	it("does not add a second copy of a neighbor another character already put on the roster", async () => {
		const ennis = { id: "npc0", uuid: "Actor.npc0", name: "Ennis", system: { home: "Marshedge", traits: "wary" }, isOwner: true, update: vi.fn(async () => {}) };
		actors.push(ennis);
		steading = makeSteading([{ uuid: "Actor.npc0", id: "npc0", name: "Ennis" }]);

		await makeSheet()._applyBackgroundNeighbors(WIDE_WANDERER, TRAIT_PICKS);

		expect(steading.neighbors).toHaveLength(3);
		expect(steading.neighbors[0]).toEqual({ uuid: "Actor.npc0", id: "npc0", name: "Ennis", checked: true });
		expect(ennis.update).not.toHaveBeenCalled(); // Home and Traits already filled in
	});

	it("fills a linked neighbor's blank Home and Traits from the background", async () => {
		const ennis = { id: "npc0", uuid: "Actor.npc0", name: "Ennis", system: { home: "", traits: "" }, isOwner: true, update: vi.fn(async () => {}) };
		actors.push(ennis);
		steading = makeSteading([{ uuid: "Actor.npc0", id: "npc0", name: "Ennis" }]);

		await makeSheet()._applyBackgroundNeighbors(WIDE_WANDERER, TRAIT_PICKS);

		// Matched by name alone because his Home was blank, and the fill lands on the NPC —
		// where the roster reads Home and Traits from — not on the pointer row.
		expect(ennis.update).toHaveBeenCalledWith({ "system.home": "Marshedge", "system.traits": "wary" });
		expect(steading.neighbors).toHaveLength(3);
	});

	it("treats a same-name neighbor from somewhere else as a different person", async () => {
		const other = { id: "npc0", uuid: "Actor.npc0", name: "Ennis", system: { home: "Lygos" }, isOwner: true, update: vi.fn(async () => {}) };
		actors.push(other);
		steading = makeSteading([{ uuid: "Actor.npc0", id: "npc0", name: "Ennis" }]);

		await makeSheet()._applyBackgroundNeighbors(WIDE_WANDERER, TRAIT_PICKS);

		expect(steading.neighbors).toHaveLength(4);
		expect(other.update).not.toHaveBeenCalled();
	});

	it("fills a legacy text row in place rather than duplicating it", async () => {
		steading = makeSteading([{ name: "Ennis", home: "Marshedge", traits: "" }]);

		await makeSheet()._applyBackgroundNeighbors(WIDE_WANDERER, TRAIT_PICKS);

		expect(steading.neighbors).toHaveLength(3);
		expect(steading.neighbors[0]).toEqual({ name: "Ennis", home: "Marshedge", traits: "wary", checked: true });
		expect(global.Actor.create).toHaveBeenCalledTimes(2); // Shahar and Yannic only
	});

	it("falls back to a text row when actor creation fails, so nobody is lost", async () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		global.Actor.create.mockRejectedValueOnce(new Error("no room"));

		await makeSheet()._applyBackgroundNeighbors(WIDE_WANDERER, TRAIT_PICKS);

		expect(steading.neighbors[0]).toEqual({ name: "Ennis", home: "Marshedge", traits: "wary", checked: true });
		expect(steading.neighbors[1]).toMatchObject({ id: "npc1", name: "Shahar" });
		error.mockRestore();
	});

	// A pointer row whose NPC was deleted keys as "ennis|" — the same key a blank-Home row has —
	// so it used to win the name-only match. Filling it wrote Home and Traits onto a row the
	// roster renders as unresolved, which reads them off an actor that is gone: the neighbor
	// vanished. Leave the dead row for the GM to clear, and list a live Ennis beside it.
	it("lists a neighbor whose linked NPC was deleted rather than filling the dead row", async () => {
		steading = makeSteading([{ uuid: "Actor.gone", id: "gone", name: "Ennis" }]);

		await makeSheet()._applyBackgroundNeighbors(WIDE_WANDERER, TRAIT_PICKS);

		expect(steading.neighbors).toHaveLength(4);
		expect(steading.neighbors[0]).toEqual({ uuid: "Actor.gone", id: "gone", name: "Ennis" });
		expect(steading.neighbors[1]).toMatchObject({ id: "npc1", name: "Ennis", checked: true });
		expect(actors[0].system.home).toBe("Marshedge");
	});

	// Onboarding is exactly when a second player is doing this to the same roster. The rows are
	// written against the roster as it stands after the creates, not the copy read before them.
	it("keeps a row added to the roster while it was creating the NPCs", async () => {
		global.Actor.create.mockImplementationOnce(async data => {
			steading.flags["stonetop-pwd"].steading.neighbors = [{ uuid: "Actor.late", id: "late", name: "Kesh" }];
			const id = `npc${++nextId}`;
			const actor = {
				id, uuid: `Actor.${id}`, name: data.name, type: data.type,
				system: data.system, isOwner: true, update: vi.fn(async () => {}),
			};
			actors.push(actor);
			return actor;
		});

		await makeSheet()._applyBackgroundNeighbors(WIDE_WANDERER, TRAIT_PICKS);

		expect(steading.neighbors.map(row => row.name)).toEqual(["Kesh", "Ennis", "Shahar", "Yannic"]);
	});

	it("warns and creates nothing when the world has no steading", async () => {
		global.game.actors.find = () => null;
		const warn = vi.fn();
		global.ui = { notifications: { warn } };

		await makeSheet()._applyBackgroundNeighbors(WIDE_WANDERER, TRAIT_PICKS);

		expect(warn).toHaveBeenCalled();
		expect(global.Actor.create).not.toHaveBeenCalled();
	});

	it("does nothing at all for a background that names no neighbors", async () => {
		await makeSheet()._applyBackgroundNeighbors({}, { backgroundSetup: {} });
		expect(steading.typedActor.setFlags).not.toHaveBeenCalled();
	});
});
