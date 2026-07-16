import { describe, it, expect } from "vitest";
import { planSeededFolderColorUpdates, seededFolderColorSignature, SEEDED_FOLDER_COLORS, WORLD_ROOT_FOLDER_COLOR } from "../../module/hooks/seeded-folder-colors.js";

// planSeededFolderColorUpdates is the pure core of the already-seeded-world migration
// (SeedCompendiums.syncSeededFolderColors). It walks the seeded "The World" >
// { Bestiary, Lore, Places, Reference } subtrees and emits a colour update for every
// folder still at the default, leaving GM-tinted folders alone.

const WORLD = "The World";
const SPECS = SEEDED_FOLDER_COLORS;
const colourFor = name => SPECS.find(s => s.name === name).color;

// Build a folder doc mirroring the shape the migration reads: `folder` is the parent
// folder document (or null), `_source.color` holds the stored hex.
function folder(id, name, parent = null, color = null) {
	return { id, name, type: "JournalEntry", folder: parent, _source: { color } };
}

// The canonical seeded layout: The World > each category, with a nested subfolder or
// two per category to exercise the recursion, all uncoloured.
function seededWorld() {
	const world = folder("w", WORLD);
	const bestiary = folder("b", "Bestiary", world);
	const regions = folder("r", "Regions", bestiary);
	const blackwater = folder("bw", "Blackwater Lake", regions);
	const lore = folder("l", "Lore", world);
	const factions = folder("pf", "Peoples & Factions", lore);
	const places = folder("p", "Places", world);
	const settlements = folder("s", "Settlements", places);
	const reference = folder("ref", "Reference", world);
	return [world, bestiary, regions, blackwater, lore, factions, places, settlements, reference];
}

const colourOf = (updates, id) => updates.find(u => u._id === id)?.color;

