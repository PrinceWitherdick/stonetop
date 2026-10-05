import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
	IMPROVEMENT_DEFINITIONS, IMPROVEMENT_GRANTS, StonetopSteading, builtInImprovementRules, standingGrantFor,
} from "../../../module/actors/steading/StonetopSteading.js";
import {
	improvementRulesFrom, upkeepsDue, upkeepStepKey, withSurplusBonus, yieldStepKey,
} from "../../../module/actors/steading/improvement-rules.js";
import { autumnHarvest, seasonalYields, winterConsumption } from "../../../module/actors/steading/season-effects.js";
import { STEADING_MOVE, improvementQuestions, rollAdjustments } from "../../../module/actors/steading/improvement-rolls.js";
import {
	grantKindsChanged, normalizeImprovementGrants, summarizeImprovementGrants, summarizeImprovementRules,
} from "../../../module/utils/improvement-def.js";
import { grantFormValues, grantsFromFormValues, editSavedNotice } from "../../../module/dialogs/ImprovementBuilderDialog.js";
import { steadingHolds } from "../../../module/actors/steading/steading-holds.js";

// ── ONE PATH FOR THE "HENCEFORTH" RULES ─────────────────────────────────────────
// The built-ins' slug-keyed rules (seasonal yields, the harvest and winter rewrites, upkeep, roll
// advantage, completion notes, the Market's lapse) moved onto the improvement's GRANTS, so a
// homebrew improvement can carry every one of them. These tests are the three promises of that move:
//
//   1. the seventeen built-ins behave EXACTLY as before (pinned against the outputs the old
//      slug-keyed code produced, captured into tests/fixtures/improvement-rules-before.json);
//   2. a custom improvement carrying a built-in's grants behaves like that built-in;
//   3. Book II's seven improvements are expressible as custom definitions.

const BEFORE = JSON.parse(readFileSync(new URL("../../fixtures/improvement-rules-before.json", import.meta.url), "utf8"));
const MOVES = [[STEADING_MOVE.DEPLOY, "defenses"], [STEADING_MOVE.MUSTER, "population"], [STEADING_MOVE.PULL_TOGETHER, "population"], [STEADING_MOVE.TRADE_BARTER, "prosperity"], [STEADING_MOVE.REQUISITION, "fortunes"], [STEADING_MOVE.AUROCHS_HUNT, "defenses"]];
const TACTICS = [{ index: 1, label: "Archery: barrages" }];
const compact = o => Object.fromEntries(Object.entries(o).filter(([, v]) => !(v === "" || v === 0 || v === false || (Array.isArray(v) && !v.length))));
// The old window asked the wall as "wall"; the grant's question is named for its improvement.
const OLD_WALL_ANSWERS = { "advantage-palisade": true, "advantage-stoneWall": true };
const asOldQuestion = q => (q.name.startsWith("advantage-") ? { ...q, name: "wall" } : q);
const yieldRow = ({ key, label, needsHit, blocked, amount }) => ({ key, label, needsHit, blocked, amount });
const byKey = (a, b) => a.key.localeCompare(b.key);

