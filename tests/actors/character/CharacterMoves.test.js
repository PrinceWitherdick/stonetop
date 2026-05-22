import { describe, expect, it, vi } from "vitest";
import { CharacterMoves } from "../../../module/actors/character/CharacterMoves.js";
import { FakeMoveRepository } from "../../fakes/FakeMoveRepository.js";
import { Move } from "../../../module/model/data/Move.js";
import {
	MoveCategorySnapshot,
	MoveGroupSnapshot,
	MoveSnapshot,
	Movelist,
	OtherItemSnapshot,
} from "../../../module/model/CharacterSnapshot.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeResources(map = {}) {
	return { getMoveResources: () => map };
}

function makeActor(items = [], playbookName = null) {
	return {
		items,
		system: { playbook: { name: playbookName } },
		createEmbeddedDocuments: vi.fn(async () => []),
		deleteEmbeddedDocuments: vi.fn(async () => []),
	};
}

function makeMoves(repo = new FakeMoveRepository(), resources = makeResources(), actor = makeActor()) {
	return new CharacterMoves(repo, resources, actor);
}

function makePlaybookData(overrides = {}) {
	return {
		slug: "the-heavy",
		name: "The Heavy",
		startingMovesNote: null,
		backgrounds: [],
		...overrides,
	};
}

function makeEntry(overrides = {}) {
	return new Move({
		_id: overrides._id ?? "abc123",
		name: overrides.name ?? "Test Move",
		system: {
			description: overrides.description ?? "A test move.",
			rollType: overrides.rollType ?? null,
			isStartingMove: overrides.isStartingMove ?? false,
			requirement: overrides.requirement ?? null,
		},
	});
}

function makeMoveItem(overrides = {}) {
	return {
		_id: overrides._id ?? "item1",
		type: "move",
		name: overrides.name ?? "Test Move",
		system: {
			moveType: overrides.moveType ?? "other",
			rollType: overrides.rollType ?? null,
			description: overrides.description ?? "",
		},
	};
}

// ── buildSnapshot: empty cases ────────────────────────────────────────────────

describe("CharacterMoves.buildSnapshot — empty", () => {
	it("returns [] when no playbook, no basic moves, no actor items", async () => {
		const result = await makeMoves().buildSnapshot(null, null, 1);
		expect(result).toEqual([]);
	});

	it("excludes basic category when basic moves list is empty", async () => {
		const repo = new FakeMoveRepository([], []);
		const result = await makeMoves(repo).buildSnapshot(null, null, 1);
		expect(result.find(c => c.key === "basic")).toBeUndefined();
	});
});

// ── buildSnapshot: basic moves ────────────────────────────────────────────────

describe("CharacterMoves.buildSnapshot — basic moves", () => {
	it("includes a 'basic' category when basic moves are present", async () => {
		const repo = new FakeMoveRepository();
		repo.addBasic({ _id: "b1", name: "Defy Danger", system: { rollType: "str", isStartingMove: false } });
		const result = await makeMoves(repo).buildSnapshot(null, null, 1);
		const cat = result.find(c => c.key === "basic");
		expect(cat).toBeDefined();
		expect(cat.title).toBe("Basic Moves");
	});

	it("basic move is marked owned when actor owns it by name", async () => {
		const repo = new FakeMoveRepository();
		repo.addBasic({ _id: "b1", name: "Defy Danger", system: { rollType: "str", isStartingMove: false } });
		const actor = makeActor([{ _id: "own1", type: "move", name: "Defy Danger" }]);
		const result = await makeMoves(repo, makeResources(), actor).buildSnapshot(null, null, 1);
		const move = result.find(c => c.key === "basic").moves[0];
		expect(move.owned).toBe(true);
		expect(move.ownedId).toBe("own1");
	});

	it("basic move is unowned when actor does not own it", async () => {
		const repo = new FakeMoveRepository();
		repo.addBasic({ _id: "b1", name: "Defy Danger", system: { rollType: "str", isStartingMove: false } });
		const result = await makeMoves(repo).buildSnapshot(null, null, 1);
		const move = result.find(c => c.key === "basic").moves[0];
		expect(move.owned).toBe(false);
		expect(move.ownedId).toBeNull();
	});

	it("basic move snapshot has source={type:'basic'}", async () => {
		const repo = new FakeMoveRepository();
		repo.addBasic({ _id: "b1", name: "Defy Danger", system: { rollType: null, isStartingMove: false } });
		const result = await makeMoves(repo).buildSnapshot(null, null, 1);
		expect(result.find(c => c.key === "basic").moves[0].source).toEqual({ type: "basic" });
	});
});

