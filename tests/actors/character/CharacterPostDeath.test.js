import { describe, it, expect, vi } from "vitest";
import { CharacterPostDeath } from "../../../module/actors/character/CharacterPostDeath.js";
import { CharacterInstincts } from "../../../module/actors/character/CharacterInstincts.js";
import { CharacterLore } from "../../../module/actors/character/CharacterLore.js";

function makeFlags(store = {}) {
	return {
		getFlag: (key) => store[key] ?? null,
		setFlag: vi.fn(async (key, val) => { store[key] = val; }),
	};
}

function makeActor(items = []) {
	return {
		items,
		createEmbeddedDocuments: vi.fn(async () => []),
		deleteEmbeddedDocuments: vi.fn(async () => []),
	};
}

function makeMoveRepo(moves = []) {
	return { getPostDeathMoves: vi.fn(async () => moves) };
}

function makePostDeath(actor = makeActor(), moveRepo = makeMoveRepo()) {
	return new CharacterPostDeath(
		makeFlags(),
		new CharacterInstincts(makeFlags()),
		new CharacterLore(makeFlags()),
		null,
		moveRepo,
		actor,
	);
}

describe("CharacterPostDeath", () => {
	it("activeSlug returns null when unset", () => {
		const pd = new CharacterPostDeath(makeFlags(), new CharacterInstincts(makeFlags()), new CharacterLore(makeFlags()));
		expect(pd.activeSlug).toBeNull();
	});

	it("setActiveSlug stores slug and activeSlug returns it", async () => {
		const flags = makeFlags();
		const pd = new CharacterPostDeath(flags, new CharacterInstincts(makeFlags()), new CharacterLore(makeFlags()));
		await pd.setActiveSlug("revenant");
		expect(flags.setFlag).toHaveBeenCalledWith("slug", "revenant");
		expect(pd.activeSlug).toBe("revenant");
	});

	it("instinct returns the CharacterInstincts instance", () => {
		const instinct = new CharacterInstincts(makeFlags());
		const pd = new CharacterPostDeath(makeFlags(), instinct, new CharacterLore(makeFlags()));
		expect(pd.instinct).toBe(instinct);
	});

	it("lore returns the CharacterLore instance", () => {
		const lore = new CharacterLore(makeFlags());
		const pd = new CharacterPostDeath(makeFlags(), new CharacterInstincts(makeFlags()), lore);
		expect(pd.lore).toBe(lore);
	});
});

describe("CharacterPostDeath.setInsert", () => {
	it("removes existing post-death items and clears slug when called with null", async () => {
		const existing = [
			{ _id: "m1", type: "move", system: { moveType: "post-death" } },
			{ _id: "m2", type: "move", system: { moveType: "post-death" } },
		];
		const actor = makeActor(existing);
		const pd = makePostDeath(actor);
		await pd.setInsert(null);
		expect(actor.deleteEmbeddedDocuments).toHaveBeenCalledWith("Item", ["m1", "m2"]);
		expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
		expect(pd.activeSlug).toBeNull();
	});

	it("skips deleteEmbeddedDocuments when no existing post-death items", async () => {
		const actor = makeActor([{ _id: "x1", type: "move", system: { moveType: "playbook" } }]);
		const moveRepo = makeMoveRepo([{ name: "Haunt", rollType: "str", description: "desc" }]);
		const pd = makePostDeath(actor, moveRepo);
		await pd.setInsert("revenant");
		expect(actor.deleteEmbeddedDocuments).not.toHaveBeenCalled();
	});

	it("removes old post-death items and creates new ones when switching insert", async () => {
		const existing = [{ _id: "old1", type: "move", system: { moveType: "post-death" } }];
		const actor = makeActor(existing);
		const moveRepo = makeMoveRepo([{ name: "Haunt", rollType: "wis", description: "A ghost lingers." }]);
		const pd = makePostDeath(actor, moveRepo);
		await pd.setInsert("revenant");
		expect(actor.deleteEmbeddedDocuments).toHaveBeenCalledWith("Item", ["old1"]);
		expect(actor.createEmbeddedDocuments).toHaveBeenCalledWith("Item", [
			{ name: "Haunt", type: "move", system: { moveType: "post-death", rollType: "wis", description: "A ghost lingers." } },
		]);
	});

	it("creates items with correct shape including fallback for missing rollType and description", async () => {
		const actor = makeActor();
		const moveRepo = makeMoveRepo([{ name: "Fade", rollType: null, description: null }]);
		const pd = makePostDeath(actor, moveRepo);
		await pd.setInsert("shade");
		expect(actor.createEmbeddedDocuments).toHaveBeenCalledWith("Item", [
			{ name: "Fade", type: "move", system: { moveType: "post-death", rollType: "", description: "" } },
		]);
	});

	it("sets the active slug after a successful insert", async () => {
		const actor = makeActor();
		const pd = makePostDeath(actor, makeMoveRepo([{ name: "Haunt", rollType: "", description: "" }]));
		await pd.setInsert("revenant");
		expect(pd.activeSlug).toBe("revenant");
	});
});
