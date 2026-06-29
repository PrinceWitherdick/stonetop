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

	it("strips stray tags and unescapes entities", () => {
		expect(customMoveDescriptionToPlainText("<p>hi <strong>there</strong></p>")).toBe("hi there");
		expect(customMoveDescriptionToPlainText("")).toBe("");
		expect(customMoveDescriptionToPlainText(null)).toBe("");
	});
});
