import { describe, it, expect } from "vitest";
import {
	formatCustomMoveDescription,
	customMoveDescriptionToPlainText,
} from "../../module/utils/custom-move-text.js";

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
		const cases = ["first\n\nsecond", "line one\nline two", "a < b & c > d", "roll when a<b holds"];
		for (const text of cases) {
			expect(customMoveDescriptionToPlainText(formatCustomMoveDescription(text))).toBe(text);
		}
	});

	it("strips stray tags and unescapes entities", () => {
		expect(customMoveDescriptionToPlainText("<p>hi <strong>there</strong></p>")).toBe("hi there");
		expect(customMoveDescriptionToPlainText("")).toBe("");
		expect(customMoveDescriptionToPlainText(null)).toBe("");
	});
});
