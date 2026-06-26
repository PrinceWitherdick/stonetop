import { describe, it, expect } from "vitest";
import { TestCharacterBuilder } from "../../fakes/TestCharacterBuilder.js";
import { FakeActorBuilder } from "../../fakes/FakeActorBuilder.js";

// A playbook whose Apiary bundles two small + one ◇ regular item, plus a Mastiffs
// possession with no grantsItems (a follower — nothing to materialize).
const PLAYBOOK = {
	slug: "the-blessed",
	name: "The Blessed",
	specialPossessions: {
		options: [
			{
				slug: "apiary",
				label: "Apiary",
				grantsItems: [
					{ name: "Beeswax", column: "small" },
					{ name: "Honey", column: "small" },
					{ name: "Bee smokers", column: "regular", weight: 1 },
				],
			},
			{ slug: "mastiffs", label: "Mastiffs" },
		],
	},
};

function grantedItem(overrides = {}) {
	return {
		_id: overrides._id ?? "id-1",
		type: "move",
		name: overrides.name ?? "Beeswax",
		system: {
			moveType: "inventory-custom",
			inventoryColumn: overrides.inventoryColumn ?? "small",
			sourcePossession: overrides.sourcePossession ?? "apiary",
			sourceKey: overrides.sourceKey ?? overrides.name ?? "Beeswax",
		},
	};
}

function makeCharacter(items = []) {
	const actor = new FakeActorBuilder()
		.withPlaybook("the-blessed", "The Blessed")
		.withItems(items)
		.build();
	const character = new TestCharacterBuilder(actor).addPlaybook(PLAYBOOK).build();
	return { actor, character };
}

describe("StonetopCharacter — special possession item grants", () => {
	it("selecting a bundling possession creates its items in the right columns, tagged to the source", async () => {
		const { actor, character } = makeCharacter();
		await character.selectPossession("apiary");

		expect(actor.createEmbeddedDocuments).toHaveBeenCalledTimes(1);
		const [docType, payload] = actor.createEmbeddedDocuments.mock.calls[0];
		expect(docType).toBe("Item");
		expect(payload.map(p => p.name)).toEqual(["Beeswax", "Honey", "Bee smokers"]);

		const smoker = payload.find(p => p.name === "Bee smokers");
		expect(smoker.system.inventoryColumn).toBe("regular");
		expect(smoker.system.weight).toBe(1);
		expect(smoker.system.sourcePossession).toBe("apiary");
		expect(smoker.system.sourceLabel).toBe("Apiary");

		const honey = payload.find(p => p.name === "Honey");
		expect(honey.system.inventoryColumn).toBe("small");
		expect(honey.system).not.toHaveProperty("weight");
	});

	it("does not recreate items the actor already has (idempotent re-select / re-onboard)", async () => {
		const { actor, character } = makeCharacter([
			grantedItem({ _id: "a", name: "Beeswax" }),
			grantedItem({ _id: "b", name: "Honey" }),
		]);
		await character.selectPossession("apiary");

		const [, payload] = actor.createEmbeddedDocuments.mock.calls[0];
		expect(payload.map(p => p.name)).toEqual(["Bee smokers"]);
	});

	it("creates nothing for a possession with no grantsItems", async () => {
		const { actor, character } = makeCharacter();
		await character.selectPossession("mastiffs");
		expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
	});

	it("deselecting removes exactly the items it granted, leaving others alone", async () => {
		const { actor, character } = makeCharacter([
			grantedItem({ _id: "a", name: "Beeswax", sourcePossession: "apiary" }),
			grantedItem({ _id: "b", name: "Bee smokers", sourcePossession: "apiary", inventoryColumn: "regular" }),
			grantedItem({ _id: "c", name: "Parchment", sourcePossession: "scribes-tools" }),
			{ _id: "d", type: "move", name: "A write-in", system: { moveType: "inventory-custom", inventoryColumn: "small" } },
		]);
		await character.deselectPossession("apiary");

		expect(actor.deleteEmbeddedDocuments).toHaveBeenCalledTimes(1);
		const [docType, ids] = actor.deleteEmbeddedDocuments.mock.calls[0];
		expect(docType).toBe("Item");
		expect(ids.sort()).toEqual(["a", "b"]);
	});

	it("deselecting a possession that granted nothing deletes nothing", async () => {
		const { actor, character } = makeCharacter([
			{ _id: "d", type: "move", name: "A write-in", system: { moveType: "inventory-custom", inventoryColumn: "small" } },
		]);
		await character.deselectPossession("apiary");
		expect(actor.deleteEmbeddedDocuments).not.toHaveBeenCalled();
	});
});