// ── buildSnapshot: playbook moves ────────────────────────────────────────────

describe("CharacterMoves.buildSnapshot — playbook category", () => {
	it("includes a 'playbook' category titled '{Playbook} Moves'", async () => {
		const repo = new FakeMoveRepository();
		repo.addPlaybook({ _id: "p1", name: "Bulwark", system: { moveType: "playbook", isStartingMove: true, playbook: "The Heavy" } });
		const playbook = makePlaybookData({ name: "The Heavy" });
		const result = await makeMoves(repo).buildSnapshot(playbook, null, 1);
		const cat = result.find(c => c.key === "playbook");
		expect(cat).toBeDefined();
		expect(cat.title).toBe("The Heavy Moves");
	});

	it("playbook category note comes from startingMovesNote", async () => {
		const repo = new FakeMoveRepository();
		repo.addPlaybook({ _id: "p1", name: "Bulwark", system: { moveType: "playbook", isStartingMove: true } });
		const playbook = makePlaybookData({ startingMovesNote: "Choose 2 to start." });
		const result = await makeMoves(repo).buildSnapshot(playbook, null, 1);
		expect(result.find(c => c.key === "playbook").note).toBe("Choose 2 to start.");
	});

	it("starting playbook move has sourceLabel='Starting'", async () => {
		const repo = new FakeMoveRepository();
		repo.addPlaybook({ _id: "p1", name: "Bulwark", system: { moveType: "playbook", isStartingMove: true } });
		const result = await makeMoves(repo).buildSnapshot(makePlaybookData(), null, 1);
		expect(result.find(c => c.key === "playbook").moves[0].sourceLabel).toBe("Starting");
	});

	it("background move has sourceLabel='Background'", async () => {
		const repo = new FakeMoveRepository();
		repo.addPlaybook({ _id: "p1", name: "Harden", system: { moveType: "playbook", isStartingMove: false } });
		const playbook = makePlaybookData({
			backgrounds: [{ slug: "warrior", label: "Warrior", moves: ["Harden"] }],
		});
		const result = await makeMoves(repo).buildSnapshot(playbook, "warrior", 1);
		expect(result.find(c => c.key === "playbook").moves[0].sourceLabel).toBe("Background");
	});

	it("non-starting non-background move has sourceLabel=null", async () => {
		const repo = new FakeMoveRepository();
		repo.addPlaybook({ _id: "p1", name: "Optional Move", system: { moveType: "playbook", isStartingMove: false } });
		const result = await makeMoves(repo).buildSnapshot(makePlaybookData(), null, 1);
		expect(result.find(c => c.key === "playbook").moves[0].sourceLabel).toBeNull();
	});

	it("playbook move resource pulls current count from moveResources", async () => {
		const repo = new FakeMoveRepository();
		repo.addPlaybook({ _id: "p1", name: "Resource Move", system: {
			moveType: "playbook", isStartingMove: true,
			resource: { max: 3, title: "Favor", labels: [] },
		}});
		const resources = makeResources({ "Resource Move": 2 });
		const result = await makeMoves(repo, resources).buildSnapshot(makePlaybookData(), null, 1);
		const move = result.find(c => c.key === "playbook").moves[0];
		expect(move.resource.current).toBe(2);
		expect(move.resource.max).toBe(3);
	});

	it("excludes playbook category when playbook has no moves", async () => {
		const result = await makeMoves().buildSnapshot(makePlaybookData(), null, 1);
		expect(result.find(c => c.key === "playbook")).toBeUndefined();
	});
});

// ── buildSnapshot: other move types ──────────────────────────────────────────

