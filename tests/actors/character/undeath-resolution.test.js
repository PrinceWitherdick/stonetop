import { describe, it, expect, vi } from "vitest";
import {
	ZERO_HP_RESOLUTIONS,
	halfMaxHp,
	resolutionTier,
	resolvedHp,
	zeroHpResolution,
} from "../../../module/actors/character/deaths-door.js";
import { CharacterPostDeath, insertHpPenalty, optionLabel } from "../../../module/actors/character/CharacterPostDeath.js";
import { CharacterInstincts } from "../../../module/actors/character/CharacterInstincts.js";
import { CharacterLore } from "../../../module/actors/character/CharacterLore.js";

function makeFlags(store = {}) {
	return {
		getFlag: (key) => store[key] ?? null,
		setFlag: vi.fn(async (key, val) => { store[key] = val; }),
		_store: store,
	};
}

// A Thrall-shaped insert: Favor track, and Marks with one already held.
const THRALL_LORE = [
	{
		slug: "favor",
		options: [{ slug: "favor-track", max: 3 }],
	},
	{
		slug: "marks",
		options: [
			{ slug: "a-festering-rot", description: "<p><strong>A FESTERING ROT</strong> &mdash; Reduce your max HP by 2.</p>" },
			{ slug: "ravenous",        description: "<p><strong>RAVENOUS</strong> &mdash; You are filled with unending hunger.</p>" },
			{ slug: "red-wrath",       description: "<p><strong>RED WRATH</strong> &mdash; Reduce your max HP by 2.</p>" },
		],
	},
];

const REVENANT_LORE = [
	{
		slug: "consequences",
		options: [
			{ slug: "breakdown", description: "<p><strong>BREAKDOWN</strong> &mdash; You lash out.</p>" },
			{ slug: "unstable",  description: "<p><strong>UNSTABLE</strong> &mdash; Prone to episodes.</p>", requires: "breakdown" },
			{ slug: "nightkin",  description: "<p><strong>NIGHTKIN</strong> &mdash; You see in the dark.</p>" },
		],
	},
];

function makePostDeath(slug, lore, { counts = {}, insertStore = {} } = {}) {
	const insertFlags = makeFlags({ slug, ...insertStore });
	const loreFlags   = makeFlags({ counts });
	const repo = { findBySlug: async (s) => (s === slug ? { slug, name: slug, lore } : null), getAll: async () => [] };
	const moveRepo = { getPostDeathMoves: async () => [] };
	return new CharacterPostDeath(insertFlags, new CharacterInstincts(makeFlags()), new CharacterLore(loreFlags), repo, moveRepo);
}

describe("zeroHpResolution — the three insert moves", () => {
	it("has a resolution for each insert and none for a plain character", () => {
		expect(zeroHpResolution("revenant").move).toBe("Undying");
		expect(zeroHpResolution("ghost").move).toBe("Tethered");
		expect(zeroHpResolution("thrall").move).toBe("Dark Succor");
		expect(zeroHpResolution(null)).toBeNull();
	});

	it("gives Undying the book's choose-1 / choose-2 / all-3 ladder", () => {
		const r = ZERO_HP_RESOLUTIONS.revenant;
		expect(r.tiers.success.pick).toBe(1);
		expect(r.tiers.partial.pick).toBe(2);
		expect(r.tiers.failure.pick).toBe(3);
		expect(r.effects).toHaveLength(3);
	});

	it("regains half max HP on Undying's 10+ and 7-9, but only 1 HP on the 6-", () => {
		const r = ZERO_HP_RESOLUTIONS.revenant;
		expect(resolvedHp(r.tiers.success, 19)).toBe(10);
		expect(resolvedHp(r.tiers.partial, 19)).toBe(10);
		expect(resolvedHp(r.tiers.failure, 19)).toBe(1);
	});

	it("offers the Revenant's 6- alternative of becoming a Ghost instead", () => {
		expect(ZERO_HP_RESOLUTIONS.revenant.tiers.failure.alternative.insert).toBe("ghost");
	});

	it("gives Tethered a single no-roll tier that reforms at half max HP", () => {
		const r = zeroHpResolution("ghost");
		expect(r.roll).toBeNull();
		expect(resolutionTier(r, null).pick).toBe(1);
		// The HP lands when they reform at the next sunset, not the moment they disperse.
		expect(resolvedHp(r.tiers.always, 21)).toBeNull();
		expect(resolvedHp(r.disperses, 21)).toBe(11);
	});

	it("leaves Dark Succor's recovery to the GM and always resets Favor", () => {
		const r = zeroHpResolution("thrall");
		for (const tier of ["success", "partial", "failure"]) {
			expect(resolvedHp(r.tiers[tier], 20), tier).toBeNull();
		}
		expect(r.alwaysResetFavor).toEqual({ entry: "favor", option: "favor-track" });
		expect(r.roll.loreCount).toEqual({ entry: "favor", option: "favor-track" });
	});
});

