import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { FoundryOutfitItemRepository } from "../../../../module/actors/character/repositories/FoundryOutfitItemRepository.js";
import { resetPackIndexFields } from "../../../../module/utils/pack-index.js";
import { indexingPack } from "../../../fakes/indexing-pack.js";

// -- Helpers ------------------------------------------------------------------

function makeEntry(slug, flags = {}) {
	return {
		_id: `id-${slug}`,
		name: slug,
		system: { moveType: "inventory" },
		flags: { stonetop: { slug, inventoryColumn: "regular", sortOrder: 1, weight: 1, ...flags } },
	};
}

function makePack(entries = []) {
	return {
		getIndex: vi.fn(async () => {}),
		index: entries,
	};
}

function stubGame(pack) {
	vi.stubGlobal("game", { packs: { get: () => pack } });
}

function stubGameNoPack() {
	vi.stubGlobal("game", { packs: { get: () => null } });
}

// -- Tests --------------------------------------------------------------------

describe("FoundryOutfitItemRepository", () => {
	// The fields asked of a pack are a union remembered across the session (utils/pack-index.js);
	// start each test from none, or one inherits the previous one's and a missing field hides.
	beforeEach(() => resetPackIndexFields());
	afterEach(() => vi.unstubAllGlobals());

	it("returns [] when the pack is missing", async () => {
		stubGameNoPack();
		const repo = new FoundryOutfitItemRepository();
		expect(await repo.getAll()).toEqual([]);
	});

	it("defaults item.armor to null when flag is absent", async () => {
		stubGame(makePack([makeEntry("cloak")]));
		const repo = new FoundryOutfitItemRepository();
		const items = await repo.getAll();
		expect(items[0].armor).toBeNull();
	});

	it("maps flags.stonetop.armor to item.armor for a base value", async () => {
		stubGame(makePack([makeEntry("thick-hides", { armor: { base: 1 } })]));
		const repo = new FoundryOutfitItemRepository();
		const items = await repo.getAll();
		expect(items[0].armor).toEqual({ base: 1 });
	});

	it("maps flags.stonetop.armor to item.armor for a modifier value", async () => {
		stubGame(makePack([makeEntry("shield", { armor: { modifier: 1 } })]));
		const repo = new FoundryOutfitItemRepository();
		const items = await repo.getAll();
		expect(items[0].armor).toEqual({ modifier: 1 });
	});

	// A live pack's index carries only the fields asked for, and so does indexingPack, so a flag
	// getAll reads but never requests comes back as its default here as it does in a world. The
	// catalog shield's `shield` flag was such a field: Armored never lightened it. Every flag the
	// mapper reads is set to a non-default value, so a new one left out of FIELDS fails here.
	it("requests every flag it reads", async () => {
		const resource = { max: 2, title: "uses", labels: ["low", "out"] };
		stubGame(indexingPack([makeEntry("shield", {
			weight: 2, note: "+1 armor", inventoryColumn: "small", resource, resourceFirst: true,
			prosperityResource: true, twoCol: true, smallGrid: true, breakBefore: true,
			armor: { modifier: 1 }, shield: true, special: true, specialCategory: "Armor",
		})]));
		const [shield] = await new FoundryOutfitItemRepository().getAll();
		expect(shield).toMatchObject({
			slug: "shield", weight: 2, note: "+1 armor", inventoryColumn: "small", resource,
			resourceFirst: true, prosperityResource: true, twoCol: true, smallGrid: true,
			breakBefore: true, armor: { modifier: 1 }, shield: true, special: true, specialCategory: "Armor",
		});
	});

	it("leaves a treasure out, which it can only tell by a requested flag", async () => {
		stubGame(indexingPack([makeEntry("cloak"), makeEntry("crown", { isTreasure: true })]));
		const items = await new FoundryOutfitItemRepository().getAll();
		expect(items.map(i => i.slug)).toEqual(["cloak"]);
	});

	it("caches results — getIndex is not called a second time", async () => {
		const pack = makePack([makeEntry("cloak")]);
		stubGame(pack);
		const repo = new FoundryOutfitItemRepository();
		await repo.getAll();
		await repo.getAll();
		expect(pack.getIndex).toHaveBeenCalledTimes(1);
	});
});
