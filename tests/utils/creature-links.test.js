import { expect, it } from "vitest";
import { describeLocal, loadLocal } from "../local-only.js";

const mods = await loadLocal(
	() => import("../../scripts/local/bestiary/creatures.mjs"),
	() => import("../../scripts/local/bestiary/ids.mjs"),
	() => import("../../scripts/local/bestiary/links.mjs"),
	() => import("../../scripts/local/shared/gazetteer.mjs"),
);
const describeGen = describeLocal(mods);
const [creaturesMod, idsMod, linksMod, gazetteerMod] = mods ?? [];
const { CREATURES } = creaturesMod ?? {};
const { creatureUuid } = idsMod ?? {};
const { CREATURE_LINK_DENYLIST, creatureLinkRecords, buildCreatureLinkIndex } = linksMod ?? {};
const { linkifyByIndex } = gazetteerMod ?? {};

// The curated creature index is the one source of truth every generator uses to
// auto-link bestiary creatures named in prose. It links distinctive names (and
// real animals) while skipping generic role words that would mis-link ordinary
// text, and the names that collide with a lore/location entry of the same name.

describeGen("creatureLinkRecords", () => {
	const records = creatureLinkRecords();
	const names = new Set(records.map(r => r.name));

	it("includes distinctive invented names", () => {
		for (const n of ["The Suileach", "Llamudwr", "Tcaventes, Shackle and Key", "Nemurvojak"]) {
			expect(names.has(n), n).toBe(true);
		}
	});

	it("includes real-animal names (per the linking policy)", () => {
		for (const n of ["Wolf", "Boar", "Cougar", "Mammoth", "Aurochs", "Caribou"]) {
			expect(names.has(n), n).toBe(true);
		}
	});

	it("excludes generic role words and lore/location collisions", () => {
		for (const n of ["Guard", "The Guard", "Chief", "Cultist", "Sorcerer", "Thrall", "Fomoraij", "Rime Lord", "The Crombil"]) {
			expect(names.has(n), n).toBe(false);
		}
	});

	it("excludes exactly the denylist (every denied name is a real creature)", () => {
		const allNames = new Set(CREATURES.map(c => c.name));
		for (const n of CREATURE_LINK_DENYLIST) expect(allNames.has(n), n).toBe(true);
		expect(records.length).toBe(CREATURES.length - CREATURE_LINK_DENYLIST.size);
	});

	it("points each record at the creature's codex entry", () => {
		const suileach = CREATURES.find(c => c.name === "The Suileach");
		const rec = records.find(r => r.name === "The Suileach");
		expect(rec.uuid).toBe(creatureUuid(suileach));
	});
});

describeGen("buildCreatureLinkIndex", () => {
	it("links a distinctive name and skips a denylisted generic word", () => {
		const index = buildCreatureLinkIndex();
		const suileach = CREATURES.find(c => c.name === "The Suileach");
		const out = linkifyByIndex("The Suileach watches; the guard sleeps.", "self", index);
		expect(out).toContain(`<strong>@UUID[${suileach.uuid ?? creatureUuid(suileach)}]{The Suileach}</strong>`);
		expect(out).toContain("the guard sleeps"); // generic "guard" stays plain
	});
});
