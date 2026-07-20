import { describe, it, expect } from "vitest";
import { SEEDED_FOLDER_COLORS } from "../../module/hooks/seeded-folder-colors.js";
import { BESTIARY_ROOT_NAME, BESTIARY_FOLDER_COLOR, planBestiaryFolderTree } from "../../module/hooks/bestiary-seed-core.js";

// SeedActors imports the Monsters actor compendium into the world's Actors sidebar under a
// red "Bestiary" folder tree. planBestiaryFolderTree is the pure core of that: it turns the
// compendium's folder docs into an ordered world-folder creation plan. These tests drive it
// without a live Foundry.

const RED = BESTIARY_FOLDER_COLOR;
const plan = (folders) => planBestiaryFolderTree(folders, { rootName: BESTIARY_ROOT_NAME, color: RED });
const byPackId = (result, id) => result.folders.find(f => f.packId === id);
const posOf = (result, id) => result.folders.findIndex(f => f.packId === id);

describe("bestiary actor seed folder colour", () => {
	it("uses the same colour as the Bestiary journal codex", () => {
		expect(BESTIARY_FOLDER_COLOR).toBe(SEEDED_FOLDER_COLORS.find(s => s.name === "Bestiary")?.color);
		expect(BESTIARY_FOLDER_COLOR).toBeTruthy();
	});
});

describe("planBestiaryFolderTree", () => {
	// A stale compendium (as it is before the rebuild): four virtual category folders loose
	// at the root, a region under one, a creature under the region. No "Bestiary" wrapper.
	const STALE = [
		{ id: "makers",  name: "The Makers", parentId: null,     sort: 0 },
		{ id: "regions", name: "Regions",    parentId: null,     sort: 0 },
		{ id: "wood",    name: "The Wood",   parentId: "regions", sort: 0 },
		{ id: "crinwin", name: "Crinwin",    parentId: "wood",    sort: 0 },
	];

	it("nests every top-level pack folder under a single red Bestiary root", () => {
		const result = plan(STALE);
		expect(result.root).toEqual({ name: "Bestiary", color: RED });
		// The two loose top-level folders reparent to the synthetic root (parentPackId null).
		expect(byPackId(result, "makers").parentPackId).toBeNull();
		expect(byPackId(result, "regions").parentPackId).toBeNull();
		// Nesting below is preserved.
		expect(byPackId(result, "wood").parentPackId).toBe("regions");
		expect(byPackId(result, "crinwin").parentPackId).toBe("wood");
	});

	it("tints every folder the Bestiary colour", () => {
		const result = plan(STALE);
		expect(result.folders.every(f => f.color === RED)).toBe(true);
	});

	it("orders parents before children so ids resolve on creation", () => {
		const result = plan(STALE);
		expect(posOf(result, "regions")).toBeLessThan(posOf(result, "wood"));
		expect(posOf(result, "wood")).toBeLessThan(posOf(result, "crinwin"));
	});

	// A rebuilt compendium: an explicit top-level "Bestiary" wrapper with the categories
	// nested under it (the pack source layout after the recolor).
	const REBUILT = [
		{ id: "bestiary", name: "Bestiary",   parentId: null,       sort: 0 },
		{ id: "makers",   name: "The Makers", parentId: "bestiary", sort: 0 },
		{ id: "regions",  name: "Regions",    parentId: "bestiary", sort: 0 },
		{ id: "wood",     name: "The Wood",   parentId: "regions",  sort: 0 },
	];

	it("collapses a pack's own Bestiary wrapper onto the synthetic root (no double folder)", () => {
		const result = plan(REBUILT);
		// The pack's "Bestiary" folder is collapsed, not emitted as its own world folder.
		expect(result.collapsedIds.has("bestiary")).toBe(true);
		expect(byPackId(result, "bestiary")).toBeUndefined();
		expect(result.folders.some(f => f.name === "Bestiary")).toBe(false);
		// Categories that pointed at the collapsed wrapper now sit directly under the root.
		expect(byPackId(result, "makers").parentPackId).toBeNull();
		expect(byPackId(result, "regions").parentPackId).toBeNull();
		expect(byPackId(result, "wood").parentPackId).toBe("regions");
	});

	it("handles an empty pack", () => {
		const result = plan([]);
		expect(result.folders).toEqual([]);
		expect(result.root).toEqual({ name: "Bestiary", color: RED });
	});
});
