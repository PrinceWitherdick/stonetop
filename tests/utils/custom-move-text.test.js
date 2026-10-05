import { describe, it, expect } from "vitest";
import {
	formatCustomMoveDescription,
	customMoveDescriptionToPlainText,
} from "../../module/utils/custom-move-text.js";
import { escHtml } from "../../module/utils/strings.js";

describe("formatCustomMoveDescription", () => {
	it("returns '' for blank input", () => {
		expect(formatCustomMoveDescription("")).toBe("");
		expect(formatCustomMoveDescription("   \n  ")).toBe("");
		expect(formatCustomMoveDescription(null)).toBe("");
	});

	it("wraps blank-line-separated blocks into paragraphs", () => {
		expect(formatCustomMoveDescription("first\n\nsecond")).toBe("<p>first</p><p>second</p>");
	});

	it("turns single newlines into <br> within a paragraph", () => {
		expect(formatCustomMoveDescription("line one\nline two")).toBe("<p>line one<br>line two</p>");
	});

	it("escapes &, < and > so no live markup is stored", () => {
		expect(formatCustomMoveDescription("a < b & c > d")).toBe("<p>a &lt; b &amp; c &gt; d</p>");
	});

	it("prints the book's bold-italic trigger from asterisks, and nothing else as markup", () => {
		expect(formatCustomMoveDescription("When you ***commune***, roll +WIS: **on a 10+**, *she* speaks"))
			.toBe("<p>When you <strong><em>commune</em></strong>, roll +WIS: <strong>on a 10+</strong>, <em>she</em> speaks</p>");
		// Emphasis wraps ESCAPED text: a tag inside asterisks is still just text.
		expect(formatCustomMoveDescription("***<img src=x onerror=alert(1)>***"))
			.toBe("<p><strong><em>&lt;img src=x onerror=alert(1)&gt;</em></strong></p>");
		// A lone asterisk, or one pair split by a line, is left as typed.
		expect(formatCustomMoveDescription("2 * 3\nand *this\none*")).toBe("<p>2 * 3<br>and *this<br>one*</p>");
	});

	it("nests italic inside bold and bold inside italic", () => {
		expect(formatCustomMoveDescription("**When you *really* try**, roll +STR"))
			.toBe("<p><strong>When you <em>really</em> try</strong>, roll +STR</p>");
		expect(formatCustomMoveDescription("*When you **really** try*"))
			.toBe("<p><em>When you <strong>really</strong> try</em></p>");
	});

	it("leaves asterisks used as arithmetic alone", () => {
		expect(formatCustomMoveDescription("Deal d6 * 2 damage, or d4 * 3")).toBe("<p>Deal d6 * 2 damage, or d4 * 3</p>");
		expect(formatCustomMoveDescription("d6*2 or d4*3")).toBe("<p>d6*2 or d4*3</p>");
		expect(formatCustomMoveDescription("**Deal d6 * 2**")).toBe("<p><strong>Deal d6 * 2</strong></p>");
	});

	it("round-trips emphasised text through the edit form", () => {
		const typed = "When you ***act***, roll +INT: **on a 7+**, *choose 1*.\n\nThen rest.";
		expect(customMoveDescriptionToPlainText(formatCustomMoveDescription(typed))).toBe(typed);
		for (const nested of ["**When you *really* try**", "*When you **really** try*", "Deal d6 * 2, or d4 * 3"]) {
			expect(customMoveDescriptionToPlainText(formatCustomMoveDescription(nested))).toBe(nested);
		}
	});

	it("neutralizes script/handler injection attempts", () => {
		const out = formatCustomMoveDescription("<img src=x/onerror=alert(1)>");
		expect(out).not.toContain("<img");
		expect(out).toBe("<p>&lt;img src=x/onerror=alert(1)&gt;</p>");
	});

	it("does not misread plain prose containing '<' before a letter (the a<b case)", () => {
		expect(formatCustomMoveDescription("roll when a<b holds")).toBe("<p>roll when a&lt;b holds</p>");
	});
});

describe("customMoveDescriptionToPlainText", () => {
	it("reverses formatCustomMoveDescription for editing", () => {
		const cases = [
			"first\n\nsecond", "line one\nline two", "a < b & c > d", "roll when a<b holds",
			`she said "hi" & left`, "it's a trap", `mix < > " ' & all`,
		];
		for (const text of cases) {
			expect(customMoveDescriptionToPlainText(formatCustomMoveDescription(text))).toBe(text);
		}
	});

	// Guard against the escaper/decoder drifting apart: the plain-text decoder hand-codes the
	// inverse of escHtml's escape table, so if escHtml ever escapes a NEW character the decoder
	// doesn't reverse, the edit form would show a raw entity. Scan ASCII, find every character
	// escHtml actually changes, and assert each one still round-trips losslessly.
	it("round-trips every character escHtml escapes", () => {
		for (let code = 0; code < 0x80; code++) {
			const ch = String.fromCharCode(code);
			if (escHtml(ch) === ch) continue; // escHtml leaves this char untouched
			const text = `x${ch}y`;
			expect(
				customMoveDescriptionToPlainText(formatCustomMoveDescription(text)),
				`char U+${code.toString(16).padStart(4, "0")} (${JSON.stringify(ch)}) must round-trip`,
			).toBe(text);
		}
	});

	it("types bold and italic back as asterisks, and strips any other tag", () => {
		expect(customMoveDescriptionToPlainText("<p>hi <strong>there</strong></p>")).toBe("hi **there**");
		expect(customMoveDescriptionToPlainText("<p>When you <strong><em>act</em></strong>, <em>roll</em></p>")).toBe("When you ***act***, *roll*");
		expect(customMoveDescriptionToPlainText("<p>When you <em><strong>act</strong></em></p>")).toBe("When you ***act***");
		expect(customMoveDescriptionToPlainText("<p>hi <span class=\"x\">there</span></p>")).toBe("hi there");
		expect(customMoveDescriptionToPlainText("")).toBe("");
		expect(customMoveDescriptionToPlainText(null)).toBe("");
	});
});
