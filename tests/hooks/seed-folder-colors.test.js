import { describe, it, expect } from "vitest";
import { planSeededFolderColorUpdates, seededFolderColorSignature, SEEDED_FOLDER_COLORS } from "../../module/hooks/seeded-folder-colors.js";

// planSeededFolderColorUpdates is the pure core of the already-seeded-world migration
// (SeedCompendiums.syncSeededFolderColors). It walks the top-level { Bestiary, Lore,
// Places, Reference } subtrees and emits a colour update for every folder still at the
// default, leaving GM-tinted folders alone. The four trees sit at the sidebar root — there
// is no longer a shared "The World" wrapper (its extra depth hid the Bestiary codex).

const SPECS = SEEDED_FOLDER_COLORS;
const colourFor = name => SPECS.find(s => s.name === name).color;

// Build a folder doc mirroring the shape the migration reads: `folder` is the parent
// folder document (or null), `_source.color` holds the stored hex.
function folder(id, name, parent = null, color = null) {
	return { id, name, type: "JournalEntry", folder: parent, _source: { color } };
}

// The canonical seeded layout: each category is a TOP-LEVEL folder, with a nested
// subfolder or two to exercise the recursion, all uncoloured.
function seededWorld() {
	const bestiary = folder("b", "Bestiary");
	const regions = folder("r", "Regions", bestiary);
	const blackwater = folder("bw", "Blackwater Lake", regions);
	const lore = folder("l", "Lore");
	const factions = folder("pf", "Peoples & Factions", lore);
	const places = folder("p", "Places");
	const settlements = folder("s", "Settlements", places);
	const reference = folder("ref", "Reference");
	return [bestiary, regions, blackwater, lore, factions, places, settlements, reference];
}

const colourOf = (updates, id) => updates.find(u => u._id === id)?.color;

describe("planSeededFolderColorUpdates", () => {
	it("colours each top-level tree with its category colour, recursively", () => {
		const updates = planSeededFolderColorUpdates(seededWorld(), SPECS);
		expect(colourOf(updates, "b")).toBe(colourFor("Bestiary"));
		expect(colourOf(updates, "r")).toBe(colourFor("Bestiary"));
		expect(colourOf(updates, "bw")).toBe(colourFor("Bestiary"));
		expect(colourOf(updates, "l")).toBe(colourFor("Lore"));
		expect(colourOf(updates, "pf")).toBe(colourFor("Lore"));
		expect(colourOf(updates, "p")).toBe(colourFor("Places"));
		expect(colourOf(updates, "s")).toBe(colourFor("Places"));
		expect(colourOf(updates, "ref")).toBe(colourFor("Reference"));
		expect(updates).toHaveLength(8);
	});

	it("leaves folders the GM has already coloured alone", () => {
		const folders = seededWorld();
		folders.find(f => f.id === "r")._source.color = "#123456"; // GM tinted Regions
		const updates = planSeededFolderColorUpdates(folders, SPECS);
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
		expect(planSeededFolderColorUpdates(folders, SPECS)).toEqual([]);
	});

	it("ignores non-JournalEntry folders and unrelated trees", () => {
		const folders = seededWorld();
		const macroDupe = folder("m", "Bestiary", null); // e.g. a Macro folder of the same name
		macroDupe.type = "Macro";
		folders.push(macroDupe, folder("x", "My Notes")); // + an unrelated GM folder
		const updates = planSeededFolderColorUpdates(folders, SPECS);
		expect(colourOf(updates, "m")).toBeUndefined();
		expect(colourOf(updates, "x")).toBeUndefined();
		expect(updates).toHaveLength(8);
	});

	it("re-tints folders still holding a previous scheme's colour, but leaves the GM's own tint", () => {
		// A later release changes a category colour: folders still carrying the OLD seeded
		// colour are ours to re-tint (they propagate), but a folder the GM has since recoloured
		// carries an unrecognised colour and must be left alone.
		const OLD_BESTIARY = "#101010";
		const bestiary = folder("b", "Bestiary", null, OLD_BESTIARY); // our prior auto-tint
		const regions = folder("r", "Regions", bestiary, "#abcdef");  // GM's own tint since
		const newSpecs = [{ name: "Bestiary", color: "#6a9165" }];
		const owned = new Set([OLD_BESTIARY]);
		const updates = planSeededFolderColorUpdates([bestiary, regions], newSpecs, owned);
		expect(colourOf(updates, "b")).toBe("#6a9165");  // ours → re-tinted to the new colour
		expect(colourOf(updates, "r")).toBeUndefined();  // GM's tint → left alone
	});
});

describe("seededFolderColorSignature", () => {
	it("covers every category colour", () => {
		const sig = seededFolderColorSignature();
		for (const { name, color } of SEEDED_FOLDER_COLORS) expect(sig).toContain(`${name}=${color}`);
	});

	it("no longer references the retired 'The World' wrapper", () => {
		expect(seededFolderColorSignature()).not.toContain("The World");
	});

	it("is stable across calls but encodes the values", () => {
		expect(seededFolderColorSignature()).toBe(seededFolderColorSignature());
		expect(seededFolderColorSignature()).not.toBe("");
	});
});
