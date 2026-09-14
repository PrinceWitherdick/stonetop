import { describe, it, expect } from "vitest";
import { clipText, dropLastChar } from "../../module/utils/strings.js";

// Cutting text to a length without breaking a character. An emoji is two UTF-16 units, and a cut that
// lands between them stores half of one: a replacement box, broadcast to the whole table, for good.

describe("cutting text to a length", () => {
	it("cuts to the length asked for, and leaves shorter text alone", () => {
		expect(clipText("friends", 3)).toBe("fri");
		expect(clipText("friends", 20)).toBe("friends");
		expect(clipText(null, 5)).toBe("");
	});

	it("never keeps half of a character", () => {
		expect(clipText("rivals 🐉", 8)).toBe("rivals ");
		expect(clipText("rivals 🐉", 9)).toBe("rivals 🐉");
	});
});

describe("taking the last character off", () => {
	it("takes one character", () => {
		expect(dropLastChar("rivals")).toBe("rival");
		expect(dropLastChar("")).toBe("");
	});

	it("takes a whole emoji, and not half of it", () => {
		expect(dropLastChar("rivals 🐉")).toBe("rivals ");
	});
});
