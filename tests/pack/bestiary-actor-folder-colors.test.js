import { describe, it, expect } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { SEEDED_FOLDER_COLORS } from "../../module/hooks/seeded-folder-colors.js";

// The "Monsters" actor compendium (stonetop-bestiary) mirrors the Bestiary journal
// codex: a single top-level "Bestiary" folder, the four category folders nested under
// it, and the same brick-red tint the journal tree carries — so browsing the monster
// sheets reads the same as browsing the codex. Unlike the journal colours (copied into
// the world by SeedCompendiums), these are pack-data only; there's no runtime path that
// colours actor folders, so this guard is what keeps them in sync. It also catches a new
// creature folder created uncoloured, since scripts/pack.js mints folders with color:null.
const BESTIARY_COLOR = SEEDED_FOLDER_COLORS.find(s => s.name === "Bestiary")?.color;
const ROOT_NAME = "Bestiary";
const CATEGORY_NAMES = ["The Makers", "Peoples & Folk", "Primordial & Mythic Powers", "Regions"];
const FOLDERS_DIR = path.resolve("packs/src/stonetop-bestiary/_folders");

async function readFolderDocs() {
	const out = [];
	for (const file of await fs.readdir(FOLDERS_DIR)) {
		if (!file.endsWith(".json")) continue;
		out.push({ file, doc: JSON.parse(await fs.readFile(path.join(FOLDERS_DIR, file), "utf8")) });
	}
	return out;
}

describe("Monsters compendium folder tree", () => {
	it("every folder carries the Bestiary codex colour", async () => {
		expect(BESTIARY_COLOR).toBeTruthy();
		const folders = await readFolderDocs();
		expect(folders.length).toBeGreaterThan(0);
		const bad = folders.filter(({ doc }) => doc.color !== BESTIARY_COLOR);
		expect(bad.map(b => `${b.file} (${b.doc.color})`)).toEqual([]);
	});

	it("has a single top-level 'Bestiary' root with the four categories nested under it", async () => {
		const folders = await readFolderDocs();
		const roots = folders.filter(({ doc }) => doc.name === ROOT_NAME && doc.folder === null);
		expect(roots).toHaveLength(1);
		const rootId = roots[0].doc._id;

		const byName = new Map(folders.map(({ doc }) => [doc.name, doc]));
		for (const name of CATEGORY_NAMES) {
			const cat = byName.get(name);
			expect(cat, `missing category folder "${name}"`).toBeTruthy();
			expect(cat.folder, `"${name}" should nest under the Bestiary root`).toBe(rootId);
		}
	});
});
