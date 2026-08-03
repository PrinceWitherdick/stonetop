import { BOOK2_ART_APPLY_MANIFEST } from "./manifest.js";
import { book2ArtRoot, book2ArtSrcWith } from "./art-root.js";
import { browseArtDirs, clearArtBrowseCache } from "./browse.js";
import { isValidRect, RECT_SUFFIX_GROUPS } from "./people-portraits.js";
import { filePicker } from "../utils/foundry-compat.js";

/**
 * Rebuild missing "People of Stonetop" detail portraits from art the GM has ALREADY imported,
 * without touching their PDFs.
 *
 * A person row may be a `crop`: a fractional [x0,y0,x1,y1] sub-rect of one illustration, so a
 * drawing with several figures yields one portrait per person. Those crops were added after the
 * first release that shipped whole-illustration portraits, which leaves an upgrading GM holding
 * every PARENT illustration on disk but none of the details cut from it. Re-running the importer
 * would work, but it means finding the books again and re-extracting everything.
 *
 * There is a shortcut: the crop rect is fractional, so cutting it out of the parent's webp gives
 * the same framing as cutting it out of the PDF. The only cost is resolution — the parent on disk
 * was already downscaled once (the importer caps the long side), so a detail derived from it is
 * smaller than one lifted from the full-resolution stencil. Measured over the current manifest
 * that is a median long side of ~525px against ~682px, with nothing below 200px, which is ample
 * for a gallery thumbnail or a sheet portrait. A GM who wants the maximum can still re-import.
 *
 * The parent's path is not stored anywhere: it is derivable from the crop's own slug, which is
 * the parent slug plus a `-cNNN-NNN-NNN-NNN` suffix (see merge-art-picker.py's `crop_suffix`).
 * That is what makes this possible with no extra manifest data beyond the rect itself.
 *
 * GM-only — it browses and uploads data files.
 */

// The slug suffix merge-art-picker.py appends for a crop: per-mille of each fractional
// coordinate, zero-padded. The digit groups come from RECT_SUFFIX_GROUPS so the 3-OR-4 rule
// (1000 is four digits) is stated once for both suffixes — writing it out a second time here is
// what let a `\d{3}` pattern miss every rect touching an edge. End-anchored, unlike the square's:
// this one runs against SLUGS, which have no extension.
const CROP_SUFFIX_RX = new RegExp(`-c${RECT_SUFFIX_GROUPS}$`);

export const isCropSlug = (slug) => CROP_SUFFIX_RX.test(String(slug ?? ""));
export const parentSlugOf = (slug) => String(slug ?? "").replace(CROP_SUFFIX_RX, "");

/**
 * Four fractions in [0,1] describing a positive-area rect. Mirrors merge-art-picker.py.
 *
 * Same contract as a square's rect, and stated once in people-portraits.js — a crop and a square
 * are the same kind of thing, and two copies of this predicate would be two things to keep in
 * step with the Python.
 */
export const isValidCrop = isValidRect;

/**
 * Which detail portraits could be rebuilt right now, given what is on disk.
 *
 * Pure and side-effect free so it can be unit-tested and so the prompt can count the work
 * without doing any of it. `present` is the set of fully-qualified paths from the art browse.
 */
export function plannedCropRebuilds(present, root, people = BOOK2_ART_APPLY_MANIFEST.people ?? []) {
	const srcOf = (out) => book2ArtSrcWith(root, out);
	const plan = [];
	for (const p of people) {
		if (!p?.crop || !p.out || !isCropSlug(p.slug)) continue;
		if (!isValidCrop(p.crop)) continue;
		const dest = srcOf(p.out);
		if (present.has(dest)) continue;               // already have this detail
		// The parent keeps its own filename in the same folder, whether or not it is still a
		// person row itself — a parent superseded by its crops stays on disk, just unreferenced.
		const parentOut = `${p.out.slice(0, p.out.lastIndexOf("/") + 1)}${parentSlugOf(p.slug)}.webp`;
		const parentSrc = srcOf(parentOut);
		if (!present.has(parentSrc)) continue;         // nothing to cut it from
		plan.push({ slug: p.slug, name: p.name, out: p.out, crop: p.crop, dest, parentSrc });
	}
	return plan;
}

/**
 * Which SQUARE faces could be cut right now, given what is on disk.
 *
 * Same shape and same runner as a crop rebuild, because it is the same operation: cut a
 * fractional rect out of an image already on disk. What differs is only where the rect is
 * measured — a square is measured against the PERSON image, so the source is that image
 * directly (`p.out`), with no slug arithmetic to recover a parent.
 *
 * This is the whole upgrade path for squares. A GM who already imported holds every person
 * image; the squares are new files cut from those, so nobody has to find their PDFs again. The
 * cost is resolution only, and a square is the smallest thing this pipeline produces.
 */