describe("the book's seventeen, exactly as before (pinned)", () => {
	describe.each(BEFORE.sets.map(set => [set.set.join("+") || "(none)", set]))("%s", (_name, before) => {
		const rules = builtInImprovementRules(before.set);

		it("rolls the same harvest", () => {
			expect([false, true].map(builtOnTheFields => autumnHarvest({ rules, builtOnTheFields }))).toEqual(before.harvest);
		});

		it("rolls the same winter, both bites, every Size", () => {
			for (const w of before.winter) {
				expect(winterConsumption({ population: w.p, rules, size: w.s, second: !!w.b }), JSON.stringify(w))
					.toEqual({ formula: w.f, parts: w.parts });
			}
		});

		// The rows are the same ones, with the same keys (the stamps already taken stay taken),
		// amounts and gates. Their order now follows the Improvements tab's, and their wording is
		// generated from the grant, so neither is pinned.
		it("offers the same yields, keyed by the same season steps", () => {
			for (const y of before.yields) {
				const now = seasonalYields({ seasonId: y.seasonId, population: y.population, rules: builtInImprovementRules(before.set, { requirementsMet: () => y.met }) });
				expect(now.map(yieldRow).sort(byKey), JSON.stringify(y)).toEqual(y.rows.map(yieldRow).sort(byKey));
				for (const row of now) expect(!!row.unmet).toBe(row.blocked);
			}
		});

		it("asks the same questions", () => {
			for (const q of before.questions) {
				const tactics = q.tactics ? TACTICS : [];
				expect(improvementQuestions(q.move, q.stat, { rules, tactics, herd: { grown: 12, total: 14 } }).map(asOldQuestion), q.move)
					.toEqual(q.q);
			}
		});

		it("adjusts every roll the same way", () => {
			for (const x of before.adjust) {
				const stat = MOVES.find(([m]) => m === x.move)[1];
				const answers = x.answered ? { watch: true, herd: true, strength: false, tactic: "1", herdCount: 3, ...OLD_WALL_ANSWERS } : {};
				const now = rollAdjustments({
					moveName: x.move, statKey: stat, rules, answers, tactics: TACTICS,
					size: x.size ?? "", winter: !!x.winter, diminished: !!x.winter, herdTotal: 14,
				});
				expect(compact(now), JSON.stringify(x)).toEqual(x.a);
			}
		});
	});

	it("keeps every standing effect (the Market's and Expanded Trades' lapse, the militia's 2+ tactics)", () => {
		for (const def of IMPROVEMENT_DEFINITIONS) {
			const n = def.sections.reduce((a, s) => a + s.items.length, 0);
			expect([
				standingGrantFor(def.slug, def, { completed: true, r: Array(n).fill(true) }),
				standingGrantFor(def.slug, def, { completed: true, r: Array(n).fill(false) }),
				standingGrantFor(def.slug, def, { completed: false, r: [] }),
			], def.slug).toEqual(BEFORE.standing[def.slug]);
		}
	});

	it("says the same completion notes, and only those", () => {
		for (const def of IMPROVEMENT_DEFINITIONS) {
			expect(IMPROVEMENT_GRANTS[def.slug]?.completionNote, def.slug).toBe(BEFORE.notes[def.slug]);
		}
	});

	it("owes the same upkeep: the watch every season, the weapons each spring, under their old step keys", () => {
		const rules = builtInImprovementRules(["standingWatch", "weaponsOfWar"]);
		expect(upkeepsDue(rules, "spring").map(u => [u.slug, u.key, u.surplus, u.start]))
			.toEqual([["standingWatch", "standingWatch", 1, true], ["weaponsOfWar", "weaponsUpkeep", 1, false]]);
		for (const season of ["summer", "autumn", "winter"]) expect(upkeepsDue(rules, season).map(u => u.slug)).toEqual(["standingWatch"]);
	});

	it("keeps the normalizer from changing any of the table", () => {
		for (const [slug, grants] of Object.entries(IMPROVEMENT_GRANTS)) {
			const { replaceAssets, ...rest } = grants;
			const normalized = normalizeImprovementGrants(grants);
			expect({ ...normalized, replaceAssets: undefined }, slug).toEqual({ ...rest, replaceAssets: undefined });
		}
	});
});

// ── 2. A homebrew copy carrying a built-in's grants behaves like it ─────────────

/** A built-in's grants through the builder's Effect panel and back, as a custom definition. */
function homebrewOf(slug) {
	const def = IMPROVEMENT_DEFINITIONS.find(d => d.slug === slug);
	const label = s => IMPROVEMENT_DEFINITIONS.find(d => d.slug === s)?.label ?? s;
	const named = n => IMPROVEMENT_DEFINITIONS.find(d => d.label === n)?.slug ?? n;
	const grants = normalizeImprovementGrants(grantsFromFormValues(grantFormValues(IMPROVEMENT_GRANTS[slug], { improvementLabel: label }), { improvementSlug: named }));
	return { slug: `custom-${slug}`, label: def.label, sections: def.sections, grants };
}
function customRules(slug, { requirementsMet = () => true } = {}) {
	const def = homebrewOf(slug);
	return improvementRulesFrom({
		defs: [def], grantsFor: d => d.grants,
		improvements: { [def.slug]: { completed: true } },
		requirementsMet: () => requirementsMet(),
	});
}
const LIVE = Object.keys(IMPROVEMENT_GRANTS).filter(slug =>
	["seasonalYield", "harvestBonus", "winterConsumption", "winterPopulation", "upkeep", "rollAdvantage", "lapse"]
		.some(key => IMPROVEMENT_GRANTS[slug][key]));

