import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { BOOK2_ART_APPLY_MANIFEST } from "../../module/book2-art/manifest.js";

// One illustration, one file.
//
// Several documents legitimately share a picture: the book draws the Adventurer and the
// Assassin in one figure, a creature's portrait is often its region's plate, a treasure can be
// a whole location plate. Every one of those rows used to name an output file of its own, so
// the importer decoded, encoded and uploaded the SAME pixels two or three times — two dozen
// byte-identical .webp on every GM's disk, and the same picture embedded twice wherever a page
// carried two of them.
//
// gen-pack-macro.js collapses them on the way out (it lives outside this repo — gitignored
// local tooling — so, like the people projection, it can only be guarded from the far side).
// These read the two things it emits: the manifest embedded in the shipped macro, which still
// carries the PDF geometry and so is the only place duplicate PIXELS are visible, and the slim
// apply manifest the runtime re-points documents with.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MACRO_PACK_DOC = path.resolve(HERE, "../../packs/src/stonetop-macros/import-book2-art.json");

/**
 * The whole manifest out of the shipped Import Book Art macro, recovered by brace-matching
 * from the `/*__MANIFEST__*\/` marker (same trick as poster-maps.test.js).
 */
function macroManifest() {
	const doc = JSON.parse(fs.readFileSync(MACRO_PACK_DOC, "utf8"));
	const marker = doc.command.indexOf("/*__MANIFEST__*/");
	const start = doc.command.indexOf("{", marker);
	let depth = 0;
	for (let i = start; i < doc.command.length; i++) {
		const c = doc.command[i];
		if (c === "{") depth++;
		else if (c === "}" && --depth === 0) return JSON.parse(doc.command.slice(start, i + 1));
	}
	throw new Error("could not find the manifest literal in the Import Book Art macro");
}

const MANIFEST = macroManifest();

/**
 * Every file the macro extracts, as { out, key } — `key` being every field it feeds into
 * decode -> crop -> encode. Two entries agreeing on all of them cannot come out as different
 * bytes; disagreeing on any one of them can. Mirrors the macro's own `wants` assembly,
 * including that a pagemap without `render` is wiring-only (its `out` is another row's file)
 * and a person is cut twice, once for the tall illustration and once for the square face.
 */
function extractions() {
	const out = [];
	const add = (row, im, portrait = null) => {
		if (!im.out || im.pdfPage == null) return;
		out.push({
			out: im.out,
			kind: row.kind,
			slug: row.slug,
			key: JSON.stringify([
				im.book ?? row.book ?? 2, im.pdfPage, im.bbox ?? null, im.w ?? null, im.h ?? null,
				im.nlong ?? null, im.crop ?? null, portrait, im.render ?? null, im.rect ?? null,
				im.dpi ?? null, im.mask ?? null,
			]),
		});
	};
	for (const row of MANIFEST.rows ?? []) {
		if (row.kind === "location") { for (const im of row.images ?? []) add(row, im); continue; }
		if (row.kind === "pagemap" && !row.render) continue; // wiring-only: extracts nothing
		add(row, row);
		if (row.portrait && row.portraitOut) add(row, { ...row, out: row.portraitOut }, row.portrait);
	}
	return out;
}

describe("the importer never writes the same picture twice", () => {
	const all = extractions();

	it("has something to check", () => {
		// A guard on the guard: a marker rename or a shape change that recovered nothing would
		// otherwise make every assertion below vacuously pass.
		expect(all.length).toBeGreaterThan(300);
	});

	it("gives every distinct picture exactly one filename", () => {
		const byKey = new Map();
		for (const e of all) {
			if (!byKey.has(e.key)) byKey.set(e.key, new Set());
			byKey.get(e.key).add(e.out);
		}
		const dupes = [...byKey.values()].filter((outs) => outs.size > 1).map((outs) => [...outs].join(" == "));
		expect(dupes, "same pixels, two output files").toEqual([]);
	});

	it("never has two different extractions claiming one filename", () => {
		// The mirror failure: two rows that write the SAME path from DIFFERENT geometry. The
		// macro extracts a path once and the first row to want it wins, so this would silently
		// ship whichever one happened to come first.
		const byOut = new Map();
		for (const e of all) {
			if (!byOut.has(e.out)) byOut.set(e.out, new Set());
			byOut.get(e.out).add(e.key);
		}
		expect([...byOut].filter(([, keys]) => keys.size > 1).map(([out]) => out)).toEqual([]);
	});
});