describe("CharacterMoves.buildSnapshot — other move type categories", () => {
	it("creates a category for 'special' moves from actor items", async () => {
		const actor = makeActor([makeMoveItem({ _id: "s1", moveType: "special", name: "Special Power" })]);
		const result = await makeMoves(new FakeMoveRepository(), makeResources(), actor).buildSnapshot(null, null, 1);
		const cat = result.find(c => c.key === "special");
		expect(cat).toBeDefined();
		expect(cat.title).toBe("Special Moves");
		expect(cat.moves[0].name).toBe("Special Power");
	});

	it("creates a category for 'follower' moves", async () => {
		const actor = makeActor([makeMoveItem({ moveType: "follower", name: "Trusted Ally" })]);
		const result = await makeMoves(new FakeMoveRepository(), makeResources(), actor).buildSnapshot(null, null, 1);
		expect(result.find(c => c.key === "follower")?.moves[0].name).toBe("Trusted Ally");
	});

	it("excludes a category when no items of that type exist", async () => {
		const result = await makeMoves().buildSnapshot(null, null, 1);
		for (const type of ["special", "follower", "expedition", "homefront"]) {
			expect(result.find(c => c.key === type)).toBeUndefined();
		}
	});

	it("creates a 'post-death' category for post-death moves", async () => {
		const actor = makeActor([makeMoveItem({ moveType: "post-death", name: "Haunting Presence" })]);
		const result = await makeMoves(new FakeMoveRepository(), makeResources(), actor).buildSnapshot(null, null, 1);
		const cat = result.find(c => c.key === "post-death");
		expect(cat).toBeDefined();
		expect(cat.moves[0].isStarting).toBe(true);
	});
});

// ── buildMovelist ─────────────────────────────────────────────────────────────

describe("CharacterMoves.buildMovelist", () => {
	function makeCategory(key, title, moves = []) {
		return { key, title, moves, note: null };
	}

	it("returns a Movelist instance", () => {
		const result = makeMoves().buildMovelist([], [], null);
		expect(result).toBeInstanceOf(Movelist);
	});

	it("playbookMoves comes from playbook category moves", () => {
		const move = { name: "Bulwark" };
		const cats = [makeCategory("playbook", "The Heavy Moves", [move])];
		const result = makeMoves().buildMovelist(cats, [], null);
		expect(result.playbookMoves).toEqual([move]);
	});

	it("basicMoves comes from basic category moves", () => {
		const move = { name: "Defy Danger" };
		const cats = [makeCategory("basic", "Basic Moves", [move])];
		const result = makeMoves().buildMovelist(cats, [], null);
		expect(result.basicMoves).toEqual([move]);
	});

	it("otherGroups is built from non-basic/playbook/post-death categories", () => {
		const cats = [makeCategory("special", "Special Moves", [{ name: "Power" }])];
		const result = makeMoves().buildMovelist(cats, [], null);
		expect(result.otherGroups).toHaveLength(1);
		expect(result.otherGroups[0]).toBeInstanceOf(MoveGroupSnapshot);
		expect(result.otherGroups[0].key).toBe("special");
	});

	it("postDeathGroup is null when no post-death category", () => {
		expect(makeMoves().buildMovelist([], [], "Revenant").postDeathGroup).toBeNull();
	});

	it("postDeathGroup is null when pdiLabel is null", () => {
		const cats = [makeCategory("post-death", "Post-Death Moves", [{ name: "Haunt" }])];
		expect(makeMoves().buildMovelist(cats, [], null).postDeathGroup).toBeNull();
	});

	it("postDeathGroup is set when post-death category and pdiLabel are both present", () => {
		const cats = [makeCategory("post-death", "Post-Death Moves", [{ name: "Haunt" }])];
		const result = makeMoves().buildMovelist(cats, [], "Revenant");
		expect(result.postDeathGroup).not.toBeNull();
		expect(result.postDeathGroup.label).toBe("Revenant");
		expect(result.postDeathGroup.moves[0].name).toBe("Haunt");
	});

	it("otherMoves is passed through from other param", () => {
		const other = [{ id: "x", name: "Other Thing" }];
		const result = makeMoves().buildMovelist([], other, null);
		expect(result.otherMoves).toEqual(other);
	});

	it("startingMovesNote comes from playbook category note", () => {
		const cats = [{ key: "playbook", title: "Moves", moves: [], note: "Choose 2." }];
		expect(makeMoves().buildMovelist(cats, [], null).startingMovesNote).toBe("Choose 2.");
	});
});

