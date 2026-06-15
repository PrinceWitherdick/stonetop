import { describe, expect, it } from "vitest";
import { makeRewriter, remapPageData, managedHash, stableStringify } from "../../module/hooks/journal-sync-core.js";

// The managed-journal update channel decides "did the GM edit this?" by comparing a
// content fingerprint to the baseline we stamped. These tests pin the two properties
// that make that safe: the fingerprint ignores cosmetic churn (page ids, key order)
// but reacts to any authored-content change, in all three section kinds.

const linkMap = new Map([["Compendium.stonetop_pwd.stonetop-journal.JournalEntry.abc", "JournalEntry.world123"]]);

describe("makeRewriter / remapPageData", () => {
	it("repoints a seeded compendium @UUID at its world copy, leaves unknown links alone", () => {
		const rewrite = makeRewriter(linkMap);
		expect(rewrite("see @UUID[Compendium.stonetop_pwd.stonetop-journal.JournalEntry.abc]{X}"))
			.toBe("see @UUID[JournalEntry.world123]{X}");
		expect(rewrite("see @UUID[Compendium.stonetop_pwd.arcana.Item.zzz]{Y}"))
			.toBe("see @UUID[Compendium.stonetop_pwd.arcana.Item.zzz]{Y}"); // not seeded → untouched
	});

	it("remaps links across a location page's prose, Q&A, and grouped Dangers", () => {
		const rewrite = makeRewriter(linkMap);
		const link = "@UUID[Compendium.stonetop_pwd.stonetop-journal.JournalEntry.abc]";
		const page = remapPageData({
			type: "location",
			system: { sections: [
				{ kind: "prose", body: `p ${link}` },
				{ kind: "qa", pairs: [{ prompt: `q ${link}`, answer: `a ${link}` }] },
				{ kind: "groups", groups: [{ heading: `h ${link}`, body: `b ${link}` }] },
			] },
		}, rewrite);
		const [prose, qa, groups] = page.system.sections;
		expect(prose.body).toBe("p @UUID[JournalEntry.world123]");
		expect(qa.pairs[0]).toEqual({ prompt: "q @UUID[JournalEntry.world123]", answer: "a @UUID[JournalEntry.world123]" });
		expect(groups.groups[0]).toEqual({ heading: "h @UUID[JournalEntry.world123]", body: "b @UUID[JournalEntry.world123]" });
	});
});

describe("managedHash", () => {
	const base = { pages: [
		{ _id: "p1", name: "Overview", type: "text", sort: 100, text: { content: "<p>Hello</p>" } },
		{ _id: "p2", name: "Region", type: "location", sort: 200, system: { sections: [{ kind: "qa", pairs: [{ prompt: "Why?", answer: "" }] }] } },
	] };

	it("ignores page ids, sort, and key order — same content, same fingerprint", () => {
		const reordered = { pages: [
			{ sort: 999, type: "text", name: "Overview", _id: "DIFFERENT", text: { content: "<p>Hello</p>" } },
			{ name: "Region", _id: "ALSO-DIFF", type: "location", sort: 1, system: { sections: [{ pairs: [{ answer: "", prompt: "Why?" }], kind: "qa" }] } },
		] };
		expect(managedHash(reordered)).toBe(managedHash(base));
	});

	it("changes when the GM fills in a Q&A answer", () => {
		const edited = structuredClone(base);
		edited.pages[1].system.sections[0].pairs[0].answer = "Because.";
		expect(managedHash(edited)).not.toBe(managedHash(base));
	});

	it("changes when prose body text changes", () => {
		const edited = structuredClone(base);
		edited.pages[0].text.content = "<p>Hello, world</p>";
		expect(managedHash(edited)).not.toBe(managedHash(base));
	});

	it("changes when a page is added or removed", () => {
		const fewer = { pages: [base.pages[0]] };
		expect(managedHash(fewer)).not.toBe(managedHash(base));
	});
});

describe("stableStringify", () => {
	it("is key-order independent and null-safe", () => {
		expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }));
		expect(stableStringify(undefined)).toBe("null");
	});
});
