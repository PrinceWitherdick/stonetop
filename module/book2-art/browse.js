// What Book II art is on disk right now.
//
// Its own leaf module because two passes ask the question and neither should own it: the
// art re-apply sweeps all six durable directories (reapply.js), while the portrait-crop
// rebuild only cares about `assets/people` (rebuild-crops.js). Sharing the walk keeps the
// FilePicker compatibility shim in ONE place — that expression is exactly the kind of
// thing that has to be revisited on a Foundry version bump, and a second copy is a second
// thing to remember.

/** Every directory the importer writes durable art into. */
export const DURABLE_ART_DIRS = [
	"assets/bestiary", "assets/locations", "assets/maps",
	"assets/treasures", "assets/people", "assets/steading",
];

/**
 * Fully-qualified paths of the art currently on disk under `root`, as a Set.
 *
 * The dirs are independent, so they are browsed in parallel. A rejected browse means the
 * directory does not exist yet (the GM hasn't imported) -> nothing on disk from there.
 *
 * GM-only, since only a GM can browse the data files.
 */
export async function browseArtDirs(root, dirs = DURABLE_ART_DIRS) {
	const FP = foundry?.applications?.apps?.FilePicker ?? FilePicker;
	const present = new Set();
	const results = await Promise.all(dirs.map(dir => FP.browse("data", `${root}/${dir}`).catch(() => null)));
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
