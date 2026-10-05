import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { FoundryMoveRepository, MOVE_DEFINITION_FIELDS } from "../../../../module/actors/character/repositories/FoundryMoveRepository.js";
import { resetPackIndexFields } from "../../../../module/utils/pack-index.js";
import { MoveDefinition } from "../../../../module/model/MoveDefinition.js";
import { indexingPack } from "../../../fakes/indexing-pack.js";

// -- Fixtures ------------------------------------------------------------------

const PLAYBOOK_MOVE_A = { _id: "pb001", name: "Serenity", system: { moveType: "playbook", playbook: "The Blessed", rollType: "stat", isStartingMove: true } };
const PLAYBOOK_MOVE_B = { _id: "pb002", name: "Invoke the Gods", system: { moveType: "playbook", playbook: "The Blessed", rollType: "stat", isStartingMove: false } };
const OTHER_MOVE      = { _id: "pb003", name: "Read the Winds", system: { moveType: "playbook", playbook: "The Marshal", rollType: "stat", isStartingMove: true } };
const BASIC_MOVE_A    = { _id: "bm001", name: "Defy Danger", system: { moveType: "basic", rollType: "stat" } };
const BASIC_MOVE_B    = { _id: "bm002", name: "Aid or Interfere", system: { moveType: "basic", rollType: "stat" } };

// -- Helpers -------------------------------------------------------------------

function makePlaybookPack(entries = []) {
	return {
		getIndex: vi.fn(async () => {}),
		index: entries,
		getDocument: vi.fn(async (id) => entries.find(e => e._id === id) ?? null),
	};
}

function makeBasicPack(entries = []) {
	return {
		getIndex: vi.fn(async () => {}),
		index: entries,
		getDocument: vi.fn(async (id) => entries.find(e => e._id === id) ?? null),
	};
}

const POST_DEATH_MOVE_A = { _id: "pd001", name: "Unliving",   system: { moveType: "post-death", playbook: "revenant", rollType: null } };
const POST_DEATH_MOVE_B = { _id: "pd002", name: "Undying",    system: { moveType: "post-death", playbook: "revenant", rollType: "con" } };
const OTHER_INSERT_MOVE = { _id: "pd003", name: "Disembodied", system: { moveType: "post-death", playbook: "ghost",   rollType: null } };

function makePostDeathPack(entries = []) {
	return {
		getIndex:    vi.fn(async () => {}),
		index:       entries,
		getDocument: vi.fn(async (id) => entries.find(e => e._id === id) ?? null),
	};
}

function stubGame(playbookPack, basicPack, postDeathPack = null) {
	vi.stubGlobal("game", {
		packs: {
			get: (name) => {
				if (name === "stonetop_pwd.stonetop-items") return playbookPack ?? basicPack ?? postDeathPack;
				return null;
			},
		},
	});
}

function stubGameNoPacks() {
	vi.stubGlobal("game", { packs: { get: () => null } });
}

// -- Tests ---------------------------------------------------------------------

