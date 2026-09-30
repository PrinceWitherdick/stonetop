// The post-death inserts as they ship (packs/src), held to the book's wording (Book I pp.148-153) and to
// the one number read out of their prose.

import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { buildLoreSection, insertHpPenalty } from "../../../module/actors/character/CharacterPostDeath.js";
import { stripHtmlToText } from "../../../module/utils/strings.js";

const SRC = path.resolve("packs/src/stonetop-items");
const read = rel => JSON.parse(fs.readFileSync(path.join(SRC, rel), "utf8"));
const insert = slug => read(`post-death-inserts/${slug}.json`);
const option = (slug, section, opt) => insert(slug).flags.stonetop.lore
	.find(e => e.slug === section).options.find(o => o.slug === opt);
const plain = html => stripHtmlToText(html);

/** A lore state with exactly `marked` counted, as CharacterLore answers it. */
const loreState = (marked = []) => ({
	getCount: (section, opt) => (marked.includes(`${section}:${opt}`) ? 1 : 0),
	getText: () => "",
});

// B17: "-2 max HP" is read live out of each Mark's prose, so the pack text IS the rule. Exactly five of
// the nine Marks print "Reduce your max HP by 2".
describe("the Thrall's Marks that cost max HP", () => {
	it("charges exactly Child of the Deeps, Quicksilver Dreams, Red Wrath, Shadow's Cold Embrace and Speak Truth", () => {
		const lore = insert("thrall").flags.stonetop.lore;
		const marks = lore.find(e => e.slug === "marks").options.map(o => o.slug);
		expect(marks).toHaveLength(9);
		const charged = marks.filter(slug => insertHpPenalty(buildLoreSection(lore, loreState([`marks:${slug}`]))) > 0);
		expect(charged).toEqual([
			"child-of-the-deeps", "quicksilver-dreams", "red-wrath", "shadows-cold-embrace", "speak-truth-whisper-secrets",
		]);
		for (const slug of charged) expect(insertHpPenalty(buildLoreSection(lore, loreState([`marks:${slug}`])))).toBe(2);
		// And they add up when a Thrall collects them.
		expect(insertHpPenalty(buildLoreSection(lore, loreState(charged.map(s => `marks:${s}`))))).toBe(10);
	});
});

// B16: the book's wording where the pack had drifted from it.
describe("the book's own words", () => {
	it("Vengeance: 'ensure that they know why', on the Ghost and the Revenant", () => {
		for (const slug of ["ghost", "revenant"]) {
			const text = plain(option(slug, "terrible-purpose", "vengeance").description);
			expect(text).toContain("make one of them pay and ensure that they know why");
		}
	});

	it("Quicksilver Dreams: 'everyone with you suffers nightmares'", () => {
		expect(plain(option("thrall", "marks", "quicksilver-dreams").description))
			.toContain("When you Make Camp, everyone with you suffers nightmares and has disadvantage on their next roll.");
	});

	it("Home to Vermin: 'Instinct to get distracted', no colon", () => {
		expect(plain(option("revenant", "consequences", "home-to-vermin").description))
			.toContain("HP 1 each; Instinct to get distracted; Cost: genuine affection.");
	});

	it("Dark Succor: 'Gain a new Mark of the GM's choice'", () => {
		expect(plain(read("post-death-moves/thrall/dark-succor.json").system.description))
			.toContain("Gain a new Mark of the GM's choice");
	});

	it("Undying: 'roll +CON:', with no stray full stop", () => {
		const text = plain(read("post-death-moves/revenant/undying.json").system.description);
		expect(text).toContain("When you are reduced to 0 HP, roll +CON: on a 10+");
		expect(text).not.toContain("+CON.");
	});

	it("the reference journal's Undying reads the same", () => {
		const journal = fs.readFileSync(path.resolve("packs/src/stonetop-journals/reference-journals/moves.json"), "utf8");
		expect(journal).toContain("roll +CON: <strong>on a 10+</strong>");
		expect(journal).not.toContain("roll +CON.:");
	});
});
