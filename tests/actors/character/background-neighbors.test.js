import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createStonetopCharacterSheetClass } from "../../../module/actors/character/StonetopCharacterSheet.js";
import {
	BackgroundNeighborsDialog, randomNeighborTrait, storedNeighborTraits,
} from "../../../module/actors/character/dialogs/BackgroundNeighborsDialog.js";

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

// The Judge's Missionary, as the pack ships it: Devin and Haeris are fixed, and the player picks
// 2 more. Choosing the background on the Details tab filed nobody, because only onboarding's
// apply called _applyBackgroundNeighbors and only onboarding asked for the picks.
describe("choosing a neighbor-naming background on the Details tab", () => {
	const JUDGE = JSON.parse(readFileSync(new URL("../../../packs/src/stonetop-items/playbooks/the-judge.json", import.meta.url), "utf8"));
	const PLAYBOOK = { name: "The Judge", backgrounds: JUDGE.flags.stonetop.backgrounds };

	function makeDetailsSheet(from = "legacy", playbook = PLAYBOOK, background = {}) {
		const sheet = makeSheet();
		const flags = { background: { selected: from, ...background } };
		sheet.actor = {
			flags: { "stonetop-pwd": flags },
			update: vi.fn(async upd => {
				for (const [k, v] of Object.entries(upd)) {
					const key = k.replace("flags.stonetop-pwd.background.", "");
					if (key.startsWith("-=")) delete flags.background[key.slice(2)];
					else flags.background[key] = v;
				}
			}),
		};
		sheet.render = vi.fn();
		sheet._stonetopCharacter = {
			backgroundState: () => ({ slug: flags.background.selected, setupChoices: {} }),
			backgroundMovesDropped: async () => [],
			background: { selectBackground: async slug => { flags.background.selected = slug; } },
			settleBackgroundMoves: async () => {},
			settleBackgroundPossessions: async () => {},
			settleBackgroundArcana: async () => {},
			settleBackgroundResources: async () => {},
			backgroundAnswerAsks: async () => [],
			playbook: async () => playbook,
		};
		return sheet;
	}
	const choose = (sheet, slug) => sheet._onBackgroundChange({ currentTarget: { value: slug } });
	const names = () => steading.neighbors.map(row => row.name);
	const askPicks = answer => vi.spyOn(BackgroundNeighborsDialog, "ask").mockResolvedValue(answer);

	afterEach(() => { vi.restoreAllMocks(); });

	it("files Devin and Haeris and the two picked", async () => {
		const ask = askPicks({ picks: { "missionary-judges": ["rahat", "unz"] }, traits: {} });
		const sheet = makeDetailsSheet();

		await choose(sheet, "missionary");

		expect(ask).toHaveBeenCalledTimes(1);
		expect(names()).toEqual(["Devin", "Haeris", "Rahat", "Unz"]);
		expect(actors.map(a => a.system.home)).toEqual(["Marshedge", "Gordin's Delve", "Lygos", "the Hillfolk"]);
		// Stored where onboarding stores them, so a later onboarding run reads them back ticked.
		expect(sheet.actor.flags["stonetop-pwd"].background.neighborPicks).toEqual({ "missionary-judges": ["rahat", "unz"] });
	});

	it("still files the fixed two when the picker is closed", async () => {
		askPicks(null);
		await choose(makeDetailsSheet(), "missionary");
		expect(names()).toEqual(["Devin", "Haeris"]);
	});

	it("adds no one twice when the background is chosen again", async () => {
		askPicks({ picks: { "missionary-judges": ["rahat", "unz"] }, traits: {} });
		const sheet = makeDetailsSheet();
		await choose(sheet, "missionary");
		await choose(sheet, "legacy");
		await choose(sheet, "missionary");
		expect(names()).toEqual(["Devin", "Haeris", "Rahat", "Unz"]);
		expect(global.Actor.create).toHaveBeenCalledTimes(4);
	});

	it("takes no one off the roster when the background changes away", async () => {
		askPicks({ picks: { "missionary-judges": ["isalde", "tejisha"] }, traits: {} });
		const sheet = makeDetailsSheet();
		await choose(sheet, "missionary");
		await choose(sheet, "prophet");
		expect(names()).toEqual(["Devin", "Haeris", "Isalde", "Tejisha"]);
	});

	it("asks nothing and files nothing for a background that names no neighbors", async () => {
		const ask = askPicks(null);
		await choose(makeDetailsSheet("missionary"), "prophet");
		expect(ask).not.toHaveBeenCalled();
		expect(steading.typedActor.setFlags).not.toHaveBeenCalled();
	});

	// The Ranger's Wide Wanderer: "Add each of the following to the Neighbors list ..., choosing 1
	// trait for each". Fixed neighbors with a traitKey were filed with blank traits, never asked.
	describe("the Ranger's Wide Wanderer", () => {
		const RANGER = JSON.parse(readFileSync(new URL("../../../packs/src/stonetop-items/playbooks/the-ranger.json", import.meta.url), "utf8"));
		const RANGER_PLAYBOOK = { name: "The Ranger", backgrounds: RANGER.flags.stonetop.backgrounds };
		const TRAITS = { ennis: "wary", shahar: "greedy", yannic: "proud", tovia: "stoic", sasca: "cheery" };
		const ranger = (background = {}) => makeDetailsSheet("mighty-hunter", RANGER_PLAYBOOK, background);

		it("asks a trait for each of the five and files them wearing it, stored where onboarding stores them", async () => {
			const ask = askPicks({ picks: {}, traits: TRAITS });
			const sheet = ranger();

			await choose(sheet, "wide-wanderer");

			expect(ask).toHaveBeenCalledTimes(1);
			expect(names()).toEqual(["Ennis", "Shahar", "Yannic", "Tovia", "Sasca"]);
			expect(actors.map(a => a.system.traits)).toEqual(["wary", "greedy", "proud", "stoic", "cheery"]);
			expect(sheet.actor.flags["stonetop-pwd"].background.neighborTraits).toEqual(TRAITS);
		});

		it("fills in the earlier answer, and files them with no traits when closed", async () => {
			const ask = askPicks(null);
			const sheet = ranger({ neighborTraits: { ennis: "wary" } });

			await choose(sheet, "wide-wanderer");

			expect(ask.mock.calls[0][2]).toEqual({ ennis: "wary" });
			expect(names()).toHaveLength(5);
			expect(actors.every(a => a.system.traits === "")).toBe(true);
			expect(sheet.actor.flags["stonetop-pwd"].background.neighborTraits).toEqual({ ennis: "wary" });
		});

		it("a changed answer reaches a neighbor still wearing the old trait, not one edited since", async () => {
			askPicks({ picks: {}, traits: TRAITS });
			const sheet = ranger();
			await choose(sheet, "wide-wanderer");
			actors[1].system.traits = "a table's own note";
			await choose(sheet, "mighty-hunter");

			askPicks({ picks: {}, traits: { ...TRAITS, ennis: "fearless", shahar: "curious" } });
			await choose(sheet, "wide-wanderer");

			expect(global.Actor.create).toHaveBeenCalledTimes(5);
			expect(actors[0].update).toHaveBeenCalledWith({ "system.traits": "fearless" });
			expect(actors[1].update).not.toHaveBeenCalled();
		});
	});
});

