import { describe, it, expect } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { PACKS } from "../../scripts/packs.js";
import { BESTIARY_ROOT_NAME, BESTIARY_FOLDER_COLOR, planBestiaryFolderTree } from "../../module/hooks/bestiary-seed-core.js";

// Guard against silently over-nesting the seeded folder trees.
//
// Foundry gates folder NESTING at CONST.FOLDER_MAX_DEPTH (4 in v13/v14): a folder
// deeper than that is relocated to the sidebar root and, on older cores, its
// contents can vanish outright — with no error. Entries are leaves and don't count
// toward the depth; only folder-in-folder nesting does.
//
// The deepest tree we ship is the Bestiary codex (Bestiary > section > subcategory >
// entry) at folder depth 3, which renders correctly. It broke once when an extra
// "The World" wrapper pushed it to 4 and the region folders + their entries silently
// stopped showing (see SeedCompendiums.unnestSeededWorldRootOnce). Because the
// failure is silent and the seed can add a wrapper level of its own, we cap the
// seeded depth at the known-good ceiling of 3 — one level below Foundry's hard limit
// — so any new folder tier, or a re-introduced root wrapper, fails HERE in CI instead
// of in a GM's sidebar. Raising this cap should be a deliberate decision, made with
// the render-depth risk in mind.
const MAX_SEEDED_DEPTH = 3;
const FOUNDRY_HARD_LIMIT = 4; // CONST.FOLDER_MAX_DEPTH, documented for context only.

const SRC = path.resolve("packs/src");

// Read a source dir's folder docs (the `_folders/*.json` sidecars). A source with no
// folders (entries loose at the root) yields [].
async function readFolders(sourceDir) {
	const dir = path.join(SRC, sourceDir, "_folders");
	let files;
	try { files = await fs.readdir(dir); } catch { return []; }
	const out = [];
	for (const f of files) {
		if (!f.endsWith(".json")) continue;
		out.push(JSON.parse(await fs.readFile(path.join(dir, f), "utf8")));
	}
	return out;
}

// Max nesting depth of a folder tree. A root folder (parent null/absent) is depth 1;
// each level of nesting adds 1. `parentOf` maps an id to its parent id.
function maxDepth(ids, parentOf) {
	const depthOf = id => {
		let d = 0, cur = id;
		const seen = new Set();
		while (cur != null && !seen.has(cur)) { seen.add(cur); d++; cur = parentOf(cur); }
		return d;
	};
	return ids.reduce((m, id) => Math.max(m, depthOf(id)), 0);
}

describe("seeded folder trees stay within Foundry's render depth", () => {
	// The four journal sources are seeded at the sidebar root with no added wrapper
	// (SeedCompendiums.importJournalPack), so a source's own folder depth IS its
	// depth in the world. Drive off PACKS so a newly-added journal source is covered
	// automatically.
	const journalPack = PACKS.find(p => p.type === "JournalEntry");
	const journalSources = journalPack.sources ?? [journalPack.name];

	it("keeps the cap one level below Foundry's hard limit", () => {
		expect(MAX_SEEDED_DEPTH).toBeLessThan(FOUNDRY_HARD_LIMIT);
	});

	it(`no journal source nests folders deeper than ${MAX_SEEDED_DEPTH}`, async () => {
		const tooDeep = [];
		for (const source of journalSources) {
			const folders = await readFolders(source);
			const parent = new Map(folders.map(f => [f._id, f.folder ?? null]));
			const depth = maxDepth([...parent.keys()], id => parent.get(id) ?? null);
			if (depth > MAX_SEEDED_DEPTH) tooDeep.push(`${source}: folder depth ${depth}`);
		}
		expect(tooDeep).toEqual([]);
	});

	// The actor bestiary is seeded under a synthetic "Bestiary" root, but the pack's
	// own "Bestiary" wrapper is collapsed onto it (planBestiaryFolderTree). Measure the
	// ACTUAL seeded tree the planner produces — synthetic root at depth 1 — not the raw
	// source, so the collapse is accounted for.
	it(`the seeded actor bestiary tree nests no deeper than ${MAX_SEEDED_DEPTH}`, async () => {
		const folders = await readFolders("stonetop-bestiary");
		const packFolders = folders.map(f => ({ id: f._id, name: f.name, parentId: f.folder ?? null, sort: f.sort ?? 0 }));
		const plan = planBestiaryFolderTree(packFolders, { rootName: BESTIARY_ROOT_NAME, color: BESTIARY_FOLDER_COLOR });

		// Seeded depth: synthetic root = 1; a plan folder with parentPackId null sits
		// directly under it (depth 2); each further level adds 1.
		const planParent = new Map(plan.folders.map(f => [f.packId, f.parentPackId ?? null]));
		const depth = 1 + maxDepth(plan.folders.map(f => f.packId), id => planParent.get(id) ?? null);
		expect(depth).toBeLessThanOrEqual(MAX_SEEDED_DEPTH);
	});
});
