// What Book II art is on disk right now.
//
// Its own leaf module because two passes ask the question and neither should own it: the
// art re-apply sweeps all six durable directories (reapply.js), while the portrait-crop
// rebuild only cares about `assets/people` (rebuild-crops.js). Sharing the walk means one
// browse and one cache rather than two of each. Which FilePicker class to walk WITH is a
// version question, so it lives with the other version shims (`filePicker`, foundry-compat.js).

import { filePicker } from "../utils/foundry-compat.js";

/** Every directory the importer writes durable art into. */
export const DURABLE_ART_DIRS = [
	"assets/bestiary", "assets/locations", "assets/maps",
	"assets/treasures", "assets/people", "assets/steading",
];

// One in-flight-or-settled browse per `${root}|${dir}`.
//
// A single GM load asks the same directories over and over: the art re-apply sweeps all six,
// the finishing self-heal sweeps them again, the Welcome guide sweeps them a third time for
// one boolean, and the poster-map offer reads assets/maps a fourth. `assets/people` (~155
// files) and `assets/bestiary` (~200) are the two largest listings the system has, and none
// of those passes can see a different answer from the one before it — nothing writes to the
// folder in between.
//
// Something eventually does, though, which is what clearArtBrowseCache is for. The promise is
// cached rather than the result, so concurrent callers share one round trip instead of racing
// to start their own.
//
// The entry lives for the SESSION, so what it is really claiming is that every writer we know
// of announces itself — see clearArtBrowseCache for the three that do. A file that arrives any
// other way (copied in over the OS, uploaded through Foundry's own file browser) is invisible
// until the next reload. That is the deliberate trade: the alternative is re-listing ~350 files
// several times per load to catch something that essentially only happens on a dev's machine,
// where `game.stonetop.reapplyBook2Art()` busts the cache anyway.
const _browseCache = new Map();

/**
 * Forget everything browseArtDirs has cached. Call after anything writes to the durable art
 * folder. Three callers today: the crop rebuild does it directly, the Import Book Art macro is
 * caught by the settings hook in stonetop.js (publishing its art index is the last thing it
 * does), and `game.stonetop.reapplyBook2Art()` clears it for the by-hand case that nothing can
 * hook. A fourth writer must join them, or its files will not be seen this session.
 */
export function clearArtBrowseCache() {
	_browseCache.clear();
}

/** One directory's file list, from cache when we have already asked this session. */
function browseDir(root, dir) {
	const key = `${root}|${dir}`;
	let pending = _browseCache.get(key);
	if (!pending) {
		const FP = filePicker();
		// A rejected browse means the directory does not exist yet (the GM hasn't imported)
		// -> nothing on disk from there. Cached like any other answer: an absent directory
		// stays absent until something creates it, and that clears the cache.
		pending = FP.browse("data", `${root}/${dir}`).catch(() => null);
		_browseCache.set(key, pending);
	}
	return pending;
}

/**
 * Fully-qualified paths of the art currently on disk under `root`, as a Set.
 *
 * The dirs are independent, so they are browsed in parallel.
 *
 * GM-only, since only a GM can browse the data files.
 */
export async function browseArtDirs(root, dirs = DURABLE_ART_DIRS) {
	const present = new Set();
	const results = await Promise.all(dirs.map(dir => browseDir(root, dir)));
	for (const res of results) {
		if (!res) continue;
		// A malformed %-escape in a stray filename must not reject the whole pass — keep the
		// raw name on decode failure so the caller still gets everything else.
		for (const f of res.files) {
			try { present.add(decodeURIComponent(f)); }
			catch { present.add(f); }
		}
	}
	return present;
}