describe("_fillExistingBackgroundNeighbor: a re-run's changed trait", () => {
	const ennisNpc = traits => ({ id: "npc0", uuid: "Actor.npc0", name: "Ennis", system: { home: "Marshedge", traits }, isOwner: true, update: vi.fn(async () => {}) });

	it("replaces traits still as the background filed them", async () => {
		const ennis = ennisNpc("sly");
		actors.push(ennis);
		steading = makeSteading([{ uuid: "Actor.npc0", id: "npc0", name: "Ennis" }]);

		await makeSheet()._applyBackgroundNeighbors(WIDE_WANDERER, TRAIT_PICKS, { previousTraits: { ennis: "sly" } });

		expect(ennis.update).toHaveBeenCalledWith({ "system.traits": "wary" });
	});

	it("leaves traits edited since the background filed them", async () => {
		const ennis = ennisNpc("sly, and owes Shahar money");
		actors.push(ennis);
		steading = makeSteading([{ uuid: "Actor.npc0", id: "npc0", name: "Ennis" }]);

		await makeSheet()._applyBackgroundNeighbors(WIDE_WANDERER, TRAIT_PICKS, { previousTraits: { ennis: "sly" } });

		expect(ennis.update).not.toHaveBeenCalled();
	});

	it("a legacy text row the same way", async () => {
		steading = makeSteading([
			{ name: "Ennis", home: "Marshedge", traits: "sly" },
			{ name: "Shahar", home: "Gordin's Delve", traits: "an edit" },
		]);

		await makeSheet()._applyBackgroundNeighbors(WIDE_WANDERER, TRAIT_PICKS, { previousTraits: { ennis: "sly", shahar: "sly" } });

		expect(steading.neighbors[0].traits).toBe("wary");
		expect(steading.neighbors[1].traits).toBe("an edit");
	});
});

