import { BOOK2_ART_APPLY_MANIFEST } from "./manifest.js";
import { book2ArtRoot, book2ArtSrcWith } from "./art-root.js";
import { browseArtDirs, clearArtBrowseCache } from "./browse.js";

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
// coordinate, zero-padded. 1000 is four digits, so the groups are 3 OR 4 long — a `\d{3}`
// pattern silently misses every rect touching an edge, which is most of them.
const CROP_SUFFIX_RX = /-c\d{3,4}(?:-\d{3,4}){3}$/;

export const isCropSlug = (slug) => CROP_SUFFIX_RX.test(String(slug ?? ""));
export const parentSlugOf = (slug) => String(slug ?? "").replace(CROP_SUFFIX_RX, "");

/** Four fractions in [0,1] describing a positive-area rect. Mirrors merge-art-picker.py. */
export function isValidCrop(crop) {
	if (!Array.isArray(crop) || crop.length !== 4) return false;
	const [x0, y0, x1, y1] = crop.map(Number);
	if (![x0, y0, x1, y1].every((n) => Number.isFinite(n) && n >= 0 && n <= 1)) return false;
	return x1 > x0 && y1 > y0;
}

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

/** Cut a fractional sub-rect out of a loaded image, at the parent's own resolution. */
function cropToCanvas(img, [x0, y0, x1, y1]) {
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
export function loadImage(src) {
	return new Promise((resolve, reject) => {
		const img = new Image();
		// The art folder is same-origin (it is served out of the user's own data path), but ask
		// for anonymous CORS anyway so the canvas is never tainted — a tainted canvas throws only
		// at toBlob, i.e. after all the work.
		img.crossOrigin = "anonymous";
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

	const FP = foundry?.applications?.apps?.FilePicker ?? FilePicker;
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
			result.skipped.push({ slug: item.slug, reason: String(err?.message ?? err) });
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