export function plannedPortraitRebuilds(present, root, people = BOOK2_ART_APPLY_MANIFEST.people ?? []) {
	const srcOf = (out) => book2ArtSrcWith(root, out);
	const plan = [];
	for (const p of people) {
		if (!p?.portrait || !p.portraitOut || !p.out) continue;
		if (!isValidRect(p.portrait)) continue;
		const dest = srcOf(p.portraitOut);
		if (present.has(dest)) continue;               // already have this square
		const parentSrc = srcOf(p.out);
		if (!present.has(parentSrc)) continue;         // nothing to cut it from
		plan.push({ slug: p.slug, name: p.name, out: p.portraitOut, crop: p.portrait, dest, parentSrc });
	}
	return plan;
}

/**
 * Cut a fractional sub-rect out of a loaded image, at the parent's own resolution. Shared with
 * the Tokenizer bridge (utils/portrait-tokenizer.js), which bakes a chosen frame the same way —
 * the never-floor-a-span-to-zero rule below has to hold for both, and one copy of it is one
 * place to fix.
 */
export function cropToCanvas(img, [x0, y0, x1, y1]) {
	const iw = img.naturalWidth ?? img.width;
	const ih = img.naturalHeight ?? img.height;
	// Round to whole pixels, but never to nothing: a sliver rect on a small parent could
	// otherwise floor to a zero-width canvas, which throws on toBlob.
	const sx = Math.round(x0 * iw);
	const sy = Math.round(y0 * ih);
	const sw = Math.max(1, Math.round((x1 - x0) * iw));
	const sh = Math.max(1, Math.round((y1 - y0) * ih));
	const canvas = document.createElement("canvas");
	canvas.width = sw;
	canvas.height = sh;
	const ctx = canvas.getContext("2d");
	ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
	return canvas;
}

/**
 * Load an image from the Foundry data folder, rejecting when it does not load — which is how
 * a path that browse reported but the browser cannot read (a truncated upload, say) fails its
 * own item rather than the whole batch. Shared with the poster-map scene builder.
 */
export function loadImage(src, { crossOrigin = "anonymous" } = {}) {
	return new Promise((resolve, reject) => {
		const img = new Image();
		// The art folder is same-origin (it is served out of the user's own data path), but ask
		// for anonymous CORS anyway so the canvas is never tainted — a tainted canvas throws only
		// at toBlob, i.e. after all the work.
		//
		// A caller that never touches a canvas passes null instead, because this default makes the
		// load FAIL outright against any host sending no CORS headers — which is most of the web,
		// and exactly the external art the portrait framer is expected to open.
		if (crossOrigin !== null) img.crossOrigin = crossOrigin;
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error(`could not load ${src}`));
		img.src = src;
	});
}

const WEBP_QUALITY = 0.85; // matches the importer's CONFIG.QUALITY

/**
 * Do the rebuild. Returns { written, failed, skipped } — `skipped` is work that was planned but
 * whose parent turned out unreadable, so a partial run is honest rather than silently short.
 * Each file is written independently: one bad parent must not abandon the other 142.
 */
export async function rebuildPeopleCrops({ plan = null, onProgress = null } = {}) {
	const root = book2ArtRoot();
	const work = plan ?? plannedCropRebuilds(await browsePeopleArt(root), root);
	const result = { written: 0, failed: 0, skipped: [], total: work.length };
	if (!work.length) return result;

	const FP = filePicker();
	const dir = `${root}/assets/people`;
	let done = 0;
	// One fetch + decode per PARENT, not per crop: the shipped manifest cuts ~143 details out
	// of ~51 illustrations, and the busiest parent feeds eleven of them. Grouping by parent is
	// what makes a single-slot cache enough — it also means only ONE decoded full-page image
	// is held at a time, rather than a map of all 51 for the length of the run.
	const grouped = [...work].sort((a, b) => String(a.parentSrc).localeCompare(String(b.parentSrc)));
	let loadedSrc = null;
	let loadedImg = null;
	for (const item of grouped) {
		try {
			if (loadedSrc !== item.parentSrc) {
				// Claim the slot BEFORE awaiting, and drop the previous image first: a parent
				// that fails to load is then attempted once, not once per crop cut from it, and
				// each of its crops still records an honest reason of its own.
				loadedSrc = item.parentSrc;
				loadedImg = null;
				loadedImg = await loadImage(item.parentSrc);
			}
			if (!loadedImg) throw new Error(`could not load ${item.parentSrc}`);
			const canvas = cropToCanvas(loadedImg, item.crop);
			const blob = await new Promise((res) => canvas.toBlob(res, "image/webp", WEBP_QUALITY));
			if (!blob) throw new Error("encode returned no blob");
			const name = item.out.slice(item.out.lastIndexOf("/") + 1);
			await FP.upload("data", dir, new File([blob], name, { type: "image/webp" }),
				{ overwrite: true }, { notify: false });
			result.written++;
		} catch (err) {
			result.failed++;
			// `dest` as well as the slug: a later pass cuts squares out of the very files this one
			// writes, and it can only skip the ones that never arrived if it is told their paths.
			result.skipped.push({ slug: item.slug, dest: item.dest, reason: String(err?.message ?? err) });
			console.warn(`Stonetop | could not rebuild portrait ${item.slug}:`, err);
		}
		onProgress?.(++done, work.length);
	}
	// New files in assets/people, so anything holding a listing of it is now out of date.
	if (result.written) clearArtBrowseCache();
	return result;
}