// ── buildMovelistContext ──────────────────────────────────────────────────────

describe("CharacterMoves.buildMovelistContext", () => {
	const moves = makeMoves();

	it("returns empty array for empty entries", () => {
		expect(moves.buildMovelistContext([], new Map(), new Set(), 1)).toHaveLength(0);
	});

	it("unowned move with no lock: owned=false, locked=false", () => {
		const [m] = moves.buildMovelistContext([makeEntry()], new Map(), new Set(), 1);
		expect(m.owned).toBe(false);
		expect(m.locked).toBe(false);
		expect(m.ownedId).toBeNull();
	});

	it("owned move: owned=true, ownedId set", () => {
		const entry = makeEntry({ name: "Bulwark" });
		const owned = { _id: "item-xyz" };
		const [m] = moves.buildMovelistContext([entry], new Map([["Bulwark", [owned]]]), new Set(), 1);
		expect(m.owned).toBe(true);
		expect(m.ownedId).toBe("item-xyz");
	});

	it("isStartingMove: isStarting=true, source=Starting, locked=false", () => {
		const [m] = moves.buildMovelistContext([makeEntry({ isStartingMove: true })], new Map(), new Set(), 1);
		expect(m.isStarting).toBe(true);
		expect(m.source).toBe("Starting");
		expect(m.locked).toBe(false);
	});

	it("background move name in bgMoveNames: isStarting=true, source=Background", () => {
		const entry = makeEntry({ name: "Trackless Step" });
		const [m] = moves.buildMovelistContext([entry], new Map(), new Set(["Trackless Step"]), 1);
		expect(m.isStarting).toBe(true);
		expect(m.source).toBe("Background");
		expect(m.locked).toBe(false);
	});

	it("regular move: isStarting=false, source=null", () => {
		const [m] = moves.buildMovelistContext([makeEntry({})], new Map(), new Set(), 1);
		expect(m.isStarting).toBe(false);
		expect(m.source).toBeNull();
	});

	it("requires a move not owned: locked=true", () => {
		const entry = makeEntry({ requirement: { moves: ["Glorious Servant"] } });
		const [m] = moves.buildMovelistContext([entry], new Map(), new Set(), 1);
		expect(m.locked).toBe(true);
	});

	it("requires a move that IS owned: locked=false", () => {
		const entry = makeEntry({ requirement: { moves: ["Glorious Servant"] } });
		const ownedBy = new Map([["Glorious Servant", [{ _id: "gs-id" }]]]);
		const [m] = moves.buildMovelistContext([entry], ownedBy, new Set(), 1);
		expect(m.locked).toBe(false);
	});

	it("minLevel above actor level: locked=true", () => {
		const entry = makeEntry({ requirement: { level: 6 } });
		const [m] = moves.buildMovelistContext([entry], new Map(), new Set(), 1);
		expect(m.locked).toBe(true);
	});

	it("minLevel at or below actor level: locked=false", () => {
		const entry = makeEntry({ requirement: { level: 3 } });
		const [m] = moves.buildMovelistContext([entry], new Map(), new Set(), 3);
		expect(m.locked).toBe(false);
	});

	it("rollType passes through", () => {
		const [m] = moves.buildMovelistContext([makeEntry({ rollType: "con" })], new Map(), new Set(), 1);
		expect(m.rollType).toBe("con");
	});

	it("starting move with requires is NOT locked (isStarting overrides)", () => {
		const entry = makeEntry({ isStartingMove: true, requirement: { moves: ["Some Move"] } });
		const [m] = moves.buildMovelistContext([entry], new Map(), new Set(), 1);
		expect(m.isStarting).toBe(true);
		expect(m.locked).toBe(false);
	});

	it("requires playbook not matching: locked=true", () => {
		const entry = makeEntry({ requirement: { playbook: "The Blessed" } });
		const [m] = moves.buildMovelistContext([entry], new Map(), new Set(), 1, "The Fox");
		expect(m.locked).toBe(true);
	});

	it("requires playbook matching actor: locked=false", () => {
		const entry = makeEntry({ requirement: { playbook: "The Blessed" } });
		const [m] = moves.buildMovelistContext([entry], new Map(), new Set(), 1, "The Blessed");
		expect(m.locked).toBe(false);
	});

	it("requiresLabel joins multiple moves", () => {
		const entry = makeEntry({ requirement: { moves: ["Move A", "Move B"] } });
		const [m] = moves.buildMovelistContext([entry], new Map(), new Set(), 1);
		expect(m.requiresLabel).toBe("Move A, Move B");
	});

	it("requiresPlaybook set from requirement.playbook", () => {
		const entry = makeEntry({ requirement: { playbook: "The Blessed" } });
		const [m] = moves.buildMovelistContext([entry], new Map(), new Set(), 1, "The Blessed");
		expect(m.requiresPlaybook).toBe("The Blessed");
	});
});

