import { describe, it, expect } from "vitest";
import {
	isValidRect, portraitSuffix, portraitOutFor,
	fullPortraitSrc, squarePortraitSrc, hasPortraitSuffix,
} from "../../module/book2-art/people-portraits.js";

// The hand-authored square cut out of a People-of-Stonetop portrait. These cover the pure half:
// the filename grammar the picker, the merge script and the in-Foundry rebuild must all agree
// on, and the square <-> whole lookup every display surface goes through.

const ROOT = "stonetop-book-art";
const person = (slug, extra = {}) => ({
	slug, name: slug, out: `assets/people/${slug}.webp`, ...extra,
});
const withSquare = (slug, rect) =>
	person(slug, { portrait: rect, portraitOut: portraitOutFor(`assets/people/${slug}.webp`, rect) });

describe("square rect validity", () => {
	it("accepts a positive-area rect inside the image", () => {
		expect(isValidRect([0.12, 0, 0.88, 0.26])).toBe(true);
	});

	it("rejects an inverted, zero-area, out-of-range or malformed rect", () => {
		expect(isValidRect([0.9, 0, 0.1, 0.26])).toBe(false);   // x1 <= x0
		expect(isValidRect([0.1, 0.2, 0.1, 0.9])).toBe(false);  // zero width
		expect(isValidRect([-0.1, 0, 0.8, 0.3])).toBe(false);   // outside the image
		expect(isValidRect([0, 0, 1])).toBe(false);             // three numbers
		expect(isValidRect(null)).toBe(false);
		expect(isValidRect([0, 0, "x", 1])).toBe(false);
	});
});

describe("filename grammar", () => {
	it("writes per-mille, zero-padded to three", () => {
		expect(portraitSuffix([0.12, 0, 0.88, 0.26])).toBe("-q120-000-880-260");
	});

	it("keeps the four-digit group for a coordinate flush with the edge", () => {
		// per-mille of 1.0 is 1000. A square is usually flush with the TOP of the figure, so a
		// \d{3} assumption breaks on the common case, not the rare one.
		const suffix = portraitSuffix([0.25, 0, 1, 0.75]);
		expect(suffix).toBe("-q250-000-1000-750");
		expect(hasPortraitSuffix(`assets/people/b1-p135-x526${suffix}.webp`)).toBe(true);
	});

	it("rounds exactly as Python's int(f * 1000 + 0.5) does", () => {
		// The two sides mint the same filename or a re-export orphans every square. Checked
		// against the real Python over the awkward values: 0.0005 0.0015 0.0025 0.1235 0.5005
		// 0.9995 0.3335 0.7775 0.125 0.375 1.0 0.0 — zero disagreements.
		//
		// 0.5005 landing on 500 rather than 501 is not a bug to fix: 0.5005 * 1000 is
		// 500.49999999999994 in IEEE-754, so it is not a tie at all, and BOTH languages see
		// the same bits. Nudging one side to "round half up properly" is what would break the
		// agreement.
		expect(portraitSuffix([0.0005, 0.0015, 0.5005, 0.9995])).toBe("-q001-002-500-1000");
		expect(portraitSuffix([0.0025, 0.1235, 0.3335, 0.7775])).toBe("-q003-124-334-778");
	});

	it("splices the suffix before the extension", () => {
		expect(portraitOutFor("assets/people/b1-p007-x32-c750-387-1000-1000.webp", [0.12, 0, 0.88, 0.26]))
			.toBe("assets/people/b1-p007-x32-c750-387-1000-1000-q120-000-880-260.webp");
	});

	it("appends when there is no extension to splice before", () => {
		expect(portraitOutFor("assets/people/plain", [0, 0, 1, 1])).toBe("assets/people/plain-q000-000-1000-1000");
	});

	it("does not mistake a crop suffix for a square one", () => {
		expect(hasPortraitSuffix("assets/people/b1-p007-x32-c750-387-1000-1000.webp")).toBe(false);
	});
});

describe("square <-> whole illustration lookup", () => {
	const rect = [0.12, 0, 0.88, 0.26];
	const people = [
		withSquare("b1-p007-x32-c750-387-1000-1000", rect),
		person("b1-p135-x526"),   // no square authored yet
	];
	const squared = people[0];
	const squareSrc = `${ROOT}/${squared.portraitOut}`;
	const fullSrc = `${ROOT}/${squared.out}`;

	it("finds the whole illustration behind a square", () => {
		expect(fullPortraitSrc(squareSrc, people)).toBe(fullSrc);
	});

	it("finds the square cut from an illustration", () => {
		expect(squarePortraitSrc(fullSrc, people)).toBe(squareSrc);
	});

	it("preserves whatever directory the caller resolved against", () => {
		// The durable art root is a world setting, so these helpers must never assume it.
		const elsewhere = `some/other/root/${squared.portraitOut}`;
		expect(fullPortraitSrc(elsewhere, people)).toBe(`some/other/root/${squared.out}`);
	});

	it("returns null for a portrait with no square authored", () => {
		expect(squarePortraitSrc(`${ROOT}/${people[1].out}`, people)).toBe(null);
	});

	it("returns null for a GM's own art, even when it looks like a square", () => {
		// Checked against the manifest rather than merely stripping the suffix, so this
		// resolves to nothing rather than to a path that does not exist.
		expect(fullPortraitSrc("worlds/mine/art/villager-q120-000-880-260.webp", people)).toBe(null);
		expect(fullPortraitSrc("worlds/mine/art/villager.webp", people)).toBe(null);
	});

	it("is null-safe", () => {
		expect(fullPortraitSrc("", people)).toBe(null);
		expect(fullPortraitSrc(null, people)).toBe(null);
		expect(squarePortraitSrc(undefined, people)).toBe(null);
	});

	it("tolerates a build whose manifest carries no squares at all", () => {
		expect(fullPortraitSrc(squareSrc, [])).toBe(null);
		expect(squarePortraitSrc(fullSrc, [person("b1-p135-x526")])).toBe(null);
	});
});