describe("planSeededFolderColorUpdates", () => {
	it("colours each subtree with its category colour, recursively", () => {
		const updates = planSeededFolderColorUpdates(seededWorld(), SPECS, WORLD);
		expect(colourOf(updates, "b")).toBe(colourFor("Bestiary"));
		expect(colourOf(updates, "r")).toBe(colourFor("Bestiary"));
		expect(colourOf(updates, "bw")).toBe(colourFor("Bestiary"));
		expect(colourOf(updates, "l")).toBe(colourFor("Lore"));
		expect(colourOf(updates, "pf")).toBe(colourFor("Lore"));
		expect(colourOf(updates, "p")).toBe(colourFor("Places"));
		expect(colourOf(updates, "s")).toBe(colourFor("Places"));
		expect(colourOf(updates, "ref")).toBe(colourFor("Reference"));
		// The World root itself is not a seeded category — left untouched.
		expect(colourOf(updates, "w")).toBeUndefined();
		expect(updates).toHaveLength(8);
	});

	it("leaves folders the GM has already coloured alone", () => {
		const folders = seededWorld();
		folders.find(f => f.id === "r")._source.color = "#123456"; // GM tinted Regions
		const updates = planSeededFolderColorUpdates(folders, SPECS, WORLD);
		expect(colourOf(updates, "r")).toBeUndefined();
		// Its parent/children that are still default are still recoloured.
		expect(colourOf(updates, "b")).toBe(colourFor("Bestiary"));
		expect(colourOf(updates, "bw")).toBe(colourFor("Bestiary"));
	});

	it("does not re-emit folders that already carry the target colour (fresh world)", () => {
		// Fresh worlds copy the compendium colours during the seed, so the subtree is
		// already tinted; the migration should then be a no-op.
		const folders = seededWorld();
		const rootOf = { b: "Bestiary", r: "Bestiary", bw: "Bestiary", l: "Lore", pf: "Lore", p: "Places", s: "Places", ref: "Reference" };
		for (const f of folders) if (rootOf[f.id]) f._source.color = colourFor(rootOf[f.id]);
		expect(planSeededFolderColorUpdates(folders, SPECS, WORLD)).toEqual([]);
	});

	it("falls back to a loose root-level category folder when there is no The World root", () => {
		// Seed fell back to the world root (The World creation failed): the categories sit
		// at the top level rather than under a shared root.
		const bestiary = folder("b", "Bestiary");
		const regions = folder("r", "Regions", bestiary);
		const places = folder("p", "Places");
		const updates = planSeededFolderColorUpdates([bestiary, regions, places], SPECS, WORLD);
		expect(colourOf(updates, "b")).toBe(colourFor("Bestiary"));
		expect(colourOf(updates, "r")).toBe(colourFor("Bestiary"));
		expect(colourOf(updates, "p")).toBe(colourFor("Places"));
	});

	it("colours the The World root itself, root-only, when a root colour is given", () => {
		const updates = planSeededFolderColorUpdates(seededWorld(), SPECS, WORLD, WORLD_ROOT_FOLDER_COLOR);
		expect(colourOf(updates, "w")).toBe(WORLD_ROOT_FOLDER_COLOR);
		// The root's own colour must NOT leak onto its category children — those keep
		// their category colours, not the stone-slate root tint.
		expect(colourOf(updates, "b")).toBe(colourFor("Bestiary"));
		expect(colourOf(updates, "l")).toBe(colourFor("Lore"));
		expect(colourOf(updates, "p")).toBe(colourFor("Places"));
		expect(colourOf(updates, "ref")).toBe(colourFor("Reference"));
		expect(updates).toHaveLength(9); // 8 category folders + the root
	});

	it("leaves the The World root alone if the GM already coloured it", () => {
		const folders = seededWorld();
		folders.find(f => f.id === "w")._source.color = "#010203";
		const updates = planSeededFolderColorUpdates(folders, SPECS, WORLD, WORLD_ROOT_FOLDER_COLOR);
		expect(colourOf(updates, "w")).toBeUndefined();
		expect(updates).toHaveLength(8); // just the categories
	});

	it("does not colour the root when no root colour is given", () => {
		const updates = planSeededFolderColorUpdates(seededWorld(), SPECS, WORLD);
		expect(colourOf(updates, "w")).toBeUndefined();
	});

	it("ignores non-JournalEntry folders and unrelated trees", () => {
		const folders = seededWorld();
		const macroDupe = folder("m", "Bestiary", null); // e.g. a Macro folder of the same name
		macroDupe.type = "Macro";
		folders.push(macroDupe, folder("x", "My Notes")); // + an unrelated GM folder
		const updates = planSeededFolderColorUpdates(folders, SPECS, WORLD);
		expect(colourOf(updates, "m")).toBeUndefined();
		expect(colourOf(updates, "x")).toBeUndefined();
		expect(updates).toHaveLength(8);
	});

	it("re-tints folders still holding a previous scheme's colour, but leaves the GM's own tint", () => {
		// A later release changes a category colour: folders still carrying the OLD seeded
		// colour are ours to re-tint (they propagate), but a folder the GM has since recoloured
		// carries an unrecognised colour and must be left alone.
		const OLD_BESTIARY = "#101010";
		const world = folder("w", WORLD);
		const bestiary = folder("b", "Bestiary", world, OLD_BESTIARY); // our prior auto-tint
		const regions = folder("r", "Regions", bestiary, "#abcdef");   // GM's own tint since
		const newSpecs = [{ name: "Bestiary", color: "#6a9165" }];
		const owned = new Set([OLD_BESTIARY]);
		const updates = planSeededFolderColorUpdates([world, bestiary, regions], newSpecs, WORLD, null, owned);
		expect(colourOf(updates, "b")).toBe("#6a9165");  // ours → re-tinted to the new colour
		expect(colourOf(updates, "r")).toBeUndefined();  // GM's tint → left alone
	});
});

describe("seededFolderColorSignature", () => {
	it("covers every category colour plus the world-root colour", () => {
		const sig = seededFolderColorSignature();
		for (const { name, color } of SEEDED_FOLDER_COLORS) expect(sig).toContain(`${name}=${color}`);
		expect(sig).toContain(`The World=${WORLD_ROOT_FOLDER_COLOR}`);
	});

	it("is stable across calls but changes when the scheme would change", () => {
		// Same inputs → same signature (so an unchanged scheme doesn't re-trigger the sync).
		expect(seededFolderColorSignature()).toBe(seededFolderColorSignature());
		// And it actually encodes the values, so any edit to a colour shifts it.
		expect(seededFolderColorSignature()).not.toBe("");
	});
});
