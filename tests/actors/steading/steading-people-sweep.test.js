import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrateSteadingPeople, onSteadingPeopleUpdate, personRowKey } from "../../../module/actors/steading/steading-people.js";

// The load-time sweep that turns plain-text Residents/Neighbors rows into NPC actors.
// It is deliberately NOT one-shot: players can't create actors, so onboarding backgrounds
// that seed neighbors (the Ranger's Wide Wanderer) leave text rows for the GM to pick up
// here, however long after the world's original migration that happens.

let actors;
let nextId;

/** A steading stub shaped like the nested flag object the sweep reads and rewrites. */
function makeSteading(people) {
	const steading = {
		id: "steading-1",
		type: "stonetop",
		flags: { "stonetop-pwd": { steading: { ...people } } },
		setFlag: vi.fn(async (scope, key, value) => {
			steading.flags[scope][key] = { ...steading.flags[scope][key], ...value };
		}),
	};
	return steading;
}

/** The rows the sweep left on a steading, for the list under test. */
function rowsOn(steading, list) {
	return steading.flags["stonetop-pwd"].steading[list];
}

beforeEach(() => {
	actors = [];
	nextId = 0;
	global.game.user = { isGM: true };
	global.game.actors = {
		get: id => actors.find(a => a.id === id) ?? null,
		find: fn => actors.find(fn) ?? null,
		contents: actors,
	};
	// The people folders already exist (the GM pre-creates them on load), so the sweep
	// never exercises the folder-creation path here.
	global.game.folders = { find: () => ({ id: "folder-1" }) };
	global.Folder = { canUserCreate: () => true, create: async () => ({ id: "folder-1" }) };
	global.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { OBSERVER: 2 } };
	global.Actor = {
		create: vi.fn(async data => {
			const id = `npc${++nextId}`;
			const actor = { id, uuid: `Actor.${id}`, name: data.name, type: data.type, system: data.system, img: data.img };
			actors.push(actor);
			return actor;
		}),
	};
});

afterEach(() => {
	delete global.game.user;
	delete global.game.actors;
	delete global.game.folders;
	delete global.Folder;
	delete global.CONST;
	delete global.Actor;
});

