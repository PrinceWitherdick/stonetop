import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// "Reduce Motion" promises to strip the hover-zoom image popups, and the CSS does that
// with a blanket rule scoped to `.stonetop` — which is exactly why the image previews
// keep escaping it. Every one of them is portaled to <body> to get out from under a
// scrolling ancestor's `overflow` clip, so it sits OUTSIDE `.stonetop`.
//
// Two were missed that way (the avatar preview and the People portrait preview), and
// hover-zoom kept popping for motion-sensitive users with the setting on. The CSS used to
// name each popup individually, which is what let them be missed; it now matches a shared
// `stonetop-hover-popup` marker instead, so a new popup is covered by construction.
//
// This test is the guard on that marker: a file that creates a body-portaled preview must
// put the marker on it, and the CSS must still be suppressing the marker.

const ROOT = path.resolve(__dirname, "../..");
const CSS  = fs.readFileSync(path.join(ROOT, "styles/stonetop.css"), "utf8");

/** Every .js under module/ that portals an element to <body>. */
function bodyPortalingSources() {
	const out = [];
	(function walk(dir) {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) walk(full);
			else if (entry.name.endsWith(".js")) {
				const src = fs.readFileSync(full, "utf8");
				if (src.includes("document.body.appendChild")) out.push({ file: path.relative(ROOT, full), src });
			}
		}
	})(path.join(ROOT, "module"));
	return out;
}

const MARKER = "stonetop-hover-popup";

/**
 * Class names those files assign that look like a hover preview. Only what a file actually
 * puts on an element: a `className` assignment, or a `*_CLASS` const it builds one from.
 * A bare "…preview…" string elsewhere is something else (StonetopCharacterSheet passes
 * `stonetop-avatar-preview--art` to the shared helper as a VARIANT — it creates no popup).
 */
function previewClassesIn(src) {
	const found = new Set();
	// A className assignment may now list several tokens ("marker own-class"), so take the
	// whole literal and pick the preview-looking tokens out of it.
	for (const m of src.matchAll(/className\s*=\s*"([^"\n]*)"/g)) {
		for (const token of m[1].split(/\s+/)) {
			if (/^stonetop-[a-z0-9-]*preview[a-z0-9-]*$/.test(token)) found.add(token);
		}
	}
	for (const m of src.matchAll(/[A-Z_]*CLASS[A-Z_]*\s*=\s*"(stonetop-[a-z0-9-]*preview[a-z0-9-]*)"/g)) {
		found.add(m[1]);
	}
	return [...found];
}

/** The `display: none !important` block that kills the popups outright. */
function reduceMotionSuppressionBlock() {
	const start = CSS.indexOf(".stonetop-reduce-motion .stonetop-welcome-springicon-wrap::after");
	expect(start, "reduce-motion suppression block not found — did the selector change?").toBeGreaterThan(-1);
	const end = CSS.indexOf("}", start);
	return CSS.slice(start, end);
}

describe("Reduce Motion suppresses every body-portaled hover preview", () => {
	const sources = bodyPortalingSources();
	const creators = sources.filter(s => previewClassesIn(s.src).length);

	it("finds the body-portaling sources at all (guards the scan itself)", () => {
		expect(sources.length).toBeGreaterThan(0);
		const all = creators.flatMap(s => previewClassesIn(s.src));
		// If this drops to zero the scan has silently stopped matching and the rest of
		// the suite would pass vacuously.
		expect(all.length).toBeGreaterThan(0);
		expect(all).toContain("stonetop-avatar-preview");
		expect(all).toContain("stonetop-people-preview");
	});

	it("suppresses the shared marker, not a list of individual names", () => {
		expect(
			reduceMotionSuppressionBlock(),
			`The Reduce Motion block must match .${MARKER}. Suppressing popups by their own `
			+ "class names is what let two of them be missed.",
		).toContain(`.stonetop-reduce-motion .${MARKER}`);
	});

	it("puts the marker on every body-portaled preview it creates", () => {
		const missing = creators
			.filter(({ src }) => !src.includes(MARKER))
			.map(({ file, src }) => `${previewClassesIn(src).join(", ")} (${file})`);
		expect(
			missing,
			`Body-portaled hover previews created without the "${MARKER}" marker. They sit `
			+ "outside .stonetop, so the blanket Reduce Motion rule cannot reach them — add the "
			+ "marker alongside the popup's own class:\n  " + missing.join("\n  "),
		).toEqual([]);
	});
});