describe("halfMaxHp", () => {
	// Stonetop rounds up wherever it halves anything in a PC-facing move — Undying's own
	// "take half damage (after armor, rounded up)".
	it("rounds up", () => {
		expect(halfMaxHp(18)).toBe(9);
		expect(halfMaxHp(19)).toBe(10);
		expect(halfMaxHp(15)).toBe(8);
	});

	// "Regain half your max HP" has to leave them up; 0 would leave a character who just
	// survived their 0-HP move still at 0 and dying all over again.
	it("never returns less than 1", () => {
		expect(halfMaxHp(1)).toBe(1);
		expect(halfMaxHp(0)).toBe(1);
	});
});

describe("optionLabel", () => {
	it("uses the option's bold lead as its short name", () => {
		expect(optionLabel("<p><strong>A FESTERING ROT</strong> &mdash; Reduce your max HP by 2.</p>")).toBe("A FESTERING ROT");
	});

	it("falls back to the first clause when there is no bold lead", () => {
		expect(optionLabel("<p>Stoke conflict, confusion, distrust</p>")).toBe("Stoke conflict, confusion, distrust");
	});

	it("survives empty input", () => {
		expect(optionLabel(null)).toBe("");
	});
});

describe("CharacterPostDeath — what the 0-HP moves write", () => {
	it("offers unmarked consequences and blocks ones already taken", async () => {
		const pd = makePostDeath("revenant", REVENANT_LORE, { counts: { "consequences:nightkin": 1 } });
		const opts = await pd.sectionOptions("consequences");
		expect(opts.find(o => o.slug === "nightkin").blocked).toBe(true);
		expect(opts.find(o => o.slug === "breakdown").blocked).toBe(false);
	});

	// The Revenant's Unstable is "(Requires Breakdown)" — it can't be the consequence you mark
	// before you have Breakdown.
	it("blocks an option whose prerequisite is unmarked, and frees it once marked", async () => {
		const pd = makePostDeath("revenant", REVENANT_LORE);
		expect((await pd.sectionOptions("consequences")).find(o => o.slug === "unstable").blocked).toBe(true);

		await pd.markSectionOption("consequences", "breakdown");
		expect((await pd.sectionOptions("consequences")).find(o => o.slug === "unstable").blocked).toBe(false);
	});

	it("marks a consequence once and refuses to mark it twice", async () => {
		const pd = makePostDeath("revenant", REVENANT_LORE);
		expect(await pd.markSectionOption("consequences", "breakdown")).toBe(true);
		expect(await pd.markSectionOption("consequences", "breakdown")).toBe(false);
	});

	it("records a crossed-off Mark as gone for good, and only once", async () => {
		const pd = makePostDeath("thrall", THRALL_LORE);
		expect(await pd.crossOffMark("ravenous")).toBe(true);
		expect(await pd.crossOffMark("ravenous")).toBe(false);
		expect(pd.crossedOffMarks).toEqual(["ravenous"]);
	});

	it("keeps a crossed-off Mark out of the list of Marks that can be gained", async () => {
		const pd = makePostDeath("thrall", THRALL_LORE);
		await pd.crossOffMark("ravenous");
		const marks = await pd.sectionOptions("marks");
		expect(marks.find(m => m.slug === "ravenous").crossedOff).toBe(true);
		expect(marks.find(m => m.slug === "ravenous").blocked).toBe(true);
	});

	it("reads and resets Favor, clamped to the track's 0-3", async () => {
		const pd = makePostDeath("thrall", THRALL_LORE, { counts: { "favor:favor-track": 2 } });
		expect(pd.favor()).toBe(2);
		await pd.setFavor(0);
		expect(pd.favor()).toBe(0);
		await pd.setFavor(9);
		expect(pd.favor()).toBe(3);
		await pd.setFavor(-4);
		expect(pd.favor()).toBe(0);
	});

	it("stores the master's task, trimmed", async () => {
		const pd = makePostDeath("thrall", THRALL_LORE);
		await pd.setMasterTask("  Drown the shrine at Marshedge  ");
		expect(pd.masterTask).toBe("Drown the shrine at Marshedge");
	});

	it("carries the crossed-off Marks and the task onto the sheet snapshot", async () => {
		const pd = makePostDeath("thrall", THRALL_LORE);
		await pd.crossOffMark("red-wrath");
		await pd.setMasterTask("Bring me the Judge's tongue");

		const snap = await pd.buildSnapshot();
		expect(snap.activeInsert.crossedOffMarks).toEqual([{ slug: "red-wrath", label: "RED WRATH" }]);
		expect(snap.activeInsert.masterTask).toBe("Bring me the Judge's tongue");
		// And the lore list itself shows it struck through rather than merely unticked.
		const marks = snap.activeInsert.lore.entries.find(e => e.slug === "marks");
		expect(marks.options.find(o => o.slug === "red-wrath").crossedOff).toBe(true);
		expect(marks.options.find(o => o.slug === "ravenous").crossedOff).toBe(false);
	});

	it("returns no options for a section the insert doesn't have", async () => {
		const pd = makePostDeath("thrall", THRALL_LORE);
		expect(await pd.sectionOptions("consequences")).toEqual([]);
	});
});

