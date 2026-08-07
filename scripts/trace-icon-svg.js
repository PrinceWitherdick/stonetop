#!/usr/bin/env node
/**
 * Vectorize a raster icon into the alpha-only SVG the tab rail needs.
 *
 *   node scripts/trace-icon-svg.js <in.webp|png> <out.svg> [--threshold 128] [--tolerance 0.7]
 *
 * WHY THIS EXISTS. Rail glyphs are worn as CSS *masks* (`mask: url(...)`, tinted by
 * `background-color`), so a file only shows where it carries ALPHA. The playbook icons in
 * assets/icons/playbooks are lossy WEBP with no alpha at all: a black drawing on an opaque
 * white square. Used directly as a mask, one resolves to a solid 20x20 slab. The drawing has
 * to become geometry before the rail can wear it.
 *
 * NOT a redraw. Every outline here comes from the book's own icon, traced at source
 * resolution; nothing is invented, straightened or re-styled, so the hand-inked roughness
 * survives (see the no-fabricated-game-art rule). Re-run it if the source art is ever
 * replaced.
 *
 * HOW. Chromium decodes the image (node cannot read WEBP, and Playwright is already here for
 * the offline render checks), then:
 *   1. threshold to a binary mask, ink = dark;
 *   2. marching squares over the mask for every boundary loop, outers and holes alike;
 *   3. Douglas-Peucker each loop, which is what keeps the file at kilobytes rather than the
 *      hundreds a per-pixel staircase would cost; and
 *   4. emit one `fill-rule="evenodd"` path, so a loop inside a loop is a hole with no
 *      winding bookkeeping. That is what carves the sun's centre and the ring's interior.
 *
 * The output follows assets/icons/tabs/ATTRIBUTION.md's export form: a 512x512 background
 * square at `fill-opacity="0"` (masks need the box, not the ink) under the opaque glyph.
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const PLAYWRIGHT = "z:/tmp/foundry-verify/node_modules/playwright/index.mjs";
const VIEWBOX = 512;

const [, , src, out, ...rest] = process.argv;
if (!src || !out) {
	console.error("usage: node scripts/trace-icon-svg.js <in.webp> <out.svg> [--threshold N] [--tolerance N]");
	process.exit(1);
}
const arg = (name, fallback) => {
	const i = rest.indexOf(`--${name}`);
	return i === -1 ? fallback : Number(rest[i + 1]);
};
const THRESHOLD = arg("threshold", 128);   // luma at or below this is ink
const TOLERANCE = arg("tolerance", 0.7);   // Douglas-Peucker, in source pixels
const MIN_AREA  = arg("min-area", 3);      // drop loops smaller than this (decode speckle)

/** Decode to a binary ink mask through Chromium, the one image decoder on hand. */
async function inkMask(file) {
	const { chromium } = await import(pathToFileURL(PLAYWRIGHT).href);
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		const data = fs.readFileSync(file).toString("base64");
		const mime = path.extname(file).toLowerCase() === ".png" ? "image/png" : "image/webp";
		return await page.evaluate(async ({ data, mime, threshold }) => {
			const img = new Image();
			img.src = `data:${mime};base64,${data}`;
			await img.decode();
			const c = Object.assign(document.createElement("canvas"), { width: img.width, height: img.height });
			c.getContext("2d").drawImage(img, 0, 0);
			const { data: px } = c.getContext("2d").getImageData(0, 0, img.width, img.height);
			const bits = [];
			for (let i = 0; i < px.length; i += 4) {
				// Transparent counts as blank, so this also handles a source that DOES carry alpha.
				const luma = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
				bits.push(px[i + 3] > 8 && luma <= threshold ? 1 : 0);
			}
			return { w: img.width, h: img.height, bits };
		}, { data, mime, threshold: THRESHOLD });
	} finally {
		await browser.close();
	}
}

/**
 * Every boundary loop in the mask, by marching squares.
 *
 * Corners are mask samples; each 2x2 cell contributes 0, 1 or 2 segments between the midpoints
 * of its edges. Chaining those segments end to end gives closed loops: one per outer boundary
 * AND one per hole, which is exactly what evenodd wants. The grid is padded by one blank cell
 * so a shape touching the edge still closes.
 */
