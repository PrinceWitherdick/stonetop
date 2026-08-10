import { describe, it, expect, vi, afterEach } from "vitest";
import { FoundryPostDeathInsertRepository } from "../../../../module/actors/character/repositories/FoundryPostDeathInsertRepository.js";
import { PostDeathInsertData } from "../../../../module/model/PostDeathInsertData.js";

// -- Fixtures -----------------------------------------------------------------

const INSERT_DOC = {
	name:   "Revenant",
	img:    "icons/svg/skull.svg",
	system: { slug: "revenant", description: "<p>When you die...</p>" },
	flags:  { stonetop: { instincts: [{ word: "Denial" }], lore: [] } },
};

const OTHER_DOC = {
	name:   "Ghost",
	img:    null,
	system: { slug: "ghost", description: "<p>When your soul lingers...</p>" },
	flags:  { stonetop: { instincts: [], lore: [] } },
};

// -- Helpers ------------------------------------------------------------------

function makePack(entries = [], docsBySlug = {}) {
	return {
		getIndex:    vi.fn(async () => {}),
		index:       entries,
		getDocument: vi.fn(async (id) => {
			const entry = entries.find(e => e._id === id);
			const slug  = entry?.system?.slug;
			return docsBySlug[slug] ?? null;
		}),
	};
}

function stubGame(pack) {
	vi.stubGlobal("game", { packs: { get: () => pack } });
}

function stubGameNoPack() {
	vi.stubGlobal("game", { packs: { get: () => null } });
}

// -- Tests --------------------------------------------------------------------

describe("FoundryPostDeathInsertRepository", () => {
	afterEach(() => vi.unstubAllGlobals());

	describe("getAll", () => {
		it("returns [] when pack not registered", async () => {
			stubGameNoPack();
			const repo = new FoundryPostDeathInsertRepository();
			expect(await repo.getAll()).toEqual([]);
		});

		it("returns the sigil and the book's trigger alongside each of the book's inserts", async () => {
			const pack = makePack(
				[
					{
						_id: "pDiRevenant00001", name: "Revenant", img: "icons/revenant.svg",
						system: { slug: "revenant", description: "<p>When you die but cling...</p>" },
					},
					{
						_id: "pDiGhost0000001", name: "Ghost", img: "icons/ghost.svg",
						system: { slug: "ghost", description: "<p>When you die but your soul lingers...</p>" },
					},
				],
				{},
			);
			stubGame(pack);
			const repo    = new FoundryPostDeathInsertRepository();
			const results = await repo.getAll();
			expect(results).toEqual([
				{ slug: "revenant", name: "Revenant", img: "icons/revenant.svg", description: "<p>When you die but cling...</p>" },
				{ slug: "ghost",    name: "Ghost",    img: "icons/ghost.svg",    description: "<p>When you die but your soul lingers...</p>" },
			]);
		});

		it("indexes the description so the sheet needn't load three documents to blurb them", async () => {
			const pack = makePack([], {});
			stubGame(pack);
			await new FoundryPostDeathInsertRepository().getAll();
			expect(pack.getIndex).toHaveBeenCalledWith({ fields: ["system.slug", "system.description"] });
		});

		it("nulls a missing sigil or trigger rather than printing undefined", async () => {
			const pack = makePack([{ _id: "pDiThrall000001", name: "Thrall", system: { slug: "thrall" } }], {});
			stubGame(pack);
			const results = await new FoundryPostDeathInsertRepository().getAll();
			expect(results).toEqual([{ slug: "thrall", name: "Thrall", img: null, description: null }]);
		});

		// The inserts share a compendium with every move, item and treasure in the system, and
		// share their document shape with the playbooks. Only the book's three are fates.
		it("ignores everything in the pack that is not one of the book's inserts", async () => {
			const pack = makePack(
				[
					{ _id: "playbookBlessed01", name: "The Blessed", system: { slug: "the-blessed" } },
					{ _id: "pDiRevenant00001",  name: "Revenant",    system: { slug: "revenant" } },
					{ _id: "treasureMenhirs01", name: "A few menhirs atop a high place", system: { moveType: "inventory" } },
					{ _id: "moveCallSpirits1",  name: "Call the Spirits", system: {} },
				],
				{},
			);
			stubGame(pack);
			const repo = new FoundryPostDeathInsertRepository();
			expect((await repo.getAll()).map(i => i.slug)).toEqual(["revenant"]);
		});

		it("lists them in the book's order, not the pack's", async () => {
			const pack = makePack(
				[
					{ _id: "pDiThrall000001",   name: "Thrall",   system: { slug: "thrall" } },
					{ _id: "pDiGhost0000001",   name: "Ghost",    system: { slug: "ghost" } },
					{ _id: "pDiRevenant00001",  name: "Revenant", system: { slug: "revenant" } },
				],
				{},
			);
			stubGame(pack);
			const repo = new FoundryPostDeathInsertRepository();
			expect((await repo.getAll()).map(i => i.slug)).toEqual(["revenant", "ghost", "thrall"]);
		});
	});

	describe("findBySlug", () => {
		it("returns null when pack is not registered", async () => {
			stubGameNoPack();
			const repo = new FoundryPostDeathInsertRepository();
			expect(await repo.findBySlug("revenant")).toBeNull();
		});

		it("returns null when slug is not in index", async () => {
			stubGame(makePack([], {}));
			const repo = new FoundryPostDeathInsertRepository();
			expect(await repo.findBySlug("revenant")).toBeNull();
		});

		it("returns a PostDeathInsertData when slug is found", async () => {
			const pack = makePack(
				[{ _id: "pDiRevenant00001", system: { slug: "revenant" } }],
				{ revenant: INSERT_DOC },
			);
			stubGame(pack);
			const repo   = new FoundryPostDeathInsertRepository();
			const result = await repo.findBySlug("revenant");
			expect(result).toBeInstanceOf(PostDeathInsertData);
			expect(result.slug).toBe("revenant");
			expect(result.name).toBe("Revenant");
			expect(result.instincts).toHaveLength(1);
		});

		it("calls getIndex with the slug and description fields", async () => {
			const pack = makePack([], {});
			stubGame(pack);
			const repo = new FoundryPostDeathInsertRepository();
			await repo.findBySlug("revenant");
			expect(pack.getIndex).toHaveBeenCalledWith({ fields: ["system.slug", "system.description"] });
		});

		it("caches result — getDocument not called a second time", async () => {
			const pack = makePack(
				[{ _id: "pDiRevenant00001", system: { slug: "revenant" } }],
				{ revenant: INSERT_DOC },
			);
			stubGame(pack);
			const repo = new FoundryPostDeathInsertRepository();
			await repo.findBySlug("revenant");
			await repo.findBySlug("revenant");
			expect(pack.getDocument).toHaveBeenCalledTimes(1);
		});

		it("does not return a different slug's data", async () => {
			const pack = makePack(
				[
					{ _id: "pDiRevenant00001", system: { slug: "revenant" } },
					{ _id: "pDiGhost0000001", system: { slug: "ghost" } },
				],
				{ revenant: INSERT_DOC, ghost: OTHER_DOC },
			);
			stubGame(pack);
			const repo   = new FoundryPostDeathInsertRepository();
			const result = await repo.findBySlug("ghost");
			expect(result.slug).toBe("ghost");
			expect(result.name).toBe("Ghost");
		});
	});
});