describe("FoundryMoveRepository", () => {
	// The index fields asked of a pack are remembered per pack across the session (the union is
	// what keeps one store's narrower list from un-indexing another's — see utils/pack-index.js),
	// so each test starts from an empty registry or it would inherit the previous one's fields.
	beforeEach(() => resetPackIndexFields());
	afterEach(() => vi.unstubAllGlobals());

	describe("getPlaybookMoves", () => {
		it("returns [] when pack is not registered", async () => {
			stubGameNoPacks();
			const repo = new FoundryMoveRepository();
			expect(await repo.getPlaybookMoves("The Blessed")).toEqual([]);
		});

		it("returns MoveDefinition instances matching playbookName", async () => {
			stubGame(makePlaybookPack([PLAYBOOK_MOVE_A, PLAYBOOK_MOVE_B, OTHER_MOVE]), null);
			const repo = new FoundryMoveRepository();
			const moves = await repo.getPlaybookMoves("The Blessed");
			expect(moves).toHaveLength(2);
			expect(moves[0]).toBeInstanceOf(MoveDefinition);
			expect(moves.map(m => m.id)).toEqual(["pb001", "pb002"]);
		});

		it("returns [] when no moves match playbookName", async () => {
			stubGame(makePlaybookPack([PLAYBOOK_MOVE_A]), null);
			const repo = new FoundryMoveRepository();
			expect(await repo.getPlaybookMoves("The Marshal")).toEqual([]);
		});

		it("calls getIndex with the correct fields", async () => {
			const pack = makePlaybookPack([]);
			stubGame(pack, null);
			const repo = new FoundryMoveRepository();
			await repo.getPlaybookMoves("The Blessed");
			expect(pack.getIndex).toHaveBeenCalledWith({ fields: [...MOVE_DEFINITION_FIELDS] });
		});

		it("caches result — getIndex not called a second time for same playbook", async () => {
			const pack = makePlaybookPack([PLAYBOOK_MOVE_A]);
			stubGame(pack, null);
			const repo = new FoundryMoveRepository();
			await repo.getPlaybookMoves("The Blessed");
			await repo.getPlaybookMoves("The Blessed");
			expect(pack.getIndex).toHaveBeenCalledTimes(1);
		});

		it("does not share cache across different playbook names", async () => {
			const pack = makePlaybookPack([PLAYBOOK_MOVE_A, OTHER_MOVE]);
			stubGame(pack, null);
			const repo = new FoundryMoveRepository();
			const blessed = await repo.getPlaybookMoves("The Blessed");
			const marshal = await repo.getPlaybookMoves("The Marshal");
			expect(blessed.map(m => m.id)).toEqual(["pb001"]);
			expect(marshal.map(m => m.id)).toEqual(["pb003"]);
		});
	});

	describe("getPlaybookMoveDocument", () => {
		it("returns null when pack is not registered", async () => {
			stubGameNoPacks();
			const repo = new FoundryMoveRepository();
			expect(await repo.getPlaybookMoveDocument("pb001")).toBeNull();
		});

		it("returns the document when found", async () => {
			const pack = makePlaybookPack([PLAYBOOK_MOVE_A]);
			stubGame(pack, null);
			const repo = new FoundryMoveRepository();
			const doc = await repo.getPlaybookMoveDocument("pb001");
			expect(doc).toEqual(PLAYBOOK_MOVE_A);
		});
	});

	describe("getBasicMoves", () => {
		it("returns [] when pack is not registered", async () => {
			stubGameNoPacks();
			const repo = new FoundryMoveRepository();
			expect(await repo.getBasicMoves()).toEqual([]);
		});

		it("returns MoveDefinition instances for all moves", async () => {
			stubGame(null, makeBasicPack([BASIC_MOVE_A, BASIC_MOVE_B]));
			const repo = new FoundryMoveRepository();
			const moves = await repo.getBasicMoves();
			expect(moves).toHaveLength(2);
			expect(moves[0]).toBeInstanceOf(MoveDefinition);
			expect(moves.map(m => m.id)).toEqual(["bm001", "bm002"]);
		});

		it("calls getIndex with the correct fields", async () => {
			const pack = makeBasicPack([]);
			stubGame(null, pack);
			const repo = new FoundryMoveRepository();
			await repo.getBasicMoves();
			expect(pack.getIndex).toHaveBeenCalledWith({ fields: [...MOVE_DEFINITION_FIELDS] });
		});

		it("caches result — getIndex not called a second time", async () => {
			const pack = makeBasicPack([BASIC_MOVE_A]);
			stubGame(null, pack);
			const repo = new FoundryMoveRepository();
			await repo.getBasicMoves();
			await repo.getBasicMoves();
			expect(pack.getIndex).toHaveBeenCalledTimes(1);
		});
	});

	describe("getBasicMoveDocument", () => {
		it("returns null when pack is not registered", async () => {
			stubGameNoPacks();
			const repo = new FoundryMoveRepository();
			expect(await repo.getBasicMoveDocument("bm001")).toBeNull();
		});

		it("returns the document when found", async () => {
			const pack = makeBasicPack([BASIC_MOVE_A]);
			stubGame(null, pack);
			const repo = new FoundryMoveRepository();
			const doc = await repo.getBasicMoveDocument("bm001");
			expect(doc).toEqual(BASIC_MOVE_A);
		});
	});

	describe("getPostDeathMoves", () => {
		it("returns [] when pack is not registered", async () => {
			stubGameNoPacks();
			const repo = new FoundryMoveRepository();
			expect(await repo.getPostDeathMoves("revenant")).toEqual([]);
		});

		it("returns MoveDefinition instances filtered by insertSlug", async () => {
			const pack = makePostDeathPack([POST_DEATH_MOVE_A, POST_DEATH_MOVE_B, OTHER_INSERT_MOVE]);
			stubGame(null, null, pack);
			const repo  = new FoundryMoveRepository();
			const moves = await repo.getPostDeathMoves("revenant");
			expect(moves).toHaveLength(2);
			expect(moves[0]).toBeInstanceOf(MoveDefinition);
			expect(moves.map(m => m.id)).toEqual(["pd001", "pd002"]);
		});

		it("returns [] when no moves match insertSlug", async () => {
			const pack = makePostDeathPack([POST_DEATH_MOVE_A]);
			stubGame(null, null, pack);
			const repo = new FoundryMoveRepository();
			expect(await repo.getPostDeathMoves("thrall")).toEqual([]);
		});

		it("calls getIndex with the correct fields", async () => {
			const pack = makePostDeathPack([]);
			stubGame(null, null, pack);
			const repo = new FoundryMoveRepository();
			await repo.getPostDeathMoves("revenant");
			expect(pack.getIndex).toHaveBeenCalledWith({ fields: [...MOVE_DEFINITION_FIELDS] });
		});

		it("caches result — getIndex not called a second time for same insertSlug", async () => {
			const pack = makePostDeathPack([POST_DEATH_MOVE_A]);
			stubGame(null, null, pack);
			const repo = new FoundryMoveRepository();
			await repo.getPostDeathMoves("revenant");
			await repo.getPostDeathMoves("revenant");
			expect(pack.getIndex).toHaveBeenCalledTimes(1);
		});
	});

	describe("getPostDeathMoveDocument", () => {
		it("returns null when pack is not registered", async () => {
			stubGameNoPacks();
			const repo = new FoundryMoveRepository();
			expect(await repo.getPostDeathMoveDocument("pd001")).toBeNull();
		});

		it("returns the document when found", async () => {
			const pack = makePostDeathPack([POST_DEATH_MOVE_A]);
			stubGame(null, null, pack);
			const repo = new FoundryMoveRepository();
			const doc  = await repo.getPostDeathMoveDocument("pd001");
			expect(doc).toEqual(POST_DEATH_MOVE_A);
		});
	});
	// Every reader through a pack that indexes ONLY the fields asked for, as a live one does. Each
	// entry sets every field MoveDefinition reads to a non-default value, so a field the shared list
	// leaves out comes back as its default here, the way it would in a world. The basic store once
	// asked for four fields, so an expedition move's track or requirement never reached the sheet.
	describe("index fields cover everything MoveDefinition reads", () => {
		const everyField = (id, name, moveType, playbook) => ({
			_id: id, name,
			system: {
				moveType, playbook, loreOption: "consequences:poltergeist", rollType: "str",
				description: "<p>text</p>", moveResults: { success: { label: "10+", value: "win" } },
				isStartingMove: true, requirement: "Requires level 2+", replaces: "Bulwark",
				repeatMax: 2, cap: 3, resource: { max: 3, title: "hold", labels: [] },
				hpBonus: 1, armorBonus: 1, loadBonus: 1, maxLoad: "normal", requiresUnarmored: true,
				markOptions: [{ label: "x", boxes: 1 }], markBudget: { base: 1, perExtra: 1 },
				crossPlaybook: { playbooks: ["The Fox"] },
			},
		});
		const expectAll = (move) => expect(move).toMatchObject({
			loreOption: "consequences:poltergeist", rollType: "str", description: "<p>text</p>",
			moveResults: { success: { label: "10+", value: "win" } }, isStarting: true,
			requirement: "Requires level 2+", replaces: "Bulwark", repeatMax: 2, cap: 3,
			resource: { max: 3, title: "hold" }, hpBonus: 1, armorBonus: 1, loadBonus: 1,
			maxLoad: "normal", requiresUnarmored: true, markOptions: [{ label: "x", boxes: 1 }],
			markBudget: { base: 1, perExtra: 1 }, crossPlaybook: { playbooks: ["The Fox"] },
		});

		it("playbook moves", async () => {
			stubGame(indexingPack([everyField("pb1", "Armored", "playbook", "The Marshal")]));
			const [move] = await new FoundryMoveRepository().getPlaybookMoves("The Marshal");
			expect(move.playbook).toBe("The Marshal");
			expectAll(move);
		});

		it("basic moves", async () => {
			stubGame(indexingPack([everyField("bm1", "Defy Danger", "basic", null)]));
			expectAll((await new FoundryMoveRepository().getBasicMoves())[0]);
		});

		it("expedition moves", async () => {
			stubGame(indexingPack([everyField("ex1", "Forage", "expedition", null)]));
			expectAll((await new FoundryMoveRepository().getExpeditionMoves())[0]);
		});

		it("post-death moves", async () => {
			stubGame(indexingPack([everyField("pd1", "Unliving", "post-death", "revenant")]));
			expectAll((await new FoundryMoveRepository().getPostDeathMoves("revenant"))[0]);
		});
	});
});
