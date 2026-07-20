import { describe, it, expect } from "vitest";
import {
	THEMES, ASPECTS, INSTINCTS,
	SITE_FEATURES, SITE_CAUSES, SITE_SEVERITIES, EMANATION_ORIGINS,
	CLEANSING_REQUIREMENTS, CLEANSING_BINDINGS, SITE_DANGER_MOVES,
	NAME_ARTICLES, NAME_VERBS, NAME_ADJECTIVES, NAME_ROLES,
	seedSiteDoomTrack, siteDangerMoves, generateThingName, generateThingTitle, rollThingName,
	rollDistinct, rollOnTable,
} from "../../module/data/things-below-tables.js";

// A deterministic rng stub returning a fixed float in [0, 1).
const rng = v => () => v;
// A sequenced rng that walks a list of floats, then repeats the last.
const seq = (...vals) => { let i = 0; return () => vals[Math.min(i++, vals.length - 1)]; };

// Every range table should tile 1..12 with no gaps or overlaps.
function covers1to12(table) {
	const covered = [];
	for (const e of table) for (let r = e.min; r <= e.max; r++) covered.push(r);
	return covered.sort((a, b) => a - b);
}
const ALL12 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

describe("Things Below straight 1d12 tables", () => {
	it("THEMES / ASPECTS / INSTINCTS are each a full 12-row 1d12", () => {
		for (const [name, table] of [["THEMES", THEMES], ["ASPECTS", ASPECTS], ["INSTINCTS", INSTINCTS]]) {
			expect(table, name).toHaveLength(12);
			table.forEach((e, i) => {
				expect(e.id, name).toBe(i + 1);
				expect(e.min, name).toBe(i + 1);
				expect(e.max, name).toBe(i + 1);
				expect(e.text, name).toBeTruthy();
			});
		}
	});

	it("THEMES carry note + materials imagery", () => {
		for (const t of THEMES) {
			expect(t.note).toBeTruthy();
			expect(t.materials).toBeTruthy();
		}
	});
});

describe("Things Below ranged 1d12 tables", () => {
	it("SITE_FEATURES / SITE_CAUSES / SITE_SEVERITIES / EMANATION_ORIGINS each cover 1..12", () => {
		expect(covers1to12(SITE_FEATURES)).toEqual(ALL12);
		expect(covers1to12(SITE_CAUSES)).toEqual(ALL12);
		expect(covers1to12(SITE_SEVERITIES)).toEqual(ALL12);
		expect(covers1to12(EMANATION_ORIGINS)).toEqual(ALL12);
	});

	it("fateful causes are flagged so the wizard can prompt the Die of Fate", () => {
		const fateful = SITE_CAUSES.filter(c => c.fateful);
		// The book stars 4 of the 6 cause rows.
		expect(fateful.length).toBe(4);
		for (const c of fateful) expect(c.text).toBeTruthy();
	});

	it("SITE_SEVERITIES form an ordered 5-rung escalation ladder", () => {
		const levels = SITE_SEVERITIES.map(s => s.level).sort((a, b) => a - b);
		expect(levels).toEqual([1, 2, 3, 4, 5]);
		for (const s of SITE_SEVERITIES) {
			expect(s.key).toBeTruthy();
			expect(s.danger).toBeTruthy();
		}
	});
});

describe("seedSiteDoomTrack", () => {
	it("a shunned place climbs the full ladder to a wound in the world", () => {
		const { grimPortents, impendingDoom } = seedSiteDoomTrack("shunned");
		// Levels 2,3,4 become portents; level 5 (wound) becomes the impending doom.
		expect(grimPortents).toHaveLength(3);
		expect(grimPortents.every(p => p.done === false)).toBe(true);
		expect(grimPortents[0].text).toMatch(/hungry place/i);
		expect(impendingDoom.text).toMatch(/wound in the world/i);
		expect(impendingDoom.done).toBe(false);
	});

	it("a poisonous place worsens toward spawning then a wound", () => {
		const { grimPortents, impendingDoom } = seedSiteDoomTrack("poisonous");
		expect(grimPortents).toHaveLength(1);
		expect(grimPortents[0].text).toMatch(/spawning place/i);
		expect(impendingDoom.text).toMatch(/wound in the world/i);
	});

	it("a wound in the world has nowhere left to worsen", () => {
		const { grimPortents, impendingDoom } = seedSiteDoomTrack("wound");
		expect(grimPortents).toEqual([]);
		expect(impendingDoom.text).toBe("");
	});

	it("an unknown severity is treated as the lowest rung (climbs from shunned)", () => {
		const { grimPortents, impendingDoom } = seedSiteDoomTrack("nope");
		expect(grimPortents).toHaveLength(3);
		expect(impendingDoom.text).toMatch(/wound in the world/i);
	});
});