describe("a homebrew improvement carrying a built-in's rule behaves like the built-in", () => {
	it("covers every built-in with a live rule", () => {
		expect(LIVE.sort()).toEqual(["additionalHousing", "expandedTrades", "greaterHarvest", "harnessingStream", "market", "mill", "palisade", "raincatching", "standingWatch", "stoneWall", "township", "weaponsOfWar"]);
	});

	describe.each(LIVE)("a copy of %s", slug => {
		const book = builtInImprovementRules([slug]);
		const copy = customRules(slug);

		it("rewrites the harvest and winter the same", () => {
			expect(autumnHarvest({ rules: copy })).toEqual(autumnHarvest({ rules: book }));
			for (const size of ["hamlet", "village", "town"]) for (const second of [false, true]) {
				expect(winterConsumption({ population: 2, rules: copy, size, second })).toEqual(winterConsumption({ population: 2, rules: book, size, second }));
			}
		});

		it("generates the same yields, gated the same", () => {
			for (const seasonId of ["spring", "summer", "autumn", "winter"]) for (const population of [-1, 0, 2]) for (const met of [true, false]) {
				const strip = rows => rows.map(({ key, slug: _s, ...row }) => row);
				expect(strip(seasonalYields({ seasonId, population, surplus: 1, rules: customRules(slug, { requirementsMet: () => met }) })))
					.toEqual(strip(seasonalYields({ seasonId, population, surplus: 1, rules: builtInImprovementRules([slug], { requirementsMet: () => met }) })));
			}
		});

		it("owes the same upkeep", () => {
			for (const season of ["spring", "summer", "autumn", "winter"]) {
				const strip = list => list.map(({ slug: _s, key: _k, ...u }) => u);
				expect(strip(upkeepsDue(copy, season))).toEqual(strip(upkeepsDue(book, season)));
			}
		});

		// Advantage only: the questions still keyed by slug (the watch's +1 Defenses, the herd's, the
		// militia's tactic) are the book improvement's own and are not carried by a copy, by design.
		it("gives the same advantage, asked or always", () => {
			const BESPOKE = new Set(["watch", "herd", "herdCount", "tactic"]);
			for (const [move, stat] of MOVES) {
				const labels = rules => improvementQuestions(move, stat, { rules }).filter(q => !BESPOKE.has(q.name)).map(q => q.label);
				expect(labels(copy)).toEqual(labels(book));
				const answer = rules => Object.fromEntries(improvementQuestions(move, stat, { rules }).map(q => [q.name, true]));
				for (const size of ["", "town", "hamlet"]) {
					expect(rollAdjustments({ moveName: move, statKey: stat, rules: copy, answers: answer(copy), size }).adv)
						.toEqual(rollAdjustments({ moveName: move, statKey: stat, rules: book, answers: answer(book), size }).adv);
				}
			}
		});

		it("lapses the same", () => {
			const def = homebrewOf(slug);
			const builtIn = IMPROVEMENT_DEFINITIONS.find(d => d.slug === slug);
			const n = builtIn.sections.reduce((a, s) => a + s.items.length, 0);
			for (const fill of [true, false]) {
				expect(standingGrantFor(def.slug, def, { completed: true, r: Array(n).fill(fill) }))
					.toEqual(standingGrantFor(slug, builtIn, { completed: true, r: Array(n).fill(fill) }));
			}
		});
	});
});

// ── WHEN AN IMPROVEMENT IS IN FORCE (P13) ──────────────────────────────────────
describe("what puts an improvement's rules in force", () => {
	const defs = IMPROVEMENT_DEFINITIONS;
	const grantsFor = def => IMPROVEMENT_GRANTS[def.slug] ?? def.grants ?? null;
	const slugs = (o = {}) => improvementRulesFrom({ defs, grantsFor, ...o }).map(r => r.slug);

	it("is completion, or the Fortification or Resource it adds, ticked on the list", () => {
		expect(slugs({ improvements: { mill: { completed: true } } })).toEqual(["mill"]);
		expect(slugs({ lists: { resources: [{ name: "Mill", checked: true }] } })).toEqual(["mill"]);
		expect(slugs({ lists: { resources: [{ name: "mill ", checked: true }] } })).toEqual(["mill"]);
		expect(slugs({ lists: { resources: [{ name: "Mill", checked: false }] } })).toEqual([]);
		expect(slugs({ lists: { fortifications: [{ name: "Stone Wall", checked: true }] } })).toEqual(["stoneWall"]);
	});

	// "erase 'Palisade' if you had it": an improvement in force that erases a Fortification retires
	// the improvement that adds it, which is why only the one wall is ever asked about.
	it("retires an improvement whose Fortification another in force erases", () => {
		expect(slugs({ improvements: { palisade: { completed: true }, stoneWall: { completed: true } } })).toEqual(["stoneWall"]);
	});

	it("gives a homebrew 'Stone Wall' Fortification the wall's advantage to Deploy and its winter saving", () => {
		const homebrew = { slug: "custom-rampart", label: "Rampart", sections: [], grants: { fortifications: ["Stone Wall"] } };
		const rules = improvementRulesFrom({
			defs: [...defs, homebrew], grantsFor,
			improvements: { "custom-rampart": { completed: true } },
			lists: { fortifications: [{ name: "Stone Wall", checked: true }] },
		});
		expect(rules.map(r => r.slug)).toEqual(["stoneWall", "custom-rampart"]);
		expect(improvementQuestions(STEADING_MOVE.DEPLOY, "defenses", { rules }).map(q => q.name)).toContain("advantage-stoneWall");
		expect(winterConsumption({ population: 1, rules }).formula).toBe("1d4");
	});
});

