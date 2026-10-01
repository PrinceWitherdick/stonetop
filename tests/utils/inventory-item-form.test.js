import { describe, it, expect } from "vitest";
import {
	buildInventoryItemData, composeInventoryNote, splitInventoryNote,
	inventoryItemCreateData, inventoryItemFormValues, inventoryItemUpdateData, readInventoryItemData,
} from "../../module/utils/inventory-item-data.js";
import { wrapGearNoteTerms, buildUsesResource } from "../../module/utils/gear-note.js";
import { treasureItemData } from "../../module/utils/treasure-drops.js";
import { TREASURE_CATALOG } from "../../module/data/treasure-catalog.js";

// The Create Item → Inventory Item / Treasure dialog shows Value and "immobile" as fields,
// but stores them where Book II prints them and a dragged treasure keeps them: in the tag
// line. These pin the translation both ways, and the edit path's update payload.

describe("composeInventoryNote", () => {
	it("ends the tag line with the Value, as the book prints it", () => {
		expect(composeInventoryNote({ tags: "fragile, magical", value: "3" })).toBe("fragile, magical, Value 3");
	});

	it("carries who it's worth that to", () => {
		expect(composeInventoryNote({ tags: "fragile", value: 2, valueTo: " to the  right buyer " }))
			.toBe("fragile, Value 2 to the right buyer");
	});

	it("keeps a Value of 0, and drops a blank one", () => {
		expect(composeInventoryNote({ value: "0" })).toBe("Value 0");
		expect(composeInventoryNote({ tags: "crude", value: "" })).toBe("crude");
	});

	it("leads an immobile thing with the tag, once", () => {
		expect(composeInventoryNote({ tags: "dangerous, immobile", immobile: true })).toBe("immobile, dangerous");
	});
});

describe("splitInventoryNote", () => {
	it("round-trips what composeInventoryNote wrote, through the <em> wrapping", () => {
		const note = wrapGearNoteTerms(composeInventoryNote({
			tags: "fragile, 2 piercing", immobile: true, value: 2, valueTo: "to a collector",
		}));
		expect(splitInventoryNote(note, { column: "small" })).toEqual({
			tags: "fragile, 2 piercing", immobile: true, value: 2, valueTo: "to a collector",
		});
	});

	it("reads immobile only off a small-column thing", () => {
		expect(splitInventoryNote("immobile", { column: "regular" }).immobile).toBe(false);
	});

	it("leaves the book's two-Value prose in the tags, where it can be read as written", () => {
		const out = splitInventoryNote("Value 0 to most, Value 1 to those-who-know");
		expect(out.value).toBeNull();
		expect(out.tags).toBe("Value 0 to most, Value 1 to those-who-know");
	});

	it("decodes what wrapGearNoteTerms escaped", () => {
		expect(splitInventoryNote(wrapGearNoteTerms("salt & iron")).tags).toBe("salt & iron");
	});
});

describe("inventoryItemFormValues", () => {
	it("opens a dragged Book II treasure whole, from its flags", () => {
		const entry = TREASURE_CATALOG.find(e => e.usesLabel === "Blood");
		const values = inventoryItemFormValues(treasureItemData(entry));
		expect(values.name).toBe(entry.name);
		expect(values.uses).toBe(entry.uses);
		expect(values.usesLabel).toBe("Blood");
		expect(values.isTreasure).toBe(true);
		if (entry.value != null) expect(values.value).toBe(Number(entry.value));
	});

	it("opens an immobile catalog treasure in the immobile column", () => {
		const entry = TREASURE_CATALOG.find(e => e.column === "immobile" && e.value != null && !/value/i.test(e.note));
		const values = inventoryItemFormValues(treasureItemData(entry));
		expect(values.column).toBe("immobile");
		expect(values.value).toBe(Number(entry.value));
		expect(values.tags).not.toMatch(/immobile|Value/i);
	});

	it("tells worn armor from a bonus, and an ammo track from a plain one", () => {
		const data = buildInventoryItemData({
			name: "Mail", armor: { base: 2 }, resource: buildUsesResource(3, true),
		});
		const values = inventoryItemFormValues(data);
		expect(values).toMatchObject({ armor: 2, armorWorn: true, uses: 3, isAmmo: true });
	});
});

describe("inventoryItemCreateData", () => {
	it("marks a treasure's write-up as the GM's from the start, blank or not", () => {
		expect(inventoryItemCreateData({ name: "An old bronze dagger", isTreasure: true, artifact: { lore: "" } }).flags)
			.toEqual({ stonetop: { writeupEdited: true } });
	});

	it("adds no flags to plain gear", () => {
		expect(inventoryItemCreateData({ name: "Rope" })).not.toHaveProperty("flags");
	});
});