describe("siteDangerMoves", () => {
	it("accrues danger moves cumulatively up the severity ladder", () => {
		const l1 = siteDangerMoves(1);
		const l3 = siteDangerMoves(3);
		expect(l1.length).toBe(SITE_DANGER_MOVES[1].length);
		// level 3 includes levels 1, 2, and 3 with no duplicates.
		expect(l3.length).toBe(SITE_DANGER_MOVES[1].length + SITE_DANGER_MOVES[2].length + SITE_DANGER_MOVES[3].length);
		expect(new Set(l3).size).toBe(l3.length);
		for (const m of l1) expect(l3).toContain(m);
	});

	it("a wound in the world accrues every level", () => {
		const all = siteDangerMoves(5);
		expect(all).toContain(SITE_DANGER_MOVES[5][0]);
		expect(all.length).toBeGreaterThanOrEqual(SITE_DANGER_MOVES[1].length + SITE_DANGER_MOVES[5].length);
	});
});

describe("cleansing lists", () => {
	it("expose non-empty requirement + binding option lists", () => {
		expect(CLEANSING_REQUIREMENTS.length).toBeGreaterThan(5);
		expect(CLEANSING_BINDINGS.length).toBeGreaterThan(5);
		expect(CLEANSING_REQUIREMENTS.every(s => typeof s === "string" && s.length)).toBe(true);
		expect(CLEANSING_BINDINGS.every(s => typeof s === "string" && s.length)).toBe(true);
	});
});

describe("name & title word-lists", () => {
	it("carry the book's word-lists", () => {
		expect(NAME_ARTICLES).toContain("the");
		expect(NAME_VERBS).toContain("whisper");
		expect(NAME_ADJECTIVES).toContain("pale");
		expect(NAME_ROLES).toContain("herald");
	});
});

describe("generateThingName", () => {
	it("is deterministic under a fixed rng and capitalizes", () => {
		const a = generateThingName(rng(0));
		const b = generateThingName(rng(0));
		expect(a).toBe(b);
		expect(a[0]).toBe(a[0].toUpperCase());
		expect(a.length).toBeGreaterThan(1);
	});

	it("can insert an apostrophe for inflection", () => {
		// count uses rng at index 0 (2 syllables), syllable picks, then the apostrophe roll (<0.5).
		const name = generateThingName(seq(0, 0, 0, 0));
		expect(name).toContain("'");
	});

	it("omits the apostrophe when the inflection roll is high", () => {
		const name = generateThingName(seq(0, 0, 0, 0.9));
		expect(name).not.toContain("'");
	});
});

describe("generateThingTitle", () => {
	it("produces a non-empty capitalized phrase flavored by a theme", () => {
		const title = generateThingTitle(rng(0), THEMES[4]); // cruelty theme (red crystal, spilled blood)
		expect(typeof title).toBe("string");
		expect(title.length).toBeGreaterThan(0);
	});
});

describe("rollThingName", () => {
	it("returns an invented name plus up to two distinct titles", () => {
		const { name, titles } = rollThingName(seq(0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9), THEMES.slice(0, 2));
		expect(name).toBeTruthy();
		expect(Array.isArray(titles)).toBe(true);
		expect(titles.length).toBeGreaterThanOrEqual(1);
		expect(titles.length).toBeLessThanOrEqual(2);
		expect(new Set(titles).size).toBe(titles.length); // distinct
	});
});

describe("rollDistinct", () => {
	it("returns N distinct entries from a table", () => {
		const picks = rollDistinct(THEMES, 2, seq(0, 0.5, 0.99));
		expect(picks).toHaveLength(2);
		expect(picks[0].id).not.toBe(picks[1].id);
	});

	it("never exceeds the table size", () => {
		const tiny = [{ id: 1, min: 1, max: 1, text: "only" }];
		expect(rollDistinct(tiny, 3, rng(0))).toHaveLength(1);
	});
});

describe("rollOnTable re-export", () => {
	it("rolls the low end to the first entry", () => {
		expect(rollOnTable(THEMES, rng(0))).toBe(THEMES[0]);
		expect(rollOnTable(SITE_FEATURES, rng(0))).toBe(SITE_FEATURES[0]);
	});
});
