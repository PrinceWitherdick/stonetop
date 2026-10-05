import { describe, it, expect } from "vitest";
import { supersededValues, currentEntryFor, indexCurrent } from "../../scripts/lib/superseded-history.js";
import { valueHash } from "../../module/migration/superseded-values.js";

// The generator's core: which current entry each historical version belongs to, and what it once held.

const doc = (id, name, system = {}, extra = {}) => ({ _id: id, name, type: "move", system, ...extra });

describe("currentEntryFor", () => {
	const current = [
		doc("a", "Unstoppable", { playbook: "The Heavy" }),
		doc("b", "Armored", { playbook: "The Heavy" }), doc("c", "Armored", { playbook: "The Judge" }),
		doc("d", "Shield", { moveType: "inventory" }),
	];
	const index = indexCurrent(current);

	it("is the same id first", () => {
		expect(currentEntryFor(doc("a", "Unstoppable"), index)._id).toBe("a");
	});

	it("is a unique name, or a shared name by playbook, within the same kind", () => {
		expect(currentEntryFor(doc("old", "Unstoppable"), index)._id).toBe("a");
		expect(currentEntryFor(doc("old", "Armored", { playbook: "The Judge" }), index)._id).toBe("c");
		expect(currentEntryFor(doc("old", "Armored"), index)).toBeNull();
		expect(currentEntryFor(doc("old", "Shield", { moveType: "playbook" }), index)).toBeNull();
	});

	it("is nothing for a move the pack no longer ships", () => {
		expect(currentEntryFor(doc("gone", "Pathfinder", { playbook: "The Marshal" }), index)).toBeNull();
	});
});

describe("supersededValues", () => {
	const now = doc("a", "Unstoppable", { resource: { max: 5, title: "Marks" }, description: "<p>Now</p>" });

	it("lists each former value, whole and key by key, and never the current one", () => {
		const history = [
			doc("a", "Unstoppable", { resource: { max: 6, title: "Marks" }, description: "<p>Was</p>" }),
			doc("a", "Unstoppable", { resource: { max: 5, title: "Marks" }, description: "<p>Now</p>" }),
		];
		const { superseded } = supersededValues(history, [now]);
		expect(superseded.a.description).toEqual([valueHash("<p>Was</p>")]);
		expect(superseded.a["resource.max"]).toEqual([valueHash(6, { top: false })]);
		expect(superseded.a.resource).toEqual([valueHash({ max: 6, title: "Marks" })]);
		expect(Object.keys(superseded.a)).not.toContain("resource.title");
	});

	it("lists a key a former version lacked as absent", () => {
		const { superseded } = supersededValues([doc("a", "Unstoppable", { resource: { max: 5 } })], [now]);
		expect(superseded.a["resource.title"]).toEqual([valueHash(undefined, { top: false })]);
	});

	it("names the orphans and fingerprints every current entry", () => {
		const { orphans, fingerprints } = supersededValues([doc("z", "Pathfinder", { playbook: "The Marshal" })], [now]);
		expect(orphans).toEqual(["Pathfinder (The Marshal)"]);
		expect(Object.keys(fingerprints)).toEqual(["a"]);
	});
});
