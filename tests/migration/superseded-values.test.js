import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
	canonicalText, canonicalValue, valueHash, sameValue, fieldValue, fieldsFor, isGear, GEAR_FIELDS, MOVE_FIELDS,
	SUPERSEDED_FORMAT,
} from "../../module/migration/superseded-values.js";

// The comparison a held copy and the pack's history share (migration/move-refresh.js): what counts as
// the same value, so a copy nobody edited reads as one the pack shipped.

describe("canonicalText", () => {
	it("reads whitespace, non-breaking spaces and self-closing tags as the round trip leaves them", () => {
		expect(canonicalText("  <p>One\n\ttwo\u00a0three<br/></p> ")).toBe("<p>One two three<br></p>");
		expect(canonicalText("<p>a <br /> b</p>")).toBe(canonicalText("<p>a <br> b</p>"));
	});

	it("reads a link or an asset path under an old system id as the current one", () => {
		expect(canonicalText("@UUID[Compendium.stonetop.stonetop-items.Item.x]"))
			.toBe("@UUID[Compendium.stonetop_pwd.stonetop-items.Item.x]");
		expect(canonicalText("systems/stonetop/assets/a.webp")).toBe("systems/stonetop_pwd/assets/a.webp");
		// Prose that merely says the word is not a link.
		expect(canonicalText("the stonetop system")).toBe("the stonetop system");
	});
});

describe("canonicalValue", () => {
	it("reads blank, empty, null and the model's false and 0 as absent at the top of a field", () => {
		for (const v of [undefined, null, "", "  ", [], {}, false, 0, { a: null, b: "" }]) expect(canonicalValue(v)).toBeUndefined();
	});

	it("keeps false and 0 inside a value, and drops null keys there", () => {
		expect(canonicalValue({ base: 2, modifier: null })).toEqual({ base: 2 });
		expect(canonicalValue({ max: 0, open: false })).toEqual({ max: 0, open: false });
	});

	it("compares regardless of key order", () => {
		expect(sameValue({ max: 5, title: "Marks" }, { title: "Marks", max: 5 })).toBe(true);
		expect(sameValue({ max: 5 }, { max: 6 })).toBe(false);
	});
});

describe("valueHash", () => {
	// Pinned: the generated data is hashed with this. A change here must bump SUPERSEDED_FORMAT and
	// regenerate (npm run gen:superseded), or every held copy stops reading as pristine.
	it("is stable", () => {
		expect(SUPERSEDED_FORMAT).toBe(1);
		expect(valueHash({ max: 5, title: "Marks" })).toBe("1eeca1321ba3c637");
		expect(valueHash(undefined)).toBe("9b55e0da69fcb93a");
		expect(valueHash("<p>A</p>")).toBe("eee4dd458b05c21c");
	});
});

describe("which fields, read where", () => {
	it("refreshes a move by the move fields and gear by the gear fields", () => {
		expect(fieldsFor({ system: { moveType: "playbook" } })).toBe(MOVE_FIELDS);
		expect(fieldsFor({ system: { moveType: "inventory-custom" } })).toBe(GEAR_FIELDS);
		expect(isGear({ system: { moveType: "other" } })).toBe(false);
	});

	it("never refreshes a move's name, kind, playbook, slug or repeat limit", () => {
		for (const field of ["name", "moveType", "playbook", "slug", "repeatMax"]) expect(MOVE_FIELDS).not.toHaveProperty(field);
	});

	it("reads a treasure's mirrored field from its flag first, as the sheet does", () => {
		const item = { system: { moveType: "inventory", note: "old" }, flags: { stonetop: { note: "flag" } } };
		expect(fieldValue(item, "note")).toBe("flag");
		expect(fieldValue({ system: { moveType: "inventory", note: "sys" }, flags: {} }, "note")).toBe("sys");
	});
});

// The server sanitizes only the fields a system declares as HTML in system.json. None are declared for
// moves, so a held description is the pack's text as shipped. Declaring some would change stored text,
// and the comparison above would have to be revisited before held copies read as pristine again.
it("system.json declares no sanitized HTML fields on moves", () => {
	const manifest = JSON.parse(readFileSync(new URL("../../system.json", import.meta.url), "utf8"));
	expect(manifest.documentTypes?.Item?.move?.htmlFields).toBeUndefined();
});