/** The people art on disk. Narrower than reapply's browse: this pass only cares about portraits. */
export const browsePeopleArt = (root = book2ArtRoot()) => browseArtDirs(root, ["assets/people"]);

/**
 * Everything cuttable from the people art on disk, as two ordered passes.
 *
 * Two passes, in that order, and NOT one merged plan — because a square is cut from the person
 * image, and for 143 of the 155 people that image is itself a detail this very run is about to
 * create. Merging them would let the runner's parent-grouping sort interleave the two and ask
 * for a square before its source exists.
 *
 * The square plan is still worked out UP FRONT, against what disk WILL hold once the details
 * land, so a caller gets an honest total to count against rather than a progress bar that grows
 * halfway through. That makes it OPTIMISTIC by construction: it assumes every detail cuts. The
 * runner is where the assumption is settled — rebuildPeopleArt drops the squares whose source
 * never arrived, rather than asking for a file nothing wrote.
 *
 * Stated once, here, because the counter and the runner have to agree about that total: two
 * copies of this ordering rule could drift into offering a number the run then disproves.
 */
async function planPeopleArt(root = book2ArtRoot()) {
	const present = await browsePeopleArt(root);
	const crops = plannedCropRebuilds(present, root);
	const afterCrops = new Set([...present, ...crops.map((c) => c.dest)]);
	return { crops, squares: plannedPortraitRebuilds(afterCrops, root) };
}

/**
 * Split the square plan by whether its source actually made it onto disk.
 *
 * The plan was drawn against what disk WOULD hold once the details landed (see planPeopleArt),
 * which makes it optimistic: a detail that could not be cut never arrives, and the square cut
 * from it then has no source. Attempting it anyway fails a SECOND time over the same single bad
 * file — the GM is told "2 could not be read" about one, and the console names a path no browse
 * ever reported as present.
 *
 * So the orphans come out separately rather than being dropped: they are still counted as done
 * and still listed as skipped, because a run that quietly produces fewer files than it announced
 * is the other half of the same dishonesty. They are simply not a second failure.
 *
 * Pure, and given the crop pass's own skip list rather than reading it, so the arithmetic that
 * decides all of the above is testable without a canvas.
 */
export function splitSquaresBySource(squares, cropSkips) {
	const unwritten = new Set((cropSkips ?? []).map((s) => s?.dest).filter(Boolean));
	const cuttable = [], orphaned = [];
	for (const s of squares ?? []) (unwritten.has(s.parentSrc) ? orphaned : cuttable).push(s);
	return { cuttable, orphaned };
}

/** Cut everything cuttable: the detail portraits, then the square faces. */
export async function rebuildPeopleArt({ onProgress = null } = {}) {
	const { crops, squares } = await planPeopleArt();
	const total = crops.length + squares.length;
	let done = 0;
	const step = () => onProgress?.(++done, total);
	const a = await rebuildPeopleCrops({ plan: crops, onProgress: step });

	const { cuttable, orphaned } = splitSquaresBySource(squares, a.skipped);
	for (const _ of orphaned) step();   // counted as done, so the bar reaches the announced total

	const b = await rebuildPeopleCrops({ plan: cuttable, onProgress: step });
	return {
		written: a.written + b.written,
		failed: a.failed + b.failed,
		skipped: [
			...a.skipped,
			...b.skipped,
			...orphaned.map((s) => ({
				slug: s.slug,
				dest: s.dest,
				reason: `source ${s.parentSrc} could not be rebuilt`,
			})),
		],
		total,
	};
}

/** How much `rebuildPeopleArt` would do, without doing any of it. Used to decide whether to ask. */
export async function plannedPeopleArtRebuilds(root = book2ArtRoot()) {
	const { crops, squares } = await planPeopleArt(root);
	return [...crops, ...squares];
}