describe("insertHpPenalty — the Thrall's Marks eat max HP", () => {
	const marked = (slugs) => ({
		entries: [{
			slug: "marks",
			options: [
				{ slug: "a-festering-rot", count: slugs.includes("a-festering-rot") ? 1 : 0, description: "<p><strong>A FESTERING ROT</strong> &mdash; Reduce your max HP by 2. You are unharmed by poison.</p>" },
				{ slug: "red-wrath",       count: slugs.includes("red-wrath")       ? 1 : 0, description: "<p><strong>RED WRATH</strong> &mdash; Reduce your max HP by 2.</p>" },
				{ slug: "ravenous",        count: slugs.includes("ravenous")        ? 1 : 0, description: "<p><strong>RAVENOUS</strong> &mdash; You are filled with unending hunger.</p>" },
			],
		}],
	});

	it("is zero with no Marks", () => {
		expect(insertHpPenalty(marked([]))).toBe(0);
	});

	it("takes 2 per marked Mark that says so, and stacks as they collect them", () => {
		expect(insertHpPenalty(marked(["a-festering-rot"]))).toBe(2);
		expect(insertHpPenalty(marked(["a-festering-rot", "red-wrath"]))).toBe(4);
	});

	// Three of the nine Marks carry no HP cost; holding one must not quietly charge for it.
	it("ignores a Mark that doesn't reduce max HP", () => {
		expect(insertHpPenalty(marked(["ravenous"]))).toBe(0);
		expect(insertHpPenalty(marked(["ravenous", "red-wrath"]))).toBe(2);
	});

	it("charges nothing for a Mark that is merely available", () => {
		// "red-wrath" costs 2, but only once it's actually marked.
		expect(insertHpPenalty(marked([]))).toBe(0);
	});

	it("survives an insert with no lore at all", () => {
		expect(insertHpPenalty(null)).toBe(0);
		expect(insertHpPenalty({ entries: [] })).toBe(0);
	});
});

describe("the Ghost's tether", () => {
	it("starts empty and asks to be named", async () => {
		const pd = makePostDeath("ghost", REVENANT_LORE);
		expect(pd.tether).toBe("");
		expect((await pd.buildSnapshot()).activeInsert.needsTether).toBe(true);
	});

	it("stores what they're bound to, trimmed, and stops asking", async () => {
		const pd = makePostDeath("ghost", REVENANT_LORE);
		await pd.setTether("  The oak where I fell  ");
		expect(pd.tether).toBe("The oak where I fell");

		const snap = await pd.buildSnapshot();
		expect(snap.activeInsert.tether).toBe("The oak where I fell");
		expect(snap.activeInsert.needsTether).toBe(false);
	});

	// It's the Ghost's field; a Revenant or Thrall sheet shouldn't sprout one.
	it("is not offered on an insert that isn't the Ghost", async () => {
		const pd = makePostDeath("thrall", THRALL_LORE);
		await pd.setTether("Should not surface");
		const snap = await pd.buildSnapshot();
		expect(snap.activeInsert.tether).toBe("");
		expect(snap.activeInsert.needsTether).toBe(false);
	});
});