// ── 3. Book II, as custom definitions ───────────────────────────────────────────
// What a later pass writes into the journal cards. Each is the book's text, read for its mechanics.
const BOOK_II = {
	// Book II p. 29 (PDF 15): "Henceforth, when spring bursts forth and Stonetop has at least 1 Surplus,
	// Stonetop gains +1 Surplus from trade. Also, when you Trade & Barter for timber ... you have advantage."
	"Trade with Barrier Pass": {
		stats: { fortunes: 1 },
		resources: ["Trade with Barrier Pass (timber, ivory, parchment, fine wool, goats, sheep)"],
		seasonalYield: { seasons: ["spring"], surplus: 1, minSurplus: 1 },
		rollAdvantage: { moves: ["Trade & Barter"], ask: "Trading for timber, ivory, fine wool, goats, sheep, parchment, vellum, or ink" },
	},
	// Book II p. 146 (PDF 74): "it consumes 1 less Surplus than usual in winter. However, the logging
	// camp consumes 1 Surplus every summer or else it ceases operation."
	"Permanent Logging Camp": {
		stats: { fortunes: 1 },
		resources: ["Logging: timber, wood"],
		winterConsumption: -1,
		upkeep: { seasons: ["summer"], surplus: 1 },
	},
	// Book II p. 188 (PDF 95): "automatically mark the Greater Harvest improvement. Henceforth, when the
	// steading generates Surplus, even just 1, it generates +1 Surplus."
	"Golden Sapling": {
		resources: ["Golden Sapling"],
		markImprovements: ["greaterHarvest"],
		surplusBonus: 1,
	},
	// Book II p. 202 (PDF 102): "Henceforth, the steading has a ready supply of timber ... and it
	// consumes 1 less Surplus every winter."
	"Great Wood Timber": {
		stats: { fortunes: 1 },
		resources: ["Timber from the Great Wood"],
		winterConsumption: -1,
	},
	// Book II p. 216 (PDF 109): "the steading generates +1 Surplus in summer and another +1 Surplus when
	// the autumn harvest is complete."
	"Rhoillyg Orchard": {
		stats: { fortunes: 1 },
		resources: ["Rhoillyg Orchard"],
		completionNote: "Add the orchard to the steading map.",
		seasonalYield: { seasons: ["summer"], surplus: 1 },
		harvestBonus: 1,
	},
	// Book II p. 272 (PDF 137): "you can expand or repair the Makers' Roads. Every ~25 miles of road
	// requires Pulling Together, one season of labor, 2 Surplus ... and a purse of silvers."
	"Roadbuilding": {
		completionNote: "The steading can now expand or repair the Makers' Roads: every ~25 miles takes Pulling Together, a season of labor, 2 Surplus and a purse of silvers.",
	},
	// Book II p. 405 (PDF 203): "As long as you trade aetherium to the outside world, increase Prosperity
	// by 1. ... you have advantage to Trade & Barter for the aetherium items with special characteristics."
	"Aetherium Crucible": {
		resources: ["Aetherium Crucible"],
		completionNote: "Add the crucible to the steading map.",
		condition: { text: "Trading aetherium to the outside world", stats: { prosperity: 1 } },
		rollAdvantage: { moves: ["Trade & Barter"], ask: "Trading for aetherium items with special characteristics" },
	},
};

const book2Rules = (name, o = {}) => improvementRulesFrom({
	defs: [{ slug: `custom-${name}`, label: name, sections: [], grants: BOOK_II[name] }],
	grantsFor: d => d.grants, improvements: { [`custom-${name}`]: { completed: true } }, ...o,
});

