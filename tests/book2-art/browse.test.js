import { describe, it, expect, beforeEach, vi } from "vitest";
import { browseArtDirs, clearArtBrowseCache, DURABLE_ART_DIRS } from "../../module/book2-art/browse.js";

// The durable-art listing is cached for the session, which is only safe because every writer
// clears it. These pin both halves of that bargain: the cache actually saves the round trips
// a single load would otherwise repeat, and it genuinely lets go when told to.

const ROOT = "stonetop-book-art";

function harness(filesByDir = {}) {
	const browse = vi.fn(async (_source, path) => {
		const dir = Object.keys(filesByDir).find(d => path.endsWith(`/${d}`));
		if (!dir) throw new Error(`no such directory: ${path}`);
		return { files: filesByDir[dir].map(f => `${ROOT}/${dir}/${f}`) };
	});
	global.FilePicker = { browse };
	global.foundry = {};
	return browse;
}

beforeEach(() => {
	clearArtBrowseCache();
	vi.restoreAllMocks();
});

describe("browseArtDirs", () => {
	it("returns every file across the directories it was given", async () => {
		harness({ "assets/people": ["a.webp", "b.webp"], "assets/maps": ["m.webp"] });
		const present = await browseArtDirs(ROOT, ["assets/people", "assets/maps"]);
		expect([...present].sort()).toEqual([
			`${ROOT}/assets/maps/m.webp`,
			`${ROOT}/assets/people/a.webp`,
			`${ROOT}/assets/people/b.webp`,
		]);
	});

	it("browses each directory once, however many passes ask for it", async () => {
		const browse = harness({ "assets/people": ["a.webp"] });
		await browseArtDirs(ROOT, ["assets/people"]);
		await browseArtDirs(ROOT, ["assets/people"]);
		await browseArtDirs(ROOT, ["assets/people"]);
		expect(browse).toHaveBeenCalledTimes(1);
	});

	it("shares one round trip between callers that ask at the same moment", async () => {
		const browse = harness({ "assets/people": ["a.webp"] });
		await Promise.all([
			browseArtDirs(ROOT, ["assets/people"]),
			browseArtDirs(ROOT, ["assets/people"]),
		]);
		// The promise is cached, not the result, so the second caller joins the first request
		// rather than racing to start its own.
		expect(browse).toHaveBeenCalledTimes(1);
	});

	it("caches per directory, so a narrower pass reuses the wide pass's answers", async () => {
		const browse = harness({ "assets/people": ["a.webp"], "assets/maps": ["m.webp"] });
		await browseArtDirs(ROOT, ["assets/people", "assets/maps"]);
		await browseArtDirs(ROOT, ["assets/maps"]);
		expect(browse).toHaveBeenCalledTimes(2);
	});

	it("keys on the root, so pointing at a different art folder is not a cache hit", async () => {
		const browse = harness({ "assets/people": ["a.webp"] });
		await browseArtDirs(ROOT, ["assets/people"]);
		await browseArtDirs("somewhere-else", ["assets/people"]);
		expect(browse).toHaveBeenCalledTimes(2);
	});

	it("re-browses once the cache is cleared, and sees what was written since", async () => {
		const files = { "assets/people": ["a.webp"] };
		const browse = harness(files);
		expect([...await browseArtDirs(ROOT, ["assets/people"])]).toEqual([`${ROOT}/assets/people/a.webp`]);

		files["assets/people"].push("b.webp");
		// Still the stale answer: nothing has said the folder changed.
		expect([...await browseArtDirs(ROOT, ["assets/people"])]).toHaveLength(1);

		clearArtBrowseCache();
		expect([...await browseArtDirs(ROOT, ["assets/people"])]).toHaveLength(2);
		expect(browse).toHaveBeenCalledTimes(2);
	});

	it("treats a missing directory as nothing on disk, and does not re-ask for it", async () => {
		const browse = harness({ "assets/people": ["a.webp"] });
		// "assets/maps" is absent, so the mock rejects — the GM has not imported any maps.
		const present = await browseArtDirs(ROOT, ["assets/people", "assets/maps"]);
		expect([...present]).toEqual([`${ROOT}/assets/people/a.webp`]);

		await browseArtDirs(ROOT, ["assets/maps"]);
		expect(browse).toHaveBeenCalledTimes(2); // one people + one maps, neither repeated
	});

	it("defaults to every durable art directory", async () => {
		const browse = harness(Object.fromEntries(DURABLE_ART_DIRS.map(d => [d, []])));
		await browseArtDirs(ROOT);
		expect(browse).toHaveBeenCalledTimes(DURABLE_ART_DIRS.length);
	});
});