// ── sortPlaybookMoves ─────────────────────────────────────────────────────────

function mv(name, { requires = null, minLevel = null } = {}) { return { name, requires, minLevel }; }
function names(ms) { return ms.map(m => m.name); }

describe("CharacterMoves.sortPlaybookMoves", () => {
	const moves = makeMoves();

	it("returns empty array for empty input", () => {
		expect(moves.sortPlaybookMoves([])).toEqual([]);
	});

	it("single move with no requires is returned as-is", () => {
		expect(names(moves.sortPlaybookMoves([mv("Alpha")]))).toEqual(["Alpha"]);
	});

	it("multiple independent moves are sorted alphabetically", () => {
		expect(names(moves.sortPlaybookMoves([mv("Charlie"), mv("Alpha"), mv("Bravo")]))).toEqual(["Alpha", "Bravo", "Charlie"]);
	});

	it("a move that requires another follows it immediately", () => {
		const result = names(moves.sortPlaybookMoves([mv("Child", { requires: "Parent" }), mv("Parent"), mv("Alpha")]));
		expect(result).toEqual(["Alpha", "Parent", "Child"]);
	});

	it("multiple moves requiring the same parent are sorted alphabetically after it", () => {
		const ms = [mv("Zeta", { requires: "Parent" }), mv("Alpha", { requires: "Parent" }), mv("Parent"), mv("Root")];
		expect(names(moves.sortPlaybookMoves(ms))).toEqual(["Parent", "Alpha", "Zeta", "Root"]);
	});

	it("chains: grandchild follows child follows parent", () => {
		const ms = [mv("Grandchild", { requires: "Child" }), mv("Child", { requires: "Parent" }), mv("Parent")];
		expect(names(moves.sortPlaybookMoves(ms))).toEqual(["Parent", "Child", "Grandchild"]);
	});

	it("root moves stay alphabetical while dependents follow their parents", () => {
		const ms = [
			mv("Zeal"), mv("Zeal-Child", { requires: "Zeal" }),
			mv("Armor"), mv("Armor-Child-B", { requires: "Armor" }), mv("Armor-Child-A", { requires: "Armor" }),
		];
		expect(names(moves.sortPlaybookMoves(ms))).toEqual(["Armor", "Armor-Child-A", "Armor-Child-B", "Zeal", "Zeal-Child"]);
	});

	it("move requiring a non-existent parent is treated as a root", () => {
		expect(names(moves.sortPlaybookMoves([mv("Orphan", { requires: "Missing Parent" }), mv("Alpha")]))).toEqual(["Alpha", "Orphan"]);
	});

	it("circular dependency does not infinite-loop", () => {
		const ms = [mv("A", { requires: "B" }), mv("B", { requires: "A" })];
		expect(() => moves.sortPlaybookMoves(ms)).not.toThrow();
		expect(moves.sortPlaybookMoves(ms)).toHaveLength(2);
	});

	it("level-6 moves come after all level-0 moves", () => {
		expect(names(moves.sortPlaybookMoves([mv("Bravo", { minLevel: 6 }), mv("Alpha"), mv("Charlie", { minLevel: 6 })]))).toEqual(["Alpha", "Bravo", "Charlie"]);
	});

	it("level groups are sorted ascending: 0, 2, 6", () => {
		expect(names(moves.sortPlaybookMoves([mv("L6", { minLevel: 6 }), mv("L2", { minLevel: 2 }), mv("L0")]))).toEqual(["L0", "L2", "L6"]);
	});

	it("within a level group, dependency chaining still applies", () => {
		const ms = [mv("Child", { minLevel: 6, requires: "Parent" }), mv("Parent", { minLevel: 6 }), mv("Alpha", { minLevel: 6 })];
		expect(names(moves.sortPlaybookMoves(ms))).toEqual(["Alpha", "Parent", "Child"]);
	});

	it("cross-level dependency is ignored: level-6 move requiring level-0 move stays in level-6 group", () => {
		const ms = [mv("Root"), mv("Lv6-Child", { minLevel: 6, requires: "Root" }), mv("Alpha")];
		expect(names(moves.sortPlaybookMoves(ms))).toEqual(["Alpha", "Root", "Lv6-Child"]);
	});
});

