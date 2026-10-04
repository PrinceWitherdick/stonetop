import { describe, it, expect, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { StonetopSteading } from "../../module/actors/steading/StonetopSteading.js";
import {
	comparableImprovement, improvementHash, improvementCardsIn, improvementRefreshFor, refreshSteadingImprovements, cardKey,
	CARDS_FORMAT,
} from "../../module/migration/improvement-refresh.js";
import { IMPROVEMENT_CARDS, CARDS_FORMAT as DATA_FORMAT } from "../../module/migration/data/superseded-improvement-cards.js";
import { renderImprovementCardHtml } from "../../module/journal/steading-improvement-cards.js";

// A Book II improvement card dropped on a steading is a COPY, and the copies taken before the cards
// gained their categories, their "1 of the following" and their automatic effects are brought up to
// the card the packs ship now, but only while they are still exactly a card some release shipped.

const steadingActor = (steadingFlags = {}) => {
	const actor = {
		name: "Stonetop",
		type: "stonetop",
		system: {},
		flags: { stonetop: { steading: steadingFlags } },
		getFlag: (scope, key) => (key === "steading" ? actor.flags.stonetop.steading : null),
		setFlag: vi.fn((scope, key, value) => { actor.flags.stonetop.steading = value; return Promise.resolve(); }),
		update: vi.fn(),
	};
	actor.typedActor = new StonetopSteading(actor);
	return actor;
};

// The card every release up to 1.7.1 shipped: the same text, its name in capitals, and none of the
// category, the minimums or the grants (8575ded8 to the working tree of 2026-10-03).
const asShippedBefore = def => ({
	name: def.name.toUpperCase(),
	flavor: def.flavor,
	effect: def.effect,
	sections: def.sections.map(({ heading, items }) => ({ heading, items })),
});

const BARRIER = IMPROVEMENT_CARDS["trade with barrier pass"].def;

describe("comparing cards", () => {
	it("reads a stored copy the same as the card it was dropped from", async () => {
		for (const { def } of Object.values(IMPROVEMENT_CARDS)) {
			const actor = steadingActor();
			await actor.typedActor.addCustomImprovement(structuredClone(def));
			expect(improvementHash(actor.typedActor.customImprovements[0])).toBe(improvementHash(def));
		}
	});

	it("reads a card with an unknown or padded category the same as the copy the steading stores", async () => {
		for (const category of ["trade", "Hearth", " hearth"]) {
			const card = { ...structuredClone(BARRIER), category };
			const actor = steadingActor();
			await actor.typedActor.addCustomImprovement(structuredClone(card));
			expect(actor.typedActor.customImprovements[0].category).toBe(category === " hearth" ? "hearth" : "");
			expect(improvementHash(actor.typedActor.customImprovements[0])).toBe(improvementHash(card));
		}
	});

	it("knows each card's old version, as it was shipped", () => {
		for (const { def, former } of Object.values(IMPROVEMENT_CARDS)) expect(former).toContain(improvementHash(asShippedBefore(def)));
	});

	it("reads a card's name case-blind, and its text exactly", () => {
		expect(comparableImprovement({ name: "ROADS" }).label).toBe(comparableImprovement({ label: "roads" }).label);
		expect(improvementHash({ name: "Roads", effect: "A" })).not.toBe(improvementHash({ name: "Roads", effect: "B" }));
	});

	it("parses the cards out of a page's HTML", () => {
		const page = { pages: [{ system: { sections: [{ body: `<p>x</p>${renderImprovementCardHtml(BARRIER)}` }] } }] };
		expect(improvementCardsIn(page).map(cardKey)).toEqual(["trade with barrier pass"]);
	});
});

describe("improvementRefreshFor", () => {
	const cards = { roads: { def: { name: "Roads", category: "renown", effect: "New", sections: [{ items: ["A"] }] }, former: [improvementHash({ name: "ROADS", effect: "New", sections: [{ items: ["A"] }] })] } };

	it("is the shipped card for a copy an earlier release shipped", () => {
		expect(improvementRefreshFor({ slug: "custom-roads", label: "ROADS", effect: "New", sections: [{ items: ["A"] }] }, cards)).toEqual(cards.roads.def);
	});

	it("is nothing for a copy the GM changed, a card already current, or a name no card has", () => {
		expect(improvementRefreshFor({ label: "ROADS", effect: "Mine", sections: [{ items: ["A"] }] }, cards)).toBeNull();
		expect(improvementRefreshFor({ label: "Roads", category: "renown", effect: "New", sections: [{ items: ["A"] }] }, cards)).toBeNull();
		expect(improvementRefreshFor({ label: "Bell Tower" }, cards)).toBeNull();
	});
});

describe("refreshSteadingImprovements", () => {
	it("brings an old Trade with Barrier Pass up to the card, keeping its ticks, and tells the GM", async () => {
		const actor = steadingActor();
		const steading = actor.typedActor;
		await steading.addCustomImprovement(asShippedBefore(BARRIER));
		const [old] = steading.customImprovements;
		expect(old.grants).toBeNull();
		// One step already ticked, as a steading part-way through building it stores it.
		actor.flags.stonetop.steading.improvements = { [old.slug]: { completed: false, r: [true] } };

		const notify = vi.fn();
		const refreshed = await refreshSteadingImprovements({ actors: [actor], notify });
		expect(refreshed).toEqual([{ steading: "Stonetop", label: "Trade with Barrier Pass", completed: false }]);
		expect(notify).toHaveBeenCalledWith(refreshed);
		const [now] = steading.customImprovements;
		expect(now.slug).toBe(old.slug);
		expect(now.label).toBe("Trade with Barrier Pass");
		expect(now.category).toBe("renown");
		expect(now.grants).toMatchObject({ stats: { fortunes: 1 } });
		expect(now.sections[0].min).toBe(1);
		expect(steading.improvementRequirements(old.slug)[0]).toBe(true);
		// Done once: the second run finds nothing.
		expect(await refreshSteadingImprovements({ actors: [actor], notify })).toEqual([]);
	});

	// The user's call, 2026-10-03: a card already built gets its ongoing rules from now on (the Logging
	// Camp's upkeep, its winter saving), and is reported as built so the GM is told nothing one-time
	// was given again.
	it("switches a built card's ongoing rules on, and says it was built", async () => {
		const actor = steadingActor();
		const steading = actor.typedActor;
		const camp = IMPROVEMENT_CARDS["permanent logging camp"].def;
		await steading.addCustomImprovement(asShippedBefore(camp));
		const [old] = steading.customImprovements;
		actor.flags.stonetop.steading.improvements = { [old.slug]: { completed: true, r: [], applied: {} } };
		const notify = vi.fn();
		expect(await refreshSteadingImprovements({ actors: [actor], notify }))
			.toEqual([{ steading: "Stonetop", label: "Permanent Logging Camp", completed: true }]);
		expect(steading.improvementGrants(old.slug)).toMatchObject({ upkeep: expect.anything(), winterConsumption: -1 });
		// What completing it applied is the record un-completing reverses: left as it was.
		expect(actor.flags.stonetop.steading.improvements[old.slug].applied).toEqual({});
	});

	it("leaves a card the GM edited, and a steading-less actor", async () => {
		const actor = steadingActor();
		await actor.typedActor.addCustomImprovement({ ...asShippedBefore(BARRIER), effect: "Our own deal." });
		const notify = vi.fn();
		expect(await refreshSteadingImprovements({ actors: [actor, { name: "PC", typedActor: {} }], notify })).toEqual([]);
		expect(notify).not.toHaveBeenCalled();
	});
});

// module/migration/data/superseded-improvement-cards.js is generated from git history; a card edited
// since it was generated is missing from it. Needs no history, so it runs anywhere.
it("was generated from the cards the packs hold now (else run `npm run gen:superseded`)", () => {
	expect(DATA_FORMAT).toBe(CARDS_FORMAT);
	const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "packs", "src");
	const readTree = dir => readdirSync(dir).flatMap(name => {
		const p = path.join(dir, name);
		if (statSync(p).isDirectory()) return readTree(p);
		return name.endsWith(".json") ? [JSON.parse(readFileSync(p, "utf8"))] : [];
	});
	const now = {};
	for (const dir of ["stonetop-locations", "stonetop-lore", "stonetop-journals", "reference-journals", "setting-overview"]) {
		let docs = [];
		try { docs = readTree(path.join(root, dir)); } catch { /* not every pack exists */ }
		for (const card of docs.flatMap(improvementCardsIn)) now[cardKey(card)] ??= improvementHash(card);
	}
	const generated = Object.fromEntries(Object.entries(IMPROVEMENT_CARDS).map(([k, v]) => [k, improvementHash(v.def)]));
	expect(generated).toEqual(now);
});
