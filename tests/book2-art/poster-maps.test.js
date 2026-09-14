import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
	POSTER_MAPS, isPosterMapScene, planPosterMapScenes, posterMapSceneHeight,
} from "../../module/book2-art/poster-maps.js";

// Rebuilding the poster-map Scenes from images already on disk, so a GM who imported their
// maps in one world doesn't have to re-run the whole PDF import to get the Scenes in the
// next one. These cover the catalog and the pure planning half; creating the Scene itself
// needs Foundry.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MACRO_PACK_DOC = path.resolve(HERE, "../../packs/src/stonetop-macros/import-book2-art.json");

const ROOT = "stonetop-book-art";
const durable = (out) => `${ROOT}/${out}`;

/**
 * The `maps` array out of the shipped Import Book Art macro. The macro embeds its whole
 * manifest as a JSON literal behind a `/*__MANIFEST__*\/` marker, so this recovers it by
 * brace-matching from the marker rather than trying to import a 150 KB macro body.
 */
function macroManifestMaps() {
	const doc = JSON.parse(fs.readFileSync(MACRO_PACK_DOC, "utf8"));
	const marker = doc.command.indexOf("/*__MANIFEST__*/");
	const start = doc.command.indexOf("{", marker);
	let depth = 0;
	for (let i = start; i < doc.command.length; i++) {
		const c = doc.command[i];
		if (c === "{") depth++;
		else if (c === "}" && --depth === 0) return JSON.parse(doc.command.slice(start, i + 1)).maps;
	}
	throw new Error("could not find the manifest literal in the Import Book Art macro");
}

describe("POSTER_MAPS mirrors the importer macro's manifest", () => {
	// The macro's manifest is not shipped as a module, so the runtime cannot derive this
	// catalog and has to duplicate it. That is fine as long as it can never drift silently:
	// a map renamed, re-sorted, or re-pathed in the macro but not here would have the offer
	// build a Scene whose background points at a file the importer no longer writes.
	const macroMaps = macroManifestMaps();

	it("covers exactly the same maps, in the same order", () => {
		expect(POSTER_MAPS.map(m => m.slug)).toEqual(macroMaps.map(m => m.slug));
	});

	it("agrees on every field the Scene is built from", () => {
		for (const map of POSTER_MAPS) {
			const source = macroMaps.find(m => m.slug === map.slug);
			expect(source, `macro manifest has no map "${map.slug}"`).toBeTruthy();
			for (const key of ["name", "navName", "navOrder", "sort", "out", "hint", "width", "height"]) {
				expect(map[key], `${map.slug}.${key}`).toEqual(source[key]);
			}
		}
	});

	it("agrees on the village map's lettered pins", () => {
		for (const map of POSTER_MAPS) {
			const source = macroMaps.find(m => m.slug === map.slug);
			expect(map.notes ?? [], `${map.slug}.notes`).toEqual(source.notes ?? []);
		}
	});

	it("only ever names files inside the durable maps folder", () => {
		for (const map of POSTER_MAPS) expect(map.out.startsWith("assets/maps/")).toBe(true);
	});
});

describe("isPosterMapScene", () => {
	const village = POSTER_MAPS[0];

	it("matches on our own flag", () => {
		expect(isPosterMapScene({ name: "Renamed", flags: { "stonetop_pwd": { posterMap: village.slug } } }, village)).toBe(true);
	});

	it("matches a Scene the macro stamped under a legacy package id", () => {
		// The macro stamps the RUNTIME game.system.id, which on a renamed install is not the
		// pinned SYSTEM_ID. Missing this would build a second Scene beside the GM's existing one.
		expect(isPosterMapScene({ name: "Renamed", flags: { stonetop_pwd: { posterMap: village.slug } } }, village)).toBe(true);
	});

	it("falls back to the map's name when there is no flag at all", () => {
		expect(isPosterMapScene({ name: village.name, flags: {} }, village)).toBe(true);
	});

	it("does not match another map's Scene", () => {
		expect(isPosterMapScene({ name: "Marshedge", flags: { "stonetop_pwd": { posterMap: "marshedge" } } }, village)).toBe(false);
	});

	it("survives a Scene with no flags object", () => {
		expect(isPosterMapScene({ name: "Something else" }, village)).toBe(false);
	});
});