describe("Book II's improvements, as custom definitions", () => {
	it.each(Object.keys(BOOK_II))("%s survives the normalizer and the builder's form unchanged", name => {
		const grants = BOOK_II[name];
		expect(normalizeImprovementGrants(grants)).toEqual(grants);
		const label = s => (s === "greaterHarvest" ? "Greater Harvest" : s);
		const slug = n => (n === "Greater Harvest" ? "greaterHarvest" : n);
		expect(normalizeImprovementGrants(grantsFromFormValues(grantFormValues(grants, { improvementLabel: label }), { improvementSlug: slug }))).toEqual(grants);
		expect([...summarizeImprovementGrants(grants), ...summarizeImprovementRules(grants)].length).toBeGreaterThan(0);
	});

	it("Barrier Pass: +1 Surplus in spring only with 1 Surplus in hand, and asked advantage on Trade & Barter", () => {
		const rules = book2Rules("Trade with Barrier Pass");
		expect(seasonalYields({ seasonId: "spring", surplus: 0, rules })[0]).toMatchObject({ blocked: true, amount: 0 });
		expect(seasonalYields({ seasonId: "spring", surplus: 1, rules })[0]).toMatchObject({ blocked: false, amount: 1, key: yieldStepKey("custom-Trade with Barrier Pass") });
		expect(seasonalYields({ seasonId: "summer", surplus: 3, rules })).toEqual([]);
		const [ask] = improvementQuestions(STEADING_MOVE.TRADE_BARTER, "prosperity", { rules });
		expect(ask.label).toMatch(/^Trading for timber/);
		expect(rollAdjustments({ moveName: STEADING_MOVE.TRADE_BARTER, statKey: "prosperity", rules, answers: { [ask.name]: true } }).adv).toEqual(["Trade with Barrier Pass"]);
		expect(rollAdjustments({ moveName: STEADING_MOVE.TRADE_BARTER, statKey: "prosperity", rules, answers: {} }).adv).toEqual([]);
	});

	it("Logging Camp and Great Wood Timber each save 1 in winter, stacking with the Stone Wall, on the first bite", () => {
		const rules = [...builtInImprovementRules(["stoneWall"]), ...book2Rules("Permanent Logging Camp"), ...book2Rules("Great Wood Timber")];
		expect(winterConsumption({ population: 3, rules }).formula).toBe("1d4");
		expect(winterConsumption({ population: 3, rules, second: true }).formula).toBe("1d4 + 3");
		expect(upkeepsDue(book2Rules("Permanent Logging Camp"), "summer")).toMatchObject([{ surplus: 1, start: false, key: "custom-Permanent Logging CampUpkeep" }]);
		expect(upkeepsDue(book2Rules("Permanent Logging Camp"), "spring")).toEqual([]);
	});

	it("Golden Sapling: +1 on every Surplus generated, never on nothing", () => {
		const rules = book2Rules("Golden Sapling");
		expect(withSurplusBonus(3, rules)).toMatchObject({ gain: 4, bonus: 1 });
		expect(withSurplusBonus(1, rules)).toMatchObject({ gain: 2 });
		expect(withSurplusBonus(0, rules)).toMatchObject({ gain: 0, bonus: 0 });
		expect(withSurplusBonus(3, [])).toMatchObject({ gain: 3, bonus: 0 });
	});

	it("Rhoillyg Orchard: +1 in summer, and +1 on the harvest", () => {
		const rules = [...builtInImprovementRules(["greaterHarvest", "mill"]), ...book2Rules("Rhoillyg Orchard")];
		expect(autumnHarvest({ rules }).formula).toBe("1d4 + 1d4 + 2");
		expect(seasonalYields({ seasonId: "summer", rules: book2Rules("Rhoillyg Orchard") })[0].amount).toBe(1);
	});

	it("Aetherium Crucible: +1 Prosperity only while its condition is ticked", () => {
		const def = { slug: "custom-aetherium", label: "Aetherium Crucible", sections: [], grants: BOOK_II["Aetherium Crucible"] };
		expect(standingGrantFor(def.slug, def, { completed: true, r: [], condition: true })).toEqual({ prosperity: 1 });
		expect(standingGrantFor(def.slug, def, { completed: true, r: [] })).toBeNull();
		expect(standingGrantFor(def.slug, def, { completed: false, r: [], condition: true })).toBeNull();
	});
});

