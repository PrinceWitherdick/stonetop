import { BOOK2_ART_APPLY_MANIFEST } from "./manifest.js";

/**
 * The square face cut out of a "People of Stonetop" portrait, and how it relates to the whole
 * illustration it came from.
 *
 * The art is book illustration: standing figures. Across the shipped manifest the median person
 * image is h/w 1.52, the tallest is 3.28, and 115 of 155 are taller than 1.2. Every place a face
 * appears in play is small and round — 22px steading roster circles, 26px relationship hearts,
 * 75px follower cards, the Actors sidebar, a token. Cropping a tall figure to a circle with CSS
 * alone takes a blind top slice, which on a 3:1 figure is as likely to be sky and hat brim as a
 * face. So the square is CHOSEN by hand in the picker, once per portrait, and cut as its own
 * small file.
 *
 * That file is what an actor's `img` points at, which is why every small surface needed no
 * change: they all already read `.img`. The whole illustration stays on disk beside it and is
 * what the NPC sheet header and the hover previews show.
 *
 * Everything here is pure and Foundry-free so it can be unit-tested, and so a caller in a
 * template helper or a data-model getter can use it without dragging settings in.
 */

/**
 * The four per-mille coordinate groups every rect suffix is made of, as regex source.
 *
 * The groups are 3 OR 4 digits long, because per-mille of 1.0 is `1000`. A `\d{3}` pattern
 * silently misses every rect touching an edge — which is most of them, since a square is
 * usually flush with the top of the figure. That mistake has already cost this project one
 * wrong number, and it was then restated in a second regex for crops, which is two chances to
 * make it again. Both suffixes now build on this: only the leading letter and the anchor
 * differ, and each site supplies its own.
 */
export const RECT_SUFFIX_GROUPS = String.raw`\d{3,4}(?:-\d{3,4}){3}`;

/**
 * A square's filename suffix: per-mille of each fractional coordinate, zero-padded. Mirrors
 * merge-art-picker.py's `portrait_suffix`, and deliberately mirrors the `-c` CROP suffix in
 * shape so the two read alike in a directory listing.
 *
 * Matched before the extension (or at end of string), because this runs against PATHS —
 * unlike the crop suffix, which is end-anchored because it runs against slugs.
 */
const PORTRAIT_SUFFIX_RX = new RegExp(`-q${RECT_SUFFIX_GROUPS}(?=\\.[^.]+$|$)`);

/** Four fractions in [0,1] describing a positive-area rect. Same contract as a crop. */
export function isValidRect(rect) {
	if (!Array.isArray(rect) || rect.length !== 4) return false;
	const [x0, y0, x1, y1] = rect.map(Number);
	if (![x0, y0, x1, y1].every((n) => Number.isFinite(n) && n >= 0 && n <= 1)) return false;
	return x1 > x0 && y1 > y0;
}

// NB: a fractional rect is NOT square just because its two spans are equal — the image
// underneath is not square, so equal fractions describe a rect as lopsided as the image.
// Squareness is only meaningful in pixels, which is why all four numbers are stored rather than
// an origin and a side. Nothing in the system needs to ASK whether a rect came out square: the
// picker settles that when the square is chosen, and merge-art-picker.py checks it there.

const permille = (f) => String(Math.round(f * 1000)).padStart(3, "0");

/** `-q<x0>-<y0>-<x1>-<y1>`, per-mille. MUST agree with the Python, or a re-export orphans files. */
export function portraitSuffix(rect) {
	return "-q" + rect.map(permille).join("-");
}

/** The square's own `out` path: the person's path with the suffix spliced before its extension. */
export function portraitOutFor(out, rect) {
	const s = String(out);
	const dot = s.lastIndexOf(".");
	const slash = s.lastIndexOf("/");
	if (dot <= slash) return s + portraitSuffix(rect);   // no extension to splice before
	return s.slice(0, dot) + portraitSuffix(rect) + s.slice(dot);
}

// A square is always measured against the PERSON image — after `crop`, not before. There is
// deliberately no "compose these two rects" helper: both extraction paths apply them in
// sequence instead (the importer cuts crop then square out of the same lifted stencil; the
// in-Foundry rebuild cuts the square straight out of the person file on disk). Sequencing IS
// the composition, and it leaves no combined rect to compute and get subtly wrong.

// Filename <-> filename, both directions, built once per people list.
//
// Keying on the BASENAME rather than the full path is what keeps this root-agnostic: the durable
// art folder is configurable, so a caller holding a resolved `stonetop-book-art/assets/people/x`
// would otherwise have to know the root to say anything about it. A square always sits in the
// same directory as its person image, so swapping one basename for the other is enough — and
// slugs are unique, so a basename identifies a row on its own.
const cache = new WeakMap();
// A stable identity for "no people at all", so an older build whose manifest predates this
// field does not mint a fresh array on every call and defeat the cache.
const NONE = [];

function index(people) {
	const rows = people ?? BOOK2_ART_APPLY_MANIFEST.people ?? NONE;
	const hit = cache.get(rows);
	if (hit) return hit;
	const toFull = new Map();
	const toSquare = new Map();
	const base = (p) => String(p).slice(String(p).lastIndexOf("/") + 1);
	for (const p of rows) {
		if (!p?.out || !p.portraitOut) continue;
		toFull.set(base(p.portraitOut), base(p.out));
		toSquare.set(base(p.out), base(p.portraitOut));
	}
	const built = { toFull, toSquare };
	cache.set(rows, built);
	return built;
}

const swapBasename = (src, file) => String(src).slice(0, String(src).lastIndexOf("/") + 1) + file;

/**
 * The whole illustration behind a square portrait path, or null if this is not one.
 *
 * Checked against the manifest rather than merely stripping the suffix, so a GM's own file that
 * happens to look like a square resolves to nothing instead of to a path that does not exist.
 */
export function fullPortraitSrc(src, people) {
	if (!src) return null;
	const s = String(src);
	const file = s.slice(s.lastIndexOf("/") + 1);
	const full = index(people).toFull.get(file);
	return full ? swapBasename(s, full) : null;
}

/** The square cut from this illustration, or null. The inverse of `fullPortraitSrc`. */
export function squarePortraitSrc(src, people) {
	if (!src) return null;
	const s = String(src);
	const file = s.slice(s.lastIndexOf("/") + 1);
	const square = index(people).toSquare.get(file);
	return square ? swapBasename(s, square) : null;
}

/** Shape-only test, for callers with no manifest to hand (the manifest's own parity checks). */
export const hasPortraitSuffix = (path) => PORTRAIT_SUFFIX_RX.test(String(path ?? ""));