// ── buildOwnedMovesMap ────────────────────────────────────────────────────────

describe("CharacterMoves.buildOwnedMovesMap", () => {
	it("returns empty Map when actor has no items", () => {
		expect(makeMoves().buildOwnedMovesMap().size).toBe(0);
	});

	it("returns empty Map when actor has no move-type items", () => {
		const actor = makeActor([{ _id: "e1", type: "equipment", name: "Sword" }]);
		expect(makeMoves(new FakeMoveRepository(), makeResources(), actor).buildOwnedMovesMap().size).toBe(0);
	});

	it("maps a single move name to an array containing that item", () => {
		const actor = makeActor([{ _id: "m1", type: "move", name: "Bulwark" }]);
		const map = makeMoves(new FakeMoveRepository(), makeResources(), actor).buildOwnedMovesMap();
		expect(map.get("Bulwark")).toHaveLength(1);
		expect(map.get("Bulwark")[0]._id).toBe("m1");
	});

	it("groups multiple instances of the same move name together", () => {
		const actor = makeActor([
			{ _id: "m1", type: "move", name: "Bulwark" },
			{ _id: "m2", type: "move", name: "Bulwark" },
		]);
		const map = makeMoves(new FakeMoveRepository(), makeResources(), actor).buildOwnedMovesMap();
		expect(map.get("Bulwark")).toHaveLength(2);
	});

	it("tracks different move names as separate keys", () => {
		const actor = makeActor([
			{ _id: "m1", type: "move", name: "Alpha" },
			{ _id: "m2", type: "move", name: "Beta" },
		]);
		const map = makeMoves(new FakeMoveRepository(), makeResources(), actor).buildOwnedMovesMap();
		expect(map.size).toBe(2);
	});
});

// ── addMove / removeMove ──────────────────────────────────────────────────────

describe("CharacterMoves.addMove", () => {
	it("creates an embedded document from the compendium move", async () => {
		const moveDoc = { _id: "m1", name: "Bulwark", toObject: () => ({ name: "Bulwark", type: "move" }) };
		const repo = new FakeMoveRepository([moveDoc], []);
		const actor = makeActor();
		await makeMoves(repo, makeResources(), actor).addMove("m1");
		expect(actor.createEmbeddedDocuments).toHaveBeenCalledWith("Item", [{ name: "Bulwark", type: "move" }]);
	});

	it("does nothing when the compendium move is not found", async () => {
		const actor = makeActor();
		await makeMoves(new FakeMoveRepository(), makeResources(), actor).addMove("nonexistent");
		expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
	});
});

describe("CharacterMoves.removeMove", () => {
	it("deletes the embedded document by id", async () => {
		const actor = makeActor();
		await makeMoves(new FakeMoveRepository(), makeResources(), actor).removeMove("item-1");
		expect(actor.deleteEmbeddedDocuments).toHaveBeenCalledWith("Item", ["item-1"]);
	});

	it("does nothing when ownedId is null", async () => {
		const actor = makeActor();
		await makeMoves(new FakeMoveRepository(), makeResources(), actor).removeMove(null);
		expect(actor.deleteEmbeddedDocuments).not.toHaveBeenCalled();
	});
});

// ── ensureStartingMoves ───────────────────────────────────────────────────────