// ── The normalizer, kind by kind ────────────────────────────────────────────────
describe("normalizing the new kinds", () => {
	it("drops what is blank or incomplete, and keeps what is whole", () => {
		expect(normalizeImprovementGrants({
			seasonalYield: { seasons: [], surplus: 1 }, upkeep: { seasons: ["summer"], surplus: "" },
			rollAdvantage: { moves: [], ask: "x" }, lapse: { stats: { prosperity: "" } },
			condition: { text: "", stats: { prosperity: 1 } }, harvestBonus: "", winterConsumption: "0", surplusBonus: "-1",
			replaceAssets: "no arrow here", markImprovements: "Greater Harvest", completionNote: "  ",
		})).toBeNull();
		expect(normalizeImprovementGrants({ harvestBonus: "+1d4" })).toEqual({ harvestBonus: "1d4" });
		expect(normalizeImprovementGrants({ harvestBonus: "2" })).toEqual({ harvestBonus: 2 });
		expect(normalizeImprovementGrants({ rollAdvantage: { moves: ["Trade &amp; Barter", "deploy", "Seasons Change"] } }))
			.toEqual({ rollAdvantage: { moves: ["Deploy", "Trade & Barter"] } });
		expect(normalizeImprovementGrants({ replaceAssets: "draft horses => A herd\nold cart -> New cart" }))
			.toEqual({ replaceAssets: [{ match: "draft horses", name: "A herd" }, { match: "old cart", name: "New cart" }] });
		expect(normalizeImprovementGrants({ seasonalYield: { seasons: ["Summer", "spring"], surplus: "0", plusPopulation: "on" } }))
			.toEqual({ seasonalYield: { seasons: ["spring", "summer"], surplus: 0, plusPopulation: true } });
	});

	// The custom asset swap never carries the herd's `beast`: the herd's tracker is the book's own.
	it("never lets a custom swap carry a beast", () => {
		expect(normalizeImprovementGrants({ replaceAssets: [{ match: "draft horses", name: "Herd", beast: { herd: true } }] }))
			.toEqual({ replaceAssets: [{ match: "draft horses", name: "Herd" }] });
	});

	it("tells one-time edits from live ones", () => {
		expect(grantKindsChanged({ stats: { fortunes: 1 } }, { stats: { fortunes: 2 } })).toEqual({ oneTime: true, live: false, note: false });
		expect(grantKindsChanged({ harvestBonus: 1 }, { harvestBonus: 2 })).toEqual({ oneTime: false, live: true, note: false });
		expect(grantKindsChanged({ completionNote: "a" }, {})).toEqual({ oneTime: false, live: false, note: true });
	});

	it("says live edits apply at once, and only one-time ones need re-completing", () => {
		const [live, liveOpts] = editSavedNotice({ label: "Camp", completed: true, liveChanged: true, oneTimeChanged: false, standingChanged: ["Prosperity +1 (x)"] });
		expect(live).toMatch(/ongoing rules changed, and apply from now on: Prosperity \+1/);
		expect(live).not.toMatch(/un-tick/);
		expect(liveOpts).toEqual({});
		const [once, onceOpts] = editSavedNotice({ label: "Camp", completed: true, liveChanged: false, oneTimeChanged: true });
		expect(once).toMatch(/one-time effects changed/);
		expect(onceOpts).toEqual({ permanent: true });
	});
});

// ── The engine, against a fake actor that writes the way Foundry does ───────────
const isPlain = v => v && typeof v === "object" && !Array.isArray(v);
function mergeInto(target, value) {
	for (const [k, v] of Object.entries(value)) {
		if (isPlain(v) && isPlain(target[k])) mergeInto(target[k], v);
		else target[k] = structuredClone(v);
	}
}
function writePath(root, path, value) {
	const keys = path.split(".");
	const last = keys.pop();
	let at = root;
	for (const k of keys) at = (at[k] ??= {});
	if (last.startsWith("-=")) { delete at[last.slice(2)]; return; }
	if (isPlain(value) && isPlain(at[last])) mergeInto(at[last], value);
	else at[last] = structuredClone(value);
}
function liveActor(steading = {}) {
	const actor = {
		id: `st-${Math.random().toString(36).slice(2)}`,
		type: "stonetop",
		system: {},
		flags: { "stonetop_pwd": { steading: structuredClone(steading) } },
		getFlag: (scope, key) => actor.flags["stonetop_pwd"]?.[key],
	};
	actor.update = vi.fn(async data => { for (const [path, value] of Object.entries(data)) writePath(actor, path, value); });
	actor.setFlag = vi.fn(async (scope, key, value) => writePath(actor, `flags.${scope}.${key}`, value));
	return actor;
}
const stored = actor => actor.flags["stonetop_pwd"].steading;
const prosperity = actor => stored(actor).system?.attributes?.prosperity?.value;