describe("BackgroundNeighborsDialog", () => {
	const MISSIONARY = {
		slug: "missionary", label: "Missionary",
		setup: {
			neighbors: [{ name: "Devin", origin: "Marshedge" }, { name: "Haeris", origin: "Gordin's Delve" }],
			neighborChoices: [{ key: "judges", label: "Pick 2 more", count: 2, options: [
				{ value: "isalde", name: "Isalde", origin: "the Manmarch" },
				{ value: "rahat",  name: "Rahat",  origin: "Lygos" },
			] }],
		},
	};

	it("names the fixed neighbors, pre-ticks an earlier answer, and names both outcomes", () => {
		const data = new BackgroundNeighborsDialog(MISSIONARY, { judges: ["rahat"] }).getData();
		expect(data.groups[0].count).toBe(2);
		expect(data.groups[0].options.map(o => [o.name, o.selected])).toEqual([["Isalde", false], ["Rahat", true]]);
		expect(data.lead).toContain("Devin & Haeris");
		expect(data.skipLabel).toContain("Devin & Haeris");
	});

	it("does not open for a background with nothing to pick", async () => {
		expect(await BackgroundNeighborsDialog.ask({ setup: { neighbors: [{ name: "Devin" }] } })).toBeNull();
	});

	const WANDERER = { slug: "wide-wanderer", label: "Wide Wanderer", setup: WIDE_WANDERER };

	it("opens for fixed neighbors that each take a trait", async () => {
		const promise = vi.spyOn(BackgroundNeighborsDialog.prototype, "promise").mockResolvedValue({ picks: {}, traits: { ennis: "wary" } });
		expect(await BackgroundNeighborsDialog.ask(WANDERER, {}, {})).toEqual({ picks: {}, traits: { ennis: "wary" } });
		expect(promise).toHaveBeenCalledTimes(1);
		promise.mockRestore();
	});

	it("draws a trait field per neighbor, the earlier answer filled in, and names what closing does", () => {
		const data = new BackgroundNeighborsDialog(WANDERER, {}, { shahar: "greedy" }).getData();
		expect(data.neighbors.map(n => [n.name, n.origin, n.traitKey, n.trait])).toEqual([
			["Ennis", "Marshedge", "ennis", ""],
			["Shahar", "Gordin's Delve", "shahar", "greedy"],
			["Yannic", "the Hillfolk", "yannic", ""],
		]);
		expect(data.groups).toEqual([]);
		expect(data.traitsLead).toBe("Choose 1 trait for each.");
		expect(data.skipLabel).toBe("Add them without traits");
	});

	it("the Missionary's dialog draws no trait fields", () => {
		expect(new BackgroundNeighborsDialog(MISSIONARY).getData().neighbors).toEqual([]);
	});
});

describe("neighbor trait helpers", () => {
	it("storedNeighborTraits keeps only this background's keys, trimmed and written", () => {
		expect(storedNeighborTraits(WIDE_WANDERER, { ennis: " wary ", shahar: "", other: "x" })).toEqual({ ennis: "wary" });
	});

	it("randomNeighborTrait skips the traits already taken, any case, and falls back to the whole pool", () => {
		const pool = ["cheery", "stoic", "wary"];
		expect(randomNeighborTrait(["Cheery", "wary"], pool, () => 0.99)).toBe("stoic");
		expect(randomNeighborTrait(pool, pool, () => 0)).toBe("cheery");
	});
});
