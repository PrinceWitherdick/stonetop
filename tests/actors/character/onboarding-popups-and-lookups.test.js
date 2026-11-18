// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { CharacterOnboardingDialog } from "../../../module/actors/character/dialogs/CharacterOnboardingDialog.js";

/** A dialog stub with just the members the popups, word lookups and stat options touch. */
function makeDialog() {
	const d = Object.create(CharacterOnboardingDialog.prototype);
	d._wordCache = new Map();
	return d;
}

afterEach(() => {
	document.body.innerHTML = "";
	vi.unstubAllGlobals();
});

describe("onboarding's popups", () => {
	// The character sheet keeps its own hidden `.stonetop-word-tooltip` panel on <body>. Found by
	// class, the first one in the document was the sheet's, so leaving a word took the sheet's
	// panel down and left onboarding's tooltip on screen.
	it("take down their own tooltip, not the character sheet's panel of the same class", () => {
		const sheetPanel = document.createElement("div");
		sheetPanel.className = "stonetop-word-tooltip";
		sheetPanel.hidden = true;
		document.body.appendChild(sheetPanel);

		const d = makeDialog();
		const anchor = document.createElement("strong");
		document.body.appendChild(anchor);
		d._showWordTooltip(anchor, "Outfit", "<p>When you outfit…</p>");
		expect(document.querySelectorAll(".stonetop-word-tooltip")).toHaveLength(2);

		d._removeTooltip();
		expect(sheetPanel.isConnected).toBe(true);
		expect(document.querySelectorAll(".stonetop-word-tooltip")).toHaveLength(1);
	});
});

describe("onboarding's word lookups", () => {
	function stubPacks(entries) {
		const getDocument = vi.fn(async id => ({ system: { description: `<p>${id}</p>` } }));
		const getIndex = vi.fn(async () => {});
		const pack = {
			collection: "stonetop_pwd.moves",
			metadata: { packageName: "stonetop_pwd", type: "Item" },
			index: entries,
			getIndex,
			getDocument,
		};
		vi.stubGlobal("game", { packs: Object.assign([pack], { get: name => (name === pack.collection ? pack : undefined) }) });
		return { getDocument, getIndex };
	}

	it("share one lookup for a word looked up again before the first answers", async () => {
		const { getDocument } = stubPacks([{ _id: "outfit", name: "Outfit" }]);
		const d = makeDialog();
		const [a, b] = await Promise.all([d._lookupWord("Outfit"), d._lookupWord("outfit")]);
		expect(a).toBe("<p>outfit</p>");
		expect(b).toBe(a);
		expect(getDocument).toHaveBeenCalledTimes(1);
		expect(d._wordCache.get("outfit")).toBe(a);
	});

	it("index the packs once for the dialog, and remember a word no item is named", async () => {
		const { getIndex, getDocument } = stubPacks([{ _id: "outfit", name: "Outfit" }]);
		const d = makeDialog();
		expect(await d._lookupWord("Nothing")).toBeNull();
		expect(await d._lookupWord("Outfit")).toBe("<p>outfit</p>");
		expect(await d._lookupWord("Nothing")).toBeNull();
		expect(getIndex).toHaveBeenCalledTimes(1);
		expect(getDocument).toHaveBeenCalledTimes(1);
	});
});

describe("the stat step's open scores", () => {
	it("offer each pool score not spent on another stat, highest first", () => {
		const d = makeDialog();
		d._statPoolCount = { 2: 1, 1: 2, 0: 2, "-1": 1 };
		d._selections = { stats: { str: 2, dex: 1, con: null, int: null, wis: null, cha: -1 } };
		expect(d._statOptionValues("str")).toEqual([2, 1, 0]);
		expect(d._statOptionValues("con")).toEqual([1, 0]);
		expect(d._statOptionValues("cha")).toEqual([1, 0, -1]);
	});
});