describe("the engine carries the new kinds", () => {
	it("marks the improvements a completion names, and takes them back when it goes (Golden Sapling)", async () => {
		const actor = liveActor({ system: { stats: { fortunes: { value: 1 } } }, resources: [{ name: "", checked: false }] });
		const steading = new StonetopSteading(actor);
		const added = await steading.addCustomImprovement({ name: "Golden Sapling", grants: BOOK_II["Golden Sapling"] });
		const done = await steading.setImprovementCompleted(added.slug, true);
		expect(steading.improvementCompleted("greaterHarvest")).toBe(true);
		expect(stored(actor).system.stats.fortunes.value).toBe(2);     // Greater Harvest's own +1
		expect(done.summary.join("; ")).toMatch(/Also marked complete: Greater Harvest/);
		expect(steading.improvementRules().map(r => r.slug)).toEqual(["greaterHarvest", added.slug]);
		await steading.setImprovementCompleted(added.slug, false);
		expect(steading.improvementCompleted("greaterHarvest")).toBe(false);
		expect(stored(actor).system.stats.fortunes.value).toBe(1);
	});

	it("moves a condition's stat with its box, and back (Aetherium Crucible)", async () => {
		const actor = liveActor({ system: { attributes: { prosperity: { value: 0 } } } });
		const steading = new StonetopSteading(actor);
		const { slug } = await steading.addCustomImprovement({ name: "Aetherium Crucible", grants: BOOK_II["Aetherium Crucible"] });
		await steading.setImprovementCompleted(slug, true);
		expect(prosperity(actor)).toBe(0);
		const on = await steading.setImprovementCondition(slug, true);
		expect(prosperity(actor)).toBe(1);
		expect(on.summary[0]).toBe("Prosperity +0 → +1 (Trading aetherium to the outside world: yes)");
		await steading.setImprovementCondition(slug, false);
		expect(prosperity(actor)).toBe(0);
		// Un-completing while ticked takes the standing stat back too.
		await steading.setImprovementCondition(slug, true);
		await steading.setImprovementCompleted(slug, false);
		expect(prosperity(actor)).toBe(0);
	});

	it("lapses a custom improvement's stat when its requirements stop being met, like the Market", async () => {
		const actor = liveActor({ system: { attributes: { prosperity: { value: 0 } } } });
		const steading = new StonetopSteading(actor);
		const { slug } = await steading.addCustomImprovement({
			name: "Guild Hall", sections: [{ heading: "Requires:", items: ["A guildmaster"] }],
			grants: { stats: { prosperity: 1 }, lapse: { stats: { prosperity: -1 } } },
		});
		await steading.setImprovementRequirement(slug, 0, true);
		await steading.setImprovementCompleted(slug, true);
		expect(prosperity(actor)).toBe(1);
		await steading.setImprovementRequirement(slug, 0, false);
		expect(prosperity(actor)).toBe(0);
		await steading.setImprovementRequirement(slug, 0, true);
		expect(prosperity(actor)).toBe(1);
	});

	it("gives back a lapsed stat when the lapse is edited off the built improvement", async () => {
		const actor = liveActor({ system: { attributes: { prosperity: { value: 0 } } } });
		const steading = new StonetopSteading(actor);
		const sections = [{ heading: "Requires:", items: ["A guildmaster"] }];
		const { slug } = await steading.addCustomImprovement({
			name: "Guild Hall", sections, grants: { stats: { prosperity: 1 }, lapse: { stats: { prosperity: -1 } } },
		});
		await steading.setImprovementRequirement(slug, 0, true);
		await steading.setImprovementCompleted(slug, true);
		await steading.setImprovementRequirement(slug, 0, false);
		expect(prosperity(actor)).toBe(0);
		const result = await steading.updateCustomImprovement(slug, { name: "Guild Hall", sections, grants: { stats: { prosperity: 1 } } });
		expect(prosperity(actor)).toBe(1);
		expect(result.standingChanged[0]).toBe("Prosperity +0 → +1 (its standing effect was removed)");
		expect(stored(actor).improvements[slug].standing).toBeNull();
		// Nothing is left to give back when it is un-completed: only the one-time +1 goes.
		await steading.setImprovementCompleted(slug, false);
		expect(prosperity(actor)).toBe(0);
	});

	it("unticks a custom copy's \"Mill\" box when the Mill is lost, as the book's Expanded Trades does", async () => {
		const actor = liveActor({
			improvements: { mill: { completed: true, r: [], applied: { resources: ["Mill"] } } },
			resources: [{ name: "Mill", checked: true }],
			system: { attributes: { prosperity: { value: 2 } } },
		});
		const steading = new StonetopSteading(actor);
		const { slug } = await steading.addCustomImprovement({
			name: "Guild Trades",
			sections: [{ heading: "Requires one of:", min: 1, items: ["Harnessing the Stream", "Raincatching", "Mill"] }],
			grants: { lapse: { stats: { prosperity: -1 } } },
		});
		await steading.setImprovementRequirement(slug, 2, true);
		await steading.setImprovementCompleted(slug, true);
		const result = await steading.setImprovementCompleted("mill", false);
		expect(stored(actor).improvements[slug].r[2]).toBe(false);
		expect(stored(actor).improvements[slug].standing).toEqual({ prosperity: -1 });
		expect(result.summary).toContain(`Guild Trades: unticked "Mill"`);
	});

	it("reads a Fortifications entry stored as a bare name as a ticked one", () => {
		const defs = IMPROVEMENT_DEFINITIONS.filter(d => d.slug === "weaponsOfWar");
		const grantsFor = def => IMPROVEMENT_GRANTS[def.slug];
		expect(improvementRulesFrom({ defs, grantsFor, lists: { fortifications: ["Weapons of War"] } }).map(r => r.slug))
			.toEqual(["weaponsOfWar"]);
		expect(improvementRulesFrom({ defs, grantsFor, lists: { fortifications: [""] } })).toEqual([]);
	});

	it("applies a live grant edited onto a built improvement at once, and says so", async () => {
		const actor = liveActor({ system: { attributes: { prosperity: { value: 0 } } } });
		const steading = new StonetopSteading(actor);
		const { slug } = await steading.addCustomImprovement({ name: "Crucible", grants: { resources: ["Crucible"] } });
		await steading.setImprovementCompleted(slug, true);
		await steading.setImprovementCondition(slug, true);   // no condition yet: nothing moves
		expect(prosperity(actor)).toBe(0);
		const result = await steading.updateCustomImprovement(slug, {
			name: "Crucible", grants: { resources: ["Crucible"], condition: { text: "Trading", stats: { prosperity: 1 } } },
		});
		expect(result).toMatchObject({ ok: true, liveChanged: true, oneTimeChanged: false, completed: true });
		expect(prosperity(actor)).toBe(1);
		expect(result.standingChanged[0]).toMatch(/^Prosperity \+0 → \+1 /);
	});

	it("writes a custom asset swap as a plain asset, never the herd", async () => {
		const actor = liveActor({});
		const steading = new StonetopSteading(actor);
		const { slug } = await steading.addCustomImprovement({
			name: "Stud Farm", grants: { replaceAssets: "draft horses => A herd of horses (its size is kept on the Herd of Horses improvement)" },
		});
		await steading.setImprovementCompleted(slug, true);
		const row = stored(actor).assets.find(a => a.name.startsWith("A herd of horses"));
		expect(row.beast).toBeNull();
		const named = steading.getNamedAssets().find(a => a.name.startsWith("A herd of horses"));
		expect(named.beast).toBeNull();
		// And un-completing puts the draft pair back whole.
		await steading.setImprovementCompleted(slug, false);
		expect(stored(actor).assets[0].beast).toMatchObject({ slug: "horse", count: 2 });
	});

	it("loses an improvement for want of upkeep, taking its own entry off the list even when written by hand", async () => {
		const actor = liveActor({ fortifications: [{ name: "Standing Watch", checked: true }] });
		const steading = new StonetopSteading(actor);
		// In force by its entry alone (P13): the watch's upkeep is owed.
		expect(upkeepsDue(steading.improvementRules(), "spring").map(u => u.slug)).toEqual(["standingWatch"]);
		const lost = await steading.loseImprovement("standingWatch", { seasonStep: { step: upkeepStepKey("standingWatch"), year: 1, seasonId: "spring" } });
		expect(stored(actor).fortifications[0].name).toBe("");
		expect(lost.summary).toContain("Standing Watch removed from Fortifications");
		expect(steading.seasonStepApplied("standingWatch", 1, "spring")).toBe(true);
	});

	it("puts a homebrew upkeep in the holds tray's generic row, the watch and the weapons in their own", () => {
		const rows = steadingHolds({ upkeep: { items: [{ label: "Permanent Logging Camp", surplus: 1 }] }, standingWatch: true });
		expect(rows.map(r => r.key)).toEqual(["standingWatch", "upkeep"]);
		expect(rows[1].tooltip).toMatch(/^Permanent Logging Camp wants 1 Surplus this season, or the steading loses it/);
	});
});