describe("migrateSteadingPeople", () => {
	it("turns a text row into an NPC and rewrites the row as a pointer", async () => {
		const steading = makeSteading({ neighbors: [{ name: "Fenrick", home: "Marshedge", traits: "wary" }] });

		expect(await migrateSteadingPeople(steading)).toBe(1);

		expect(rowsOn(steading, "neighbors")).toEqual([
			{ uuid: "Actor.npc1", id: "npc1", name: "Fenrick", checked: false },
		]);
		expect(actors[0]).toMatchObject({ name: "Fenrick", type: "npc", system: { home: "Marshedge", traits: "wary" } });
	});

	// The regression this suite exists for: the sweep used to short-circuit on a
	// `peopleMigrated` flag that its own first conversion set, so every text row written
	// afterwards — every background-seeded neighbor — stayed text forever.
	it("still converts on a world whose first migration already ran", async () => {
		const steading = makeSteading({
			peopleMigrated: true,
			neighbors: [
				{ uuid: "Actor.old", id: "old", name: "Already linked" },
				{ name: "Kesh", home: "Gordin's Delve" },
			],
		});

		expect(await migrateSteadingPeople(steading)).toBe(1);

		expect(rowsOn(steading, "neighbors")).toEqual([
			{ uuid: "Actor.old", id: "old", name: "Already linked" },
			{ uuid: "Actor.npc1", id: "npc1", name: "Kesh", checked: false },
		]);
	});

	it("sweeps residents and neighbors together, in sheet order", async () => {
		const steading = makeSteading({ residents: [{ name: "Aderyn" }], neighbors: [{ name: "Tarn" }] });

		expect(await migrateSteadingPeople(steading)).toBe(2);

		expect(rowsOn(steading, "residents")[0].name).toBe("Aderyn");
		expect(rowsOn(steading, "neighbors")[0].name).toBe("Tarn");
		// Residents live in Stonetop by definition; a neighbor's Home stays as typed.
		expect(actors[0].system.home).toBe("Stonetop");
		expect(actors[1].system.home).toBe("");
	});

	it("carries a row's ticked state onto the pointer row", async () => {
		const steading = makeSteading({ neighbors: [{ name: "Fenrick", checked: true }] });
		await migrateSteadingPeople(steading);
		expect(rowsOn(steading, "neighbors")[0].checked).toBe(true);
	});

	it("drops blank slots without making actors for them", async () => {
		const steading = makeSteading({ neighbors: [{ name: "  " }, { name: "Fenrick" }, {}] });

		expect(await migrateSteadingPeople(steading)).toBe(1);

		expect(rowsOn(steading, "neighbors")).toHaveLength(1);
		expect(global.Actor.create).toHaveBeenCalledTimes(1);
	});

	it("keeps the text row when actor creation fails, so the next load retries", async () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		global.Actor.create.mockRejectedValueOnce(new Error("no room"));
		const steading = makeSteading({ neighbors: [{ name: "Fenrick", home: "Marshedge" }] });

		expect(await migrateSteadingPeople(steading)).toBe(0);

		expect(rowsOn(steading, "neighbors")).toEqual([{ name: "Fenrick", home: "Marshedge" }]);
		error.mockRestore();
	});

	// The sweep now runs on every steading write (onSteadingPeopleUpdate), not just at load, so
	// somebody is genuinely likely to be using the sheet while it works. It used to write back a
	// copy of the WHOLE steading flag object taken before its first await, which put every other
	// field back the way it was.
	it("does not revert a steading edit that lands while it is making the NPCs", async () => {
		const steading = makeSteading({ surplus: 1, neighbors: [{ name: "Ennis" }] });
		global.Actor.create.mockImplementationOnce(async data => {
			steading.flags["stonetop-pwd"].steading.surplus = 4; // a Surplus click, mid-create
			const actor = { id: "npc1", uuid: "Actor.npc1", name: data.name, type: data.type, system: data.system };
			actors.push(actor);
			return actor;
		});

		expect(await migrateSteadingPeople(steading)).toBe(1);

		expect(steading.flags["stonetop-pwd"].steading.surplus).toBe(4);
		expect(rowsOn(steading, "neighbors")).toEqual([
			{ uuid: "Actor.npc1", id: "npc1", name: "Ennis", checked: false },
		]);
	});

	// The same hazard one level down: the roster itself moved on. The conversion is applied to
	// the rows as they now stand, so a row added mid-flight is still there afterwards.
	it("keeps a row somebody else added while it was working", async () => {
		const steading = makeSteading({ neighbors: [{ name: "Ennis" }] });
		global.Actor.create.mockImplementationOnce(async data => {
			steading.flags["stonetop-pwd"].steading.neighbors = [
				{ name: "Ennis" },
				{ uuid: "Actor.late", id: "late", name: "Kesh" },
			];
			const actor = { id: "npc1", uuid: "Actor.npc1", name: data.name, type: data.type, system: data.system };
			actors.push(actor);
			return actor;
		});

		await migrateSteadingPeople(steading);

		expect(rowsOn(steading, "neighbors")).toEqual([
			{ uuid: "Actor.npc1", id: "npc1", name: "Ennis", checked: false },
			{ uuid: "Actor.late", id: "late", name: "Kesh" },
		]);
	});

	// Two people of the same name is a roster the book invites (there is more than one Ennis in
	// the world), and each row is owed the NPC made for it — not both pointed at the last one,
	// which would orphan the other actor.
	it("gives each of two same-named rows its own NPC", async () => {
		const steading = makeSteading({ neighbors: [{ name: "Ennis", home: "Marshedge" }, { name: "Ennis", home: "Lygos" }] });

		expect(await migrateSteadingPeople(steading)).toBe(2);

		expect(rowsOn(steading, "neighbors").map(row => row.id)).toEqual(["npc1", "npc2"]);
		expect(actors.map(a => a.system.home)).toEqual(["Marshedge", "Lygos"]);
	});

	it("writes nothing when every row already points at an actor", async () => {
		const steading = makeSteading({ neighbors: [{ uuid: "Actor.old", id: "old", name: "Already linked" }] });

		expect(await migrateSteadingPeople(steading)).toBe(0);

		expect(steading.setFlag).not.toHaveBeenCalled();
		expect(global.Actor.create).not.toHaveBeenCalled();
	});

	it("leaves the world alone for a player, or for an actor that isn't a steading", async () => {
		global.game.user = { isGM: false };
		const steading = makeSteading({ neighbors: [{ name: "Fenrick" }] });
		expect(await migrateSteadingPeople(steading)).toBe(0);
		expect(steading.setFlag).not.toHaveBeenCalled();

		global.game.user = { isGM: true };
		expect(await migrateSteadingPeople({ type: "character", flags: {} })).toBe(0);
	});
});