describe("planPosterMapScenes", () => {
	it("offers only maps whose image is actually on disk", () => {
		const present = new Set([durable(POSTER_MAPS[0].out), durable(POSTER_MAPS[3].out)]);
		const plan = planPosterMapScenes(present, ROOT, []);
		expect(plan.map(row => row.map.slug)).toEqual([POSTER_MAPS[0].slug, POSTER_MAPS[3].slug]);
		expect(plan.every(row => row.hasScene === false)).toBe(true);
	});

	it("resolves each row's source path against the art root", () => {
		const present = new Set([durable(POSTER_MAPS[1].out)]);
		const [row] = planPosterMapScenes(present, "my-art", []);
		expect(row).toBeUndefined(); // the set was built against a different root

		const [hit] = planPosterMapScenes(new Set(["my-art/" + POSTER_MAPS[1].out]), "my-art", []);
		expect(hit.src).toBe("my-art/" + POSTER_MAPS[1].out);
	});

	it("flags a map this world already has a Scene for", () => {
		const present = new Set(POSTER_MAPS.map(m => durable(m.out)));
		const scenes = [{ name: "whatever", flags: { "stonetop_pwd": { posterMap: "vicinity" } } }];
		const plan = planPosterMapScenes(present, ROOT, scenes);
		expect(plan.find(r => r.map.slug === "vicinity").hasScene).toBe(true);
		expect(plan.filter(r => r.hasScene)).toHaveLength(1);
	});

	it("is empty when nothing has been imported", () => {
		expect(planPosterMapScenes(new Set(), ROOT, [])).toEqual([]);
	});
});

describe("posterMapSceneHeight", () => {
	// The catalog width is fixed; only the ratio moves. A stand-in map so the numbers are
	// readable rather than being the real 6000×4714.
	const MAP = { width: 1000, height: 800 };

	it("takes the aspect ratio from the GM's own image, not the catalog", () => {
		expect(posterMapSceneHeight(MAP, { w: 2000, h: 1000 })).toBe(500);
		expect(posterMapSceneHeight(MAP, { w: 1000, h: 2500 })).toBe(2500);
	});

	it("rounds to a whole pixel and never goes below one", () => {
		expect(posterMapSceneHeight(MAP, { w: 3, h: 2 })).toBe(667);
		expect(posterMapSceneHeight(MAP, { w: 1e6, h: 1 })).toBe(1);
	});

	// The regression this function exists for. A file that fails to decode can report EITHER
	// dimension as zero, and only one of the two produces a NaN: 0/0 is NaN, but 1/0 is
	// Infinity — a truthy number that a `|| map.height` fallback would wave straight through
	// and onto the Scene.
	it("falls back to the catalog height for an image that measured unusably", () => {
		expect(posterMapSceneHeight(MAP, { w: 0, h: 0 })).toBe(800);
		expect(posterMapSceneHeight(MAP, { w: 0, h: 4714 })).toBe(800);
		expect(posterMapSceneHeight(MAP, { w: 6000, h: 0 })).toBe(800);
		expect(posterMapSceneHeight(MAP, {})).toBe(800);
		expect(posterMapSceneHeight(MAP, undefined)).toBe(800);
	});

	it("falls back to the width when the catalog names no height either", () => {
		expect(posterMapSceneHeight({ width: 1000 }, { w: 0, h: 4714 })).toBe(1000);
	});

	// Every shipped map must produce a real Scene height from a real measurement, which is
	// the only thing that makes the guard above a fallback rather than the usual path.
	it("gives every catalog map a finite height from its own printed ratio", () => {
		for (const map of POSTER_MAPS) {
			const height = posterMapSceneHeight(map, { w: map.width, h: map.height });
			expect(Number.isInteger(height)).toBe(true);
			expect(height).toBe(map.height);
		}
	});
});