const SIMPLE_PLAYBOOK = {
	slug: "the-blessed",
	name: "The Blessed",
	backgrounds: [{ slug: "initiate", moves: ["Rites of the Land"] }],
};

function makeMoveEntry(name, isStartingMove, id) {
	return { _id: id, name, system: { isStartingMove, playbook: "The Blessed" }, toObject: () => ({ name }) };
}

describe("CharacterMoves.ensureStartingMoves", () => {
	it("does nothing when playbookData is null", async () => {
		const actor = makeActor();
		await makeMoves(new FakeMoveRepository(), makeResources(), actor).ensureStartingMoves(null, null);
		expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
	});

	it("adds missing starting moves", async () => {
		const actor = makeActor();
		const repo = new FakeMoveRepository([makeMoveEntry("Rites of the Land", true, "id1")], []);
		await makeMoves(repo, makeResources(), actor).ensureStartingMoves(SIMPLE_PLAYBOOK, null);
		expect(actor.createEmbeddedDocuments).toHaveBeenCalledWith("Item", [{ name: "Rites of the Land" }]);
	});

	it("does not add moves the actor already owns", async () => {
		const actor = makeActor([{ _id: "own1", type: "move", name: "Rites of the Land" }]);
		const repo = new FakeMoveRepository([makeMoveEntry("Rites of the Land", true, "id1")], []);
		await makeMoves(repo, makeResources(), actor).ensureStartingMoves(SIMPLE_PLAYBOOK, null);
		expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
	});

	it("adds background-specific moves based on bgSelectedSlug", async () => {
		const actor = makeActor();
		const repo = new FakeMoveRepository([makeMoveEntry("Rites of the Land", false, "id1")], []);
		await makeMoves(repo, makeResources(), actor).ensureStartingMoves(SIMPLE_PLAYBOOK, "initiate");
		expect(actor.createEmbeddedDocuments).toHaveBeenCalledWith("Item", [{ name: "Rites of the Land" }]);
	});
});

// ── onDropMove ────────────────────────────────────────────────────────────────

describe("CharacterMoves.onDropMove", () => {
	it("returns false when a move with the same name is already owned", async () => {
		const actor = makeActor([{ type: "move", name: "Barkskin" }], "The Blessed");
		const result = await makeMoves(new FakeMoveRepository(), makeResources(), actor)
			.onDropMove({ name: "Barkskin", type: "move", system: { moveType: "playbook", playbook: "The Blessed" } });
		expect(result).toBe(false);
		expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
	});

	it("returns true and creates a same-playbook move as-is", async () => {
		const actor = makeActor([], "The Blessed");
		const itemData = { name: "Barkskin", type: "move", system: { moveType: "playbook", playbook: "The Blessed" } };
		const result = await makeMoves(new FakeMoveRepository(), makeResources(), actor).onDropMove(itemData);
		expect(result).toBe(true);
		expect(actor.createEmbeddedDocuments).toHaveBeenCalledWith("Item", [
			expect.objectContaining({ system: expect.objectContaining({ moveType: "playbook" }) }),
		]);
	});

	it("returns true and changes moveType to 'other' for cross-playbook moves", async () => {
		const actor = makeActor([], "The Fox");
		const itemData = { name: "Barkskin", type: "move", system: { moveType: "playbook", playbook: "The Blessed" } };
		const result = await makeMoves(new FakeMoveRepository(), makeResources(), actor).onDropMove(itemData);
		expect(result).toBe(true);
		expect(actor.createEmbeddedDocuments).toHaveBeenCalledWith("Item", [
			expect.objectContaining({ system: expect.objectContaining({ moveType: "other" }) }),
		]);
	});

	it("returns true and creates other-moveType moves without changing moveType", async () => {
		const actor = makeActor([], "The Fox");
		const itemData = { name: "Some Follower Move", type: "move", system: { moveType: "follower", playbook: null } };
		const result = await makeMoves(new FakeMoveRepository(), makeResources(), actor).onDropMove(itemData);
		expect(result).toBe(true);
		expect(actor.createEmbeddedDocuments).toHaveBeenCalledWith("Item", [
			expect.objectContaining({ system: expect.objectContaining({ moveType: "follower" }) }),
		]);
	});
});