// The live pickup: `updateActor` broadcasts a player's roster write to every client, so the
// GM's converts it on the spot instead of at the GM's next reload.
describe("onSteadingPeopleUpdate", () => {
	beforeEach(() => {
		global.game.users = { activeGM: { id: "gm" }, find: () => null };
		global.game.user = { id: "gm", isGM: true };
	});

	afterEach(() => { delete global.game.users; });

	it("converts a text row a player just wrote, without waiting for a reload", async () => {
		const steading = makeSteading({ neighbors: [{ name: "Ennis", home: "Marshedge" }] });

		await onSteadingPeopleUpdate(steading);

		expect(rowsOn(steading, "neighbors")).toEqual([
			{ uuid: "Actor.npc1", id: "npc1", name: "Ennis", checked: false },
		]);
	});

	it("stands down on a player's client and on a second GM's", async () => {
		const steading = makeSteading({ neighbors: [{ name: "Ennis" }] });

		global.game.user = { id: "player", isGM: false };
		await onSteadingPeopleUpdate(steading);

		global.game.user = { id: "gm2", isGM: true }; // not the primary GM
		await onSteadingPeopleUpdate(steading);

		expect(global.Actor.create).not.toHaveBeenCalled();
	});

	it("ignores an update to anything that isn't a steading", async () => {
		await onSteadingPeopleUpdate({ id: "a1", type: "character", flags: {} });
		expect(global.Actor.create).not.toHaveBeenCalled();
	});

	// The conversion's own flag write re-broadcasts, firing this hook again. It has to settle.
	it("settles rather than looping when its own write fires the hook again", async () => {
		const steading = makeSteading({ neighbors: [{ name: "Ennis" }, { name: "Shahar" }] });
		steading.setFlag.mockImplementation(async (scope, key, value) => {
			steading.flags[scope][key] = { ...steading.flags[scope][key], ...value };
			await onSteadingPeopleUpdate(steading); // the broadcast coming back around
		});

		await onSteadingPeopleUpdate(steading);
		await onSteadingPeopleUpdate(steading); // and once more, after the flight ends

		expect(global.Actor.create).toHaveBeenCalledTimes(2);
		expect(rowsOn(steading, "neighbors")).toHaveLength(2);
	});

	// Two updates arriving while the first pass is still awaiting its Actor.create calls
	// would otherwise both convert the same rows, leaving two of everybody.
	it("does not double-convert when two updates overlap", async () => {
		const steading = makeSteading({ neighbors: [{ name: "Ennis" }] });
		let release;
		const held = new Promise(resolve => { release = resolve; });
		global.Actor.create.mockImplementationOnce(async data => {
			await held;
			const actor = { id: "npc1", uuid: "Actor.npc1", name: data.name, type: data.type, system: data.system };
			actors.push(actor);
			return actor;
		});

		const first = onSteadingPeopleUpdate(steading);
		const second = onSteadingPeopleUpdate(steading); // lands mid-flight
		release();
		await Promise.all([first, second]);

		expect(global.Actor.create).toHaveBeenCalledTimes(1);
		expect(rowsOn(steading, "neighbors")).toHaveLength(1);
	});
});

describe("personRowKey", () => {
	it("keys a legacy row off its own fields, case- and space-insensitively", () => {
		expect(personRowKey({ name: " Fenrick ", home: "Marshedge" })).toBe("fenrick|marshedge");
	});

	it("keys an actor-backed row off the NPC, so a linked neighbor still matches by Home", () => {
		actors.push({ id: "npc1", uuid: "Actor.npc1", name: "Fenrick", system: { home: "Marshedge" } });
		const row = { uuid: "Actor.npc1", id: "npc1", name: "Fenrick" };
		expect(personRowKey(row)).toBe(personRowKey({ name: "Fenrick", home: "Marshedge" }));
	});

	it("falls back to the row's cached name when the actor was deleted", () => {
		expect(personRowKey({ uuid: "Actor.gone", id: "gone", name: "Ghost" })).toBe("ghost|");
	});
});