describe("the apply manifest agrees with the macro about where the art is", () => {
	// The two generated files are written by one script from one manifest, but they are
	// separate artifacts: a collapse applied to one and not the other would point the runtime
	// at a file the importer never writes, which looks exactly like "the GM has not imported".
	const macroOut = (kind) => new Map((MANIFEST.rows ?? []).filter((r) => r.kind === kind).map((r) => [r.slug, r.out]));

	it("names the same file for every monster, treasure and steading", () => {
		for (const kind of ["monster", "treasure", "steading"]) {
			const source = macroOut(kind);
			const rows = BOOK2_ART_APPLY_MANIFEST[`${kind}s`] ?? [];
			expect(rows.length, `${kind}s`).toBeGreaterThan(0);
			for (const row of rows) expect(row.out, `${kind} "${row.slug}"`).toBe(source.get(row.slug));
		}
	});

	it("names the same files for every location page", () => {
		const source = new Map((MANIFEST.rows ?? []).filter((r) => r.kind === "location")
			.map((r) => [`${r.slug}/${r.sectionIndex ?? 0}`, (r.images ?? []).map((im) => im.out)]));
		for (const l of BOOK2_ART_APPLY_MANIFEST.locations ?? []) {
			expect(l.images.map((im) => im.out), `location "${l.slug}"`)
				.toEqual(source.get(`${l.slug}/${l.sectionIndex ?? 0}`));
		}
	});
});

describe("retired art", () => {
	// `retired` is how a world that already imported the old manifest gets the stale embed
	// taken off the page instead of ending up with the shared illustration on it twice.
	const { monsters = [], locations = [] } = BOOK2_ART_APPLY_MANIFEST;
	const live = new Set([
		...monsters.map((m) => m.out),
		...locations.flatMap((l) => l.images.map((im) => im.out)),
		...(BOOK2_ART_APPLY_MANIFEST.treasures ?? []).map((t) => t.out),
		...(BOOK2_ART_APPLY_MANIFEST.steadings ?? []).map((s) => s.out),
	]);

	it("retires a path only where the collapse actually happened", () => {
		// Not an exact list — art gets curated — but a floor: the 24 duplicates that prompted
		// this must stay accounted for, minus the two treasures, which embed nothing and so
		// have nothing to retire.
		const retiredCount = [...monsters, ...locations].reduce((n, r) => n + (r.retired?.length ?? 0), 0);
		expect(retiredCount).toBeGreaterThanOrEqual(22);
	});

	it("never retires a path the same row still wants", () => {
		// A row that retired its own art would strip the picture it just placed, every load.
		for (const m of monsters) expect(m.retired ?? [], `monster "${m.slug}"`).not.toContain(m.out);
		for (const l of locations) {
			for (const im of l.images) expect(l.retired ?? [], `location "${l.slug}"`).not.toContain(im.out);
		}
	});

	it("points every collapsed row at a file some row still writes", () => {
		for (const out of live) expect(out).toMatch(/^assets\/(bestiary|locations|treasures|steading|people|maps)\/.+\.webp$/);
		for (const r of [...monsters, ...locations]) {
			for (const out of r.retired ?? []) {
				// A retired path is dead as a target: nothing may still point at it.
				expect(live.has(out), `"${out}" is retired but still named as live art`).toBe(false);
			}
		}
	});

	it("keeps a collapsed peer in a curated codex page's managed list", () => {
		// `managed` is the strip list, so it has to keep naming the path the page may still
		// carry from an older import — otherwise the curated pass could never clear it.
		for (const c of BOOK2_ART_APPLY_MANIFEST.codex ?? []) {
			const shown = new Set((c.slots ?? []).flatMap((s) => (s.images ?? []).map((i) => i.out)));
			for (const out of shown) expect(c.managed, `codex "${c.name}"`).toContain(out);
			for (const out of c.managed) expect(live.has(out) || !shown.has(out), `codex "${c.name}" manages "${out}"`).toBe(true);
		}
	});
});