function traceLoops({ w, h, bits }) {
	const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : bits[y * w + x]);
	// Midpoints of the cell's four edges, in grid coordinates.
	const TOP = (x, y) => [x + 0.5, y], RIGHT = (x, y) => [x + 1, y + 0.5];
	const BOTTOM = (x, y) => [x + 0.5, y + 1], LEFT = (x, y) => [x, y + 0.5];

	const segs = new Map();   // "x,y" -> list of segment ends, for chaining
	const key = p => `${p[0]},${p[1]}`;
	const add = (a, b) => {
		if (!segs.has(key(a))) segs.set(key(a), []);
		segs.get(key(a)).push(b);
	};

	for (let y = -1; y < h; y++) {
		for (let x = -1; x < w; x++) {
			// Corner bits, clockwise from top-left.
			const tl = at(x, y), tr = at(x + 1, y), br = at(x + 1, y + 1), bl = at(x, y + 1);
			const c = (tl << 3) | (tr << 2) | (br << 1) | bl;
			if (c === 0 || c === 15) continue;
			// Every segment runs with ink on its RIGHT. The direction is not what draws the
			// shape (evenodd ignores winding); it is what lets the segments chain, since each
			// point then has exactly one way in and one way out.
			const T = TOP(x, y), R = RIGHT(x, y), B = BOTTOM(x, y), L = LEFT(x, y);
			switch (c) {
				case 1:  add(L, B); break;
				case 2:  add(B, R); break;
				case 3:  add(L, R); break;
				case 4:  add(R, T); break;
				// Saddles: two opposite ink corners, so two segments, each cut the same way it
				// would be if it were alone in the cell. Both saddles resolve as "the ink
				// corners are separate", consistently, which is what stops one cell joining
				// two loops that the other cell keeps apart.
				case 5:  add(R, T); add(L, B); break;   // ink at top-right and bottom-left
				case 6:  add(B, T); break;
				case 7:  add(L, T); break;
				case 8:  add(T, L); break;
				case 9:  add(T, B); break;
				case 10: add(T, L); add(B, R); break;   // ink at top-left and bottom-right
				case 11: add(T, R); break;
				case 12: add(R, L); break;
				case 13: add(R, B); break;
				case 14: add(B, L); break;
			}
		}
	}

	const loops = [];
	while (segs.size) {
		const startKey = segs.keys().next().value;
		let cur = startKey.split(",").map(Number);
		const loop = [cur];
		for (;;) {
			const outs = segs.get(key(cur));
			if (!outs?.length) break;
			const next = outs.pop();
			if (!outs.length) segs.delete(key(cur));
			loop.push(next);
			cur = next;
			if (key(cur) === startKey) break;
		}
		if (loop.length > 3) loops.push(loop);
	}
	return loops;
}

/** Twice the signed area, which doubles as the "is this just decode speckle" test. */
const area2 = loop => loop.reduce((s, p, i) => {
	const q = loop[(i + 1) % loop.length];
	return s + (p[0] * q[1] - q[0] * p[1]);
}, 0);

/** Douglas-Peucker on an open run of points. */
function simplify(points, tol) {
	if (points.length < 3) return points;
	const [a] = points, b = points[points.length - 1];
	let far = 0, best = -1;
	for (let i = 1; i < points.length - 1; i++) {
		const d = pointLineDistance(points[i], a, b);
		if (d > far) { far = d; best = i; }
	}
	if (far <= tol) return [a, b];
	return [...simplify(points.slice(0, best + 1), tol).slice(0, -1), ...simplify(points.slice(best), tol)];
}

function pointLineDistance(p, a, b) {
	const dx = b[0] - a[0], dy = b[1] - a[1];
	if (!dx && !dy) return Math.hypot(p[0] - a[0], p[1] - a[1]);
	const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
	const cx = a[0] + t * dx, cy = a[1] + t * dy;
	return Math.hypot(p[0] - cx, p[1] - cy);
}

const mask = await inkMask(src);
const scale = VIEWBOX / Math.max(mask.w, mask.h);
const offX = (VIEWBOX - mask.w * scale) / 2, offY = (VIEWBOX - mask.h * scale) / 2;
const round = n => Number(n.toFixed(1));

const loops = traceLoops(mask)
	.filter(loop => Math.abs(area2(loop)) / 2 >= MIN_AREA)
	// A closed ring arrives with its first point repeated at the end. Douglas-Peucker keeps
	// both, which pins the seam and makes it the one point that can never be dropped; the
	// duplicate is then redundant, since `Z` closes the path anyway.
	.map(loop => {
		const simplified = simplify(loop, TOLERANCE);
		const last = simplified[simplified.length - 1];
		return String(last) === String(simplified[0]) ? simplified.slice(0, -1) : simplified;
	})
	.filter(loop => loop.length >= 3);

const d = loops.map(loop => {
	const pts = loop.map(([x, y]) => [round(x * scale + offX), round(y * scale + offY)]);
	return `M${pts[0][0]} ${pts[0][1]}` + pts.slice(1).map(p => `L${p[0]} ${p[1]}`).join("") + "Z";
}).join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEWBOX} ${VIEWBOX}">` +
	`<path d="M0 0h${VIEWBOX}v${VIEWBOX}H0z" fill="#ffffff" fill-opacity="0"/>` +
	`<path fill-rule="evenodd" d="${d}"/></svg>\n`;

fs.writeFileSync(out, svg);
console.log(`${path.basename(out)}: ${loops.length} loops, ` +
	`${loops.reduce((n, l) => n + l.length, 0)} points, ${(svg.length / 1024).toFixed(1)} KB`);
