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
				description: "beeswax, honey, ◇ bee smokers, etc.",
				grantsItems: [
					{ name: "Beeswax", column: "small" },
					{ name: "Honey", column: "small" },
					{ name: "Bee smokers", column: "regular", weight: 1 },
				],
			},
			{
				slug: "distillery",
				label: "Distillery",
				description: "skins of fine whisky (○○ uses, grants advantage to Persuade), copper tubes, malt, ◇ firkins, stills, barrels, etc.",
				grantsItems: [
					{
						name: "Skins of fine whisky",
						sourceKey: "Fine whisky (advantage to Persuade)",
						// Deliberately keeps the sourceKey duplicated in aliases — this is the
						// pathological shape that tripped the cross-possession collision guard.
						// Retained so the grantNames de-dupe keeps being exercised by a test.
						aliases: ["Fine whisky (advantage to Persuade)", "Fine whisky"],
						column: "small",
						resource: { max: 2, title: null, labels: [] },
						resourceSuffix: "uses, grants advantage to Persuade",
						legacyUsesFromPossession: true,
					},
					{ name: "Firkins", column: "regular", weight: 1 },
				],
			},
			{ slug: "mastiffs", label: "Mastiffs" },
		],
	},
};

function grantedItem(overrides = {}) {
	const system = {
		moveType: "inventory-custom",
		inventoryColumn: overrides.inventoryColumn ?? "small",
		sourceKey: overrides.sourceKey ?? overrides.name ?? "Beeswax",
	};
	if (!overrides.untagged) system.sourcePossession = overrides.sourcePossession ?? "apiary";
	if (overrides.resource) system.resource = overrides.resource;
	return {
		_id: overrides._id ?? "id-1",
		type: "move",
		name: overrides.name ?? "Beeswax",
		system,
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

	it("uses a stable source key and carries resource data for renamed grant labels", async () => {
		const { actor, character } = makeCharacter();
		await character.selectPossession("distillery");

		const [, payload] = actor.createEmbeddedDocuments.mock.calls[0];
		const whisky = payload.find(p => p.system.sourceKey === "Fine whisky (advantage to Persuade)");
		expect(whisky.name).toBe("Skins of fine whisky");
		expect(whisky.system.resource).toEqual({ max: 2, title: null, labels: [] });
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
		expect(apiary.description).toBe("");
		expect(apiary.grantedRegular.map(i => i.name)).toEqual(["Bee smokers"]);
		expect(apiary.grantedSmall.map(i => i.name)).toEqual(["Beeswax", "Honey"]);
		// Not duplicated into the shared Items / Small Items columns.
		expect(snap.inventory.outfit.regularItems.some(i => i.name === "Bee smokers")).toBe(false);
		expect(snap.inventory.outfit.smallItems.some(i => i.name === "Beeswax")).toBe(false);
	});

	it("pulls older untagged grant-matching write-ins into their active possession card", async () => {
		const items = [
			grantedItem({ _id: "beeswax", name: "Beeswax", inventoryColumn: "small", untagged: true }),
			grantedItem({ _id: "smoker", name: "Bee smokers", inventoryColumn: "regular", untagged: true }),
			grantedItem({ _id: "chalk", name: "Chalk", inventoryColumn: "small", untagged: true }),
		];
		const actor = new FakeActorBuilder()
			.withPlaybook("the-blessed", "The Blessed")
			.withItems(items)
			.withFlag("possessions.selected", ["apiary"])
			.build();
		const snap = await new TestCharacterBuilder(actor).addPlaybook(PLAYBOOK).build().buildSnapshot();
		const apiary = snap.inventory.possessions.items.find(p => p.slug === "apiary");

		expect(apiary.grantedRegular.map(i => i.name)).toEqual(["Bee smokers"]);
		expect(apiary.grantedSmall.map(i => i.name)).toEqual(["Beeswax"]);
		expect(snap.inventory.outfit.regularItems.some(i => i.name === "Bee smokers")).toBe(false);
		expect(snap.inventory.outfit.smallItems.some(i => i.name === "Beeswax")).toBe(false);
		expect(snap.inventory.outfit.smallItems.some(i => i.name === "Chalk")).toBe(true);
	});

	it("renders Distillery uses on the whisky grant, not the possession header", async () => {
		const actor = new FakeActorBuilder()
			.withPlaybook("the-blessed", "The Blessed")
			.withItems([
				grantedItem({
					_id: "whisky",
					name: "Fine whisky",
					untagged: true,
				}),
			])
			.withFlag("possessions.selected", ["distillery"])
			.withFlag("possessions.uses", { distillery: 1 })
			.build();
		const snap = await new TestCharacterBuilder(actor).addPlaybook(PLAYBOOK).build().buildSnapshot();
		const distillery = snap.inventory.possessions.items.find(p => p.slug === "distillery");
		const whisky = distillery.grantedSmall.find(i => i.slug === "whisky");

		expect(distillery.resource).toBeNull();
		expect(distillery.usesLabel).toBeNull();
		// Reads "Skins of fine whisky (○○ uses, grants advantage to Persuade)" on the card:
		// name, then the ○ track, then the suffix — matching the book's phrasing.
		expect(whisky.name).toBe("Skins of fine whisky");
		expect(whisky.resourceSuffix).toBe("uses, grants advantage to Persuade");
		expect(whisky.resource.max).toBe(2);
		expect(whisky.resource.current).toBe(1);
		expect(snap.inventory.outfit.smallItems.some(i => i.name === "Fine whisky")).toBe(false);
	});

	it("adopts an untagged legacy item named with the grant's full sourceKey (redundant alias)", async () => {
		// The Distillery whisky grant lists its sourceKey verbatim in `aliases` too, so the
		// name "Fine whisky (advantage to Persuade)" appears twice in grantNames. It must not
		// read as a cross-possession collision and get dropped into the Small Items column.
		const actor = new FakeActorBuilder()
			.withPlaybook("the-blessed", "The Blessed")
			.withItems([
				grantedItem({
					_id: "whisky",
					name: "Fine whisky (advantage to Persuade)",
					untagged: true,
				}),
			])
			.withFlag("possessions.selected", ["distillery"])
			.withFlag("possessions.uses", { distillery: 2 })
			.build();
		const snap = await new TestCharacterBuilder(actor).addPlaybook(PLAYBOOK).build().buildSnapshot();
		const distillery = snap.inventory.possessions.items.find(p => p.slug === "distillery");
		const whisky = distillery.grantedSmall.find(i => i.slug === "whisky");

		expect(whisky).toBeDefined();
		expect(whisky.name).toBe("Skins of fine whisky");
		expect(whisky.resourceSuffix).toBe("uses, grants advantage to Persuade");
		expect(whisky.resource.max).toBe(2);
		expect(whisky.resource.current).toBe(2);
		expect(snap.inventory.outfit.smallItems.some(i => i.name === "Fine whisky (advantage to Persuade)")).toBe(false);
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