describe("inventoryItemUpdateData", () => {
	it("clears what the new input leaves out, since an update merges", () => {
		const item = buildInventoryItemData({
			name: "Pot", note: "fragile, Value 1", resource: buildUsesResource(2, false), armor: { modifier: 1 }, shield: true,
		});
		const update = inventoryItemUpdateData(item, { name: "Pot", column: "small" });
		expect(update.system).toMatchObject({ inventoryColumn: "small", note: "", resource: null, armor: null, shield: false });
	});

	it("rewrites a treasure's flag mirror, or the stale flag would shadow the edit", () => {
		const entry = TREASURE_CATALOG.find(e => e.column === "regular" && e.value != null);
		const item = treasureItemData(entry);
		const update = inventoryItemUpdateData(item, {
			name: entry.name, column: "regular", weight: 2, note: "magical, Value 5", isTreasure: true,
		});
		expect(update["flags.stonetop.note"]).toBe("magical, Value 5");
		expect(update["flags.stonetop.weight"]).toBe(2);
		// And the reader, flags first, now sees the edit.
		const merged = { ...item, flags: { stonetop: { ...item.flags.stonetop, note: update["flags.stonetop.note"] } } };
		expect(readInventoryItemData(merged).note).toBe("magical, Value 5");
	});

	// The fields are plain text, so the form's rebuilt note has lost any markup the book printed.
	it("keeps a note's authored markup when the save left its words alone", () => {
		const note = "<em>+1 armor, close, +1 Readiness <strong>on a 7+</strong> to Defend</em>";
		const item = { name: "Shield", type: "move", system: { moveType: "inventory", note }, flags: { stonetop: { note } } };
		const rebuilt = wrapGearNoteTerms(composeInventoryNote(splitInventoryNote(note)));
		const update = inventoryItemUpdateData(item, { name: "Shield", img: "new.webp", note: rebuilt });
		expect(update.system.note).toBe(note);
		expect(update["flags.stonetop.note"]).toBe(note);
		// A real change to the words is still written.
		expect(inventoryItemUpdateData(item, { name: "Shield", note: "close" }).system.note).toBe("close");
	});

	it("leaves the artifact fields alone unless the form carries them", () => {
		const item = buildInventoryItemData({ name: "Ring", artifact: { lore: "<p>It hums.</p>" } });
		expect(inventoryItemUpdateData(item, { name: "Ring" }).system).not.toHaveProperty("artifactLore");
		expect(inventoryItemUpdateData(item, { name: "Ring" }).system).not.toHaveProperty("isTreasure");
		const edited = inventoryItemUpdateData(item, { name: "Ring", isTreasure: true, artifact: { state: "", lore: "" } });
		expect(edited.system).toMatchObject({ artifactLore: "", identifyState: "", isTreasure: true });
	});

	it("marks a write-up the form edited, so the load-time back-fill leaves it be", () => {
		const item = buildInventoryItemData({ name: "Ring", isTreasure: true, artifact: { lore: "<p>It hums.</p>" } });
		expect(inventoryItemUpdateData(item, { name: "Ring", isTreasure: true, artifact: { lore: "" } })["flags.stonetop.writeupEdited"]).toBe(true);
		expect(inventoryItemUpdateData(item, { name: "Ring", isTreasure: true, artifact: { lore: "<p>It sings.</p>" } })["flags.stonetop.writeupEdited"]).toBe(true);
		expect(inventoryItemUpdateData(item, { name: "Ring" })).not.toHaveProperty(["flags.stonetop.writeupEdited"]);
	});

	it("leaves the flag off when the write-up did not change, so a blank one can still be filled", () => {
		const blank = buildInventoryItemData({ name: "Ring", isTreasure: true });
		expect(inventoryItemUpdateData(blank, { name: "Ring", isTreasure: true, note: "Value 3", artifact: { lore: "" } }))
			.not.toHaveProperty(["flags.stonetop.writeupEdited"]);
		// The editor re-serializing the same words is not an edit either.
		const written = buildInventoryItemData({ name: "Ring", isTreasure: true, artifact: { lore: "<p>It hums.</p>" } });
		expect(inventoryItemUpdateData(written, { name: "Ring", isTreasure: true, artifact: { lore: "<p>It  hums.</p>\n" } }))
			.not.toHaveProperty(["flags.stonetop.writeupEdited"]);
	});

	it("replaces the armor whole, since an update merges into the stored object", () => {
		const bonus = buildInventoryItemData({ name: "Mail", armor: { modifier: 1 } });
		expect(inventoryItemUpdateData(bonus, { name: "Mail", armor: { base: 2 } }).system.armor).toEqual({ base: 2, modifier: null });
		const worn = buildInventoryItemData({ name: "Mail", armor: { base: 2 } });
		expect(inventoryItemUpdateData(worn, { name: "Mail", armor: { modifier: 1 } }).system.armor).toEqual({ base: null, modifier: 1 });
		// And the flag mirror a treasure reads first gets the same whole object.
		const mirrored = { ...worn, flags: { stonetop: { armor: { base: 2 } } } };
		expect(inventoryItemUpdateData(mirrored, { name: "Mail", armor: { modifier: 1 } })["flags.stonetop.armor"]).toEqual({ base: null, modifier: 1 });
	});

	it("edits an official catalog item through its flags, leaving its catalog keys alone", () => {
		// As packs/src/stonetop-items/inventory-items/*.json stores one: everything in flags.
		const item = {
			name: "Lantern", type: "move", system: { moveType: "inventory" },
			flags: { stonetop: { slug: "lantern", inventoryColumn: "regular", weight: 1, note: "near", sortOrder: 3 } },
		};
		const update = inventoryItemUpdateData(item, { name: "Lantern", column: "regular", weight: 2, note: "near, Value 1" });
		expect(update["flags.stonetop.weight"]).toBe(2);
		expect(update["flags.stonetop.note"]).toBe("near, Value 1");
		expect(update).not.toHaveProperty(["flags.stonetop.slug"]);
		expect(update).not.toHaveProperty(["flags.stonetop.sortOrder"]);
		expect(inventoryItemFormValues(item)).toMatchObject({ column: "regular", tags: "near" });
	});

	it("only writes an image it was given", () => {
		const item = buildInventoryItemData({ name: "Ring" });
		expect(inventoryItemUpdateData(item, { name: "Ring", img: "" })).not.toHaveProperty("img");
		expect(inventoryItemUpdateData(item, { name: "Ring", img: "a.webp" }).img).toBe("a.webp");
	});
});
