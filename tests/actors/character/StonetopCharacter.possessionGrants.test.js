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

	it("marks a bundling possession applied on select so its gear isn't recreated later", async () => {
		const { actor, character } = makeCharacter();
		await character.selectPossession("apiary");
		expect(actor.setFlag).toHaveBeenCalledWith(
			"stonetop_pwd", "possessionGrantsApplied", { apiary: true },
		);
	});
});

// The ready-time back-fill for characters whose grant-bearing possessions were
// selected before bundled-gear grants existed.
describe("StonetopCharacter — ensurePossessionGrants back-fill", () => {
	function makeSelected(selectedSlugs, { applied, items = [] } = {}) {
		const builder = new FakeActorBuilder()
			.withPlaybook("the-blessed", "The Blessed")
			.withItems(items)
			.withFlag("possessions.selected", selectedSlugs);
		if (applied) builder.withFlag("possessionGrantsApplied", applied);
		const actor = builder.build();
		const character = new TestCharacterBuilder(actor).addPlaybook(PLAYBOOK).build();
		return { actor, character };
	}

	it("materializes gear for a selected possession that was never granted", async () => {
		const { actor, character } = makeSelected(["apiary"]);
		await character.ensurePossessionGrants();

		expect(actor.createEmbeddedDocuments).toHaveBeenCalledTimes(1);
		const [, payload] = actor.createEmbeddedDocuments.mock.calls[0];
		expect(payload.map(p => p.name)).toEqual(["Beeswax", "Honey", "Bee smokers"]);
		expect(actor.setFlag).toHaveBeenCalledWith(
			"stonetop_pwd", "possessionGrantsApplied", { apiary: true },
		);
	});

	it("does nothing for a possession already marked applied (respects deletions)", async () => {
		const { actor, character } = makeSelected(["apiary"], { applied: { apiary: true } });
		await character.ensurePossessionGrants();
		expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
	});

	it("only marks — creates nothing — when the gear is already present", async () => {
		const { actor, character } = makeSelected(["apiary"], {
			items: [
				grantedItem({ _id: "a", name: "Beeswax" }),
				grantedItem({ _id: "b", name: "Honey" }),
				grantedItem({ _id: "c", name: "Bee smokers", inventoryColumn: "regular" }),
			],
		});
		await character.ensurePossessionGrants();
		expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
		expect(actor.setFlag).toHaveBeenCalledWith(
			"stonetop_pwd", "possessionGrantsApplied", { apiary: true },
		);
	});

	it("marks — but creates nothing for — selected possessions that grant no items", async () => {
		// A grant-less selected possession still gets recorded, so the pre-playbook bail can
		// short-circuit next load instead of re-resolving the playbook every world load.
		const { actor, character } = makeSelected(["mastiffs"]);
		await character.ensurePossessionGrants();
		expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
		expect(actor.setFlag).toHaveBeenCalledWith(
			"stonetop_pwd", "possessionGrantsApplied", { mastiffs: true },
		);
	});
});

// Granted gear renders inside its possession's card (grouped ◇ then small), not the
// Items / Small Items columns — but still feeds the load / small-item accounting.
describe("StonetopCharacter — possession gear renders in the card, not the columns", () => {
	function buildWithApiary({ checked = {} } = {}) {
		const items = [
			grantedItem({ _id: "beeswax", name: "Beeswax", inventoryColumn: "small" }),
			grantedItem({ _id: "honey",   name: "Honey",   inventoryColumn: "small" }),
			grantedItem({ _id: "smoker",  name: "Bee smokers", inventoryColumn: "regular" }),
		];
		const actor = new FakeActorBuilder()
			.withPlaybook("the-blessed", "The Blessed")
			.withItems(items)
			.withFlag("possessions.selected", ["apiary"])
			.withFlag("inventory.checked", checked)
			.build();
		return new TestCharacterBuilder(actor).addPlaybook(PLAYBOOK).build();
	}

	it("groups granted gear on the possession (◇ regular first, then small) and keeps it out of the columns", async () => {
		const snap = await buildWithApiary().buildSnapshot();
		const apiary = snap.inventory.possessions.items.find(p => p.slug === "apiary");
		expect(apiary.grantedRegular.map(i => i.name)).toEqual(["Bee smokers"]);
		expect(apiary.grantedSmall.map(i => i.name)).toEqual(["Beeswax", "Honey"]);
		// Not duplicated into the shared Items / Small Items columns.
		expect(snap.inventory.outfit.regularItems.some(i => i.name === "Bee smokers")).toBe(false);
		expect(snap.inventory.outfit.smallItems.some(i => i.name === "Beeswax")).toBe(false);
	});

	it("a checked ◇ gear item in the card still counts toward load", async () => {
		const bare    = await buildWithApiary().buildSnapshot();
		const carried = await buildWithApiary({ checked: { smoker: true } }).buildSnapshot();
		expect(carried.inventory.outfit.load.totalMarks).toBe(bare.inventory.outfit.load.totalMarks + 1);
	});

	it("plain write-ins (no source possession) still render in the columns", async () => {
		const actor = new FakeActorBuilder()
			.withPlaybook("the-blessed", "The Blessed")
			.withItems([
				{ _id: "w1", type: "move", name: "A write-in", system: { moveType: "inventory-custom", inventoryColumn: "small" } },
			])
			.build();
		const snap = await new TestCharacterBuilder(actor).addPlaybook(PLAYBOOK).build().buildSnapshot();
		expect(snap.inventory.outfit.smallItems.some(i => i.name === "A write-in")).toBe(true);
	});
});
