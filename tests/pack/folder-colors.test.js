import { describe, it, expect } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { SEEDED_FOLDER_COLORS } from "../../module/hooks/seeded-folder-colors.js";

// Each seeded gazetteer category (Bestiary codex, Lore, Places, Reference) ships as
// its own pack source dir, so every folder doc in a dir belongs to that one category.
// These stamp an identifying colour on every folder so the sidebar reads the trees
// apart — and the runtime (SeedCompendiums) both copies that colour into fresh worlds
// and back-fills it into already-seeded ones. This guards that the pack docs stay in
// sync with the shared SEEDED_FOLDER_COLORS constant the runtime uses, so the two
// paths can't drift to different hues.

const SRC = path.resolve("packs/src");
const colourFor = name => SEEDED_FOLDER_COLORS.find(s => s.name === name)?.color;

// The pack source dir backing each category's folder tree.
const CATEGORY_DIRS = {
	Bestiary:  "stonetop-bestiary-journal",
	Lore:      "stonetop-lore",
	Places:    "stonetop-locations",
	Reference: "stonetop-journals",
};

async function readFolderDocs(relDir) {
	const dir = path.join(SRC, relDir, "_folders");
	const out = [];
	for (const file of await fs.readdir(dir)) {
		if (!file.endsWith(".json")) continue;
		out.push({ file: `${relDir}/_folders/${file}`, doc: JSON.parse(await fs.readFile(path.join(dir, file), "utf8")) });
	}
	return out;
}

describe("seeded gazetteer folder colours", () => {
	for (const [category, relDir] of Object.entries(CATEGORY_DIRS)) {
		it(`every ${category}-tree folder carries the ${category} colour`, async () => {
			const folders = await readFolderDocs(relDir);
			expect(folders.length).toBeGreaterThan(0);
			const bad = folders.filter(({ doc }) => doc.color !== colourFor(category));
			expect(bad.map(b => b.file)).toEqual([]);
		});
	}

	it("every category uses a distinct colour", () => {
		const colours = SEEDED_FOLDER_COLORS.map(s => s.color);
		expect(colours.every(Boolean)).toBe(true);
		expect(new Set(colours).size).toBe(colours.length);
	});

	it("each category tree is a top-level folder (no shared wrapper)", async () => {
		// The four trees seed at the sidebar root — there is no longer a "The World" wrapper
		// (its extra depth pushed the Bestiary codex past Foundry's folder-render limit). The
		// named top folder of each tree must sit at the root (folder: null).
		for (const [category, relDir] of Object.entries(CATEGORY_DIRS)) {
			const docs = await readFolderDocs(relDir);
			const top = docs.find(({ doc }) => doc.name === category);
			expect(top, `missing top-level "${category}" folder`).toBeTruthy();
			expect(top.doc.folder, `"${category}" should be top-level`).toBeNull();
		}
		// And the retired wrapper is gone from every source dir.
		for (const relDir of Object.values(CATEGORY_DIRS)) {
			for (const { doc, file } of await readFolderDocs(relDir)) {
				expect(doc.name, `stale "The World" wrapper in ${file}`).not.toBe("The World");
			}
		}
	});
});
