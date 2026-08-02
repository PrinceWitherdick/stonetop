import { describe, it, expect } from "vitest";
import { BOOK2_ART_APPLY_MANIFEST } from "../../module/book2-art/manifest.js";
import {
	isValidRect, portraitOutFor, fullPortraitSrc, squarePortraitSrc, hasPortraitSuffix,
} from "../../module/book2-art/people-portraits.js";

// gen-pack-macro.js lives outside this repo (gitignored local tooling), so what it emits can
// only be guarded from the far side: these assert the shape of the people projection it writes
// into module/book2-art/manifest.js.
//
// The failure this exists to catch is silent. If `portrait`/`portraitOut` ever stop being
// emitted, nothing throws — the square rebuild just plans zero work and every sheet quietly
// falls back to the tall illustration, which looks exactly like "no squares authored yet". The
// same trap already applies to `crop` (see rebuild-crops.test.js).

const ROOT = "stonetop-book-art";
const { people = [] } = BOOK2_ART_APPLY_MANIFEST;
const squared = people.filter((p) => p.portrait || p.portraitOut);

describe("people projection: square portraits", () => {
	it("never carries half of the pair", () => {
		// One without the other is unusable: the rect with no filename cuts a file nothing
		// references, the filename with no rect cannot be cut at all.
		for (const p of squared) {
			expect(p.portrait, `${p.slug} has portraitOut but no portrait rect`).toBeDefined();
			expect(p.portraitOut, `${p.slug} has portrait but no portraitOut`).toBeDefined();
		}
	});

	it("names each square exactly as the shared helper would", () => {
		// The merge script (Python) mints portraitOut and this helper (JS) re-derives it. If the
		// two ever disagree by a rounding hair, the importer writes one filename and every
		// lookup asks for another.
		for (const p of squared) {
			expect(portraitOutFor(p.out, p.portrait), `${p.slug}`).toBe(p.portraitOut);
		}
	});

	it("ships a valid rect for every square", () => {
		for (const p of squared) expect(isValidRect(p.portrait), `${p.slug}`).toBe(true);
	});

	it("resolves square <-> whole illustration in both directions", () => {
		for (const p of squared) {
			expect(fullPortraitSrc(`${ROOT}/${p.portraitOut}`)).toBe(`${ROOT}/${p.out}`);
			expect(squarePortraitSrc(`${ROOT}/${p.out}`)).toBe(`${ROOT}/${p.portraitOut}`);
		}
	});

	it("keeps every emitted path unique", () => {
		const all = [...people.map((p) => p.out), ...squared.map((p) => p.portraitOut)];
		expect(new Set(all).size).toBe(all.length);
	});
});

describe("people projection: the square namespace is clean", () => {
	it("no person image is itself named like a square", () => {
		// Squares are minted by appending `-q<rect>` to a person's own path. If a person image
		// ever arrived already carrying that suffix, its square would collide with another
		// row's — and the reverse index would resolve the wrong illustration.
		for (const p of people) expect(hasPortraitSuffix(p.out), `${p.slug}`).toBe(false);
	});

	it("still ships the people it did before squares existed", () => {
		// A floor, not an exact count: this catches the projection being emptied or the people
		// list being dropped wholesale, without breaking every time art is curated.
		expect(people.length).toBeGreaterThanOrEqual(100);
		for (const p of people) {
			expect(p.slug).toBeTruthy();
			expect(p.out).toMatch(/^assets\/people\/.+\.webp$/);
		}
	});
});
